// Notice composition, preview, publishing, correction and cancellation.

import {
  el, icon, toast, readForm, fillForm, friendlyError, askReason, showModal,
} from '../ui.js';
import {
  validateNoticeForm, buildPublicNotice, buildPrivateDetails, noticeToForm,
  formatJanazahTime, timeZoneOptions, defaultTimeZone,
} from '../model.js';
import { publicNoticeView } from '../notice-view.js';
import { placePicker } from './place-picker.js';
import { dateTimePicker } from './date-time-picker.js';
import { statusBadge } from './org.js';
import * as store from '../store.js';

let unwatch = null;

export function teardownNotices() {
  if (unwatch) { unwatch(); unwatch = null; }
}

export function renderNotices(mount, ctx) {
  teardownNotices();
  mount.replaceChildren();

  if (!ctx.orgs.length) {
    mount.append(el('div', { class: 'empty' }, [
      el('p', { text: 'Register an organization before posting a notice.' }),
    ]));
    return;
  }

  const selector = el('select', { class: 'field field--inline', id: 'org-picker' },
    ctx.orgs.map((o) => el('option', {
      value: o.id,
      text: `${o.name}${o.verificationStatus === 'verified' ? '' : ` (${o.verificationStatus})`}`,
    })));

  mount.append(el('div', { class: 'page-head' }, [
    el('div', {}, [
      el('h1', { text: 'Janazah notices' }),
      ctx.orgs.length > 1 ? el('label', { class: 'label label--inline', for: 'org-picker', text: 'Organization' }) : null,
      ctx.orgs.length > 1 ? selector : null,
    ]),
  ]));

  const strip = el('div');
  mount.append(strip);

  const list = el('div', { class: 'stack' });
  mount.append(list);

  const currentOrgId = () => selector.value;
  function currentOrg() {
    return ctx.orgs.find((o) => o.id === currentOrgId()) || ctx.orgs[0];
  }

  function subscribe() {
    teardownNotices();
    strip.replaceChildren(orgStatusStrip(currentOrg(), ctx,
      () => openComposer(mount, ctx, currentOrg(), null)));
    list.replaceChildren(el('p', { class: 'muted', text: 'Loading…' }));
    unwatch = store.watchOrgNotices(currentOrgId(), (notices) => {
      list.replaceChildren();
      if (!notices.length) {
        const org = currentOrg();
        const verified = org.verificationStatus === 'verified';
        list.append(el('div', { class: 'empty' }, [
          icon('clock', { size: 30 }),
          el('h2', { text: 'No notices yet' }),
          el('p', {
            text: verified
              ? `${org.name} is verified and can publish. A notice goes out to `
                + 'everyone following this masjid and to people nearby who '
                + 'have turned alerts on.'
              : `${org.name} cannot publish until a platform administrator `
                + 'approves it. You can write and save drafts in the meantime.',
          }),
          el('button', {
            class: 'btn btn--primary',
            onclick: () => openComposer(mount, ctx, org, null),
          }, verified ? 'Publish the first notice' : 'Write a draft'),
        ]));
        return;
      }
      for (const notice of notices) {
        list.append(noticeCard(notice, mount, ctx, currentOrg()));
      }
    });
  }

  selector.addEventListener('change', subscribe);
  subscribe();
}

/**
 * Who is publishing, as what, and the one action a coordinator came here
 * for. This replaces the old "None of your organizations are verified yet"
 * banner, which spoke about every organization at once even though only one
 * is ever selected: this strip is honest about the org actually in view.
 *
 * The verified badge copy and styling match janazahRow()/masjidRow() in
 * home.js, so "Verified Masjid" reads the same wherever it appears. A
 * not-verified organization gets the real status word from statusBadge()
 * (org.js), never a green badge it has not earned.
 */
function orgStatusStrip(org, ctx, onPost) {
  const verified = org.verificationStatus === 'verified';
  const role = org.ownerUid === ctx.user.uid ? 'Owner' : 'Staff';
  return el('div', { class: 'card org-strip' }, [
    el('div', { class: 'org-strip__id' }, [
      verified
        ? el('span', { class: 'chip chip--verified' },
          [icon('check', { size: 12 }), el('span', { text: 'Verified Masjid' })])
        : statusBadge(org.verificationStatus),
      el('h2', { class: 'org-strip__name', text: org.name }),
      el('span', { class: 'org-strip__role', text: role }),
    ]),
    el('button', { class: 'btn btn--primary', onclick: onPost }, 'Post a Janazah'),
  ]);
}

