// The sliding marker behind a set of tabs.
//
// Before this, moving between "All notices" and "Manage" repainted the
// highlight in its new place. The eye reads that as two separate highlights
// rather than one moving, and loses track of where it came from. A marker that
// travels the distance keeps the relationship visible, which matters most on
// the widest jump — left-hand tab to right-hand tab — where a repaint gives no
// clue that anything moved.
//
// Measured with offsetLeft/offsetTop rather than getBoundingClientRect, which
// means the numbers are already relative to the container and stay correct
// when a tab strip is scrolled sideways on a phone.
//
// The container's contents are rebuilt from scratch on every repaint — the
// feed does that whenever a follow count changes — so this watches for that
// rather than assuming the buttons it measured still exist.

const REDUCED = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * @param {HTMLElement} container
 * @param {object} [options]
 * @param {string} [options.activeSelector] What counts as the current item.
 * @returns {() => void} Teardown.
 */
export function slideIndicator(container, { activeSelector = '.tab--active' } = {}) {
  if (!container) return () => {};

  const marker = document.createElement('span');
  marker.className = 'slider';
  marker.setAttribute('aria-hidden', 'true');
  container.prepend(marker);
  container.classList.add('has-slider');

  let settled = false;

  const place = () => {
    // The views rebuild their buttons with replaceChildren, which takes the
    // marker with them. Re-attaching here rather than asking each view to
    // remember means a new set of tabs anywhere gets this for free.
    if (marker.parentNode !== container) container.prepend(marker);

    const active = container.querySelector(activeSelector);
    if (!active) {
      marker.style.opacity = '0';
      return;
    }
    marker.style.opacity = '';
    marker.style.width = `${active.offsetWidth}px`;
    marker.style.height = `${active.offsetHeight}px`;
    marker.style.transform =
      `translate(${active.offsetLeft}px, ${active.offsetTop}px)`;

    // The first placement jumps; every one after it travels. Otherwise the
    // marker slides in from the corner on load, which reads as the page
    // still assembling itself.
    if (!settled) {
      settled = true;
      requestAnimationFrame(() => marker.classList.add('is-settled'));
    }
  };

  place();
  // Fonts land after first paint and change how wide a tab is, so the first
  // measurement is taken again once they have.
  document.fonts?.ready?.then(place).catch(() => {});

  // The buttons are replaced wholesale on repaint, and a label can change
  // width without being replaced ("Masjids I follow (2)").
  const mo = new MutationObserver(place);
  mo.observe(container, {
    childList: true, subtree: true, characterData: true,
    attributes: true, attributeFilter: ['class'],
  });

  // Deliberately not a window resize listener. window would hold this closure,
  // which holds the container, which keeps a whole detached view alive after
  // the route changes. Observing the container instead means both observers
  // are collected with the node they watch, so forgetting to tear one down
  // costs nothing.
  const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(place);
  ro?.observe(container);

  return () => {
    mo.disconnect();
    ro?.disconnect();
    marker.remove();
    container.classList.remove('has-slider');
  };
}

/** Exported for the tests: the marker never animates under reduced motion. */
export const reducedMotion = REDUCED;
