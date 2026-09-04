// The time on a notice.
//
// The largest thing on the screen, on a tinted panel, because it is the
// question. Everything else on the notice is an answer to a question somebody
// asks second.
//
// The "in about two hours" line is refreshed once a minute while the screen
// is open, so it does not still say twenty minutes an hour later. It is not a
// countdown and does not become one: src/lib/time.ts caps it at twelve hours
// and rounds it hard, because a ticking clock on a funeral notice would be
// ghoulish.

import React, { useEffect, useState } from 'react';
import { View } from 'react-native';

import { Text } from '../../components/Text';
import { useColors, radius, space } from '../../theme';
import { formatNoticeTime, timeSentence, timeUntil } from '../../lib/time';
import type { Notice } from '../../lib/notice';

/** Re-renders once a minute. Coarse on purpose; see the note above. */
function useMinute(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

export function TimePanel({ notice, cancelled }: {
  notice: Notice;
  cancelled: boolean;
}) {
  const colors = useColors();
  const now = useMinute();
  const time = formatNoticeTime(notice, now);
  const soon = cancelled ? null : timeUntil(notice.janazahAt, now);

  const struck = cancelled
    ? { textDecorationLine: 'line-through' as const }
    : undefined;

  return (
    <View
      accessible
      accessibilityLabel={`Janazah ${timeSentence(time)}`}
      style={{
        padding: space.lg,
        borderRadius: radius.lg,
        backgroundColor: cancelled ? colors.surfaceAlt : colors.accentSoft,
        borderWidth: 1,
        borderColor: cancelled ? colors.line : colors.accentLine,
        gap: space.xs,
      }}
    >
      <Text variant="overline" tone="subtle" style={{ textTransform: 'uppercase' }}>
        Janazah prayer
      </Text>

      <View
        style={{
          flexDirection: 'row', alignItems: 'baseline',
          flexWrap: 'wrap', gap: space.sm, marginTop: space.xs,
        }}
      >
        <Text variant="hero" serif style={struck}>{time.day}</Text>
        <Text
          variant="hero"
          serif
          tone={cancelled ? 'subtle' : 'default'}
          style={struck}
        >
          {time.time}
        </Text>
        {time.zone ? (
          <Text variant="callout" tone="muted">{time.zone}</Text>
        ) : null}
      </View>

      {time.label || soon ? (
        <Text variant="callout" style={{ color: colors.accent }}>
          {[time.label, soon].filter(Boolean).join(' · ')}
        </Text>
      ) : null}
    </View>
  );
}
