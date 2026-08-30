// Sign in and create an account.
//
// The same accounts as the web app, so this screen has to cope with anything
// a web user has already done to theirs: a Google-only account, an
// unverified email address, or an authenticator app enrolled as a second
// factor. The last of those is why src/lib/mfa.ts exists; without it, every
// user who took the security advice on the web account page would find
// themselves locked out of the phone app.

import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Screen, ScreenScroll } from '@/components/Screen';
import { Text } from '@/components/Text';
import { Field } from '@/components/Field';
import { Button } from '@/components/Button';
import { Surface } from '@/components/Surface';
import { useAuth } from '@/lib/auth';
import { getGoogleIdToken, isGoogleConfigured, GoogleSignInError } from '@/lib/google';
import {
  challengeFrom, isTotp, resolveWithTotp,
  UNSUPPORTED_FACTOR_MESSAGE, type MfaChallenge,
} from '@/lib/mfa';
import { friendlyAuthError } from '@/lib/auth-errors';
import { space } from '@/theme';

type Mode = 'signin' | 'signup';

/**
 * Thrown to unwind out of `attempt` without reporting anything and without
 * navigating. Backing out of the Google account sheet is neither a failure
 * nor a sign-in, and must leave the screen exactly as it was.
 */
class CancelledSignIn extends Error {
  constructor() { super('cancelled'); this.name = 'CancelledSignIn'; }
}

export default function SignInScreen() {
  const insets = useSafeAreaInsets();
  const { signIn, signUp, signInWithGoogleCredential, resetPassword } = useAuth();

  const [mode, setMode] = useState<Mode>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [challenge, setChallenge] = useState<MfaChallenge | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const done = () => router.canGoBack() ? router.back() : router.replace('/');

  async function attempt(run: () => Promise<void>) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await run();
      done();
    } catch (caught) {
      if (caught instanceof CancelledSignIn) return;
      // A second factor is not a failure, it is the next step, so it is
      // handled before anything is reported as an error.
      const next = challengeFrom(caught);
      if (next) {
        if (!next.hints.some(isTotp)) setError(UNSUPPORTED_FACTOR_MESSAGE);
        else setChallenge(next);
      } else if (caught instanceof GoogleSignInError) {
        setError(caught.message);
      } else {
        setError(friendlyAuthError(caught));
      }
    } finally {
      setBusy(false);
    }
  }

  if (challenge) {
    const factor = challenge.hints.find(isTotp);
    return (
      <Screen>
        <ScreenScroll contentContainerStyle={{ paddingTop: insets.top + space.xl }}>
          <View style={{ paddingHorizontal: space.lg, gap: space.lg }}>
            <Text variant="display" serif>Two-step check</Text>
            <Text variant="callout" tone="muted">
              Your account asks for a code from your authenticator app. Open it and
              enter the six digits shown for Ta’ziyah.
            </Text>
            <Field
              label="Six-digit code"
              value={code}
              onChangeText={setCode}
              keyboardType="number-pad"
              textContentType="oneTimeCode"
              autoComplete="one-time-code"
              maxLength={6}
            />
            {error ? <Text variant="callout" tone="danger">{error}</Text> : null}
            <Button
              label="Continue"
              kind="primary"
              full
              busy={busy}
              disabled={code.trim().length < 6 || !factor}
              onPress={() => attempt(async () => {
                if (!factor) throw new Error(UNSUPPORTED_FACTOR_MESSAGE);
                await resolveWithTotp(challenge, factor.uid, code);
              })}
            />
            <Button
              label="Use a different account"
              onPress={() => { setChallenge(null); setCode(''); setError(null); }}
            />
          </View>
        </ScreenScroll>
      </Screen>
    );
  }

  return (
    <Screen>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScreenScroll contentContainerStyle={{ paddingTop: insets.top + space.xl }}>
          <View style={{ paddingHorizontal: space.lg, gap: space.lg }}>
            <View style={{ gap: space.sm }}>
              <Text variant="display" serif>
                {mode === 'signin' ? 'Sign in' : 'Create an account'}
              </Text>
              <Text variant="callout" tone="muted">
                The same account as taziyah.com. Reading notices never needs one.
              </Text>
            </View>

            {mode === 'signup' ? (
              <Field
                label="Your name"
                value={name}
                onChangeText={setName}
                autoComplete="name"
                textContentType="name"
              />
            ) : null}

            <Field
              label="Email address"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              textContentType="emailAddress"
            />

            <Field
              label="Password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              textContentType={mode === 'signin' ? 'password' : 'newPassword'}
            />

            {error ? <Text variant="callout" tone="danger">{error}</Text> : null}
            {notice ? <Text variant="callout" tone="accent">{notice}</Text> : null}

            <Button
              label={mode === 'signin' ? 'Sign in' : 'Create account'}
              kind="primary"
              full
              busy={busy}
              disabled={!email.trim() || password.length < 6}
              onPress={() => attempt(() => (mode === 'signin'
                ? signIn(email, password)
                : signUp(email, password, name)))}
            />

            {isGoogleConfigured() ? (
              <Button
                label="Continue with Google"
                full
                busy={busy}
                onPress={() => attempt(async () => {
                  const idToken = await getGoogleIdToken();
                  if (!idToken) throw new CancelledSignIn();
                  await signInWithGoogleCredential(idToken);
                })}
              />
            ) : null}

            <Surface padded style={{ gap: space.md }}>
              <Button
                label={mode === 'signin'
                  ? 'Create an account instead'
                  : 'I already have an account'}
                size="compact"
                onPress={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(null); }}
              />
              {mode === 'signin' ? (
                <Button
                  label="Send a password reset email"
                  size="compact"
                  disabled={!email.trim()}
                  onPress={async () => {
                    setError(null);
                    try {
                      await resetPassword(email);
                      // Deliberately does not say whether the address is
                      // registered: that would confirm who has an account.
                      setNotice(
                        'If that address has an account, a reset email is on its way.',
                      );
                    } catch (caught) {
                      setError(friendlyAuthError(caught));
                    }
                  }}
                />
              ) : null}
            </Surface>
          </View>
        </ScreenScroll>
      </KeyboardAvoidingView>
    </Screen>
  );
}
