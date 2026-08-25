// Reveal-on-scroll, and nothing else.
//
// The rest of the motion in this app is CSS: transitions on hover and focus,
// keyframes on modals and toasts. Only one thing genuinely needs JavaScript,
// which is knowing that an element has come into view, and IntersectionObserver
// does that without a scroll listener and without a framework.
//
// Three rules this follows, because motion on a funeral app is a liability
// before it is a feature:
//
// 1. Content is visible by default. The `.reveal` class only *animates* an
//    element in; it never hides one. If this module never runs, if the
//    browser lacks IntersectionObserver, or if a script error happens
//    earlier on the page, every notice still renders. Hiding content in CSS
//    and revealing it in JavaScript is how a broken script turns into a blank
//    page, which here would mean a Janazah nobody could read.
//
// 2. Reduced motion is honoured before anything is observed, not by
//    animating anyway and hoping the CSS catches it.
//
// 3. Only opacity and transform are animated, so the compositor handles it
//    and a mid-range phone scrolling a long feed is not doing layout work.

const REDUCED = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

let observer = null;

function ensureObserver() {
  if (observer || typeof IntersectionObserver === 'undefined') return observer;
  observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add('is-revealed');
      // One-way: re-animating something on the way back up is the kind of
      // motion that draws attention to itself.
      observer.unobserve(entry.target);
    }
  }, {
    // Slightly inside the viewport, so a card is already settled by the time
    // it is properly on screen rather than animating under the reader's eye.
    rootMargin: '0px 0px -8% 0px',
    threshold: 0.05,
  });
  return observer;
}

/**
 * Animate every not-yet-revealed `.reveal` inside `root` as it scrolls in.
 *
 * Safe to call after every render: already-revealed elements are skipped, and
 * the observer is shared.
 */
export function revealIn(root = document) {
  const targets = root.querySelectorAll?.('.reveal:not(.is-revealed)');
  if (!targets?.length) return;

  const io = ensureObserver();
  if (REDUCED() || !io) {
    // No observation at all: show everything, now.
    for (const node of targets) node.classList.add('is-revealed');
    return;
  }

  for (const node of targets) {
    // Anything already on screen at first paint should not fade in; that
    // reads as the page still loading.
    const box = node.getBoundingClientRect();
    if (box.top < window.innerHeight * 0.9) node.classList.add('is-revealed');
    else io.observe(node);
  }
}

/**
 * Watch a container and reveal anything added to it later.
 *
 * The feed, the dashboard and an organization's notice list all repaint from
 * live Firestore snapshots, so their cards appear after the route has
 * finished rendering.
 */
export function autoReveal(container) {
  if (!container) return () => {};
  revealIn(container);
  if (typeof MutationObserver === 'undefined') return () => {};
  const mo = new MutationObserver(() => revealIn(container));
  mo.observe(container, { childList: true, subtree: true });
  return () => mo.disconnect();
}
