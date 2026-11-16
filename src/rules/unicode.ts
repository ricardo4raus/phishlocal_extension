/*
 * Unicode tricks: invisible characters inside words, and words that mix Latin letters with
 * Cyrillic or Greek ones that look the same ("paypal" written with a Cyrillic "a"). Both hide a
 * word from filters while the reader sees a normal word, so both are red flags of their own.
 */
import type { Email } from '../email';
import { clip, type Finding } from './types';
import { normalizeText } from './words';

/** Latin, Cyrillic and Greek letters: the alphabets whose letters look alike. */
const ALPHABET = String.raw`[\p{sc=Latin}\p{sc=Cyrillic}\p{sc=Greek}]`;

/**
 * A Latin, Cyrillic or Greek word with invisible format characters inside (zero-width space,
 * joiners, direction marks). Other scripts are left out because Arabic, Persian and Indic text
 * needs zero-width joiners; soft hyphens (U+00AD) too, because newsletters use them to hyphenate
 * long words. The lookbehind starts a match only at the beginning of a word, so the pattern stays
 * linear.
 */
const HIDDEN_IN_WORD = new RegExp(
  String.raw`(?<!${ALPHABET})${ALPHABET}+(?:(?:(?!\xAD)\p{Cf})+${ALPHABET}+)+`,
  'gu',
);

const WORD = /[\p{L}\p{M}]+/gu;
const LATIN = /\p{Script=Latin}/u;
const LOOKALIKE_SCRIPT = /[\p{Script=Cyrillic}\p{Script=Greek}]/u;

/** At most this many words are listed per finding. */
const MAX_WORDS_SHOWN = 5;

const codeLabel = (char: string): string =>
  `<U+${(char.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, '0')}>`;

/** Shows invisible characters as `<U+200B>`, so the evidence can be read. */
const reveal = (word: string): string => word.replaceAll(/\p{Cf}/gu, codeLabel);

/**
 * The left-to-right and right-to-left overrides (U+202D, U+202E). They force the direction of
 * the text that follows: written "moc.lapyap", displayed "paypal.com" (MITRE ATT&CK T1036.002).
 * Built from code points, so the source itself contains no invisible characters.
 */
const OVERRIDES = new RegExp(`[${String.fromCodePoint(0x202d, 0x202e)}]`, 'gu');

/**
 * Shows direction overrides as `<U+202E>`, so text in the side panel reads as it is written.
 * Other direction marks are left alone: Arabic and Hebrew text needs them.
 */
export const revealOverrides = (text: string): string => text.replaceAll(OVERRIDES, codeLabel);

/** Text around the first override, with the override visible. */
function overrideSnippet(text: string): string | undefined {
  const at = text.search(OVERRIDES);
  return at < 0 ? undefined : revealOverrides(text.slice(Math.max(0, at - 20), at + 60));
}

function textsOf(email: Email): string[] {
  return [
    email.sender.name,
    email.sender.address,
    email.subject,
    email.bodyText,
    ...email.links.flatMap((link) => [link.text, link.href]),
  ];
}

const unique = (words: string[]): string[] => [...new Set(words)].slice(0, MAX_WORDS_SHOWN);

export function checkUnicode(email: Email): Finding[] {
  const texts = textsOf(email);
  const findings: Finding[] = [];

  const reversed = unique(texts.flatMap((text) => overrideSnippet(text) ?? [])).map(clip);
  if (reversed.length > 0) {
    findings.push({
      rule: 'direction-override',
      severity: 'warning',
      // The message is fixed text; the attacker's text stays in the evidence.
      message:
        'Text contains a hidden direction switch (U+202E or U+202D) that makes it display differently than it is written, e.g. "moc.lapyap" shows as "paypal.com".',
      evidence: reversed,
    });
  }

  const hidden = unique(
    texts.flatMap((text) => Array.from(text.matchAll(HIDDEN_IN_WORD), ([word]) => reveal(word))),
  ).map(clip);
  if (hidden.length > 0) {
    findings.push({
      rule: 'hidden-characters',
      severity: 'warning',
      message: `Words contain invisible characters, a trick to slip past filters: ${hidden.join(', ')}.`,
      evidence: hidden,
    });
  }

  const mixed = unique(
    texts.flatMap((text) =>
      Array.from(normalizeText(text).matchAll(WORD), ([word]) => word).filter(
        (word) => LATIN.test(word) && LOOKALIKE_SCRIPT.test(word),
      ),
    ),
  ).map(clip);
  if (mixed.length > 0) {
    findings.push({
      rule: 'mixed-script',
      severity: 'warning',
      message: `Words mix Latin letters with Cyrillic or Greek letters that look the same: ${mixed.join(', ')}.`,
      evidence: mixed,
    });
  }
  return findings;
}
