// Organization registration, profile, and staff authorization.

import { el, toast, readForm, friendlyError, showModal } from '../ui.js';
import { searchAddresses } from '../geocode.js';
import {
  COUNTRIES, subdivisionsFor, regionLabelFor, countryName, centreFor,
} from '../regions.js';
import { ORG_TYPES, VERIFICATION_STATUS_LABEL } from '../model.js';
import {
  APPLICANT_ROLES, VERIFICATION_METHODS, roleLabel, methodLabel,
  findPossibleDuplicates,
} from '../verification.js';
import * as store from '../store.js';

import { sendSignInEmailConfirmation } from './auth.js';
import { documentProblem, uploadVerificationDocument } from '../upload.js';

const STATUS_COPY = {
  pending: {
    tone: 'warn',
    text: 'Awaiting verification by a platform administrator. You can prepare ' +
          'drafts, but you cannot publish until this is approved.',
  },
  needs_information: {
    tone: 'warn',
    text: 'A platform administrator has asked for something more before ' +
          'this can be verified. Their question is below. Answering it is ' +
          'the only thing holding this up.',
  },
  verified: { tone: 'ok', text: 'Verified Organization. This organization can publish Janazah notices.' },
  rejected: { tone: 'error', text: 'Verification was declined.' },
  suspended: {
    tone: 'error',
    text: 'Suspended. Publishing is disabled while this is under review.',
  },
};

export function statusBadge(status) {
  const copy = STATUS_COPY[status] || { tone: 'muted' };
  return el('span', {
    class: `badge badge--${copy.tone}`,
    text: VERIFICATION_STATUS_LABEL[status] || status,
  });
}

/**
 * The full-screen state a coordinator sees when their only organization is
 * not verified. A status strip on a card is enough once someone knows the
 * system; the first thing after submitting an application should say plainly
 * what happens next instead of leaving them looking for a publish button that
 * is not going to appear.
 *
 * Publishing is blocked by firestore.rules (isOrgVerified on every notice
 * create and update), not by this screen. This only explains it.
 */
function verificationStateScreen(org, ctx, mount) {
  const submitted = org.createdAt?.toDate
    ? org.createdAt.toDate().toLocaleDateString('en-CA',
        { year: 'numeric', month: 'long', day: 'numeric' })
    : null;

  const STATE = {
    pending: {
      tone: 'warn',
      heading: 'Verification pending',
      lede: 'Your registration has been received and is waiting for a platform '
          + 'administrator to review it. Until it is approved, this '
          + 'organization cannot publish Janazah notices.',
      next: [
        'An administrator checks that the organization is real and that you are entitled to register it.',
        'They may contact you at the address you gave for verification.',
        'When it is approved, publishing unlocks here with no further action from you.',
      ],
      nextHeading: 'What happens next',
    },
    needs_information: {
      tone: 'warn',
      heading: 'More information needed',
      lede: 'A platform administrator has looked at this registration and '
          + 'needs something more before approving it. Their question is '
          + 'below. Nothing else is holding this up.',
      next: [
        'Read the administrator’s note above and answer what it asks.',
        'Update your application with the missing detail, then let the administrator know.',
        'Publishing unlocks here as soon as it is approved.',
      ],
      nextHeading: 'What you can do',
    },
    rejected: {
      tone: 'error',
      heading: 'Application not approved',
      lede: 'A platform administrator reviewed this registration and did not '
          + 'approve it. This organization cannot publish Janazah notices.',
      next: [
        'If the reason above is something you can correct, update the organization’s details and contact the administrators to ask for another review.',
        'If you believe this was a mistake, reply to the address you registered with.',
      ],
      nextHeading: 'What you can do',
    },
    suspended: {
      tone: 'error',
      heading: 'Publishing suspended',
      lede: 'A platform administrator has suspended this organization. '
          + 'Publishing is disabled while it is under review. Notices already '
          + 'published stay visible.',
      next: [
        'The reason is shown above where one was given.',
        'Contact the platform administrators to resolve it. Publishing resumes as soon as the suspension is lifted.',
      ],
      nextHeading: 'What you can do',
    },
  }[org.verificationStatus];

  if (!STATE) return null;

  return el('div', { class: 'card verify-state' }, [
    el('div', { class: 'card-head' }, [
      el('div', {}, [
        el('h1', { text: STATE.heading }),
        el('p', { class: 'muted', text: org.name }),
      ]),
      statusBadge(org.verificationStatus),
    ]),
    el('p', { text: STATE.lede }),

    org.statusReason
      ? el('div', { class: `notice-strip notice-strip--${STATE.tone}` }, [
          el('strong', { text: 'Administrator’s note' }),
          el('p', { text: org.statusReason }),
        ])
      : null,

    el('dl', { class: 'kv' }, [
      el('dt', { text: 'Organization' }),
      el('dd', { text: org.name }),
      el('dt', { text: 'Type' }),
      el('dd', { text: ORG_TYPES.find((t) => t.value === org.type)?.label || org.type }),
      el('dt', { text: 'Address' }),
      el('dd', { text: `${org.address}, ${org.city}, ${org.province}` }),
      el('dt', { text: 'Submitted' }),
      el('dd', { text: submitted || 'not recorded' }),
      el('dt', { text: 'Status' }),
      el('dd', { text: VERIFICATION_STATUS_LABEL[org.verificationStatus] || org.verificationStatus }),
    ]),

    el('h2', { text: STATE.nextHeading }),
    el('ol', { class: 'list' }, STATE.next.map((t) => el('li', { text: t }))),

    // Offered, not demanded. Confirming an inbox proves the applicant can
    // read that address and nothing else; it does not verify the
    // organization and does not move this application along by itself. It is
    // here because it is one fewer open question on the reviewer's screen.
    ctx.user && ctx.user.emailVerified === false
      ? el('div', { class: 'notice-strip' }, [
        el('strong', { text: 'Confirm your email address' }),
        el('p', {
          text: `We can send a confirmation link to ${ctx.user.email}. This `
              + 'only confirms you can read that inbox. It is separate from '
              + 'verifying the organization, and it does not approve '
              + 'anything on its own.',
        }),
        el('button', {
          class: 'btn btn--small',
          onclick: async (event) => {
            const button = event.currentTarget;
            button.disabled = true;
            try {
              await sendSignInEmailConfirmation();
              toast('Confirmation link sent. Check your inbox.');
            } catch (err) {
              console.error('sendEmailVerification', err);
              toast(friendlyError(err), 'error');
              button.disabled = false;
            }
          },
        }, 'Send the link'),
      ])
      : null,

    el('div', { class: 'card-actions' }, [
      org.ownerUid === ctx.user.uid && org.verificationStatus === 'needs_information'
        ? el('button', {
          class: 'btn btn--primary',
          onclick: () => renderApplicationEdit(mount, org, ctx),
        }, 'Update my application')
        : null,
      org.ownerUid === ctx.user.uid
        ? el('button', { class: 'btn', onclick: () => manageStaff(org, ctx) }, 'Manage staff')
        : null,
      el('button', { class: 'btn', onclick: () => ctx.refresh() }, 'Check again'),
      el('a', { class: 'btn btn--link', href: '/janazahs' }, 'View the public feed'),
    ]),
  ]);
}

