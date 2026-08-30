// The Janazah guide's religious content.
// Implementation: public/js/janazah-guide-content.js.
//
// Read the header of that file before touching anything it exports. Nothing
// in it is paraphrased, shortened or generated, every recitation carries its
// source, and this app renders it unchanged. The mobile guide screen is a
// layout, not an edition.
//
// The types below describe what that file already contains. They are written
// to be a faithful description of it and nothing more: if a type here does
// not fit, the type is wrong, because the content is the authority.

import * as guide from '../../../public/js/janazah-guide-content.js';

/** A [label, text] pair. Used for point lists and the quick reference. */
export type Pair = string[];

export type Recitation = {
  title?: string;
  note?: string;
  arabic?: string;
  transliteration?: string;
  meaning?: string;
  source?: string;
};

export type GuideStep = {
  number: number;
  title: string;
  lede?: string;
  points?: Pair[];
  body?: string;
  aside?: string;
};

/** A headed passage of prose, sometimes carrying Arabic of its own. */
export type Passage = Recitation & { heading?: string; body?: string };

export type Takbir = {
  number: number;
  label: string;
  takbir?: Recitation;
  intro?: string;
  recitations?: Recitation[];
  /**
   * Shown when the deceased is a child. The dua genuinely differs, and this
   * is one of the places where dropping content for space on a phone would
   * make the guide wrong rather than merely shorter.
   */
  childNote?: Passage;
  closing?: Passage;
};

export type PronounNote = {
  heading: string;
  body: string;
  /** [description, transliterated ending, Arabic ending] */
  forms: Pair[];
  footnote: string;
};

export type Section = { heading: string; points?: Pair[]; body?: string };

export const STEPS: GuideStep[] = guide.STEPS;
export const TAKBIRS: Takbir[] = guide.TAKBIRS;
export const PRONOUN_NOTE: PronounNote = guide.PRONOUN_NOTE;
export const QUICK_REFERENCE: Pair[] = guide.QUICK_REFERENCE;
export const AFTER: Section = guide.AFTER;
export const ISTIRJA: {
  arabic: string;
  transliteration: string;
  english: string;
  source: string;
} = guide.ISTIRJA;

/**
 * Both of these are shown on the guide screen, unedited. The first says the
 * schools of law differ; the second says Ta'ziyah is a notification service
 * and not a religious authority. Neither is decoration and neither is cut for
 * space on a small screen.
 */
export const SCHOOLS_NOTE: string = guide.SCHOOLS_NOTE;
export const SCOPE_NOTE: string = guide.SCOPE_NOTE;
