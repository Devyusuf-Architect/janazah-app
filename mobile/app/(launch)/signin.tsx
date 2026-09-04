// Sign in, and create an account.
//
// The mobile app requires an account, so this is the door rather than a
// detour, and it is designed as one: the brand ground and the mark at the top,
// the form on a card that rises out of it, and a single toggle between signing
// in and registering rather than two screens that look almost the same.
//
// It has to cope with anything a web user has already done to their account: a
// Google-only account, an unverified address, or an authenticator app enrolled
// as a second factor. The last is why src/lib/mfa.ts exists; without it every
// user who took the security advice on the website would find themselves
// locked out of the phone.

import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BrandGround } from '../../src/features/launch/BrandGround';
import { Mark } from '../../src/features/launch/Brandmark';
import { Text } from '../../src/components/Text';
import { Field } from '../../src/components/Field';
import { Button } from '../../src/components/Button';
import { FadeInView } from '../../src/components/Motion';
import { useAuth } from '../../src/lib/auth';
import { getGoogleIdToken, isGoogleConfigured, GoogleSignInError } from '../../src/lib/google';
import {
  challengeFrom, isTotp, resolveWithTotp,
  UNSUPPORTED_FACTOR_MESSAGE, type MfaChallenge,
} from '../../src/lib/mfa';
import { friendlyAuthError } from '../../src/lib/auth-errors';
import { useColors, radius, space, elevation } from '../../src/theme';

type Mode = 'signin' | 'signup';

/**
 * Thrown to unwind without reporting anything and without navigating. Backing
 * out of the Google account sheet is neither a failure nor a sign-in, and must
 * leave the screen exactly as it was.
 */
class CancelledSignIn extends Error {
  constructor() { super('cancelled'); this.name = 'CancelledSignIn'; }
}

export default function SignInScreen() {
  const colors = useColors();
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

  const done = () => router.replace('/(tabs)');

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

  const factor = challenge?.hints.find(isTotp);

  return (
    <BrandGround>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            paddingTop: insets.top + space.xxl,
            paddingBottom: insets.bottom + space.xl,
          }}
          keyboardShouldPersistTaps="handled"
        >
          <View style={{ alignItems: 'center', gap: space.md, paddingBottom: space.xl }}>
            <Mark size={64} tone="light" />
            <Text variant="display" serif style={{ color: colors.onBrand }}>
              Ta’ziyah
            </Text>
            <Text
              variant="callout"
              style={{ color: colors.onBrandMuted, textAlign: 'center', paddingHorizontal: space.xl }}
            >
              {challenge
                ? 'One more step to keep your account secure.'
                : 'Sign in to follow masjids and be told when a Janazah is announced.'}
            </Text>
          </View>

          <FadeInView
            style={{
              flex: 1,
              backgroundColor: colors.bg,
              borderTopLeftRadius: radius.xl,
              borderTopRightRadius: radius.xl,
              paddingHorizontal: space.xl,
              paddingTop: space.xl,
              gap: space.lg,
              ...elevation.sheet,
            }}
          >
            {challenge ? (
              <>
                <Text variant="title" serif>Two-step check</Text>
                <Text variant="callout" tone="muted">
                  Your account asks for a code from your authenticator app.
                  Open it and enter the six digits shown for Ta’ziyah.
                </Text>
                <Field
                  label="Six-digit code"
                  value={code}
                  onChangeText={setCode}
                  keyboardType="number-pad"
                  textContentType="oneTimeCode"
                  autoComplete="one-time-code"
                  maxLength={6}
                  autoFocus
                />
                {error ? <Text variant="callout" tone="danger">{error}</Text> : null}
                <Button
                  label="Continue"
                  kind="primary"
                  size="large"
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
                  kind="plain"
                  full
                  onPress={() => { setChallenge(null); setCode(''); setError(null); }}
                />
              </>
            ) : (
              <>
                <Text variant="title" serif>
                  {mode === 'signin' ? 'Welcome back' : 'Create your account'}
                </Text>

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
                  hint={mode === 'signup' ? 'At least six characters.' : undefined}
                />

                {error ? <Text variant="callout" tone="danger">{error}</Text> : null}
                {notice ? <Text variant="callout" tone="accent">{notice}</Text> : null}

                <Button
                  label={mode === 'signin' ? 'Sign in' : 'Create account'}
                  kind="primary"
                  size="large"
                  full
                  busy={busy}
                  disabled={!email.trim() || password.length < 6}
                  onPress={() => attempt(() => (mode === 'signin'
                    ? signIn(email, password)
                    : signUp(email, password, name)))}
                />

                {isGoogleConfigured() ? (
                  <>
                    <Rule />
                    <Button
                      label="Continue with Google"
                      size="large"
                      full
                      busy={busy}
                      onPress={() => attempt(async () => {
                        const idToken = await getGoogleIdToken();
                        if (!idToken) throw new CancelledSignIn();
                        await signInWithGoogleCredential(idToken);
                      })}
                    />
                  </>
                ) : null}

                <View style={{ alignItems: 'center', gap: space.xs, paddingTop: space.sm }}>
                  <Button
                    label={mode === 'signin'
                      ? 'New here? Create an account'
                      : 'I already have an account'}
                    kind="plain"
                    onPress={() => {
                      setMode(mode === 'signin' ? 'signup' : 'signin');
                      setError(null);
                    }}
                  />
                  {mode === 'signin' ? (
                    <Button
                      label="Forgot your password?"
                      kind="plain"
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
                </View>
              </>
            )}
          </FadeInView>
        </ScrollView>
      </KeyboardAvoidingView>
    </BrandGround>
  );
}

function Rule() {
  const colors = useColors();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
      <View style={{ flex: 1, height: 1, backgroundColor: colors.line }} />
      <Text variant="caption" tone="subtle">or</Text>
      <View style={{ flex: 1, height: 1, backgroundColor: colors.line }} />
    </View>
  );
}