/**
 * The first thing someone entering the coordinator area sees when they are
 * not yet staff of anything. Two genuinely different jobs, presented as two
 * choices rather than one primary button and a link:
 *
 *   Register a new masjid   nobody has put this masjid on Ta'ziyah yet
 *   Join an existing masjid  it is already here and you need access to it
 *
 * Someone who already said which of these they wanted, by choosing it on the
 * public /register-masjid page, never sees this screen. See ctx.startIntent.
 */
function renderStartChoice(mount, ctx) {
  mount.append(
    el('div', { class: 'page-head' }, [
      el('h1', { text: 'Masjid / Coordinator access' }),
    ]),
    el('p', { class: 'muted', style: 'margin-bottom:1.5rem' },
      'Two different things, depending on whether your masjid is already on ' +
      'Ta’ziyah.'),
    el('div', { class: 'cta-row' }, [
      el('div', { class: 'cta-card' }, [
        el('h2', { text: 'Register a new masjid' }),
        el('p', { class: 'muted' },
          'For someone responsible for a masjid or funeral home that is not on ' +
          'Ta’ziyah yet. A platform administrator reviews it before it can ' +
          'publish anything.'),
        el('div', { class: 'cta-card__actions' }, [
          el('button', {
            class: 'btn btn--primary',
            onclick: () => renderRegisterForm(mount, ctx),
          }, 'Register a new masjid'),
        ]),
      ]),
      el('div', { class: 'cta-card' }, [
        el('h2', { text: 'Join an existing masjid' }),
        el('p', { class: 'muted' },
          'For someone working with a masjid already registered here. Its ' +
          'owner approves your request, so a masjid never needs a shared ' +
          'login.'),
        el('div', { class: 'cta-card__actions' }, [
          el('button', {
            class: 'btn',
            onclick: () => renderJoinForm(mount, ctx),
          }, 'Request access'),
        ]),
      ]),
    ]),
  );
}

export function renderOrgs(mount, ctx) {
  mount.replaceChildren();
  const { orgs } = ctx;

  // An intent chosen on the public site, honoured exactly once. Someone who
  // already clicked "Register a new masjid" has said what they want; making
  // them find and click it again on a list of nothing is the friction this
  // removes.
  const intent = ctx.startIntent;
  if (intent) {
    ctx.startIntent = null;
    if (intent === 'register') { renderRegisterForm(mount, ctx); return; }
    if (intent === 'join') { renderJoinForm(mount, ctx); return; }
  }

  // Only a genuine failure. An empty list is the normal state for a new
  // coordinator and is handled by renderStartChoice below, not treated as an
  // error. Deliberately non-blocking: whatever failed to load, registering is
  // still the thing they came to do.
  if (ctx.orgsError) {
    mount.append(el('p', { class: 'notice-strip notice-strip--warn' },
      friendlyError(ctx.orgsError, 'orgLoad')));
  }

  // Someone whose single organization is not verified has nothing to do on a
  // list screen: give them the state itself, in full, rather than a card in a
  // list of one. With more than one organization the list is the right view,
  // since the statuses may differ.
  if (orgs.length === 1 && orgs[0].verificationStatus !== 'verified') {
    const screen = verificationStateScreen(orgs[0], ctx, mount);
    if (screen) {
      mount.append(screen);
      mount.append(el('button', {
        class: 'btn btn--link',
        onclick: () => renderRegisterForm(mount, ctx),
      }, 'Register another organization'));
      return;
    }
  }

  mount.append(el('div', { class: 'page-head' }, [
    el('h1', { text: 'Organizations' }),
    el('button', {
      class: 'btn btn--primary',
      onclick: () => renderRegisterForm(mount, ctx),
    }, 'Register an organization'),
  ]));

  if (!orgs.length) {
    renderStartChoice(mount, ctx);
    return;
  }

  for (const org of orgs) {
    const copy = STATUS_COPY[org.verificationStatus] || {};
    const card = el('div', { class: 'card' }, [
      el('div', { class: 'card-head' }, [
        el('div', {}, [
          el('h2', { text: org.name }),
          el('p', { class: 'muted', text: `${org.address}, ${org.city}, ${org.province}` }),
        ]),
        statusBadge(org.verificationStatus),
      ]),
      el('p', { class: `notice-strip notice-strip--${copy.tone || 'muted'}`, text: copy.text || '' }),
      org.statusReason
        ? el('p', { class: 'muted', text: `Administrator note: ${org.statusReason}` })
        : null,
      el('dl', { class: 'kv' }, [
        el('dt', { text: 'Type' }),
        el('dd', { text: ORG_TYPES.find((t) => t.value === org.type)?.label || org.type }),
        el('dt', { text: 'Alert cell' }),
        el('dd', { class: 'mono', text: org.cell || 'not recorded' }),
        el('dt', { text: 'Staff' }),
        el('dd', { text: `${org.staffUids?.length || 0} authorized` }),
      ]),
      el('div', { class: 'card-actions' }, [
        // The point of being verified. Without this the screen that tells
        // somebody they have been approved gives them nothing to do about it,
        // and they have to work out for themselves that publishing lives
        // under a different tab.
        org.verificationStatus === 'verified'
          ? el('button', {
            class: 'btn btn--primary',
            onclick: () => ctx.go?.('notices'),
          }, 'Publish a Janazah notice')
          : null,
        org.ownerUid === ctx.user.uid
          ? el('button', { class: 'btn', onclick: () => manageStaff(org, ctx) }, 'Manage staff')
          : null,
        el('button', { class: 'btn', onclick: () => viewAudit(org) }, 'Audit trail'),
      ]),
    ]);
    mount.append(card);
  }

  mount.append(el('button', {
    class: 'btn btn--link',
    onclick: () => renderJoinForm(mount, ctx),
  }, 'Request access to another organization'));
}

