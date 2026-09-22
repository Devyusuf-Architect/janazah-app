// What a crawler and a link preview see.
//
// Most of this is not about ranking. A Janazah notice is shared in a group
// chat far more often than it is found in a search, and the crawler that
// builds that preview does not run JavaScript. If the markup is wrong, a
// link to a funeral notice shows up as a bare URL or as the wrong page's
// description, on the day it matters.
//
// The other half is about not lying. Structured data is a claim made in a
// format nobody reads by eye, which is exactly why an invented rating or a
// fabricated address is worth testing against.

import { test, describe } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync, existsSync } from 'node:fs';

import { SITE, PAGES, indexablePages, socialLinks, socialHandle, pageFor }
  from '../public/js/site.js';
import { buildSeo, fileFor } from '../scripts/build-seo.mjs';

const read = (name) => readFileSync(`public/${name}`, 'utf8');
const html = (path) => read(fileFor(path));

describe('what is committed matches what the generator produces', () => {
  test('every generated file is up to date', () => {
    // The whole scheme depends on this. Twenty files carry a copy of one
    // head, and the only thing stopping them drifting is that changing the
    // manifest without regenerating fails here.
    for (const [name, body] of buildSeo({ write: false })) {
      assert.equal(read(name), body,
        `public/${name} is stale. Run: npm run build:seo`);
    }
  });

  test('a canonical override names a page that exists and is indexable', () => {
    // Pointing a canonical at a page that is itself noindexed, or missing,
    // tells a crawler to drop both.
    for (const page of PAGES.filter((entry) => entry.canonical)) {
      const target = pageFor(page.canonical);
      assert.ok(target, `${page.path} is canonical to ${page.canonical}, which does not exist`);
      assert.notEqual(target.indexable, false,
        `${page.path} is canonical to ${page.canonical}, which is noindexed`);
    }
  });

  test('a page in the manifest has a file to be served from', () => {
    for (const page of PAGES) {
      assert.ok(existsSync(`public/${fileFor(page.path)}`),
        `${page.path} has no generated file`);
    }
  });
});

describe('every public page says what it is', () => {
  test('each has a title and a description, and no two are the same', () => {
    const titles = new Set();
    const descriptions = new Set();
    for (const page of indexablePages()) {
      // Short is fine: the site name is appended to every page title, so
      // "About" becomes "About | Ta'ziyah" in a result. What matters is that
      // the page has one of its own and does not repeat the site name into
      // "About Ta'ziyah | Ta'ziyah".
      assert.ok(page.title?.length > 2, `${page.path} has no real title`);
      if (page.path !== '/') {
        assert.ok(!page.title.includes(SITE.name),
          `${page.path}'s title repeats the site name, which is appended anyway`);
      }
      assert.ok(page.description?.length > 40,
        `${page.path} has no real description`);
      assert.ok(!titles.has(page.title), `two pages share a title: ${page.title}`);
      assert.ok(!descriptions.has(page.description),
        `two pages share a description: ${page.path}`);
      titles.add(page.title);
      descriptions.add(page.description);
    }
  });

  test('a description is a sentence, not a pile of keywords', () => {
    for (const page of indexablePages()) {
      // Search engines cut a description near 160 characters, and a reader
      // meets it as a sentence under a link.
      assert.ok(page.description.length <= 200,
        `${page.path}'s description is ${page.description.length} characters`);
      const janazah = (page.description.match(/janazah/gi) || []).length;
      assert.ok(janazah <= 2,
        `${page.path} repeats "Janazah" ${janazah} times in one description`);
    }
  });

  test('the markup carries them, so a preview needs no JavaScript', () => {
    for (const page of indexablePages()) {
      const body = html(page.path);
      assert.ok(body.includes(`<title>`), `${page.path} has no title tag`);
      assert.ok(body.includes(page.description),
        `${page.path} does not carry its own description`);
      assert.ok(body.includes(`<meta property="og:title"`),
        `${page.path} has no Open Graph title`);
      assert.ok(body.includes('name="twitter:card" content="summary_large_image"'),
        `${page.path} has no Twitter card`);
    }
  });

  test('each canonical points at its own address, on the real origin', () => {
    for (const page of PAGES) {
      // Except where a page names another as canonical: /welcome points at
      // /how-it-works so the introduction and the full page do not compete.
      const target = page.canonical || page.path;
      const expected = `${SITE.origin}${target === '/' ? '/' : target}`;
      assert.ok(html(page.path).includes(`<link rel="canonical" href="${expected}">`),
        `${page.path} has the wrong canonical`);
    }
    assert.ok(SITE.origin.startsWith('https://'), 'the canonical origin must be https');
    assert.ok(!SITE.origin.endsWith('/'), 'the origin must not carry a trailing slash');
  });
});

