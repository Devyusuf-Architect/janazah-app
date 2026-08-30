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
//   8. Share, and saying something is wrong.
//
// Nothing decorative goes above item 3.

import React from 'react';
import { Share, View } from 'react-native';

import { Text } from '../../components/Text';
import { Button } from '../../components/Button';
import { Surface, Divider } from '../../components/Surface';
import { VerifiedBadge } from '../../components/Badge';
import { FollowButton } from '../following/FollowButton';
import { ReminderButton } from '../alerts/ReminderButton';
import { useColors, space, radius } from '../../theme';
import { formatNoticeTime, timeSentence } from '../../lib/time';
import {
  displayName, isCancelled, isCorrected,
  type Notice, type Place,
} from '../../lib/notice';

const SITE = 'https://taziyah.com';

export type NoticeDetailProps = {
  notice: Notice;
  verified: boolean;
  onDirections: (place: Place) => void;
  onReport: () => void;
};

export function NoticeDetail({
  notice, verified, onDirections, onReport,
}: NoticeDetailProps) {
  const colors = useColors();
  const time = formatNoticeTime(notice);
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
      <View accessible accessibilityLabel={`Janazah ${timeSentence(time)}`}>
        <Text variant="overline" tone="subtle" style={{ textTransform: 'uppercase' }}>
          Janazah prayer
        </Text>
        <View
          style={{
            flexDirection: 'row', alignItems: 'baseline',
            flexWrap: 'wrap', gap: space.sm, marginTop: space.xs,
          }}
        >
          <Text
            variant="display"
            serif
            style={cancelled ? { textDecorationLine: 'line-through' } : undefined}
          >
            {time.day}
          </Text>
          <Text
            variant="display"
            serif
            tone={cancelled ? 'subtle' : 'default'}
            style={cancelled ? { textDecorationLine: 'line-through' } : undefined}
          >
            {time.time}
          </Text>
          {time.zone ? <Text variant="callout" tone="muted">{time.zone}</Text> : null}
        </View>
        {time.label ? (
          <Text variant="callout" tone="muted">{time.label}</Text>
        ) : null}
      </View>

      {/* 3. Where to pray. */}
      {notice.prayerLocation ? (
        <PlaceBlock
          heading="Prayer"
          place={notice.prayerLocation}
          onDirections={onDirections}
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
          <View style={{ flexDirection: 'row', paddingTop: space.xs }}>
            <FollowButton orgId={notice.orgId} />
          </View>
        </Surface>
      </View>

      {/* 8. Share, and saying something is wrong. */}
      <Divider />
      <View style={{ flexDirection: 'row', gap: space.md, flexWrap: 'wrap' }}>
        <Button
          label="Share"
          onPress={() => {
            const line = [
              name ? `Janazah for ${name}` : 'Janazah',
              timeSentence(time),
              notice.prayerLocation?.name,
              notice.prayerLocation?.address,
              notice.orgName,
              `${SITE}/n/${notice.id}`,
            ].filter(Boolean).join('\n');
            // Shared as text with the link last, so it is readable in a
            // WhatsApp group, which is where most of this actually travels.
            Share.share({ message: line }).catch(() => {});
          }}
        />
        <ReminderButton notice={notice} />
        <Button
          label="Report a problem"
          onPress={onReport}
        />
      </View>

      <Text variant="caption" tone="subtle">
        Times and places are as the masjid published them. If something looks
        wrong, report it rather than relying on it.
      </Text>
    </View>
  );
}

function PlaceBlock({ heading, place, onDirections }: {
  heading: string;
  place: Place;
  onDirections: (place: Place) => void;
}) {
  return (
    <View>
      <Text variant="overline" tone="subtle" style={{ textTransform: 'uppercase' }}>
        {heading}
      </Text>
      <View style={{ marginTop: space.xs, gap: space.sm }}>
        {place.name ? <Text variant="bodyStrong">{place.name}</Text> : null}
        {place.address ? (
          <Text variant="body" tone="muted">{place.address}</Text>
        ) : null}
        <Button
          label="Directions"
          kind="primary"
          size="compact"
          onPress={() => onDirections(place)}
        />
      </View>
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