function field(id, label, attrs = {}, hint = null) {
  return el('div', { class: 'field-group' }, [
    el('label', { class: 'label', for: id, text: label }),
    el('input', { class: 'field', id, name: id, ...attrs }),
    hint ? el('p', { class: 'hint', text: hint }) : null,
  ]);
}

/**
 * Address search with suggestions, replacing the latitude/longitude pair the
 * form used to ask for.
 *
 * The coordinates still exist and are still required: nearby matching,
 * distance on a notice card, area topics for alerts and the directions links
 * all depend on them (geo.js, location.js, functions/lib/topics.js). They are
 * now taken from the chosen result and carried in hidden inputs, so
 * store.registerOrganization keeps reading `form.lat` and `form.lng` exactly
 * as before and nothing downstream changes.
 *
 * Nothing is submitted until a suggestion is actually chosen. A typed string
 * that was never resolved has no coordinates, and an organization with no
 * coordinates is invisible to every nearby feature, which is a worse outcome
 * than making someone pick from a list.
 *
 * @returns {{ node: Node, selected: () => object|null, focusInput: () => void }}
 */
function addressPicker() {
  let selected = null;
  let controller = null;
  let debounce = null;

  // Asked before the address, and used to scope the search. See regions.js
  // for why the order matters rather than being tidiness.
  const country = el('select', { class: 'field', id: 'countryCode', name: 'countryCode' }, [
    el('option', { value: '', text: 'Select a country…' }),
    ...COUNTRIES.map((c) => el('option', { value: c.code, text: c.name })),
  ]);

  const regionWrap = el('div', { class: 'field-group' });

  const input = el('input', {
    class: 'field', id: 'addressSearch', type: 'text', disabled: true,
    autocomplete: 'off', role: 'combobox', 'aria-expanded': 'false',
    'aria-controls': 'address-results', 'aria-autocomplete': 'list',
    placeholder: 'Choose a country first',
  });
  const results = el('ul', { class: 'address-results', id: 'address-results', role: 'listbox', hidden: true });
  const status = el('p', { class: 'hint', role: 'status', 'aria-live': 'polite' });
  const chosen = el('div', { class: 'address-chosen', hidden: true });

  // Read by store.registerOrganization via readForm(), unchanged.
  const latInput = el('input', { type: 'hidden', name: 'lat', id: 'lat' });
  const lngInput = el('input', { type: 'hidden', name: 'lng', id: 'lng' });
  const addressInput = el('input', { type: 'hidden', name: 'address', id: 'address' });
  const cityInput = el('input', { type: 'hidden', name: 'city', id: 'city' });
  const postalInput = el('input', { type: 'hidden', name: 'postalCode', id: 'postalCode' });
  const countryInput = el('input', { type: 'hidden', name: 'country', id: 'country' });

  const clearResults = () => {
    results.replaceChildren();
    results.hidden = true;
    input.setAttribute('aria-expanded', 'false');
  };

  /** Whatever the region control currently holds, list or free text. */
  const regionValue = () => regionWrap.querySelector('#province')?.value.trim() || '';

  /**
   * Rebuild the region control for the chosen country.
   *
   * Canada and the United States get their real subdivisions; everywhere else
   * gets a text box, because a half-remembered list of another country's
   * regions is worse than letting someone type the right answer.
   */
  const paintRegion = () => {
    const code = country.value;
    const list = subdivisionsFor(code);
    const label = el('label', { class: 'label', for: 'province', text: regionLabelFor(code) });

    if (!code) {
      regionWrap.replaceChildren(
        label,
        el('input', { class: 'field', id: 'province', name: 'province', disabled: true, placeholder: 'Choose a country first' }),
      );
      return;
    }

    regionWrap.replaceChildren(label, list
      ? el('select', { class: 'field', id: 'province', name: 'province', required: true }, [
          el('option', { value: '', text: `Select a ${regionLabelFor(code).toLowerCase()}…` }),
          ...list.map((name) => el('option', { value: name, text: name })),
        ])
      : el('input', {
          class: 'field', id: 'province', name: 'province', required: true, maxlength: 40,
          placeholder: 'The state, province or region this masjid is in',
        }));

    regionWrap.querySelector('#province').addEventListener('change', reset);
    regionWrap.querySelector('#province').addEventListener('input', reset);
  };

  /** Any change above the address invalidates an address chosen under the old one. */
  const reset = () => {
    selected = null;
    chosen.hidden = true;
    latInput.value = '';
    lngInput.value = '';
    clearResults();
    status.textContent = '';

    const ready = Boolean(country.value);
    input.disabled = !ready;
    input.placeholder = ready
      ? 'Start typing the masjid’s name or street address'
      : 'Choose a country first';
    if (!ready) input.value = '';
  };

  country.addEventListener('change', () => {
    paintRegion();
    reset();
  });
  paintRegion();

  const choose = (place) => {
    selected = place;
    latInput.value = String(place.lat);
    lngInput.value = String(place.lng);
    addressInput.value = place.address || place.label;
    cityInput.value = place.city;
    postalInput.value = place.postalCode;
    // The country the registrant chose wins over what the geocoder inferred.
    // They know where their masjid is; the geocoder is guessing from a
    // string, and that guess is what asking first exists to correct. The
    // province is the region control's own value and needs no copying.
    countryInput.value = countryName(country.value) || place.country;

    input.value = place.label;
    clearResults();
    status.textContent = '';

    chosen.hidden = false;
    chosen.replaceChildren(
      el('p', { class: 'address-chosen__label' }, [
        el('strong', { text: 'Selected location: ' }),
        el('span', { text: place.label }),
      ]),
      // Confirming against a map matters here: an address that geocodes to
      // the wrong side of a city sends every nearby alert to the wrong
      // people, and nobody would find out until a Janazah was missed.
      el('a', {
        class: 'link', target: '_blank', rel: 'noopener noreferrer',
        href: `https://www.google.com/maps/search/?api=1&query=${place.lat},${place.lng}`,
      }, 'Check this on a map'),
      el('p', { class: 'hint' },
        'This is the location used for nearby alerts and directions. If it ' +
        'is not the right building, search again.'),
    );
  };

  const search = async (query) => {
    controller?.abort();
    controller = new AbortController();
    status.textContent = 'Searching…';
    try {
      const places = await searchAddresses(query, {
        signal: controller.signal,
        country: countryName(country.value),
        region: regionValue(),
        centre: centreFor(country.value),
      });
      if (!places.length) {
        clearResults();
        status.textContent = 'No matching address found. Try the street address on its own.';
        return;
      }
      status.textContent = '';
      results.replaceChildren(...places.map((place) => {
        const item = el('li', { class: 'address-result', role: 'option', tabindex: '0' },
          [el('span', { text: place.label })]);
        const pick = () => choose(place);
        item.addEventListener('click', pick);
        item.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); }
        });
        return item;
      }));
      results.hidden = false;
      input.setAttribute('aria-expanded', 'true');
    } catch (err) {
      if (err?.name === 'AbortError') return;
      console.error('searchAddresses', err);
      clearResults();
      status.textContent = 'Address lookup is unavailable right now. Please try again shortly.';
    }
  };

  input.addEventListener('input', () => {
    // Typing invalidates a previous choice: the box no longer shows what was
    // actually selected, so treating it as still selected would submit
    // coordinates that do not match the text on screen.
    const typed = input.value;
    reset();
    input.value = typed;

    clearTimeout(debounce);
    const query = typed.trim();
    if (query.length < 3) return;
    debounce = setTimeout(() => search(query), 300);
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') clearResults();
    // Enter in a search box must not submit a form that has no coordinates yet.
    if (e.key === 'Enter') { e.preventDefault(); results.firstChild?.focus(); }
  });

  const node = el('div', { class: 'location-fields' }, [
    el('div', { class: 'field-group' }, [
      el('label', { class: 'label', for: 'countryCode', text: 'Country' }),
      country,
    ]),
    regionWrap,
    el('div', { class: 'field-group address-picker' }, [
      el('label', { class: 'label', for: 'addressSearch', text: 'Address' }),
      input,
      el('p', { class: 'hint' },
        'Start typing and choose the right result. Searching inside the ' +
        'country and region you picked is what keeps a masjid from landing on ' +
        'a same-named street somewhere else, which nothing later would catch.'),
      results,
      status,
      chosen,
    ]),
    latInput, lngInput, addressInput, cityInput, postalInput, countryInput,
  ]);

  return {
    node,
    selected: () => selected,
    focusInput: () => input.focus(),
    /** What is still missing, in the order the form asks for it. */
    missing: () => {
      if (!country.value) return { message: 'Choose the country this masjid is in.', focus: country };
      if (!regionValue()) {
        return {
          message: `Choose the ${regionLabelFor(country.value).toLowerCase()}.`,
          focus: regionWrap.querySelector('#province'),
        };
      }
      if (!selected) {
        return {
          message: 'Choose your address from the suggestions, so the exact '
                 + 'location is known for nearby alerts and directions.',
          focus: input,
        };
      }
      return null;
    },
  };
}

