// Verification: the registrations that are waiting on a decision today.
//
// Deliberately narrower than the Organizations register beside it. A reviewer
// opening this screen has one job, and everything that has already been
// decided is one click away in the other section rather than in the way here.
//
// The queue is a live query, so an organization that is approved leaves the
// list on its own rather than after a refresh somebody has to remember.

import { el, friendlyError } from '../../ui.js';
import * as store from '../../store.js';
import { reviewCard } from './organizations.js';
import { sectionHead, emptyState, loading, errorState, filterChips, toolbar } from './common.js';

const QUEUES = [
  {
    value: 'pending',
    label: 'Awaiting review',
    empty: 'No registrations are waiting for review.',
  },
  {
    value: 'needs_information',
    label: 'Awaiting information',
    empty: 'Nobody has been asked for more information.',
  },
];

export function renderVerification(panel, actx) {
  const state = { queue: 'pending', orgs: {}, error: null };

  const head = () => sectionHead('Verification requests',
    'Registrations that cannot publish until somebody decides. Approving, '
    + 'declining and asking for more information are all recorded against your '
    + 'account.');

  const body = el('div', { class: 'admin-body' });

  const paint = () => {
    panel.replaceChildren(
      head(),
      toolbar([
        filterChips(
          QUEUES.map((q) => ({
            value: q.value,
            label: q.label,
            count: state.orgs[q.value]?.length,
          })),
          state.queue,
          (value) => { state.queue = value; paintBody(); },
        ),
      ]),
      body,
    );
    paintBody();
  };

  const paintBody = () => {
    body.replaceChildren();
    if (state.error) { body.append(errorState(friendlyError(state.error, 'load'))); return; }
    const queue = QUEUES.find((q) => q.value === state.queue);
    const orgs = state.orgs[state.queue];
    if (!orgs) { body.append(loading()); return; }
    if (!orgs.length) { body.append(emptyState(queue.empty)); return; }
    for (const org of orgs) body.append(reviewCard(org, actx));
  };

  paint();

  // One watcher per queue, both live for as long as the section is on screen.
  // The counts on the filter chips are the reason both run at once: a reviewer
  // clearing the pending queue should be able to see, without switching, that
  // three applicants have since answered the question they were asked.
  for (const queue of QUEUES) {
    actx.watch(store.watchOrganizationsByStatus(queue.value, (orgs) => {
      state.orgs[queue.value] = orgs.sort((a, b) =>
        (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
      paint();
    }));
  }
}
