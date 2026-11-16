/*
 * Whole-word matching for names and phrases in any of our languages.
 */

const escapeRegExp = (text: string): string => text.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * A pattern that finds any of `words` as whole words: not inside a longer word, in any letter
 * case, with any whitespace between the words of a phrase. Built only from our own fixed lists
 * (escaped), never from email content, and it has no nested repetition, so it cannot hang.
 */
export function wordsPattern(words: readonly string[], flags = 'giu'): RegExp {
  const alternatives = words.map((word) => escapeRegExp(word.trim()).replaceAll(/\s+/g, '\\s+'));
  return new RegExp(`(?<![\\p{L}\\p{N}])(?:${alternatives.join('|')})(?![\\p{L}\\p{N}])`, flags);
}

/**
 * Invisible formatting characters: zero-width space and joiners, soft hyphen, word joiner,
 * direction marks. Attackers put them inside words to slip past filters ("con\u200bfirm").
 */
export const INVISIBLE = /\p{Cf}/gu;

/**
 * Text in one comparable form, used by every rule: compatibility characters folded (NFKC turns
 * full-width or ligature letters into plain ones), invisible characters removed, the ideographic
 * full stop read as a dot (browsers do the same in domain names), lowercase, typographic
 * apostrophes as `'`.
 */
export const normalizeText = (text: string): string =>
  text
    .normalize('NFKC')
    .replaceAll(INVISIBLE, '')
    .replaceAll('。', '.')
    .toLowerCase()
    .replaceAll(/[‘’ʼ`´]/g, "'");