// The registration form, asked in four passes rather than one long page.
//
// Section order is deliberate. Somebody registers the organization first,
// because that is the thing they came to do and it is all public information
// they already know. Only then are they asked about themselves, and only
// after that for evidence. Front-loading "prove who you are" on a bereavement
// service reads as suspicion of the person, and the people filling this in
// are usually doing it in the middle of arranging a funeral.
const REGISTER_STEPS = [
  { key: 'org', title: 'Organization' },
  { key: 'you', title: 'Your information' },
  { key: 'proof', title: 'Verification' },
  { key: 'review', title: 'Review' },
];

function stepper(current) {
  return el('ol', { class: 'stepper' }, REGISTER_STEPS.map((step, i) => el('li', {
    class: `stepper__item${i === current ? ' is-current' : ''}${i < current ? ' is-done' : ''}`,
    'aria-current': i === current ? 'step' : null,
  }, [
    el('span', { class: 'stepper__num', text: String(i + 1) }),
    el('span', { class: 'stepper__label', text: step.title }),
  ])));
}

function textField(id, label, attrs = {}, hint = null) {
  return el('div', { class: 'field-group' }, [
    el('label', { class: 'label', for: id, text: label }),
    el('textarea', { class: 'field', id, name: id, ...attrs }),
    hint ? el('p', { class: 'hint', text: hint }) : null,
  ]);
}