const STATUS_TONE = { draft: 'muted', published: 'ok', cancelled: 'error' };

function noticeCard(notice, mount, ctx, org) {
  const isCancelled = notice.status === 'cancelled';
  const isDraft = notice.status === 'draft';

  return el('div', { class: `card notice-card notice-card--${notice.status}` }, [
    el('div', { class: 'card-head' }, [
      el('div', {}, [
        el('h2', { text: notice.deceasedName || 'Janazah notice' }),
        el('p', { class: 'muted', text: formatJanazahTime(notice) }),
      ]),
      el('span', { class: `badge badge--${STATUS_TONE[notice.status]}`, text: notice.status }),
    ]),
    el('dl', { class: 'kv' }, [
      el('dt', { text: 'Prayer' }),
      el('dd', { text: `${notice.prayerLocation?.name}, ${notice.prayerLocation?.address}` }),
      ...(notice.burialLocation ? [
        el('dt', { text: 'Burial' }),
        el('dd', { text: `${notice.burialLocation.name}, ${notice.burialLocation.address}` }),
      ] : []),
      el('dt', { text: 'Version' }),
      el('dd', { text: String(notice.version || 1) }),
    ]),
    notice.instructions ? el('p', { class: 'instructions', text: notice.instructions }) : null,
    notice.correctionNote
      ? el('p', { class: 'notice-strip notice-strip--warn', text: `Correction: ${notice.correctionNote}` })
      : null,
    isCancelled
      ? el('p', { class: 'notice-strip notice-strip--error' },
          `Cancelled${notice.cancelReason ? `: ${notice.cancelReason}` : '.'}`)
      : null,
    el('div', { class: 'card-actions' }, [
      el('button', {
        class: 'btn btn--small',
        onclick: () => showPreview(notice),
      }, 'Preview as public'),
      isCancelled ? null : el('button', {
        class: 'btn btn--small',
        onclick: () => openComposer(mount, ctx, org, notice),
      }, isDraft ? 'Edit draft' : 'Correct'),
      isDraft ? el('button', {
        class: 'btn btn--small btn--danger',
        onclick: async () => {
          const reason = await askReason({
            title: 'Delete this draft?',
            body: 'Drafts were never published, so nobody was notified.',
            label: 'Reason (recorded in the audit trail)',
            confirmText: 'Delete draft',
            required: false,
          });
          if (reason === null) return;
          try {
            await store.deleteDraft(notice.id);
            toast('Draft deleted.');
          } catch (err) { toast(friendlyError(err), 'error'); }
        },
      }, 'Delete draft') : null,
      isCancelled || isDraft ? null : el('button', {
        class: 'btn btn--small btn--danger',
        onclick: () => cancelFlow(notice),
      }, 'Cancel notice'),
    ]),
  ]);
}

async function cancelFlow(notice) {
  const reason = await askReason({
    title: 'Cancel this Janazah notice?',
    body: 'The notice stays visible and is marked cancelled, so anyone holding ' +
          'a shared link sees the cancellation. From Phase 4, everyone who ' +
          'received the original will also be notified. Cancellation cannot be undone.',
    label: 'Reason shown to the community',
    confirmText: 'Cancel notice',
  });
  if (reason === null) return;
  try {
    await store.cancelNotice(notice.id, notice, reason);
    toast('Notice cancelled.');
  } catch (err) {
    toast(friendlyError(err), 'error');
  }
}

/**
 * Shown before publishing when something similar is already on the feed.
 *
 * A warning, never a block. Two coordinators announcing the same funeral
 * produces two cards and two notifications for one Janazah, but a false
 * positive that stopped a genuine notice would be far worse.
 */
