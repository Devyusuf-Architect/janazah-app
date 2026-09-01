// How to pray Salat al-Janazah.
//
// Public, and deliberately so: somebody standing at the back of a hall who
// has never prayed this before should be able to open it on their phone
// without an account, a sign-in prompt, or anything between them and the
// text.
//
// This file renders. Every word of religious content lives in
// janazah-guide-content.js, so it can be reviewed by someone who does not
// read JavaScript.

import { el, icon } from '../ui.js';
import {
  STEPS, TAKBIRS, QUICK_REFERENCE, AFTER, PRONOUN_NOTE,
  SCHOOLS_NOTE, SCOPE_NOTE,
} from '../janazah-guide-content.js';

/**
 * One recitation: Arabic, how to say it, what it means, where it is from.
 *
 * The Arabic is marked `lang="ar" dir="rtl"`, which is what makes a browser
 * shape and order it correctly and lets a screen reader switch voice. It is
 * also the largest text on the page, because squinting at small Arabic is the
 * single most common failing of pages like this one.
 */
function recitation(text) {
  return el('div', { class: 'recite reveal' }, [
    el('h4', { class: 'recite__title', text: text.title }),
    text.note ? el('p', { class: 'recite__note', text: text.note }) : null,

    el('p', {
      class: 'recite__arabic', lang: 'ar', dir: 'rtl',
      // Preserves the line breaks the content file uses to set each ayah or
      // clause on its own line.
      style: 'white-space: pre-line',
      text: text.arabic,
    }),

    el('p', { class: 'recite__translit', text: text.transliteration }),
    el('p', { class: 'recite__meaning', text: text.meaning }),
    el('p', { class: 'recite__source', text: text.source }),
  ]);
}

function takbirSection(t) {
  const body = el('section', { class: 'takbir reveal', id: `takbir-${t.number}` }, [
    el('div', { class: 'takbir__head' }, [
      el('span', { class: 'takbir__num', 'aria-hidden': 'true', text: String(t.number) }),
      el('div', {}, [
        el('h3', { class: 'takbir__label', text: t.label }),
        el('p', {
          class: 'takbir__say', lang: 'ar', dir: 'rtl', text: t.takbir.arabic,
        }),
        el('p', { class: 'takbir__translit' }, [
          el('strong', { text: t.takbir.transliteration }),
          el('span', { class: 'muted', text: `: ${t.takbir.meaning}` }),
        ]),
      ]),
    ]),
    el('p', { class: 'takbir__intro', text: t.intro }),
    ...t.recitations.map(recitation),
  ]);

  if (t.number === 3) {
    body.append(
      el('div', { class: 'guide-aside reveal' }, [
        el('h4', { text: PRONOUN_NOTE.heading }),
        el('p', { text: PRONOUN_NOTE.body }),
        el('ul', { class: 'pronouns' }, PRONOUN_NOTE.forms.map(([who, translit, arabic]) =>
          el('li', {}, [
            el('span', { class: 'pronouns__who', text: who }),
            el('span', { class: 'pronouns__ar', lang: 'ar', dir: 'rtl', text: arabic }),
            el('span', { class: 'pronouns__tr', text: translit }),
          ]))),
        el('p', { class: 'hint', text: PRONOUN_NOTE.footnote }),
      ]),
      el('div', { class: 'guide-aside guide-aside--warm reveal' }, [
        el('h4', { text: t.childNote.heading }),
        el('p', { text: t.childNote.body }),
      ]),
    );
  }

  if (t.closing) {
    body.append(el('div', { class: 'recite recite--closing reveal' }, [
      el('h4', { class: 'recite__title', text: t.closing.heading }),
      el('p', { class: 'recite__note', text: t.closing.body }),
      el('p', {
        class: 'recite__arabic', lang: 'ar', dir: 'rtl', text: t.closing.arabic,
      }),
      el('p', { class: 'recite__translit', text: t.closing.transliteration }),
      el('p', { class: 'recite__meaning', text: t.closing.meaning }),
    ]));
  }

  return body;
}

export function renderJanazahGuide(mount) {
  mount.replaceChildren(
    el('a', { class: 'btn btn--link', href: '/janazahs' },
      [icon('arrowLeft', { size: 15 }), el('span', { text: 'Back to notices' })]),

    el('header', { class: 'guide-head' }, [
      el('p', { class: 'hero__eyebrow', text: 'Janazah prayer guide' }),
      el('h1', { text: 'How to pray Salat al-Janazah' }),
      el('p', { class: 'guide-head__lede' },
        'A prayer said standing, with no rukuʻ and no sujud: four takbirs, and '
        + 'in between them, praise, blessings upon the Prophet ﷺ, and dua for '
        + 'the person who has died. It takes a few minutes. If you have never '
        + 'prayed it before, follow the imam and read this beforehand.'),
      el('a', { class: 'btn btn--primary', href: '#quick-reference' },
        'Skip to the quick reference'),
    ]),

    el('div', { class: 'notice-strip notice-strip--muted guide-scope' }, [
      el('p', { text: SCHOOLS_NOTE }),
    ]),

    ...STEPS.map((step) => el('section', { class: 'guide-step reveal' }, [
      el('div', { class: 'guide-step__head' }, [
        el('span', { class: 'guide-step__num', 'aria-hidden': 'true', text: String(step.number) }),
        el('h2', { text: step.title }),
      ]),
      el('p', { class: 'guide-step__lede', text: step.lede }),
      step.points
        ? el('dl', { class: 'guide-points' }, step.points.flatMap(([term, def]) => [
            el('dt', { text: term }),
            el('dd', { text: def }),
          ]))
        : null,
      step.body ? el('p', { text: step.body }) : null,
      step.aside ? el('p', { class: 'hint hint--boxed', text: step.aside }) : null,
    ])),

    el('h2', { class: 'guide-divider', text: 'The four takbirs' }),
    ...TAKBIRS.map(takbirSection),

    el('section', { class: 'quick-ref reveal', id: 'quick-reference' }, [
      el('h2', { text: 'Quick reference' }),
      el('p', { class: 'muted', text: 'For the minute before the prayer begins.' }),
      el('ol', { class: 'quick-ref__list' }, QUICK_REFERENCE.map(([label, what], i) =>
        el('li', {}, [
          el('span', { class: 'quick-ref__num', 'aria-hidden': 'true', text: String(i + 1) }),
          el('div', {}, [
            el('strong', { text: label }),
            el('span', { class: 'quick-ref__what', text: what }),
          ]),
        ]))),
    ]),

    el('section', { class: 'guide-step reveal' }, [
      el('div', { class: 'guide-step__head' }, [
        el('span', { class: 'guide-step__num', 'aria-hidden': 'true' }, [icon('route', { size: 18 })]),
        el('h2', { text: AFTER.heading }),
      ]),
      el('dl', { class: 'guide-points' }, AFTER.points.flatMap(([term, def]) => [
        el('dt', { text: term }),
        el('dd', { text: def }),
      ])),
    ]),

    el('footer', { class: 'guide-foot' }, [
      el('p', { class: 'muted', text: SCOPE_NOTE }),
      el('div', { class: 'hero__actions' }, [
        el('a', { class: 'btn', href: '/janazahs', text: 'Current Janazah notices' }),
        el('a', { class: 'btn btn--link', href: '/', text: 'Home' }),
      ]),
    ]),
  );
}