function renderRegisterForm(mount, ctx) {
  mount.replaceChildren();
  const error = el('p', { class: 'form-error', hidden: true });
  const form = el('form', { class: 'card card--narrow', novalidate: true });
  const picker = addressPicker();
  const account = ctx.user || {};

  // --- step 1: the organization -------------------------------------------

  const orgStep = el('section', { class: 'step' }, [
    el('h2', { text: 'About the organization' }),
    el('p', {
      class: 'muted',
      text: 'All of this appears on the organization’s public page once ' +
            'it is verified, so use the details a family would find in a ' +
            'directory.',
    }),
    field('name', 'Organization name', { required: true, maxlength: 140 }),
    el('div', { class: 'field-group' }, [
      el('label', { class: 'label', for: 'type', text: 'Type' }),
      el('select', { class: 'field', id: 'type', name: 'type' },
        ORG_TYPES.map((t) => el('option', { value: t.value, text: t.label }))),
    ]),
    picker.node,
    field('phone', 'Organization phone number', { type: 'tel', required: true },
      'The public number a family would call. An administrator may ring it ' +
      'and ask for you by name, which is one of the simplest ways to confirm ' +
      'a registration.'),
    field('website', 'Website', { type: 'url' },
      'Optional, but it makes verification considerably faster.'),
  ]);

  // --- step 2: the person filling this in ---------------------------------

  const roleOther = field('applicantRoleOther', 'Describe your role',
    { maxlength: 120 });
  roleOther.hidden = true;

  const roleSelect = el('select',
    { class: 'field', id: 'applicantRole', name: 'applicantRole' },
    APPLICANT_ROLES.map((r) => el('option', { value: r.value, text: r.label })));
  roleSelect.addEventListener('change', () => {
    roleOther.hidden = roleSelect.value !== 'other';
  });

  const youStep = el('section', { class: 'step', hidden: true }, [
    el('h2', { text: 'About you' }),
    el('p', {
      class: 'muted',
      text: 'This part is private. It is read by platform administrators ' +
            'reviewing this registration and by nobody else: not the ' +
            'community, not other organizations, and not visitors to the ' +
            'public page after approval.',
    }),
    field('applicantName', 'Your full name', { required: true, maxlength: 140 }),
    el('div', { class: 'field-group' }, [
      el('label', { class: 'label', for: 'applicantRole', text: 'Your role' }),
      roleSelect,
    ]),
    roleOther,
    el('div', { class: 'field-group' }, [
      el('label', { class: 'label', text: 'Your account email' }),
      el('p', { class: 'field field--static', text: account.email || 'Not signed in' }),
      el('input', { type: 'hidden', name: 'applicantEmail', value: account.email || '' }),
      el('p', {
        class: 'hint',
        text: 'The address you signed in with. Confirming it proves you own ' +
              'this inbox; it is separate from verifying the organization.',
      }),
    ]),
    field('workEmail', 'Your email at the organization', { type: 'email' },
      'Optional. An address at the organization’s own domain is the ' +
      'quickest evidence there is. A personal address is fine too and is not ' +
      'held against the application.'),
    field('applicantPhone', 'A number you can be reached on', { type: 'tel' },
      'Optional. Private to administrators.'),
    textField('roleExplanation', 'How are you involved with this organization?',
      { rows: 4, maxlength: 2000 },
      'A sentence or two. What you do there, and who asked you to register it.'),
  ]);

  // --- step 3: what would prove it ----------------------------------------

  const methodBoxes = VERIFICATION_METHODS.map((m) => {
    const box = el('input', { type: 'checkbox', 'data-method': m.value, id: `m-${m.value}` });
    return el('label', { class: 'check', for: `m-${m.value}` }, [box, el('span', { text: m.label })]);
  });
  const readMethods = () => Array.from(
    form.querySelectorAll('input[data-method]:checked'), (b) => b.dataset.method);

  const authorized = el('input', { type: 'checkbox', id: 'authorized', name: 'authorized' });

  // Optional, and it stays optional. A registration is never held up for the
  // want of a document, and government identification is never asked for.
  // The upload happens after the organization exists, because storage.rules
  // decides who may write here by looking up that organization's owner.
  const documentInput = el('input', {
    class: 'field', type: 'file', id: 'supportingDocument',
    accept: '.pdf,image/jpeg,image/png,image/heic,image/webp',
  });
  const documentNote = el('p', { class: 'hint' });
  documentInput.addEventListener('change', () => {
    const problem = documentProblem(documentInput.files?.[0]);
    documentNote.textContent = problem || '';
    documentNote.classList.toggle('hint--error', !!problem);
    if (problem) documentInput.value = '';
  });
  const documentField = el('div', { class: 'field-group' }, [
    el('label', { class: 'label', for: 'supportingDocument', text: 'Supporting document' }),
    documentInput,
    el('p', {
      class: 'hint',
      text: 'Optional. A letter on the organization’s letterhead, or a photo '
          + 'of one. PDF or image, up to 10 MB. It is readable by platform '
          + 'administrators only, never appears on any public page, and no '
          + 'registration is refused for not having one.',
    }),
    documentNote,
  ]);

  const proofStep = el('section', { class: 'step', hidden: true }, [
    el('h2', { text: 'How can we verify you represent this organization?' }),
    el('p', {
      class: 'muted',
      text: 'Pick whatever is true. None of these is required, and a ' +
            'registration is never approved or declined automatically. ' +
            'A person reads every one of these.',
    }),
    el('div', { class: 'check-list' }, methodBoxes),
    field('staffPageUrl', 'Link to a staff or contact page', { type: 'url' },
      'Optional. A page on the organization’s own site that names you.'),
    documentField,
    el('label', { class: 'check check--consent', for: 'authorized' }, [
      authorized,
      el('span', {
        text: 'I confirm I am authorized to register this organization and to ' +
              'publish Janazah notices on its behalf.',
      }),
    ]),
    el('p', {
      class: 'hint',
      text: 'We do not ask for government identification, and never will.',
    }),
  ]);

  // --- step 4: read it back -----------------------------------------------

  const summary = el('div', { class: 'review-summary' });
  const duplicates = el('div', { hidden: true });
  const reviewStep = el('section', { class: 'step', hidden: true }, [
    el('h2', { text: 'Check this over' }),
    el('p', {
      class: 'muted',
      text: 'Submitting saves the organization as pending. It does not grant ' +
            'publishing, and there is no way to approve your own ' +
            'registration.',
    }),
    duplicates,
    summary,
  ]);

  /**
   * Warn if this masjid appears to be registered already.
   *
   * A warning, never a block. A genuinely new organization with a similar
   * name in the same city is entirely possible, and refusing it would leave
   * a real masjid unable to register at all. What this offers instead is the
   * thing they probably wanted: joining the record that already exists.
   *
   * Only verified organizations are visible here, because firestore.rules
   * hides pending ones from everyone but their own staff. A duplicate of
   * something still in the queue is caught by the administrator reviewing it.
   */
  async function paintDuplicates() {
    duplicates.hidden = true;
    duplicates.replaceChildren();
    let hits = [];
    try {
      hits = findPossibleDuplicates(
        { ...readForm(form), ...(picker.selected() || {}) },
        await store.verifiedOrganizations());
    } catch (err) {
      // A directory read that fails must not stop somebody registering.
      console.error('duplicate check', err);
      return;
    }
    if (!hits.length) return;
    duplicates.hidden = false;
    duplicates.append(el('div', { class: 'notice-strip notice-strip--warn' }, [
      el('strong', {
        text: hits.length === 1
          ? 'This may already be registered'
          : 'These may already be registered',
      }),
      el('ul', { class: 'review-list' }, hits.map((o) => el('li', {
        text: `${o.name} (${o.address}, ${o.city})`,
      }))),
      el('p', {
        text: 'If that is the same organization, ask its existing '
            + 'coordinators to add you instead of registering it twice. Two '
            + 'records means families follow one and the notices appear on '
            + 'the other.',
      }),
      el('button', {
        class: 'btn btn--small',
        type: 'button',
        onclick: () => renderJoinForm(mount, ctx),
      }, 'Request access to this organization'),
      el('p', {
        class: 'hint',
        text: 'If it really is a different organization, carry on and submit. '
            + 'An administrator will see this note too.',
      }),
    ]));
  }

  const line = (label, value) => (value
    ? el('div', { class: 'review-row' }, [
      el('dt', { text: label }), el('dd', { text: value }),
    ])
    : null);

  function paintSummary() {
    const v = readForm(form);
    const chosen = picker.selected();
    const methods = readMethods();
    summary.replaceChildren(
      el('h3', { text: 'Organization' }),
      el('dl', {}, [
        line('Name', v.name),
        line('Type', ORG_TYPES.find((t) => t.value === v.type)?.label),
        line('Address', chosen?.label),
        line('Phone', v.phone),
        line('Website', v.website),
      ].filter(Boolean)),
      el('h3', { text: 'You' }),
      el('dl', {}, [
        line('Name', v.applicantName),
        line('Role', roleLabel(v.applicantRole, v.applicantRoleOther)),
        line('Account email', v.applicantEmail),
        line('Work email', v.workEmail),
        line('Phone', v.applicantPhone),
        line('Involvement', v.roleExplanation),
      ].filter(Boolean)),
      el('h3', { text: 'Verification' }),
      methods.length
        ? el('ul', { class: 'review-list' },
          methods.map((m) => el('li', { text: methodLabel(m) })))
        : el('p', { class: 'muted', text: 'No verification routes selected.' }),
      v.staffPageUrl ? el('p', { class: 'muted', text: v.staffPageUrl }) : null,
      el('p', {
        class: 'hint',
        text: 'Your name, emails, phone number and explanation stay private ' +
              'to platform administrators. The organization details above ' +
              'become public once verified.',
      }),
    );
  }

  // --- movement between steps ---------------------------------------------

  const steps = [orgStep, youStep, proofStep, reviewStep];
  const head = el('div');
  const back = el('button', { class: 'btn', type: 'button' }, 'Back');
  const next = el('button', { class: 'btn btn--primary', type: 'button' }, 'Continue');
  const submit = el('button', { class: 'btn btn--primary', type: 'submit', hidden: true },
    'Submit for verification');
  let at = 0;

  function show(index) {
    at = index;
    steps.forEach((s, i) => { s.hidden = i !== index; });
    head.replaceChildren(stepper(index));
    back.hidden = index === 0;
    next.hidden = index === steps.length - 1;
    submit.hidden = index !== steps.length - 1;
    error.hidden = true;
    if (index === steps.length - 1) { paintSummary(); paintDuplicates(); }
    // A step change is a page change as far as the reader is concerned.
    form.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /** Name the one thing stopping this step, rather than failing at the end. */
  function gapIn(index) {
    if (index === 0) {
      const bad = orgStep.querySelector(':invalid');
      if (bad) {
        return {
          message: bad.validity.valueMissing
            ? `${bad.previousElementSibling?.textContent || 'This field'} is required.`
            : 'Check the highlighted field.',
          focus: bad,
        };
      }
      return picker.missing();
    }
    if (index === 1) {
      const name = form.elements.applicantName;
      if (!name.value.trim()) {
        return { message: 'Enter your full name, so an administrator knows who they are speaking to.', focus: name };
      }
      if (roleSelect.value === 'other' && !form.elements.applicantRoleOther.value.trim()) {
        return { message: 'Describe your role in a few words.', focus: form.elements.applicantRoleOther };
      }
      return null;
    }
    if (index === 2 && !authorized.checked) {
      return {
        message: 'Confirm you are authorized to register this organization.',
        focus: authorized,
      };
    }
    return null;
  }

  function stop(gap) {
    error.hidden = false;
    error.textContent = gap.message;
    gap.focus?.focus();
  }

  next.addEventListener('click', () => {
    const gap = gapIn(at);
    if (gap) return stop(gap);
    show(at + 1);
  });
  back.addEventListener('click', () => show(at - 1));

  form.append(
    el('h1', { text: 'Register an organization' }),
    head,
    ...steps,
    error,
    el('div', { class: 'form-actions' }, [
      back, next, submit,
      el('button', { class: 'btn btn--link', type: 'button', onclick: () => ctx.refresh() }, 'Cancel'),
    ]),
  );

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    error.hidden = true;
    // Re-check every step, not just the last one. Nothing here relies on a
    // button being hidden: the same checks run again, and firestore.rules
    // rejects a submission missing the authorization declaration regardless
    // of what the browser sends.
    for (let i = 0; i < steps.length - 1; i += 1) {
      const gap = gapIn(i);
      if (gap) { show(i); return stop(gap); }
    }
    submit.disabled = true;
    try {
      // The picker's hidden inputs already carry lat, lng, address, city,
      // postalCode and country into readForm. Spreading the chosen place on
      // top would overwrite `name` with the geocoder's label for the
      // building, which is not the organization's name.
      const orgId = await store.registerOrganization({
        ...readForm(form),
        verificationMethods: readMethods(),
      });
      const document = documentInput.files?.[0];
      if (document) {
        // A failed upload must not lose a completed registration. The
        // organization exists and is in the queue either way; the applicant
        // is told plainly that the attachment did not go with it.
        try {
          const stored = await uploadVerificationDocument(orgId, document);
          await store.attachApplicationDocument(orgId, stored);
        } catch (uploadErr) {
          console.error('uploadVerificationDocument', uploadErr);
          toast('Registered, but the document did not upload. You can add it '
              + 'from your application later.', 'error');
        }
      }
      toast('Submitted. A platform administrator will review it.');
      await ctx.refresh();
    } catch (err) {
      // Registering is the first thing a masjid ever does here. A denial at
      // this point is a fault on our side, never something the applicant got
      // wrong, so it must not read as a warning about them.
      console.error('registerOrganization', err);
      error.hidden = false;
      error.textContent = friendlyError(err, 'register');
    } finally {
      submit.disabled = false;
    }
  });

  show(0);
  mount.append(form);
}

