// Deleting an account, from the phone.
//
// Google Play requires an app with accounts to offer deletion inside the app
// as well as from a web page, so this is a store requirement and not only a
// courtesy. It also has to be honest about what it does and does not remove.
//
// Order matters. The /users document goes first, while a session allowed to
// delete it still exists. firestore.rules opens that document to its own
// account and to nobody else, not even a platform administrator, so one left
// behind after the account is gone is unreachable forever.
//
// What deletion does NOT remove, and the screen says so rather than implying
// otherwise: notices published by an organization this person was staff of.
// Those are the public record of a funeral and are attributed to the account
// that published them; the audit trail has to keep pointing at something.
// Somebody who owns an organization cannot delete their account here at all,
// which is the same rule the web account page applies.

import { deleteUser, type User } from '@react-native-firebase/auth';
import { getDocs } from '@react-native-firebase/firestore';

import { auth } from './firebase';
import { myOrganizationsQuery } from './collections';
import { deleteAccountRecord } from './follows';
import { toOrganization } from './notice';

export class AccountDeletionError extends Error {
  readonly code: 'owns-organization' | 'requires-recent-login' | 'failed';
  constructor(message: string, code: AccountDeletionError['code']) {
    super(message);
    this.name = 'AccountDeletionError';
    this.code = code;
  }
}

/** Organizations this account owns, which block deletion. */
export async function ownedOrganizations(user: User): Promise<string[]> {
  try {
    const snapshot = await getDocs(myOrganizationsQuery(user.uid));
    return snapshot.docs
      .map(toOrganization)
      .filter((org): org is NonNullable<typeof org> => !!org)
      // ownerUid is not on the public projection, so this compares what the
      // query already filtered on: staff membership plus the owner field the
      // document carries.
      .filter((org) => (snapshot.docs.find((d) => d.id === org.id)
        ?.data()?.ownerUid) === user.uid)
      .map((org) => org.name);
  } catch {
    // A failure here must not silently allow a deletion the rules would
    // reject halfway through.
    throw new AccountDeletionError(
      'Your organizations could not be checked just now. Try again.', 'failed',
    );
  }
}

export async function deleteAccount(): Promise<void> {
  const user = auth.currentUser;
  if (!user || user.isAnonymous) return;

  const owned = await ownedOrganizations(user);
  if (owned.length) {
    throw new AccountDeletionError(
      `You are the owner of ${owned.join(', ')}. An organization cannot be `
      + 'left without an owner, and the notices it has published are '
      + 'attributed to your account. Transfer ownership at taziyah.com, or '
      + 'contact a platform administrator, before deleting this account.',
      'owns-organization',
    );
  }

  await deleteAccountRecord(user.uid);

  try {
    await deleteUser(user);
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === 'auth/requires-recent-login') {
      throw new AccountDeletionError(
        'For security, sign out and sign in again, then delete the account.',
        'requires-recent-login',
      );
    }
    throw new AccountDeletionError(
      'The account could not be deleted just now. Try again.', 'failed',
    );
  }
}