describe('what must not be indexed is not', () => {
  test("somebody's own screens carry a noindex and stay out of the sitemap", () => {
    for (const path of ['/account', '/dashboard', '/signin', '/following']) {
      const page = pageFor(path);
      assert.equal(page.indexable, false, `${path} is marked indexable`);
      assert.ok(html(path).includes('name="robots" content="noindex, follow"'),
        `${path} does not carry a noindex`);
    }
    const sitemap = read('sitemap.xml');
    for (const path of ['/account', '/dashboard', '/signin', '/following']) {
      assert.ok(!sitemap.includes(`${SITE.origin}${path}`),
        `${path} is in the sitemap`);
    }
  });

  test('a single Janazah notice is kept out of search results', async () => {
    // Public so the community can read it today. That is not the same as
    // wanting a permanent search result for somebody's death, which the
    // family agreed to no part of.
    const { isIndexable } = await import('../public/js/seo.js');
    assert.equal(isIndexable('/n/abc123'), false);
    // A masjid publishing publicly is helped by being findable.
    assert.equal(isIndexable('/o/abc123'), true);
    assert.ok(read('robots.txt').includes('Disallow: /n/'));
  });

  test('the console is not crawled', () => {
    assert.ok(read('console.html').includes('name="robots" content="noindex"'));
    assert.ok(read('robots.txt').includes('Disallow: /console'));
  });

  test('nothing public is accidentally noindexed', () => {
    for (const page of indexablePages()) {
      assert.ok(!html(page.path).includes('noindex'),
        `${page.path} is public but carries a noindex`);
    }
  });
});

describe('the sitemap', () => {
  test('lists every indexable page and nothing else', () => {
    const sitemap = read('sitemap.xml');
    const listed = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    const expected = indexablePages()
      .map((page) => `${SITE.origin}${page.path === '/' ? '/' : page.path}`);
    assert.deepEqual(listed, expected);
  });

  test('it is well formed and absolute', () => {
    const sitemap = read('sitemap.xml');
    assert.match(sitemap, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
    assert.match(sitemap, /<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/);
    assert.ok(sitemap.trim().endsWith('</urlset>'));
    for (const [, url] of sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)) {
      assert.ok(url.startsWith('https://'), `${url} is not absolute`);
    }
  });

  test('robots points at it', () => {
    assert.ok(read('robots.txt').includes(`Sitemap: ${SITE.origin}/sitemap.xml`));
  });
});