/**
 * Correcting an application after "Request more information".
 *
 * The status itself is untouchable here, and not because this screen chooses
 * not to offer it: firestore.rules forbids an owner from changing
 * verificationStatus, verifiedAt, verifiedBy or statusReason at all. Somebody
 * editing this file in their browser gets a permission error, not a
 * verification.
 */
async function renderApplicationEdit(mount, org, ctx) {
  mount.replaceChildren(el('p', { class: 'muted', text: 'Loading your application…' }));

  let existing = null;
  try {
    existing = await store.getApplication(org.id);
  } catch (err) {
    console.error('getApplication', err);
  }

  const error = el('p', { class: 'form-error', hidden: true });
  const form = el('form', { class: 'card card--narrow', novalidate: true });

  const roleOther = field('applicantRoleOther', 'Describe your role', { maxlength: 120 });
  const roleSelect = el('select',
    { class: 'field', id: 'applicantRole', name: 'applicantRole' },
    APPLICANT_ROLES.map((r) => el('option', {
      value: r.value, text: r.label,
      selected: r.value === existing?.applicantRole ? true : null,
    })));
  roleOther.hidden = roleSelect.value !== 'other';
  roleSelect.addEventListener('change', () => {
    roleOther.hidden = roleSelect.value !== 'other';
  });

  const methodBoxes = VERIFICATION_METHODS.map((m) => {
    const on = (existing?.verificationMethods || []).includes(m.value);
    const box = el('input', {
      type: 'checkbox', 'data-method': m.value, id: `m-${m.value}`,
      checked: on ? true : null,
    });
    return el('label', { class: 'check', for: `m-${m.value}` },
      [box, el('span', { text: m.label })]);
  });
  const readMethods = () => Array.from(
    form.querySelectorAll('input[data-method]:checked'), (b) => b.dataset.method);

  form.append(
    el('h1', { text: 'Update your application' }),
    org.statusReason
      ? el('div', { class: 'notice-strip notice-strip--warn' }, [
        el('strong', { text: 'What the administrator asked for' }),
        el('p', { text: org.statusReason }),
      ])
      : null,
    el('p', {
      class: 'muted',
      text: 'This stays private to platform administrators, as before.',
    }),
    field('applicantName', 'Your full name',
      { required: true, maxlength: 140, value: existing?.applicantName || '' }),
    el('div', { class: 'field-group' }, [
      el('label', { class: 'label', for: 'applicantRole', text: 'Your role' }),
      roleSelect,
    ]),
    roleOther,
    field('workEmail', 'Your email at the organization',
      { type: 'email', value: existing?.workEmail || '' }),
    field('applicantPhone', 'A number you can be reached on',
      { type: 'tel', value: existing?.phone || '' }),
    textField('roleExplanation', 'How are you involved with this organization?',
      { rows: 4, maxlength: 2000 }),
    el('h2', { text: 'How can we verify you represent this organization?' }),
    el('div', { class: 'check-list' }, methodBoxes),
    field('staffPageUrl', 'Link to a staff or contact page',
      { type: 'url', value: existing?.staffPageUrl || '' }),
    error,
    el('div', { class: 'form-actions' }, [
      el('button', { class: 'btn btn--primary', type: 'submit' }, 'Send the update'),
      el('button', { class: 'btn', type: 'button', onclick: () => ctx.refresh() }, 'Cancel'),
    ]),
  );

  if (existing?.applicantRoleOther) {
    form.elements.applicantRoleOther.value = existing.applicantRoleOther;
  }
  // A textarea's value is not an attribute, so it is set after construction.
  form.elements.roleExplanation.value = existing?.roleExplanation || '';

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    error.hidden = true;
    const submit = form.querySelector('button[type=submit]');
    if (!form.elements.applicantName.value.trim()) {
      error.hidden = false;
      error.textContent = 'Enter your full name.';
      form.elements.applicantName.focus();
      return;
    }
    submit.disabled = true;
    try {
      await store.saveApplication(org.id, {
        ...readForm(form),
        applicantEmail: existing?.applicantEmail || ctx.user?.email || '',
        verificationMethods: readMethods(),
      });
      toast('Sent. An administrator will take another look.');
      await ctx.refresh();
    } catch (err) {
      console.error('saveApplication', err);
      error.hidden = false;
      error.textContent = friendlyError(err, 'register');
    } finally {
      submit.disabled = false;
    }
  });

  mount.replaceChildren(form);
}

