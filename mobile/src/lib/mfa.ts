// Two-factor sign-in.
//
// The web account page enrols TOTP through multiFactor() (see
// public/js/views/account.js). Any account that has done so cannot complete a
// plain email-and-password sign-in: Firebase rejects it with
// auth/multi-factor-auth-required and hands back a resolver. If the mobile app
// did not handle that, every user who took the security advice would be
// locked out of it, which is the worst possible way to reward them.
//
// @react-native-firebase/auth 26 supports this on the native SDKs:
// getMultiFactorResolver produces the resolver from the error, and
// TotpMultiFactorGenerator.assertionForSignIn turns a six-digit code into an
// assertion the resolver accepts. Verified against the installed package;
// still to be exercised on a real device against a real enrolled account,
// which is a Phase 1 device-test item.
//
// Enrolment is deliberately not implemented here. Setting up a second factor
// is a considered, one-time act that belongs on the fuller web account page,
// and duplicating it would mean maintaining two versions of a security flow.

import {
  getAuth,
  getMultiFactorResolver,
  TotpMultiFactorGenerator,
  type MultiFactorError,
  type MultiFactorInfo,
  type MultiFactorResolver,
} from '@react-native-firebase/auth';

export const MFA_REQUIRED = 'auth/multi-factor-auth-required';

export type MfaChallenge = {
  resolver: MultiFactorResolver;
  /** The enrolled factors offered, in the order Firebase returned them. */
  hints: MultiFactorInfo[];
};

/**
 * Turn a caught sign-in error into a challenge, or null if it was some other
 * failure and the caller should report it normally.
 */
export function challengeFrom(error: unknown): MfaChallenge | null {
  const code = (error as { code?: string })?.code;
  if (code !== MFA_REQUIRED) return null;
  const resolver = getMultiFactorResolver(
    getAuth(), error as MultiFactorError,
  );
  if (!resolver) return null;
  return { resolver, hints: resolver.hints ?? [] };
}

/** Whether a returned factor is an authenticator app rather than SMS. */
export const isTotp = (hint: MultiFactorInfo): boolean =>
  hint.factorId === TotpMultiFactorGenerator.FACTOR_ID;

/**
 * Complete a TOTP challenge with the six digits from the authenticator app.
 *
 * The uid here is the enrolled factor's uid, not the user's, which is what
 * assertionForSignIn expects.
 */
export async function resolveWithTotp(
  challenge: MfaChallenge,
  factorUid: string,
  code: string,
): Promise<void> {
  const assertion = TotpMultiFactorGenerator.assertionForSignIn(
    factorUid, code.trim(),
  );
  await challenge.resolver.resolveSignIn(assertion);
}

/**
 * The message shown when an account is enrolled in a factor this app cannot
 * complete. Honest rather than vague: it says what to do instead.
 */
export const UNSUPPORTED_FACTOR_MESSAGE =
  'This account uses a second sign-in step that the app cannot complete yet. '
  + 'Sign in at taziyah.com, or use an authenticator app code if you have one set up.';
