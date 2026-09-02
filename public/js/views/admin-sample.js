// Platform administration: the sample data shown to testers.
//
// Two separate things, which is why this screen exists rather than one
// button:
//
//   The switch    whether the app shows sample notices at all. Stored in
//                 /platformSettings/sampleData, so flipping it here changes
//                 what every visitor sees, immediately, with no redeploy.
//   The records   sample masjids and notices written into the database as
//                 real documents. Once they exist they are ordinary records,
//                 so customising them is done with the Notices and
//                 Organizations tabs that already exist rather than a second
//                 editor built here.
//
// Removing everything is one button, and it is exact: every sample document
// has a `sample-` id, which is the same thing firestore.rules keys its delete
// permission on. A real notice stays undeletable and a real organization
// stays undeletable, by anyone, including whoever is reading this screen.

import { el, toast, friendlyError, askReason } from '../ui.js';
import { SAMPLE_ORGS, SAMPLE_NOTICES } from '../sample-data.js';
import { isSampleMode, setSampleModeOverride } from '../sample-mode.js';
import * as store from '../store.js';

export function renderAdminSample(panel, ctx) {
  panel.replaceChildren(el('p', { class: 'muted', text: 'Loading…' }));

  store.countSampleData()
    .then((counts) => paint(panel, ctx, counts))
    .catch((err) => {
      console.error('countSampleData', err);
      paint(panel, ctx, null, err);
    });
}

function paint(panel, ctx, counts, countError) {
  const on = isSampleMode();

  panel.replaceChildren(
    el('div', { class: 'card' }, [
      el('div', { class: 'card-head' }, [
        el('div', {}, [
          el('h2', { text: 'Show sample data' }),
          el('p', { class: 'muted' },
            'While this is on, visitors see fictional notices and a banner ' +
            'saying they are examples. Turn it off when Ta’ziyah goes public.'),
        ]),
        el('span', {
          class: `badge badge--${on ? 'warn' : 'ok'}`,
          text: on ? 'showing samples' : 'off',
        }),
      ]),
      el('div', { class: 'card-actions' }, [
        el('button', {
          class: `btn ${on ? 'btn--danger' : 'btn--primary'}`,
          onclick: (event) => toggle(event.target, panel, ctx, !on),
        }, on ? 'Turn sample data off' : 'Turn sample data on'),
      ]),
      el('p', { class: 'hint' },
        'This only controls what is displayed. Any sample records already in ' +
        'the database stay there until they are removed below.'),
    ]),

    el('div', { class: 'card' }, [
      el('h2', { text: 'Sample records in the database' }),
      countError
        ? el('p', { class: 'form-error', text: friendlyError(countError, 'load') })
        : el('p', { class: 'muted' },
            counts && (counts.orgs || counts.notices)
              ? `${counts.orgs} masjid${counts.orgs === 1 ? '' : 's'} and `
                + `${counts.notices} notice${counts.notices === 1 ? '' : 's'}.`
              : 'None. The app is showing the built-in examples, which are not '
                + 'stored anywhere and cannot be edited.'),
      el('p', { class: 'muted' },
        'Adding these writes real documents you can then edit, correct or '
        + 'cancel from the Notices and Organizations tabs, exactly like any '
        + 'other notice. That is how you customise what testers see.'),
      el('div', { class: 'card-actions' }, [
        el('button', {
          class: 'btn',
          onclick: (event) => addRecords(event.target, panel, ctx),
        }, counts && (counts.orgs || counts.notices)
          ? 'Rewrite the built-in examples'
          : 'Add the built-in examples'),
        counts && (counts.orgs || counts.notices)
          ? el('button', {
              class: 'btn btn--danger',
              onclick: (event) => removeRecords(event.target, panel, ctx),
            }, 'Remove all sample records')
          : null,
      ]),
      el('p', { class: 'hint' },
        `${SAMPLE_ORGS.length} masjids and ${SAMPLE_NOTICES.length} notices, `
        + 'all named "Sample ..." or "Fulan ...". Rewriting overwrites them at '
        + 'the same ids, so anything you edited is reset.'),
    ]),
  );
}

async function toggle(button, panel, ctx, next) {
  if (next) {
    // Turning samples off only ever removes something fake, so it stays one
    // click. Turning them on, on the live site, is the direction that can
    // show a fictional notice to a real visitor by mistake, so it gets the
    // same confirm-with-a-reason step as deleting sample records below.
    const confirmed = await askReason({
      title: 'Show sample data to visitors?',
      body: 'Every visitor to the live site will see fictional notices and '
          + 'organizations until this is turned off again.',
      label: 'Type anything to confirm',
      confirmText: 'Turn it on',
    });
    if (confirmed === null) return;
  }

  button.disabled = true;
  try {
    await store.writeSampleDataSetting(next);
    setSampleModeOverride(next);
    toast(next
      ? 'Sample data is showing to visitors.'
      : 'Sample data is hidden from visitors.');
    renderAdminSample(panel, ctx);
  } catch (err) {
    console.error('writeSampleDataSetting', err);
    toast(friendlyError(err, 'admin'), 'error');
    button.disabled = false;
  }
}

async function addRecords(button, panel, ctx) {
  const original = button.textContent;
  button.disabled = true;
  button.textContent = 'Writing…';
  try {
    await store.seedSampleData(SAMPLE_ORGS, SAMPLE_NOTICES);
    toast('Sample records added. Edit them from the Notices tab.');
    renderAdminSample(panel, ctx);
  } catch (err) {
    console.error('seedSampleData', err);
    toast(friendlyError(err, 'admin'), 'error');
    button.disabled = false;
    button.textContent = original;
  }
}

async function removeRecords(button, panel, ctx) {
  const confirmed = await askReason({
    title: 'Remove all sample records?',
    body: 'Every masjid and notice added as sample data is deleted. Real '
        + 'notices and real masjids are untouched, and cannot be deleted this '
        + 'way even by mistake.',
    label: 'Type anything to confirm',
    confirmText: 'Remove them',
  });
  if (confirmed === null) return;

  button.disabled = true;
  button.textContent = 'Removing…';
  try {
    const removed = await store.removeSampleData();
    toast(`Removed ${removed} sample document${removed === 1 ? '' : 's'}.`);
    renderAdminSample(panel, ctx);
  } catch (err) {
    console.error('removeSampleData', err);
    toast(friendlyError(err, 'admin'), 'error');
    button.disabled = false;
    button.textContent = 'Remove all sample records';
  }
}