function duplicateWarning(duplicates) {
  return el('div', { class: 'notice-strip notice-strip--warn dup-warning' }, [
    el('strong', {
      text: duplicates.length === 1
        ? 'A similar notice is already published'
        : `${duplicates.length} similar notices are already published`,
    }),
    el('p', { class: 'small' },
      'This may be the same Janazah announced by someone else. Two notices ' +
      'means two notifications for one funeral. Check before publishing.'),
    el('ul', { class: 'list list--plain' }, duplicates.map((notice) => el('li', {}, [
      el('strong', {
        text: notice.showDeceasedName && notice.deceasedName
          ? notice.deceasedName : 'Name not shared',
      }),
      el('div', { class: 'small', text: `${notice.orgName}, ${formatJanazahTime(notice)}` }),
      el('a', {
        class: 'link small', href: `/n/${notice.id}`,
        target: '_blank', rel: 'noopener noreferrer',
      }, 'Open this notice'),
    ]))),
  ]);
}

// ------------------------------------------------------------------ composer

function fieldGroup(id, label, attrs = {}, hint = null) {
  return el('div', { class: 'field-group' }, [
    el('label', { class: 'label', for: id, text: label }),
    el('input', { class: 'field', id, name: id, ...attrs }),
    hint ? el('p', { class: 'hint', text: hint }) : null,
  ]);
}

/** The zone control. The list and the default live in model.js, which is
    pure and therefore testable without a browser. */
function timeZoneSelect(existing) {
  const options = timeZoneOptions();
  const chosen = defaultTimeZone(existing, options);
  return el('select', { class: 'field', id: 'timeZone', name: 'timeZone' },
    options.map((z) => el('option', {
      value: z, text: z.replace(/_/g, ' '), selected: z === chosen,
    })));
}

// A short guided sequence rather than one long technical form. Nothing about
// the fields, validation, or the public/private split changes here: this is
// the same form, walked through a few screens at a time, on the same
// stepper/gapIn pattern already established for org.js's registration
// wizard.
const NOTICE_STEPS = [
  { key: 'when', title: 'When & where' },
  { key: 'who', title: 'Who' },
  { key: 'details', title: 'Details' },
  { key: 'review', title: 'Review' },
];

function noticeStepper(current) {
  return el('ol', { class: 'stepper' }, NOTICE_STEPS.map((step, i) => el('li', {
    class: `stepper__item${i === current ? ' is-current' : ''}${i < current ? ' is-done' : ''}`,
    'aria-current': i === current ? 'step' : null,
  }, [
    el('span', { class: 'stepper__num', text: String(i + 1) }),
    el('span', { class: 'stepper__label', text: step.title }),
  ])));
}