async function renderJoinForm(mount, ctx) {
  mount.replaceChildren(el('p', { class: 'muted', text: 'Loading organizations…' }));
  let orgs = [];
  try {
    orgs = await store.verifiedOrganizations();
  } catch (err) {
    mount.replaceChildren(el('p', { class: 'form-error', text: friendlyError(err, 'load') }));
    return;
  }

  const mine = new Set(ctx.orgs.map((o) => o.id));
  const available = orgs.filter((o) => !mine.has(o.id));

  mount.replaceChildren();
  const card = el('div', { class: 'card card--narrow' }, [
    el('h1', { text: 'Request staff access' }),
    el('p', {
      class: 'muted',
      text: 'The organization’s owner approves or declines the request. ' +
            'Both the request and the decision are recorded in the audit trail.',
    }),
  ]);

  if (!available.length) {
    card.append(el('p', { class: 'muted', text: 'No other verified organizations yet.' }));
  } else {
    const list = el('ul', { class: 'list' });
    for (const org of available) {
      list.append(el('li', { class: 'list-row' }, [
        el('div', {}, [
          el('strong', { text: org.name }),
          el('p', { class: 'muted', text: `${org.city}, ${org.province}` }),
        ]),
        el('button', {
          class: 'btn',
          onclick: async (event) => {
            event.target.disabled = true;
            try {
              await store.requestStaffAccess(org.id);
              toast(`Request sent to ${org.name}.`);
            } catch (err) {
              toast(friendlyError(err), 'error');
              event.target.disabled = false;
            }
          },
        }, 'Request access'),
      ]));
    }
    card.append(list);
  }

  card.append(el('button', { class: 'btn', onclick: () => ctx.refresh() }, 'Back'));
  mount.append(card);
}

