// The greeting.
//
// One line, small, and it never becomes a hero. Somebody opening this app has
// usually just been told that a funeral is today; the screen's job at that
// moment is the time and the address, not a welcome.
//
// The salaam is used only when there is a name to attach it to. Greeting a
// signed-out visitor by no name reads as a template rather than as a greeting.

import React from 'react';

import { Text } from '@/components/Text';
import { useAuth } from '@/lib/auth';

/** First name only. A full legal name in a greeting is not a greeting. */
function firstName(displayName: string | null | undefined): string | null {
  const trimmed = displayName?.trim();
  if (!trimmed) return null;
  return trimmed.split(/\s+/)[0] ?? null;
}

export function Greeting() {
  const { user, ready } = useAuth();
  // Held back until auth resolves, so the line does not change under someone
  // a moment after they have started reading it.
  if (!ready) return null;

  const name = user && !user.isAnonymous ? firstName(user.displayName) : null;

  return (
    <Text variant="callout" tone="muted">
      {name ? `Assalamu Alaikum, ${name}` : 'Assalamu Alaikum'}
    </Text>
  );
}