describe('structured data claims only what is true', () => {
  const schemas = (path) => [...html(path)
    .matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
    .map((match) => JSON.parse(match[1]));

  test('it parses, everywhere', () => {
    for (const page of PAGES) {
      assert.doesNotThrow(() => schemas(page.path),
        `${page.path} has structured data that is not valid JSON`);
    }
  });

  test('Organization and SoftwareApplication describe this site', () => {
    const graph = schemas('/')[0]['@graph'];
    const organization = graph.find((node) => node['@type'] === 'Organization');
    const app = graph.find((node) => node['@type'] === 'SoftwareApplication');
    assert.equal(organization.name, SITE.name);
    assert.equal(organization.url, `${SITE.origin}/`);
    assert.equal(app.offers.price, '0', 'the site is free, and says so on /for-masjids');
  });

  test('nothing is invented to win a richer result', () => {
    // Every one of these needs a fact this site does not have. A rating with
    // no ratings behind it is a lie that happens to be machine-readable, and
    // Google removes rich results for it anyway.
    const forbidden = [
      'aggregateRating', 'review', 'ratingValue', 'priceRange',
      'address', 'streetAddress', 'telephone', 'foundingDate', 'event',
    ];
    for (const page of PAGES) {
      const raw = JSON.stringify(schemas(page.path));
      for (const claim of forbidden) {
        assert.ok(!raw.includes(claim),
          `${page.path} claims ${claim}, which this site cannot support`);
      }
    }
  });

  test('breadcrumbs match the page they are on', () => {
    const page = pageFor('/for-masjids');
    const crumbs = schemas('/for-masjids')
      .find((node) => node['@type'] === 'BreadcrumbList');
    assert.ok(crumbs, '/for-masjids has no breadcrumb');
    assert.equal(crumbs.itemListElement[1].name, page.breadcrumb);
    assert.equal(crumbs.itemListElement[1].item, `${SITE.origin}/for-masjids`);
    // The home page is not below anything.
    assert.ok(!schemas('/').some((node) => node['@type'] === 'BreadcrumbList'));
  });

  test('the social address is declared once, from the config', () => {
    const graph = schemas('/')[0]['@graph'];
    const organization = graph.find((node) => node['@type'] === 'Organization');
    assert.deepEqual(organization.sameAs, socialLinks().map((entry) => entry.url));
  });
});

describe('the social links', () => {
  const footer = readFileSync('public/js/footer.js', 'utf8');
  const contact = readFileSync('public/js/views/contact.js', 'utf8');

  test('the address lives in one place', () => {
    // Nowhere but site.js may hardcode it, or changing it means hunting.
    for (const [name, source] of [['footer.js', footer], ['contact.js', contact]]) {
      assert.ok(!/instagram\.com/.test(source),
        `${name} hardcodes the Instagram address instead of reading the config`);
    }
    assert.equal(socialLinks().length, 1);
    assert.match(socialLinks()[0].url, /^https:\/\/www\.instagram\.com\//);
  });

  test('the handle shown as text is derived from that address', () => {
    assert.equal(socialHandle(socialLinks()[0]), '@taziyahapp');
    assert.equal(socialHandle({ url: 'https://www.instagram.com/other/' }), '@other');
  });

  test('an external link opens safely and says where it goes', () => {
    assert.match(footer, /target: '_blank'/);
    assert.match(footer, /rel: 'noopener noreferrer'/);
    assert.match(footer, /'aria-label': entry\.a11y/);
    assert.match(contact, /rel: 'noopener noreferrer'/);
    assert.equal(socialLinks()[0].a11y, "Follow Ta'ziyah on Instagram");
  });
});

describe('the pages connect to each other', () => {
  const sources = Object.fromEntries(
    ['footer.js', 'views/how-it-works.js', 'views/for-masjids.js', 'views/faq.js',
      'views/contact.js', 'views/delete-account.js', 'views/home.js', 'nav.js']
      .map((name) => [name, readFileSync(`public/js/${name}`, 'utf8')]));

  test('every public page is reachable from the footer on every page', () => {
    // Which is what stops a page existing only at the end of one link on one
    // screen, for a reader and for a crawler alike.
    for (const page of indexablePages()) {
      if (page.path === '/') continue;
      assert.ok(sources['footer.js'].includes(`href: '${page.path}'`),
        `${page.path} is not linked from the footer`);
    }
  });

  test('the journey through the site is joined up', () => {
    // Home to how it works to the notices, and the masjid route from the
    // page that explains it to the form that starts it.
    const journeys = [
      ['views/home.js', '/how-it-works'],
      ['views/how-it-works.js', '/janazahs'],
      ['views/how-it-works.js', '/masjids'],
      ['views/how-it-works.js', '/for-masjids'],
      ['views/how-it-works.js', '/janazah-guide'],
      ['views/for-masjids.js', '/register-masjid'],
      ['views/for-masjids.js', '/faq'],
      ['views/faq.js', '/for-masjids'],
      ['nav.js', '/how-it-works'],
    ];
    for (const [file, target] of journeys) {
      assert.ok(sources[file].includes(`'${target}'`),
        `${file} does not lead to ${target}`);
    }
  });

  test('no page promises coverage this site does not have', () => {
    // The site is new. "Every masjid" would have been false on the day it
    // shipped, and a bereaved family taking it literally is the cost.
    const claims = [/every masjid/i, /all janazahs/i, /every janazah/i,
      /all masjids/i, /nationwide/i];
    const pages = ['views/how-it-works.js', 'views/for-masjids.js',
      'views/faq.js', 'views/contact.js', 'views/delete-account.js'];
    for (const file of pages) {
      for (const claim of claims) {
        const found = sources[file].match(claim);
        // "does not list every Janazah" is the honest form and is allowed.
        if (found) {
          const at = sources[file].indexOf(found[0]);
          // Both directions: a phrase can be denied before it ("does not
          // list every Janazah") or after it, when it is the question and
          // the answer underneath is the denial.
          const around = sources[file].slice(Math.max(0, at - 80), at + 320);
          assert.match(around, /\bno\b|\bnot\b|never/i,
            `${file} claims ${found[0]} without qualifying it`);
        }
      }
    }
  });

  test('descriptions do not promise coverage either', () => {
    for (const page of indexablePages()) {
      assert.ok(!/every masjid|all janazahs|every janazah/i.test(page.description),
        `${page.path}'s description overclaims`);
    }
  });
});
