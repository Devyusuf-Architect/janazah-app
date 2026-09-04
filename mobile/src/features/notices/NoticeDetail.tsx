// The notice, as a screen.
//
// Separated from the route so the design harness can render it without
// Firebase or navigation (see preview/entry.tsx). The order below is the
// whole design and is not a matter of taste:
//
//   1. The state, when it is not the ordinary one. A cancellation announced
//      below the fold is a cancellation nobody read.
//   2. The time. Largest thing on the screen.
//   3. Where to pray, and how to get there.
//   4. Who died, when the family made the name public.
//   5. The burial, and how to get there.
//   6. Parking and anything else the masjid said.
//   7. The masjid, and what the verified mark actually means.
//   8. A reminder, and saying something is wrong. Share is a header action.
//
// Nothing decorative goes above item 3.

import React from 'react';
import { Share, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { Text } from '../../components/Text';
import { Button } from '../../components/Button';
import { Surface, Divider } from '../../components/Surface';
import { VerifiedBadge } from '../../components/Badge';
import { FollowButton } from '../following/FollowButton';
import { ReminderButton } from '../alerts/ReminderButton';
import { TimePanel } from './TimePanel';
import { useColors, space, radius } from '../../theme';
import { formatNoticeTime, timeSentence } from '../../lib/time';
import {
  displayName, isCancelled, isCorrected,
  type Notice, type Place,
} from '../../lib/notice';

const SITE = 'https://taziyah.com';

/**
 * Shares a notice as plain text with the link last.
 *
 * Exported because the share action lives in the screen's header, where a
 * one-tap action belongs, rather than in a row of buttons at the bottom. The
 * shape of the message is the point: it has to be readable in a WhatsApp
 * group, which is where most of this actually travels, and it must not lead
 * with a link that some clients turn into a card and others do not.
 */
export function shareNotice(notice: Notice): void {
  const time = formatNoticeTime(notice);
  const name = displayName(notice);
  const message = [
    name ? `Janazah for ${name}` : 'Janazah',
    isCancelled(notice) ? 'CANCELLED' : '',
    timeSentence(time),
    notice.prayerLocation?.name,
    notice.prayerLocation?.address,
    notice.orgName,
    `${SITE}/n/${notice.id}`,
  ].filter(Boolean).join('\n');
  Share.share({ message }).catch(() => {});
}

export type NoticeDetailProps = {
  notice: Notice;
  verified: boolean;
  onDirections: (place: Place) => void;
  onReport: () => void;
};

export function NoticeDetail({
  notice, verified, onDirections, onReport,
}: NoticeDetailProps) {
  const name = displayName(notice);
  const cancelled = isCancelled(notice);

  return (
    <View style={{ paddingHorizontal: space.lg, gap: space.lg }}>
      {/* 1. State. First, always, when there is one. */}
      {cancelled ? (
        <StateNotice
          tone="danger"
          heading="This Janazah has been cancelled"
          body={
            notice.cancelReason
            || 'The masjid cancelled this notice. It will not take place as announced.'
          }
        />
      ) : isCorrected(notice) && notice.correctionNote ? (
        <StateNotice
          tone="gold"
          heading="This notice was updated"
          body={notice.correctionNote}
        />
      ) : null}

      {/* 2. The time. */}
      <TimePanel notice={notice} cancelled={cancelled} />

      {/* 3. Where to pray. Directions is demoted on a cancelled notice: a
          full-width green button under a cancellation invites somebody to
          drive to a Janazah that is not happening. */}
      {notice.prayerLocation ? (
        <PlaceBlock
          heading="Prayer"
          place={notice.prayerLocation}
          onDirections={onDirections}
          primary={!cancelled}
        />
      ) : null}

      {/* 4. Who. Only ever when the family said so. */}
      {name ? (
        <View>
          <Text variant="overline" tone="subtle" style={{ textTransform: 'uppercase' }}>
            For
          </Text>
          <Text variant="title" serif style={{ marginTop: space.xs }}>{name}</Text>
          <Text variant="caption" tone="subtle" style={{ marginTop: space.xs }}>
            Inna lillahi wa inna ilayhi raji’un
          </Text>
        </View>
      ) : null}

      {/* 5. The burial. */}
      {notice.burialLocation ? (
        <PlaceBlock
          heading="Burial"
          place={notice.burialLocation as Place}
          onDirections={onDirections}
        />
      ) : null}

      {/* 6. Parking, and anything else the masjid wrote. */}
      {notice.instructions ? (
        <View>
          <Text variant="overline" tone="subtle" style={{ textTransform: 'uppercase' }}>
            From the masjid
          </Text>
          <Surface padded style={{ marginTop: space.sm }}>
            <Text variant="body">{notice.instructions}</Text>
          </Surface>
        </View>
      ) : null}

      {/* 7. Who published it, and what the mark means. */}
      <View>
        <Text variant="overline" tone="subtle" style={{ textTransform: 'uppercase' }}>
          Published by
        </Text>
        <Surface padded style={{ marginTop: space.sm, gap: space.sm }}>
          <Text variant="bodyStrong">{notice.orgName}</Text>
          {verified ? (
            <>
              <VerifiedBadge />
              {/* The distinction the web app makes in the same words
                  (commit b134012). The badge is about the masjid, never
                  about this particular notice, and blurring the two would
                  be the most damaging thing this screen could do. */}
              <Text variant="caption" tone="subtle">
                A Ta’ziyah administrator confirmed this organization. The badge is
                about the masjid, not about this notice.
              </Text>
            </>
          ) : (
            <Text variant="caption" tone="subtle">
              This organization is not currently shown as verified.
            </Text>
          )}
          {/* Following from here, because this is where somebody decides a
              masjid matters to them: they came for one funeral and want to
              hear about the next. */}
          <View style={{ paddingTop: space.xs }}>
            <FollowButton orgId={notice.orgId} size="regular" full />
          </View>
        </Surface>
      </View>

      {/* 8. A reminder, and saying something is wrong. Share is in the
          header, where a one-tap action belongs. */}
      <Divider />
      <View style={{ flexDirection: 'row', gap: space.md, flexWrap: 'wrap' }}>
        <ReminderButton notice={notice} />
        <Button label="Report a problem" onPress={onReport} />
      </View>

      <Text variant="caption" tone="subtle">
        Times and places are as the masjid published them. If something looks
        wrong, report it rather than relying on it.
      </Text>
    </View>
  );
}

function PlaceBlock({ heading, place, onDirections, primary = false }: {
  heading: string;
  place: Place;
  onDirections: (place: Place) => void;
  /** The prayer location. Its Directions button is the one people press. */
  primary?: boolean;
}) {
  const colors = useColors();

  return (
    <View>
      <Text variant="overline" tone="subtle" style={{ textTransform: 'uppercase' }}>
        {heading}
      </Text>
      <Surface level={primary ? 'raised' : 'flat'} padded style={{ marginTop: space.sm, gap: space.sm }}>
        {place.name ? <Text variant="bodyStrong">{place.name}</Text> : null}
        {place.address ? (
          <Text variant="body" tone="muted">{place.address}</Text>
        ) : null}
        <Button
          label="Directions"
          kind={primary ? 'primary' : 'secondary'}
          size={primary ? 'regular' : 'compact'}
          full={primary}
          onPress={() => onDirections(place)}
          accessibilityHint="Opens your maps app"
          icon={(
            <Svg width={18} height={18} viewBox="0 0 24 24">
              <Path
                d="M12 21s6.5-5.6 6.5-10.2A6.5 6.5 0 0 0 5.5 10.8C5.5 15.4 12 21 12 21z"
                stroke={primary ? colors.onAccent : colors.ink}
                strokeWidth={1.7} strokeLinejoin="round" fill="none"
              />
              <Circle
                cx="12" cy="10.6" r="2.3"
                stroke={primary ? colors.onAccent : colors.ink}
                strokeWidth={1.7} fill="none"
              />
            </Svg>
          )}
        />
      </Surface>
    </View>
  );
}

/** A cancellation or a correction, said plainly and placed first. */
function StateNotice({ tone, heading, body }: {
  tone: 'danger' | 'gold';
  heading: string;
  body: string;
}) {
  const colors = useColors();
  const palette = tone === 'danger'
    ? { bg: colors.dangerSoft, border: colors.dangerLine, fg: colors.danger }
    : { bg: colors.goldSoft, border: colors.goldLine, fg: colors.gold };

  return (
    <View
      accessibilityRole="alert"
      style={{
        padding: space.lg,
        borderRadius: radius.lg,
        borderWidth: 1,
        backgroundColor: palette.bg,
        borderColor: palette.border,
        gap: space.sm,
      }}
    >
      <Text variant="heading" style={{ color: palette.fg }}>{heading}</Text>
      <Text variant="body" style={{ color: palette.fg }}>{body}</Text>
    </View>
  );
}
