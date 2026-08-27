// Google sign-in appearing to succeed and then quietly not signing anyone in.
//
// The failure this pins: Firebase's popup flow relays its result back to the
// app through third-party storage on the project's authDomain. That is
// exactly what browsers increasingly block by default -- Safari's Intelligent
// Tracking Prevention, Chrome/Firefox with third-party cookies off, and most
// in-app browsers (WhatsApp, Instagram, Gmail -- exactly how a link to a
// Janazah notice tends to get opened). On such a browser, someone completes
// Google sign-in in the popup, watches it close, and lands back on the
// sign-in form with no explanation: nothing failed on Google's side, but
// Ta'ziyah never finished signing them in, and trying again repeats the same
// silent failure.
//
// Firebase's own SDK names this precisely: it rejects with
// auth/web-storage-unsupported after checking iframe storage support, not
// with a code that says "the popup was blocked" (verified against
// node_modules/@firebase/auth's own source, which throws exactly this code
// from _isIframeWebStorageSupported). The existing code already falls back to
// a full-page redirect for the structurally identical auth/popup-blocked and
// auth/operation-not-supported-in-this-environment cases -- this is a third
// member of that same family, not a new kind of failure.
//
// auth.js cannot be imported here: it touches document and firebase/auth at
// module load. This reads the source, the approach tests/error-copy.test.js
// uses for the same reason.

import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

const auth = readFileSync('public/js/views/auth.js', 'utf8');
const ui = readFileSync('public/js/ui.js', 'utf8');

/** The body of signInWithGoogle's catch block. */
const catchBlock = auth.slice(
  auth.indexOf('await signInWithPopup(auth, provider);'),
  auth.indexOf('\n}', auth.indexOf('await signInWithPopup(auth, provider);')),
);

describe('the popup-cannot-work family falls back to redirect', () => {
  test('a genuinely unsupported browser and a blocked popup both redirect', () => {
    // The two cases this already handled correctly, pinned so the next edit
    // here does not lose them while fixing the third.
    assert.match(catchBlock, /code === 'auth\/popup-blocked'/);
    assert.match(catchBlock, /code === 'auth\/operation-not-supported-in-this-environment'/);
  });

  test('blocked third-party storage falls back to redirect too', () => {
    // This is the code Firebase's own popup_redirect implementation throws
    // when _isIframeWebStorageSupported reports storage is unavailable --
    // the single most common real-world reason a popup that visibly
    // completed never reaches the app.
    assert.match(catchBlock, /code === 'auth\/web-storage-unsupported'/);
  });

  test('all three redirect cases share one signInWithRedirect call', () => {
    // Structurally: one condition, one fallback, not three separate
    // near-duplicate branches that could individually drift.
    const redirectBranch = catchBlock.slice(catchBlock.indexOf("code === 'auth/popup-blocked'"));
    const webStorageAt = redirectBranch.indexOf("'auth/web-storage-unsupported'");
    const redirectCallAt = redirectBranch.indexOf('signInWithRedirect(auth, provider)');
    assert.ok(webStorageAt > 0 && redirectCallAt > webStorageAt,
      'auth/web-storage-unsupported must be checked before the shared redirect call');
    assert.equal((redirectBranch.match(/signInWithRedirect\(auth, provider\)/g) || []).length, 1);
  });

  test('a genuine cancel by the person is left exactly as it was', () => {
    // The fix must not turn "I changed my mind and closed it" into an
    // unexpected full-page redirect. Both cancellation codes still return
    // quietly, undisturbed by the new branch.
    assert.match(catchBlock, /code === 'auth\/popup-closed-by-user' \|\| code === 'auth\/cancelled-popup-request'/);
    const cancelBranch = catchBlock.slice(
      catchBlock.indexOf("code === 'auth/popup-closed-by-user'"),
      catchBlock.indexOf("code === 'auth/popup-blocked'"),
    );
    assert.match(cancelBranch, /return;/);
    assert.ok(!/signInWithRedirect/.test(cancelBranch),
      'a genuine cancellation must not trigger a redirect');
  });

  test('anything truly unexpected still surfaces rather than vanishing', () => {
    assert.match(catchBlock, /throw err;\s*\n\s*\}\s*$/);
  });
});

describe('the message shown if it still surfaces', () => {
  test('auth/web-storage-unsupported has an actionable message, not the raw Firebase string', () => {
    assert.match(ui, /code === 'auth\/web-storage-unsupported'/);
    const block = ui.slice(ui.indexOf("code === 'auth/web-storage-unsupported'"));
    const body = block.slice(0, block.indexOf('}'));
    assert.match(body, /cookies/i);
    assert.doesNotMatch(body, /3rd party cookies and data may be disabled/,
      'must not just relay Firebase’s internal wording verbatim');
  });

  test('it is placed alongside the other popup-cannot-work messages', () => {
    // Not required for correctness, but keeps the file organized the way its
    // own comments describe: related codes read together.
    const popupBlockedAt = ui.indexOf("code === 'auth/popup-blocked'");
    const webStorageAt = ui.indexOf("code === 'auth/web-storage-unsupported'");
    assert.ok(popupBlockedAt > 0 && webStorageAt > popupBlockedAt
      && webStorageAt - popupBlockedAt < 600,
      'auth/web-storage-unsupported should sit near auth/popup-blocked');
  });
});