async function openComposer(mount, ctx, org, existing) {
  teardownNotices();
  mount.replaceChildren();

  const editing = !!existing;
  const error = el('p', { class: 'form-error', hidden: true });
  const form = el('form', { class: 'card', novalidate: true });

  // Both locations are searched, never typed as coordinates. See
  // place-picker.js: these two fields decide whether the notice reaches
  // people near enough to attend and whether Directions opens the right
  // building, and both fail silently when they are wrong.
  const prayer = placePicker({
    prefix: 'prayer',
    legend: 'Prayer location',
    nameLabel: 'Location name',
    required: true,
    org,
    shortcutLabel: `Use ${org.name}’s address`,
    hint: 'Where Salat al-Janazah will be prayed.',
  });
  const burial = placePicker({
    prefix: 'burial',
    legend: 'Burial location',
    nameLabel: 'Cemetery name',
    required: false,
    org,
    hint: 'Optional. Leave blank if the burial is not arranged yet, or is '
        + 'not open to the public.',
    nameHint: 'The cemetery as mourners would find it signposted.',
  });

  // Pre-filled straight from the notice being corrected, rather than
  // through the generic fillForm() pass below: fillForm sets the hidden
  // input's .value directly and has no idea a picker sits in front of it, so
  // seeding the picker itself here is what makes an edit open already
  // showing the right day, month and time instead of a blank "Select date
  // and time" trigger.
  const janazahPicker = dateTimePicker({
    id: 'janazahAt',
    value: existing ? noticeToForm(existing).janazahAt : '',
    required: true,
  });

  const whenStep = el('section', { class: 'step' }, [
    el('h2', { text: 'When and where is the prayer?' }),
    el('div', { class: 'field-row' }, [
      el('div', { class: 'field-group' }, [
        el('label', { class: 'label', for: 'janazahAt', text: 'Janazah date and prayer time' }),
        janazahPicker.node,
      ]),
      el('div', { class: 'field-group' }, [
        el('label', { class: 'label', for: 'timeZone', text: 'Time zone' }),
        timeZoneSelect(existing?.timeZone),
      ]),
    ]),
    fieldGroup('timeLabel', 'Time description (optional)',
      { maxlength: 60, placeholder: 'After Dhuhr' },
      'Shown alongside the clock time. Use it when the time is announced ' +
      'relative to a prayer rather than as a fixed hour.'),
    prayer.node,
  ]);

  const whoStep = el('section', { class: 'step', hidden: true }, [
    el('h2', { text: 'Who is this Janazah for?' }),
    fieldGroup('deceasedName', 'Name of the deceased', { maxlength: 140 }),
    el('label', { class: 'check' }, [
      el('input', { type: 'checkbox', name: 'showDeceasedName' }),
      el('span', { text: 'The family has approved sharing this name publicly' }),
    ]),
    el('p', { class: 'hint' },
      'Leave both blank if the family has not approved. A name entered ' +
      'without approval is rejected rather than quietly hidden.'),
    burial.node,
  ]);

  const detailsStep = el('section', { class: 'step', hidden: true }, [
    el('h2', { text: 'Instructions and family contact' }),
    el('div', { class: 'field-group' }, [
      el('label', { class: 'label', for: 'instructions', text: 'Public instructions' }),
      el('textarea', {
        class: 'field', id: 'instructions', name: 'instructions', rows: 4,
        maxlength: 2000,
        placeholder: 'Parking, entrance to use, whether the burial follows immediately.',
      }),
    ]),
    el('p', { class: 'hint hint--boxed' },
      'Everything above becomes publicly readable the moment you publish. ' +
      'What follows is private: readable only by staff of this organization ' +
      'and platform administrators, and never written onto the public notice.'),
    fieldGroup('familyContactName', 'Family contact name'),
    fieldGroup('familyContactPhone', 'Family contact phone', { type: 'tel' }),
    el('div', { class: 'field-group' }, [
      el('label', { class: 'label', for: 'internalNotes', text: 'Internal notes' }),
      el('textarea', { class: 'field', id: 'internalNotes', name: 'internalNotes', rows: 3 }),
    ]),
    editing ? el('div', { class: 'field-group' }, [
      el('label', { class: 'label', for: 'correctionNote', text: 'What changed' }),
      el('input', {
        class: 'field', id: 'correctionNote', name: 'correctionNote', maxlength: 200,
        placeholder: 'Prayer time moved from 1:00pm to 1:30pm',
      }),
      el('p', { class: 'hint', text: 'Shown to anyone who saw the original.' }),
    ]) : null,
  ]);

  const reviewSummary = el('div', { class: 'review-summary' });
  const reviewStep = el('section', { class: 'step', hidden: true }, [
    el('h2', { text: 'Check this over' }),
    el('p', { class: 'muted' },
      'This is a summary, not the public rendering. Preview shows exactly ' +
      'what the community will see before anything goes out.'),
    reviewSummary,
  ]);

  const steps = [whenStep, whoStep, detailsStep, reviewStep];
  const head = el('div');
  const back = el('button', { class: 'btn', type: 'button' }, 'Back');
  const next = el('button', { class: 'btn btn--primary', type: 'button' }, 'Continue');
  const previewBtn = el('button', { class: 'btn', type: 'button', id: 'preview', hidden: true }, 'Preview');
  const saveDraftBtn = el('button', { class: 'btn', type: 'button', id: 'save-draft', hidden: true },
    editing ? 'Save without publishing' : 'Save as draft');
  const publishBtn = el('button', { class: 'btn btn--primary', type: 'button', id: 'publish', hidden: true },
    editing ? 'Publish correction' : 'Publish');
  const cancelLink = el('button', { class: 'btn btn--link', type: 'button', id: 'cancel' }, 'Cancel');

  let at = 0;

  const line = (label, value) => (value
    ? el('div', { class: 'review-row' }, [el('dt', { text: label }), el('dd', { text: value })])
    : null);

  function paintReview() {
    const v = readForm(form);
    reviewSummary.replaceChildren(
      ...[
        line('Deceased', v.showDeceasedName && v.deceasedName ? v.deceasedName : 'Not shared publicly'),
        v.janazahAt ? line('Janazah', formatJanazahTime({
          janazahAt: new Date(v.janazahAt),
          timeZone: v.timeZone,
          timeLabel: v.timeLabel,
        })) : null,
        line('Prayer', v.prayerName ? `${v.prayerName}, ${v.prayerAddress || ''}` : null),
        line('Burial', v.burialName ? `${v.burialName}, ${v.burialAddress || ''}` : null),
        line('Family contact', [v.familyContactName, v.familyContactPhone].filter(Boolean).join(', ') || null),
      ].filter(Boolean),
    );
  }

  function show(index) {
    at = index;
    steps.forEach((s, i) => { s.hidden = i !== index; });
    head.replaceChildren(noticeStepper(index));
    back.hidden = index === 0;
    next.hidden = index === steps.length - 1;
    previewBtn.hidden = index !== steps.length - 1;
    saveDraftBtn.hidden = index !== steps.length - 1;
    publishBtn.hidden = index !== steps.length - 1;
    error.hidden = true;
    if (index === steps.length - 1) paintReview();
    // A step change is a page change as far as the reader is concerned.
    form.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function stop(gap) {
    error.hidden = false;
    error.replaceChildren(el('p', { text: gap.message }));
    gap.focus?.focus();
    gap.focus?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  /** Name the one thing stopping this step, rather than failing at the end. */
  function gapIn(index) {
    if (index === 0) {
      if (!janazahPicker.input.value) {
        return {
          message: 'Enter the Janazah date and prayer time.',
          focus: janazahPicker.trigger,
        };
      }
      return prayer.missing();
    }
    if (index === 1) {
      const name = form.elements.deceasedName.value.trim();
      const approved = form.elements.showDeceasedName.checked;
      if (approved && !name) {
        return {
          message: 'You ticked "approved for public sharing" but left the name blank.',
          focus: form.elements.deceasedName,
        };
      }
      if (!approved && name) {
        return {
          message: 'A name was entered but not marked approved for public sharing. ' +
                   'Either confirm approval or clear the name.',
          focus: form.elements.showDeceasedName,
        };
      }
      return burial.missing();
    }
    return null;
  }

  next.addEventListener('click', () => {
    const gap = gapIn(at);
    if (gap) { stop(gap); return; }
    show(at + 1);
  });
  back.addEventListener('click', () => show(at - 1));

  form.append(
    el('h1', { text: editing ? 'Correct notice' : 'New Janazah notice' }),
    el('p', { class: 'muted', text: `Publishing as ${org.name}` }),
    head,
    ...steps,
    error,
    el('div', { class: 'form-actions form-actions--sticky' }, [
      back, next, previewBtn, saveDraftBtn, publishBtn, cancelLink,
    ]),
  );

  if (editing) {
    fillForm(form, noticeToForm(existing));
    const priv = await store.getNoticePrivate(existing.id);
    fillForm(form, priv);
  }
  // After fillForm, so a correction opens showing the location the notice
  // already has rather than an empty search box that reads as data lost.
  prayer.hydrate();
  burial.hydrate();

  mount.append(form);
  show(0);

  const collect = () => ({ ...readForm(form), orgId: org.id });

  const validate = () => {
    // Walk every step's own gate first, jumping to and naming whichever one
    // is unmet, rather than failing generically from the review step.
    for (let i = 0; i < steps.length - 1; i += 1) {
      const gap = gapIn(i);
      if (gap) { show(i); stop(gap); return null; }
    }
    // The pickers name what is missing in the words of the thing they are
    // missing, and put the cursor there. validateNoticeForm still runs after
    // them: it is the mirror of firestore.rules and has the final say.
    for (const picker of [prayer, burial]) {
      const gap = picker.missing();
      if (gap) {
        show(picker === prayer ? 0 : 1);
        stop(gap);
        return null;
      }
    }

    const form_ = collect();
    const errors = validateNoticeForm(form_);
    if (errors.length) {
      show(steps.length - 1);
      error.hidden = false;
      error.replaceChildren(el('ul', {}, errors.map((m) => el('li', { text: m }))));
      error.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return null;
    }
    error.hidden = true;
    return form_;
  };

  previewBtn.addEventListener('click', () => {
    const data = validate();
    if (!data) return;
    const draft = buildPublicNotice(data, {
      org, uid: ctx.user.uid, status: 'published',
    });
    showPreview(draft, { private: buildPrivateDetails(data) });
  });

  const submitWith = async (publish) => {
    const data = validate();
    if (!data) return;
    if (publish && org.verificationStatus !== 'verified') {
      error.hidden = false;
      error.textContent =
        `${org.name} is ${org.verificationStatus}. Only a verified organization ` +
        'can publish. Save a draft in the meantime.';
      return;
    }
    if (publish) {
      const draft = buildPublicNotice(data, { org, uid: ctx.user.uid, status: 'published' });
      const duplicates = await store.findPossibleDuplicates(draft, {
        excludeId: existing?.id ?? null,
      });
      const confirmed = await confirmPublish(draft, editing, duplicates);
      if (!confirmed) return;
    }

    for (const btn of form.querySelectorAll('.form-actions button')) btn.disabled = true;
    try {
      if (editing) {
        await store.correctNotice(existing.id, existing, data, org, {
          publish: publish || existing.status === 'published',
          note: data.correctionNote,
        });
        toast(publish ? 'Correction published.' : 'Saved.');
      } else {
        await store.createNotice(data, org, { publish });
        toast(publish ? 'Notice published.' : 'Draft saved.');
      }
      renderNotices(mount, ctx);
    } catch (err) {
      error.hidden = false;
      error.textContent = friendlyError(err, 'publish');
      for (const btn of form.querySelectorAll('.form-actions button')) btn.disabled = false;
    }
  };

  saveDraftBtn.addEventListener('click', () => submitWith(false));
  publishBtn.addEventListener('click', () => submitWith(true));
  cancelLink.addEventListener('click', () => renderNotices(mount, ctx));
  form.addEventListener('submit', (e) => e.preventDefault());
}

/** Mandatory preview-and-confirm before anything reaches the public. */
function confirmPublish(draft, editing, duplicates = []) {
  return new Promise((resolve) => {
    const body = el('div', {}, [
      duplicates.length ? duplicateWarning(duplicates) : null,
      el('p', { class: 'muted' },
        'This is exactly what the community will see. Nothing else from the ' +
        'form is published.'),
      publicNoticeView(draft),
      el('label', { class: 'check' }, [
        el('input', { type: 'checkbox', id: 'confirm-check' }),
        el('span', {
          text: duplicates.length
            ? 'I have checked the notice above and confirm this is a different ' +
              'Janazah, or that publishing it anyway is correct.'
            : 'I confirm these details are correct and approved for public sharing.',
        }),
      ]),
    ]);

    const backdrop = el('div', { class: 'modal-backdrop' });
    const done = (value) => { backdrop.remove(); resolve(value); };
    const publishBtn = el('button', { class: 'btn btn--primary', disabled: true },
      editing ? 'Publish correction' : 'Publish now');

    body.querySelector('#confirm-check').addEventListener('change', (e) => {
      publishBtn.disabled = !e.target.checked;
    });
    publishBtn.addEventListener('click', () => done(true));

    backdrop.append(el('div', { class: 'modal modal--wide', role: 'dialog', 'aria-modal': 'true' }, [
      el('h2', { text: 'Publish this notice?' }),
      body,
      el('div', { class: 'modal-actions' }, [
        el('button', { class: 'btn', onclick: () => done(false) }, 'Back to editing'),
        publishBtn,
      ]),
    ]));
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) done(false); });
    document.body.append(backdrop);
  });
}

function showPreview(notice, extra = {}) {
  const body = el('div', {}, [publicNoticeView(notice)]);
  if (extra.private && Object.keys(extra.private).length) {
    body.append(
      el('h3', { text: 'Held privately, never published' }),
      el('ul', { class: 'list list--plain' },
        Object.entries(extra.private).map(([k, v]) =>
          el('li', { text: `${k}: ${v}` }))),
    );
  }
  showModal('Public preview', body, { wide: true });
}
