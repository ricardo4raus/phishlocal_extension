/*
 * Text patterns shared by the AI answer reader (`verdict.ts`) and the privacy filter in front of
 * the cloud (`../privacy/redact.ts`): links, email addresses, phone-like numbers and dates.
 */

// Any scheme ("ftp://", not only "https://"), and no \b in front: a link glued to a word
// ("4567https://evil.example") must go too.
export const FULL_URL = /(?:[a-z][a-z\d+.-]*:\/\/|www\.)\S+/gi;
export const EMAIL_ADDRESS = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
/*
 * A phone number: digits of any script (Arabic-Indic too), grouped by spaces, parentheses, dash
 * punctuation (\p{Pd}), the minus sign, dots (also middle dots, bullets, hyphenation point,
 * katakana middle dot) or slashes. Other characters ("|", "[") split a number: no filter can
 * know every separator, and adding commas would remove amounts like "12,345.67 EUR".
 */
const GROUPING = String.raw`\p{Pd} ()./\u2212\u00b7\u2022\u2027\u2219\u30fb\u2044\u2215`;
export const PHONE_NUMBER = new RegExp(String.raw`\+?\p{Nd}[\p{Nd}${GROUPING}]{7,}\p{Nd}`, 'gu');

/**
 * A date ("19.11.2026", "19/11/26", "2026-11-19") or a year range ("2020-2025") matches the
 * phone pattern too, but deadlines are the evidence a reason needs: kept. Only real date shapes:
 * day and month have 1 or 2 digits and plausible values, so "0791-2345", "555-12-3456" or
 * "079.12.3456" are still removed. Year ranges count only for 19xx and 20xx.
 */
const DATE_SEPARATOR = String.raw`[./\p{Pd}\u2044\u2215]`;
const DAY_MONTH_YEAR = new RegExp(
  String.raw`^(\d{1,2})(${DATE_SEPARATOR})(\d{1,2})\2(?:\d{4}|\d{2})$`,
  'u',
);
const YEAR_MONTH_DAY = new RegExp(String.raw`^\d{4}(${DATE_SEPARATOR})(\d{1,2})\1(\d{1,2})$`, 'u');
const YEAR_RANGE = /^(?:19|20)\d\d ?\p{Pd} ?(?:19|20)\d\d$/u;

const isDigit = (char: string): boolean => /^\p{Nd}$/u.test(char);

/**
 * Digits of any script as ASCII digits (NFKC folds only some, e.g. fullwidth). Unicode keeps
 * each script's digits 0 to 9 in a row, so a digit's value is its distance from the start of
 * that row (several rows in a row, as for mathematical digits, repeat every 10).
 */
function asciiDigits(text: string): string {
  return text.replace(/\p{Nd}/gu, (char) => {
    const code = char.codePointAt(0) ?? 0;
    let start = code;
    while (start > 0 && isDigit(String.fromCodePoint(start - 1))) start--;
    return String((code - start) % 10);
  });
}

/** Day and month (either order) are plausible. */
function plausible(first: string, second: string): boolean {
  const [a, b] = [Number(first), Number(second)];
  return a >= 1 && b >= 1 && a <= 31 && b <= 31 && (a <= 12 || b <= 12);
}

function isDate(text: string): boolean {
  const ascii = asciiDigits(text);
  if (YEAR_RANGE.test(ascii)) return true;
  const dayFirst = DAY_MONTH_YEAR.exec(ascii);
  if (dayFirst) return plausible(dayFirst[1] ?? '', dayFirst[3] ?? '');
  const yearFirst = YEAR_MONTH_DAY.exec(ascii);
  return yearFirst ? plausible(yearFirst[2] ?? '', yearFirst[3] ?? '') : false;
}

/**
 * Replaces phone-pattern matches with `replacement`, but keeps a match that is a date, or holds
 * dates and nothing else that reads as a phone number. The match can hold more than a date
 * ("19.11.2026 12" from "19.11.2026 12:00"), so its space-separated parts are read: the parts that
 * are not dates, joined, must not be a phone number. Joined, not one by one: a date placed between
 * the groups of a phone number ("079 19.11.2026 123 4567") must not split it into harmless-looking
 * pieces (found in review). A phone number right next to a date takes the date with it; that errs
 * on the safe side.
 */
export function replacePhoneNumbers(text: string, replacement: string): string {
  return text.replaceAll(PHONE_NUMBER, (match: string, offset: number) => {
    if (isDate(match)) return match;
    const parts = match.split(' ');
    if (!parts.some(isDate)) return replacement;
    // A "+" starts only phone numbers, never a date: "+49 30/12/34 56789" holds a date-shaped
    // group, and the rest alone is too short to read as a number (found by the monkey test). Not
    // after a time zone: "UTC+1 19.11.2026" is a deadline (found in review).
    const timeZone = /(?:UTC|GMT)$/iu.test(text.slice(Math.max(0, offset - 3), offset));
    if (match.startsWith('+') && !timeZone) return replacement;
    const rest = parts.filter((part) => !isDate(part)).join(' ');
    const phoneInRest = [...rest.matchAll(new RegExp(PHONE_NUMBER.source, 'gu'))].some(
      ([number]) => !isDate(number),
    );
    return phoneInRest ? replacement : match;
  });
}

/** Invisible format characters (zero-width, soft hyphen, direction controls). */
const INVISIBLE = /\p{Cf}/gu;

/** The ideographic full stop, which NFKC keeps (its halfwidth form becomes it): read as "." */
const IDEOGRAPHIC_STOP = /\u3002/g;

/**
 * The text as it is shown, so the patterns see what a reader sees: a phone number split by line
 * breaks, invisible characters or fullwidth digits would otherwise slip past them (found by the
 * monkey test). Invisible characters go before NFKC too, so an accent behind one joins its letter
 * ("example" + U+200F + U+0301 is "examplé", not "example" with a loose accent; found by the
 * monkey test).
 */
export function normalizeText(text: string): string {
  return text
    .replace(INVISIBLE, '')
    .normalize('NFKC')
    .replace(INVISIBLE, '')
    .replace(IDEOGRAPHIC_STOP, '.')
    .replace(/\s+/g, ' ');
}
