/*
 * Unicode tricks: invisible characters inside words, and words that mix Latin letters with
 * Cyrillic or Greek ones that look the same ("pаypal" with a Cyrillic "а"). Both hide a word
 * from filters while the reader sees a normal word, so both are red flags of their own.
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

/** Shows invisible characters as `<U+200B>`, so the evidence can be read. */
const reveal = (word: string): string =>
  word.replaceAll(
    /\p{Cf}/gu,
    (char) => `<U+${(char.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, '0')}>`,
  );

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
