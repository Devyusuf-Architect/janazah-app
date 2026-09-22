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
 * Play the page-entry animation on a route change.
 *
 * A whole page swapping instantly reads as a browser reload; a short rise
 * reads as the same app moving. It is 180ms and it moves 6px, which is the
 * most this application should ever do to a page somebody opened to find out
 * when a funeral is.
 *
 * The class is removed and re-added across a forced reflow because the same
 * element is reused for every route: without that, the animation only ever
 * plays once.
 */
export function pageEnter(node) {
  if (!node || REDUCED()) return;
  node.classList.remove('is-entering');
  // Reading offsetWidth flushes the removal so the class re-add restarts the
  // animation rather than being coalesced into a no-op.
  void node.offsetWidth;
  node.classList.add('is-entering');
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

// -------------------------------------------------------- scroll position
//
// Somebody scrolls a long feed, opens a notice, and presses back. Returning
// them to the top of the list means finding their place again, and on this
// site "their place" is often a specific funeral they were reading about.
//
// The offset lives in history.state, not in a Map in this module. A Map only
// answers for the entry you came from, in the tab you are still in: pressing
// Forward returned to the top, and so did reloading and then pressing Back,
// because nothing outside memory knew where the page had been. history.state
// is attached to the entry itself and the browser keeps it across both.
//
// The cost is a replaceState while scrolling, which is why it is throttled
// hard: Safari rate-limits history writes, and a scroll handler that writes
// on every frame will hit that ceiling and start throwing.

const SAVE_EVERY_MS = 600;
const MOVED_ENOUGH = 24;

let lastSaved = 0;
let lastOffset = 0;

/** Take the browser out of the loop; the router decides where the page sits. */
export function ownScrollRestoration() {
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
}

/** Write the current offset onto the current history entry. */
export function rememberScroll() {
  try {
    const scrollY = Math.round(window.scrollY);
    history.replaceState({ ...history.state, scrollY }, '');
    lastSaved = Date.now();
    lastOffset = scrollY;
  } catch { /* a browser rate-limiting history writes; the page still works */ }
}

/**
 * Keep the current entry's offset roughly current while somebody scrolls.
 *
 * Throttled by both time and distance, because the only thing this has to be
 * is close enough that returning to the page looks like returning to it.
 */
export function watchScrollPosition() {
  const save = () => {
    const now = Date.now();
    if (now - lastSaved < SAVE_EVERY_MS) return;
    if (Math.abs(window.scrollY - lastOffset) < MOVED_ENOUGH) return;
    rememberScroll();
  };
  window.addEventListener('scroll', save, { passive: true });
  // A page being left for any reason at all: a reload, a real navigation, or
  // the tab being hidden on a phone, which is where it is most often killed.
  window.addEventListener('pagehide', rememberScroll);
  return () => window.removeEventListener('scroll', save);
}

/**
 * Put the page where it should be for this navigation.
 *
 * Going back or forward returns to the offset that entry recorded; anything
 * else starts at the top, because arriving halfway down a page you have not
 * seen is disorienting rather than helpful.
 *
 * The retry is the part that matters. Views here paint twice: once
 * synchronously, and again when a live Firestore snapshot arrives with the
 * actual notices. Scrolling to 1200px against the first paint does nothing,
 * because the document is still one screen tall and the browser clamps it, so
 * the old single attempt landed somewhere near the top and looked like the
 * position had been lost. This keeps asking across a few frames until the
 * page is tall enough to honour it, and stops the moment it lands, gives up,
 * or the reader takes over by scrolling themselves.
 */
export function restoreScroll({ remembered = false } = {}) {
  const target = remembered ? Number(history.state?.scrollY) || 0 : 0;
  lastOffset = target;
  lastSaved = Date.now();

  const jump = (top) => window.scrollTo({ top, behavior: 'auto' });
  if (!target) { jump(0); return; }

  let frames = 0;
  let cancelled = false;
  const stop = () => { cancelled = true; };
  // Their scroll wins over ours, immediately and for good.
  for (const event of ['wheel', 'touchstart', 'keydown']) {
    window.addEventListener(event, stop, { once: true, passive: true });
  }

  const settle = () => {
    if (cancelled) return;
    jump(target);
    // Landed, or the page is never going to be tall enough. 40 frames is
    // about two thirds of a second, which is longer than a snapshot takes
    // and short enough that nothing is still moving when a reader arrives.
    if (Math.abs(window.scrollY - target) <= 2 || frames++ > 40) {
      for (const event of ['wheel', 'touchstart', 'keydown']) {
        window.removeEventListener(event, stop);
      }
      return;
    }
    requestAnimationFrame(settle);
  };
  settle();
}

// ------------------------------------------------------------ scroll state
//
// The masthead sits over the page with a blur behind it. Flat against the top
// of an unscrolled page that reads correctly; once content is passing beneath
// it, the edge needs to be visible or the two planes merge and the header
// looks like part of the article.
//
// A passive listener with a class toggled only on the crossing, so scrolling a
// long feed does not write to the DOM on every frame.

export function watchScroll({ threshold = 8 } = {}) {
  let scrolled = null;
  const update = () => {
    const now = window.scrollY > threshold;
    if (now === scrolled) return;
    scrolled = now;
    document.body.classList.toggle('is-scrolled', now);
  };
  update();
  window.addEventListener('scroll', update, { passive: true });
  return () => window.removeEventListener('scroll', update);
}

/**
 * Scroll to an element, clearing the sticky masthead.
 *
 * CSS scroll-margin handles anchors the browser navigates to itself; this is
 * for the times the app decides to move the page, such as jumping to the first
 * thing wrong on a form.
 */
export function scrollTo(node, { block = 'start' } = {}) {
  if (!node) return;
  node.scrollIntoView({
    behavior: REDUCED() ? 'auto' : 'smooth',
    block,
  });
}
