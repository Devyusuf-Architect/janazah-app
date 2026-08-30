// Reading notices and organizations.
//
// Every read is a one-shot fetch behind TanStack Query, not a Firestore
// listener. That is a deliberate departure from the web app, which uses
// onSnapshot: a phone spends most of its life with the screen off on a weak
// connection, and a live socket per screen costs battery and data for updates
// nobody is looking at. The refresh points are launch, screen focus, and pull
// to refresh, which is what someone standing outside a masjid actually does.
//
// Offline is not a special case here. React Native Firebase turns Firestore's
// local cache on by default, so a fetch with no connection returns what was
// last seen and says so through `metadata.fromCache`. That flag is what drives
// the "these may have changed" banner. A funeral time that has since moved is
// worse than no time at all, so cached content is always labelled.

import {
  useInfiniteQuery, useQuery, type UseQueryResult,
} from '@tanstack/react-query';
import { getDoc, getDocs } from '@react-native-firebase/firestore';

import {
  upcomingNoticesQuery, orgNoticesQuery, chunkOrgIds, MAX_IN_VALUES,
  verifiedOrganizationsQuery, noticeRef, organizationRef,
  type DocSnapshot,
} from './collections';
import { toNotice, toOrganization, type Notice, type Organization } from './notice';
import { sampleNotices, sampleOrganizations, withSamples, isSampleId } from './sample';

export const PAGE_SIZE = 20;

export type Page = {
  notices: Notice[];
  cursor: DocSnapshot | null;
  /** True when this page came from the local cache rather than the server. */
  stale: boolean;
};

const notNull = <T,>(value: T | null): value is T => value !== null;

/**
 * Upcoming public notices, a page at a time.
 *
 * The query carries where('isPublic','==',true), which is required rather
 * than cosmetic: for a list, Firestore evaluates the rule against the query's
 * filters, so dropping it fails the read outright.
 */
export function useUpcomingNotices() {
  return useInfiniteQuery<Page>({
    queryKey: ['notices', 'upcoming'],
    initialPageParam: undefined,
    queryFn: async ({ pageParam }) => {
      const snapshot = await getDocs(
        upcomingNoticesQuery(PAGE_SIZE, pageParam as DocSnapshot | undefined),
      );
      const notices = snapshot.docs.map(toNotice).filter(notNull);
      return {
        // Samples belong on the first page only, or they would repeat with
        // every page fetched.
        notices: pageParam
          ? notices
          : sortByTime(withSamples(notices, sampleNotices())),
        cursor: snapshot.docs.at(-1) ?? null,
        stale: snapshot.metadata.fromCache,
      };
    },
    getNextPageParam: (last) =>
      (last.notices.length >= PAGE_SIZE ? last.cursor ?? undefined : undefined),
  });
}

/** Soonest first, matching the server-side orderBy the query asks for. */
export function sortByTime(notices: Notice[]): Notice[] {
  return [...notices].sort(
    (a, b) => (a.janazahAt?.getTime() ?? 0) - (b.janazahAt?.getTime() ?? 0),
  );
}

/**
 * Upcoming notices from a set of organizations.
 *
 * Firestore's `in` takes at most 30 values, so a long follow list is fetched
 * as several queries and merged. Chunking here rather than capping the follow
 * list is the right way round: somebody who follows forty masjids has not done
 * anything wrong.
 */
export function useNoticesFromOrgs(
  orgIds: string[],
): UseQueryResult<{ notices: Notice[]; stale: boolean }> {
  const live = orgIds.filter((id) => !isSampleId(id));
  const sampleIds = new Set(orgIds.filter(isSampleId));

  return useQuery({
    queryKey: ['notices', 'orgs', [...orgIds].sort()],
    enabled: orgIds.length > 0,
    queryFn: async () => {
      const results = await Promise.all(
        chunkOrgIds(live).map((chunk) => getDocs(orgNoticesQuery(chunk, PAGE_SIZE))),
      );
      const notices = results.flatMap((snap) => snap.docs.map(toNotice).filter(notNull));
      const samples = sampleNotices().filter((n) => sampleIds.has(n.orgId));
      return {
        notices: sortByTime(withSamples(notices, samples)),
        stale: results.some((snap) => snap.metadata.fromCache),
      };
    },
  });
}

export function useNotice(id: string | undefined): UseQueryResult<{
  notice: Notice | null;
  stale: boolean;
}> {
  return useQuery({
    queryKey: ['notice', id],
    enabled: !!id,
    queryFn: async () => {
      const sample = sampleNotices().find((n) => n.id === id);
      if (sample) return { notice: sample, stale: false };

      const snapshot = await getDoc(noticeRef(id!));
      return {
        notice: snapshot.exists() ? toNotice(snapshot) : null,
        stale: snapshot.metadata.fromCache,
      };
    },
  });
}

/**
 * One organization, for the verified badge and the masjid's own page.
 *
 * A denial here is not an error to report. The rules make an unverified
 * organization unreadable to anyone but its own staff, so a missing record
 * simply means "not a verified organization", which is exactly what the badge
 * needs to know.
 */
export function useOrganization(id: string | undefined) {
  return useQuery({
    queryKey: ['organization', id],
    enabled: !!id,
    // An organization's name and address change far less often than a notice.
    staleTime: 30 * 60 * 1000,
    queryFn: async (): Promise<Organization | null> => {
      const sample = sampleOrganizations().find((o) => o.id === id);
      if (sample) return sample;
      try {
        const snapshot = await getDoc(organizationRef(id!));
        return snapshot.exists() ? toOrganization(snapshot) : null;
      } catch {
        return null;
      }
    },
  });
}

/** The public directory. Verified organizations only; the rules require it. */
export function useVerifiedOrganizations() {
  return useQuery({
    queryKey: ['organizations', 'verified'],
    staleTime: 30 * 60 * 1000,
    queryFn: async () => {
      const snapshot = await getDocs(verifiedOrganizationsQuery());
      const live = snapshot.docs.map(toOrganization).filter(notNull);
      return withSamples(live, sampleOrganizations())
        .sort((a, b) => a.name.localeCompare(b.name));
    },
  });
}

export { MAX_IN_VALUES };
