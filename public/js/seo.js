// Keeping the document's head honest as the router moves.
//
// Every public route is served by a real HTML file with its own title,
// description and canonical already in it (scripts/build-seo.mjs), so a
// crawler or a link preview gets the right answer without running any of
// this. What this module does is keep those tags correct afterwards, when
// somebody clicks from one page to the next and the document never reloads.
//
// A crawler that does render JavaScript then sees the same values it saw in
// the markup, rather than the previous page's description left behind.

import { SITE, pageFor, normalizePath } from './site.js';

// Paths whose pages must stay out of search results even though they are
// public and anyone with the link can read them.
//
// A notice names a funeral, and often the person who died. It is public
// because the community needs it today, which is a different thing from
// wanting it to be a permanent search result for that person's name years
// later. The family agreed to a notice, not to that.
//
// An organization page is the opposite case: a masjid publishing publicly
// benefits from being found, so /o/ is not listed here.
const NOINDEX_PREFIXES = ['/n/'];

/** Whether a path may appear in search results. */
export function isIndexable(path) {
  const clean = normalizePath(path);
  if (NOINDEX_PREFIXES.some((prefix) => clean.startsWith(prefix))) return false;
  const page = pageFor(clean);
  // An unknown path is a route this manifest does not describe. Those are
  // dynamic pages (/o/abc) rather than mistakes, and they are indexable
  // unless listed above.
  return page ? page.indexable !== false : true;
}

/** Find or create a <meta>/<link> in the head, then set its content. */
function tag(selector, create, value, attribute = 'content') {
  let node = document.head.querySelector(selector);
  if (!value) {
    node?.remove();
    return;
  }
  if (!node) {
    node = create();
    document.head.append(node);
  }
  node.setAttribute(attribute, value);
}

const meta = (name, value) => tag(
  `meta[name="${name}"]`,
  () => Object.assign(document.createElement('meta'), { name }),
  value,
);

const property = (name, value) => tag(
  `meta[property="${name}"]`,
  () => {
    const node = document.createElement('meta');
    node.setAttribute('property', name);
    return node;
  },
  value,
);

/**
 * Point the head at the page now on screen.
 *
 * @param {string} path The route being rendered.
 * @param {object} [overrides] For a page the manifest cannot describe in
 *   advance, such as a single masjid: `{ title, description }`.
 */
export function applyPageMeta(path, overrides = {}) {
  const clean = normalizePath(path);
  const page = pageFor(clean) || {};
  const title = overrides.title || page.title || SITE.name;
  const description = overrides.description || page.description || SITE.tagline;

  // The one title the app shows is the one the markup already carried, so a
  // page does not flash a different name as it renders. The site name is
  // appended here rather than stored in the manifest twice.
  document.title = title === SITE.name ? title : `${title} | ${SITE.name}`;
  meta('description', description);

  // A page may declare another page as its canonical: see /welcome, which
  // points at /how-it-works rather than competing with it.
  const target = page.canonical || clean;
  const canonical = `${SITE.origin}${target === '/' ? '/' : target}`;
  tag('link[rel="canonical"]',
    () => Object.assign(document.createElement('link'), { rel: 'canonical' }),
    canonical, 'href');

  // Robots, only where something must be kept out. Absent means indexable,
  // which is the default a crawler assumes anyway.
  meta('robots', isIndexable(clean) ? '' : 'noindex, follow');

  property('og:title', document.title);
  property('og:description', description);
  property('og:url', canonical);
  meta('twitter:title', document.title);
  meta('twitter:description', description);
}