async function manageStaff(org, ctx) {
  const body = el('div', {}, [el('p', { class: 'muted', text: 'Loading…' })]);
  showModal(`Staff of ${org.name}`, body, { wide: true });

  let requests = [];
  try {
    requests = await store.listStaffRequests(org.id);
  } catch (err) {
    body.replaceChildren(el('p', { class: 'form-error', text: friendlyError(err) }));
    return;
  }

  const render = () => {
    body.replaceChildren();
    body.append(el('h3', { text: 'Authorized staff' }));
    const staffList = el('ul', { class: 'list' });
    for (const uid of org.staffUids || []) {
      staffList.append(el('li', { class: 'list-row' }, [
        el('span', { class: 'mono', text: uid + (uid === org.ownerUid ? '  (owner)' : '') }),
        uid === org.ownerUid ? null : el('button', {
          class: 'btn btn--danger btn--small',
          onclick: async () => {
            try {
              await store.removeStaff(org.id, uid, org.staffUids);
              org.staffUids = org.staffUids.filter((u) => u !== uid);
              toast('Staff member removed.');
              render();
            } catch (err) { toast(friendlyError(err), 'error'); }
          },
        }, 'Remove'),
      ]));
    }
    body.append(staffList);

    const pending = requests.filter((r) => r.status === 'pending');
    body.append(el('h3', { text: `Pending requests (${pending.length})` }));
    if (!pending.length) {
      body.append(el('p', { class: 'muted', text: 'None.' }));
      return;
    }
    const reqList = el('ul', { class: 'list' });
    for (const req of pending) {
      reqList.append(el('li', { class: 'list-row' }, [
        el('div', {}, [
          el('strong', { text: req.displayName || req.email || req.uid }),
          el('p', { class: 'muted mono', text: req.uid }),
        ]),
        el('div', { class: 'row-actions' }, [
          el('button', {
            class: 'btn btn--primary btn--small',
            onclick: async () => {
              try {
                await store.approveStaffRequest(org.id, req.uid, org.staffUids);
                org.staffUids = [...new Set([...org.staffUids, req.uid])];
                req.status = 'approved';
                toast('Approved.');
                render();
              } catch (err) { toast(friendlyError(err), 'error'); }
            },
          }, 'Approve'),
          el('button', {
            class: 'btn btn--small',
            onclick: async () => {
              try {
                await store.rejectStaffRequest(org.id, req.uid);
                req.status = 'rejected';
                toast('Declined.');
                render();
              } catch (err) { toast(friendlyError(err), 'error'); }
            },
          }, 'Decline'),
        ]),
      ]));
    }
    body.append(reqList);
  };

  render();
}

async function viewAudit(org) {
  const body = el('div', {}, [el('p', { class: 'muted', text: 'Loading…' })]);
  showModal(`Audit trail: ${org.name}`, body, { wide: true });
  try {
    const entries = await store.auditForOrg(org.id);
    body.replaceChildren(renderAuditTable(entries));
  } catch (err) {
    body.replaceChildren(el('p', { class: 'form-error', text: friendlyError(err) }));
  }
}

export function renderAuditTable(entries) {
  if (!entries.length) return el('p', { class: 'muted', text: 'No entries yet.' });
  const rows = entries.map((e) => {
    const at = e.at?.toDate ? e.at.toDate().toLocaleString('en-CA') : 'not recorded';
    const detail = e.details && Object.keys(e.details).length
      ? JSON.stringify(e.details) : '';
    return el('tr', {}, [
      el('td', { class: 'mono nowrap', text: at }),
      el('td', { text: e.action }),
      el('td', { text: e.actorEmail || e.actorUid }),
      el('td', { class: 'mono', text: `${e.targetType}/${e.targetId}` }),
      el('td', { class: 'muted small', text: detail }),
    ]);
  });
  return el('div', { class: 'table-scroll' }, [
    el('table', { class: 'table' }, [
      el('thead', {}, el('tr', {}, [
        el('th', { text: 'When' }), el('th', { text: 'Action' }),
        el('th', { text: 'Who' }), el('th', { text: 'Target' }),
        el('th', { text: 'Details' }),
      ])),
      el('tbody', {}, rows),
    ]),
  ]);
}
