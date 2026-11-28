/*
 * The privacy filter in front of the cloud "deep check". It runs on the device and builds the only
 * data that may leave it, after the user has seen it and agreed:
 *
 * - links become their host ("[link: evil.example]"): a phishing link's path and query often hold
 *   an ID that identifies the user;
 * - email addresses keep only their domain ("[email]@lumorabank.example");
 * - IBANs and long numbers (phone, card, customer and account numbers) become placeholders; dates
 *   stay, because deadlines are evidence;
 * - at privacy level "high" only, names become "[name]": the names Gemini Nano found on the
 *   device, the name after a greeting ("Dear Anna Muster"), and the sender's name when Nano could
 *   not look for names. Level "standard" (the default) keeps names.
 *
 * Raw headers never go: they hold the user's address and server IP addresses. Of the headers,
 * only the sender check results (pass/fail and signing domains) and the Reply-To domains go.
 */
import { FULL_URL, isPhoneNumber, normalizeText, PHONE_NUMBER } from '../ai/patterns';
import { PROMPT_LIMITS, randomMarker } from '../ai/prompt';
import { type Email, FIELD_LIMITS, MAX_BODY_CHARS } from '../email';
import type { Finding } from '../rules';
import { hostOfAddress, parseUrl } from '../rules/domains';
import {
  concat,
  NAME_STAND_IN,
  offsetOf,
  type Replacement,
  sortSpans,
  type Tracked,
  Tracker,
  untouched,
} from './tracked';

export const PLACEHOLDER = {
  name: '[name]',
  email: '[email]',
  number: '[number]',
  iban: '[iban]',
} as const;

/** How many items of each kind the filter replaced. */
export interface Removed {
  names: number;
  emails: number;
  numbers: number;
  ibans: number;
  links: number;
}

const none = (): Removed => ({ names: 0, emails: 0, numbers: 0, ibans: 0, links: 0 });

/**
 * Anything shaped like an email address, wider than the AI answer reader's pattern: letters of
 * any script ("jürgen.müller@…"), and no top-level domain needed, so an address cut short at the
 * end of a field ("anna@private.") or written without one ("anna@gmail") goes too (found by the
 * monkey test).
 */
const ANY_ADDRESS = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}-]*(?:\.[\p{L}\p{N}-]*)*/gu;

/**
 * A link without a scheme that has a path, query or fragment ("login.example/verify?uid=7f3a"):
 * its path can hold an ID that identifies the user too (found in review). A bare domain without
 * one stays; it names no one.
 */
const BARE_LINK = new RegExp(
  String.raw`(?<![\p{L}\p{N}.-])` +
    // A user name (and password) in front goes with it: "anna:pw@host.example/x".
    // (No "?" or "#" in the password: "anna:1234?x@host" would read "anna" as the host.)
    String.raw`(?:[\p{L}\p{N}._%+-]+(?::[^\s@/?#\\]*)?@)?` +
    // A host name with a letter or punycode ending, or an IP address (found in review).
    String.raw`(?:(?:[\p{L}\p{N}-]+\.)+(?:\p{L}{2,24}|xn--[a-z\d-]+)|\d{1,3}(?:\.\d{1,3}){3}|\[[\da-f:.]+\])` +
    // Also a backslash path ("login.example\verify?uid="), which browsers read as "/".
    String.raw`(?::\d+)?[/?#\\]\S*`,
  'giu',
);

/**
 * An IBAN: country code, check digits, then 11 to 30 letters or digits, written in one piece or in
 * groups of four. At least 8 digits in it, so that words after "AB12" are not taken for one.
 */
const IBAN =
  /(?<![\p{L}\p{N}])[A-Z]{2}\d{2}(?: ?[A-Z\d]{4}){2,7}(?: ?[A-Z\d]{1,4})?(?![\p{L}\p{N}])/giu;
const MIN_IBAN_DIGITS = 8;

/** Greetings in the six languages; the capitalized words after one are taken as a name. */
const GREETINGS = [
  'dear',
  'good morning',
  'good afternoon',
  'good evening',
  'hello',
  'hi',
  'hey',
  'liebe',
  'lieber',
  'liebes',
  'hallo',
  'guten tag',
  'guten morgen',
  'grüezi',
  'grüss gott',
  'moin',
  'servus',
  'sehr geehrte',
  'sehr geehrter',
  'bonjour',
  'bonsoir',
  'salut',
  'cher',
  'chère',
  'hola',
  'buenos días',
  'buenas tardes',
  'estimado',
  'estimada',
  'querido',
  'querida',
  'ciao',
  'salve',
  'gentile',
  'caro',
  'cara',
  'buongiorno',
  'olá',
  'oi',
  'bom dia',
  'boa tarde',
  'prezado',
  'prezada',
];

/** Titles between a greeting and a name ("Dear Mrs Muster"). */
const TITLES = [
  'mr',
  'mrs',
  'ms',
  'miss',
  'dr',
  'herr',
  'frau',
  'm',
  'mme',
  'mlle',
  'monsieur',
  'madame',
  'sr',
  'sra',
  'señor',
  'señora',
  'don',
  'doña',
  'sig',
  'signor',
  'signora',
  'senhor',
  'senhora',
];

/** Words after a greeting that are no name ("Dear Customer"): kept, they are evidence. */
const NOT_NAMES = new Set([
  'customer',
  'customers',
  'client',
  'clients',
  'user',
  'users',
  'member',
  'members',
  'sir',
  'madam',
  'team',
  'all',
  'everyone',
  'friend',
  'friends',
  'colleague',
  'colleagues',
  'account',
  'holder',
  'kunde',
  'kundin',
  'kunden',
  'nutzer',
  'nutzerin',
  'mitglied',
  'damen',
  'herren',
  'kollegen',
  'utilisateur',
  'utilisatrice',
  'abonné',
  'cliente',
  'clientes',
  'usuario',
  'usuaria',
  'utente',
  'socio',
  'socia',
  'amigo',
  'amiga',
  'equipo',
  'équipe',
  'membre',
  ...TITLES,
]);

/**
 * A greeting pattern, each word capitalized or not ("guten tag" matches "Guten Tag" and "guten
 * tag").
 */
const greetingPattern = (greeting: string): string =>
  greeting
    .split(' ')
    .map((word) => `[${word[0]?.toUpperCase()}${word[0]}]${word.slice(1)}`)
    .join(' ');

/** The words of the greetings ("dear", "guten", "tag"): no names, except those that are names too. */
const GREETING_WORDS = new Set(
  GREETINGS.flatMap((greeting) => greeting.split(' ')).filter(
    (word) => !['cara', 'caro', 'oi'].includes(word),
  ),
);

const isGreetingWord = (word: string): boolean => GREETING_WORDS.has(word.toLowerCase());

const escapeRegex = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);

const GREETING = new RegExp(
  String.raw`(?<![\p{L}\p{N}])(?:${GREETINGS.map(greetingPattern).join('|')})((?:,? \p{Lu}[\p{L}'-]*\.?){1,4})`,
  'gu',
);

/**
 * The names right after a greeting ("Hallo Anna Muster," gives "Anna Muster"). Titles, generic
 * words ("Dear Customer") and greeting words ("Hello Dear Customer") are skipped, so they stay as
 * evidence. A brand after a greeting ("Dear Lumora Bank Customer") is taken as a name: removing a
 * brand costs evidence, keeping a name would cost privacy (a person's domain can hold their name).
 */
export function greetingNames(text: string): string[] {
  const names: string[] = [];
  for (const [, words = ''] of normalizeText(text).matchAll(GREETING)) {
    const name: string[] = [];
    for (const [index, word] of words.replace(/^,/, '').trim().split(' ').entries()) {
      const bare = word.replace(/\.$/, '');
      // A greeting word counts only right after the greeting ("Hello Dear Customer"); later it can
      // be a surname ("Dear Mr Gentile", "Dear Anna Morgen"; found in review round 3).
      if (NOT_NAMES.has(bare.toLowerCase()) || (index === 0 && isGreetingWord(bare))) {
        if (name.length > 0) break;
        continue;
      }
      name.push(bare);
    }
    if (name.length > 0) names.push(name.join(' '));
  }
  return names;
}

/** Longest name taken from the model; a longer entry is no name. */
const MAX_NAME = 60;
/** Most names taken from the model (an injection could send a flood). */
const MAX_NAMES = 50;

/**
 * Nano's names, ready for {@link nameVariants}: a list in one entry ("Peter Meier, Claudia
 * Schneider") is split; at most {@link MAX_NAMES} names of at most {@link MAX_NAME} characters.
 * `dropped`: some were left out, so names may remain (found in review: they were dropped silently).
 */
export function modelNames(found: readonly string[]): { names: string[]; dropped: boolean } {
  const names = found
    // Conjunctions only between spaces: "\b" knows only ASCII letters, so "Renée" split at its
    // last "e" (found in review).
    .flatMap((entry) => entry.split(/[,;/&]|\s(?:and|und|et|y|e)\s/u))
    .map((name) => normalizeText(name).trim())
    .filter((name) => name !== '');
  const usable = names.filter((name) => name.length <= MAX_NAME).slice(0, MAX_NAMES);
  return { names: usable, dropped: usable.length < names.length };
}

/**
 * The names to replace: each full name and its parts ("Anna Muster", "Anna", "Muster"), at least
 * 2 characters ("Li", "Ng") with a letter, without titles. Longest first, so a full name goes in
 * one piece.
 */
export function nameVariants(names: readonly string[]): string[] {
  const variants = new Set<string>();
  for (const raw of names) {
    const name = normalizeText(raw).trim();
    // Parts at spaces and hyphens: "Schneider-Rossi" gives "Schneider" and "Rossi" too.
    for (const part of [name, ...name.split(/[ -]/u)]) {
      const bare = part.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
      if (bare.length < 2 || !/\p{L}/u.test(bare)) continue;
      if (TITLES.includes(bare.toLowerCase())) continue;
      variants.add(bare);
    }
  }
  return [...variants].toSorted((a, b) => b.length - a.length);
}

/** Adds the spans of a tracked text to the counts. */
function countSpans(removed: Removed, tracked: Tracked): void {
  for (const span of tracked.spans) removed[COUNTED[span.kind]]++;
}

const COUNTED: Record<RedactedKind, keyof Removed> = {
  name: 'names',
  email: 'emails',
  number: 'numbers',
  iban: 'ibans',
  link: 'links',
};

/**
 * A link in the text as its host only (see {@link trueHost}). The host goes through the name and
 * number filter too: the host `URL` reads can hold a name the text hid ("%41nna.example").
 * `bare`: the match has no scheme (BARE_LINK); it is read with "https://" in front.
 */
function linkPlaceholder(match: string, names: readonly string[], bare = false): Replacement {
  const link = bare || /^www\./iu.test(match) ? `https://${match}` : match;
  const { host, at } = trueHostAt(link);
  if (!host) return { kind: 'link', text: '[link]' };
  // An IP address would be read as a number by the next step and turn into "[number]".
  if (IP_ADDRESS.test(host)) return { kind: 'link', text: '[link: IP address]' };
  const inner = redactHostTracked(host, names, { fromText: true });
  const prefix = '[link: ';
  const shift = link.length - match.length;
  return {
    kind: 'link',
    ...concat(prefix, inner, ']'),
    // A character of the written host: where it stands in the cleaned host (undefined when URL
    // rewrote the host, or for the scheme, user name, path and query, which are gone). The host
    // is the link's slice in lower case, which can be longer ("İ" becomes two units; review).
    slotFor: (offset) => {
      const inLink = offset + shift;
      if (at === undefined || inLink < at) return undefined;
      const inHost = offsetOf(inner, link.slice(at, inLink).toLowerCase().length);
      return inHost === undefined ? undefined : prefix.length + inHost;
    },
  };
}

/** An IPv4 address, or an IPv6 address in brackets, as a link's host. */
const IP_ADDRESS = /^(?:[\d.]+|\[[\da-f:.]+\])$/iu;

/**
 * The host of a link as written, lower case, or '' if there is none. Only letters, digits, dots
 * and hyphens (or an IPv6 address in brackets): anything else ends it, so a percent-encoded path
 * or trailing punctuation does not ride along ("evil.example%2Fuid%3D1", "evil.example).").
 */
export function linkHost(link: string): string {
  return linkHostAt(link).host;
}

/** {@link linkHost}, and where the host starts in the link. */
function linkHostAt(link: string): { host: string; at: number } {
  const scheme = /^[a-z][a-z\d+.-]*:\/\//iu.exec(link)?.[0].length ?? 0;
  const authority = link.slice(scheme).split(/[/?#\\\s]/u)[0] ?? '';
  const userEnd = authority.lastIndexOf('@') + 1;
  const hostAndPort = authority.slice(userEnd);
  const host = hostAndPort.startsWith('[')
    ? (/^\[[\da-f:.]+\]/iu.exec(hostAndPort)?.[0] ?? '')
    : (/^[\p{L}\p{N}.-]*/u.exec(hostAndPort)?.[0] ?? '').replace(/\.+$/u, '');
  return { host: host.toLowerCase(), at: scheme + userEnd };
}

/**
 * The host a browser goes to, as written in the link (so a name in it can be found, rather than
 * its punycode) when that is the same host; otherwise the host `URL` reads. A link written to
 * show another host than it goes to ("lumorabank.example%2Eevil.example", "https:evil.example")
 * then shows the real one (found in review round 6). The stand-in for a removed name is a letter
 * `URL` would fold, so it is compared as a plain letter.
 */
export function trueHost(link: string): string {
  return trueHostAt(link).host;
}

/**
 * {@link trueHost}, and where the host starts in the link when it is the written one (so a name
 * stand-in in it keeps its original); undefined when `URL` rewrote it.
 */
function trueHostAt(link: string): { host: string; at?: number } {
  const { host: written, at } = linkHostAt(link);
  // A trailing dot is the same host ("müller.example." at the end of a sentence; review round 7).
  const parsed = (parseUrl(plain(link))?.hostname ?? '').replace(/\.+$/u, '');
  if (!parsed) return { host: written, at };
  if (parseUrl(`https://${plain(written)}`)?.hostname === parsed) return { host: written, at };
  // `URL` also takes punctuation into a host ("evil.example)."): only the host characters count.
  return { host: linkHost(`https://${parsed}`).replaceAll(STAND_IN_MARK, NAME_STAND_IN) };
}

/**
 * The stand-in for a name as plain letters, as `URL` can read it, and back: a marker no host
 * holds by chance, so a host `URL` read gets its "[name]" back (review round 7: it showed "x").
 */
const STAND_IN_MARK = 'zqnamezq';
const plain = (text: string): string => text.replaceAll(NAME_STAND_IN, STAND_IN_MARK);

/** An email address as its domain only. */
export function addressPlaceholder(address: string): string {
  const at = address.lastIndexOf('@');
  // Only what looks like a domain: a pasted "anna@mail.example (Anna Muster)" ends in a name.
  const domain = at >= 0 ? (/^[\p{L}\p{N}.-]*/u.exec(address.slice(at + 1))?.[0] ?? '') : '';
  return domain ? `${PLACEHOLDER.email}@${domain.toLowerCase()}` : PLACEHOLDER.email;
}

/**
 * Removes personal data from one text and counts what it removed (into `removed`). `names` are
 * the variants from {@link nameVariants}.
 */
export function redactText(text: string, names: readonly string[], removed: Removed): string {
  const tracked = redactTextTracked(text, names);
  countSpans(removed, tracked);
  return tracked.text;
}

/** {@link redactText} with the position and the original of every placeholder. */
export function redactTextTracked(text: string, names: readonly string[]): Tracked {
  const tracker = new Tracker(normalizeText(text));
  // Names first, before any placeholder exists: a placeholder can then neither hide a name nor be
  // changed by one, and a name inside a link or an address goes with it (found in review round 3:
  // shielding placeholders afterwards let "[link: " in an email shield the names behind it).
  // Until the end, a name stands as one letter that normalized text cannot hold (NAME_STAND_IN,
  // U+1D40D, a mathematical bold capital N, which NFKC folds away), so the link and address
  // patterns still see a whole word ("hans.<name>@mail.example"; a "[name]" there broke them and
  // the rest of the address went out; found in review round 4).
  replaceNames(tracker, names);
  tracker.pass(FULL_URL, (link) => linkPlaceholder(link, names));
  // Before the addresses: "anna:pw@host.example/x" is a link with a user name, not an address.
  tracker.pass(BARE_LINK, (link) => linkPlaceholder(link, names, true));
  tracker.pass(ANY_ADDRESS, (address) => {
    const at = address.lastIndexOf('@');
    const prefix = `${PLACEHOLDER.email}@`;
    return {
      kind: 'email',
      text: addressPlaceholder(address),
      // The domain is kept, in lower case (which can be longer: "İ" becomes two units), the
      // local part is gone.
      slotFor: (offset) =>
        offset > at
          ? prefix.length + address.slice(at + 1, offset).toLowerCase().length
          : undefined,
    };
  });
  tracker.pass(IBAN, (iban) =>
    (iban.match(/\d/g)?.length ?? 0) < MIN_IBAN_DIGITS
      ? undefined
      : { kind: 'iban', text: PLACEHOLDER.iban },
  );
  replaceNumbers(tracker);
  tracker.swapNameStandIns();
  tracker.trim();
  return tracker.result();
}

/** Phone, card, account and customer numbers, but not dates. */
function replaceNumbers(tracker: Tracker): void {
  tracker.pass(PHONE_NUMBER, (match, offset, text) =>
    isPhoneNumber(match, offset, text) ? { kind: 'number', text: PLACEHOLDER.number } : undefined,
  );
}

/**
 * A host or domain on its own (a link target, an address domain, a DKIM domain): names and
 * numbers go, but no link or address pattern runs on it, so "www.bank.example" stays a host
 * (found in review round 6). Every word in it counts as part of a host. IP addresses stay.
 */
export function redactHost(
  host: string,
  names: readonly string[],
  removed: Removed,
  options: { fromText?: boolean } = {},
): string {
  const tracked = redactHostTracked(host, names, options);
  countSpans(removed, tracked);
  return tracked.text;
}

/** {@link redactHost} with the position and the original of every placeholder. */
export function redactHostTracked(
  host: string,
  names: readonly string[],
  { fromText = false }: { fromText?: boolean } = {},
): Tracked {
  if (IP_ADDRESS.test(host)) return untouched(host);
  // A host from the text is normalized already; normalizing it again would fold the stand-in.
  // Any other host is normalized (review round 7: full-width letters passed).
  const tracker = new Tracker(fromText ? host : normalizeText(host));
  replaceNames(tracker, hostNames(names), { host: true });
  replaceNumbers(tracker);
  tracker.swapNameStandIns();
  tracker.trim();
  return tracker.result();
}

/**
 * The names as a host may write them: as they are, and a name with letters beyond ASCII also as
 * its punycode label ("xn--mller-kva" for "Müller"), for hosts that only `URL` could read.
 */
function hostNames(names: readonly string[]): string[] {
  const punycode = names
    .filter((name) => !name.includes(' ') && /\P{ASCII}/u.test(name))
    .map((name) => parseUrl(`https://${name}.example`)?.hostname.split('.')[0] ?? '')
    .filter((label) => label.startsWith('xn--'));
  return [...names, ...punycode];
}

/**
 * The word at `start`..`end` of `text` sits in a host, an address or a link: the run of text
 * without spaces around it holds an "@", a "://" or a dot followed by a letter or digit
 * ("muster-family.example", "anna.muster@"), not prose ("bank/insurance", "e-mail").
 */
function inAddress(text: string, start: number, end: number): boolean {
  const from = text.lastIndexOf(' ', start) + 1;
  const to = text.indexOf(' ', end);
  const token = text.slice(from, to < 0 ? text.length : to);
  return /@|:\/\/|\.[\p{L}\p{N}]/u.test(token);
}

/**
 * Replaces the names in any case ("ANNA MUSTER", "Strauß" for "STRAUẞ"), with one exception, so a
 * name part does not hit ordinary words ("will" for "Will Smith", "bank"): a single word written
 * all in lower case counts only as written by Nano, or inside a host, an address or a link
 * ("muster-family.example", "anna.muster@"), where lower case is the rule; there only from 3
 * letters on, so a part like "Li" does not take endings like "evil.li".
 */
function replaceNames(
  tracker: Tracker,
  names: readonly string[],
  { host = false }: { host?: boolean } = {},
): void {
  if (names.length === 0) return;
  const exact = new Set(names);
  // In a host, digits next to a name do not hide it ("anna1985.example"; review round 7).
  const edge = host ? String.raw`\p{L}` : String.raw`\p{L}\p{N}`;
  const pattern = new RegExp(
    String.raw`(?<![${edge}])(?:${names.map(escapeRegex).join('|')})(?![${edge}])`,
    'giu',
  );
  tracker.pass(pattern, (match, offset, text) => {
    const lowerWord = !match.includes(' ') && match === match.toLowerCase();
    const counts =
      !lowerWord ||
      exact.has(match) ||
      (match.length >= 3 && (host || inAddress(text, offset, offset + match.length)));
    return counts ? { kind: 'name', text: NAME_STAND_IN } : undefined;
  });
}

/**
 * How much the deep check removes. "standard" (the default): addresses, numbers, IBANs and link
 * paths. "high": also the names of people, found by Gemini Nano and after greetings.
 */
export type PrivacyLevel = 'standard' | 'high';

export const PRIVACY_LEVELS: readonly PrivacyLevel[] = ['standard', 'high'];

export const DEFAULT_PRIVACY_LEVEL: PrivacyLevel = 'standard';

/** The kinds of personal data the filter replaces. */
export type RedactedKind = 'name' | 'email' | 'number' | 'iban' | 'link';

/**
 * One replacement in {@link CloudData.json}: `json.slice(start, end)` is the placeholder the
 * filter wrote. The panel highlights these places and shows `original` on the device only.
 */
export interface RedactedSpan {
  /** UTF-16 offsets into the JSON text. */
  start: number;
  end: number;
  kind: RedactedKind;
  /** The text that stood there (normalized). Never sent. */
  original: string;
}

/** What the user sees and, after agreeing, sends to the cloud. */
export interface CloudData {
  /** The data block, exactly as it is shown and sent. */
  json: string;
  removed: Removed;
  /**
   * Every replacement in `json`, sorted by `start`; a span can lie inside another (a name in a
   * link's host). Empty when the positions could not be mapped; the counts still hold.
   */
  spans: RedactedSpan[];
  /**
   * True if Gemini Nano looked for names and every name it found could be used; otherwise names
   * may remain.
   */
  namesChecked: boolean;
}

/**
 * Rule messages that quote words of the email (which can be names, split by the very characters
 * the rule found): the cloud gets a fixed text instead (found in review).
 */
const FIXED_MESSAGES: Partial<Record<Finding['rule'], string>> = {
  'hidden-characters': 'Words contain invisible characters, a trick to slip past filters.',
  'mixed-script': 'Words mix Latin letters with Cyrillic or Greek letters that look the same.',
};

/**
 * A field as far as it goes to the cloud, normalized. A cut can split a phone number, an address
 * or an IBAN into pieces too short for the patterns, so a cut field loses its last word and any
 * digits and signs before it ("... call +41 79 12" ends at "call"). `cutBefore`: the field was
 * already cut where the email was read (it reached its limit there), which the cloud's limit may
 * not show after normalizing (found by the monkey test).
 */
export function cloudCut(text: string, max: number, cutBefore = false): string {
  const normalized = normalizeText(text).trim();
  if (normalized.length <= max && !cutBefore) return normalized;
  return normalized
    .slice(0, max)
    .replace(/\S*$/u, '')
    .replace(/[^\p{L}]*$/u, '');
}

/** The email's text fields as far as they go to the cloud, before the names are removed. */
function cloudFields(email: Email) {
  return {
    name: cloudCut(
      email.sender.name,
      PROMPT_LIMITS.name,
      email.sender.name.length >= FIELD_LIMITS.name,
    ),
    subject: cloudCut(
      email.subject,
      PROMPT_LIMITS.subject,
      email.subject.length >= FIELD_LIMITS.subject,
    ),
    linkTexts: email.links
      .slice(0, PROMPT_LIMITS.links)
      .map((link) =>
        cloudCut(link.text, PROMPT_LIMITS.linkText, link.text.length >= FIELD_LIMITS.linkText),
      ),
    // A body at its limit was cut where it was read, also when no source said so (monkey test).
    body: cloudCut(
      email.bodyText,
      PROMPT_LIMITS.body,
      email.truncated || email.bodyText.length >= MAX_BODY_CHARS,
    ),
  };
}

/** The text Gemini Nano reads to find names: exactly the text the cloud data is built from. */
export function nameSearchText(email: Email): string {
  const fields = cloudFields(email);
  return [fields.name, fields.subject, ...fields.linkTexts, fields.body].join('\n');
}

/**
 * The brand label of the sender's domain, lower case ("google" for accounts.google.com), when
 * DMARC confirmed it; otherwise undefined. Only this one domain counts: it is the visible From
 * domain the sender proved to own. DKIM domains do not: anyone can sign with up to ten domains of
 * their own, named like a person (found in review).
 */
function confirmedSenderBrand(email: Email): string | undefined {
  if (email.headers?.auth?.dmarc !== 'pass') return undefined;
  return hostOfAddress(email.sender.address)?.label;
}

/** A name without the punctuation around it, as nameVariants() takes it ("Google."), lower case. */
const bareLowerCase = (name: string): string =>
  name.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '').toLowerCase();

/**
 * Nano's names without an entry that is exactly the confirmed sender's brand: Nano sometimes lists
 * a company ("Google") as a person, and removing it took the evidence the cloud needs most, the
 * confirmed sender and DKIM domains (found in Chrome on 22 Nov 2026: "[email]@[name].com").
 * The sender can still choose this one label (it is their own domain), but every other entry, all
 * parts of longer names ("Anna Muster" removes "Anna") and names from greetings are removed.
 */
function withoutConfirmedBrand(names: readonly string[], email: Email): string[] {
  const brand = confirmedSenderBrand(email);
  return brand ? names.filter((name) => bareLowerCase(name) !== brand) : [...names];
}

/**
 * The cloud data for one email. `foundNames`: the names Gemini Nano found in
 * {@link nameSearchText}, or `undefined` if it could not look; then the sender's name is removed
 * entirely, since it may be a person's.
 *
 * `level`: "high" also removes names (from greetings and Nano's list); "standard" keeps every
 * name, so the cloud sees whether the email was written for this person or for everyone ("Dear
 * customer"). Addresses, numbers, IBANs and link paths are removed at both levels.
 */
export function cloudData(
  email: Email,
  findings: readonly Finding[],
  foundNames: readonly string[] | undefined,
  level: PrivacyLevel = 'high',
): CloudData {
  const fields = cloudFields(email);
  const high = level === 'high';
  const fromModel = modelNames(high ? (foundNames ?? []) : []);
  const names = high
    ? nameVariants([
        ...greetingNames(nameSearchText(email)),
        ...withoutConfirmedBrand(fromModel.names, email),
      ])
    : [];
  const clean = (text: string): Tracked => redactTextTracked(text, names);
  // Hosts and domains go through the name and number filter too: "secure.anna-muster.example" is
  // a host, and a name in it is still a name (found in review round 5).
  const cleanHost = (host: string): Tracked => redactHostTracked(host, names);
  // Only the domain goes through it: "[email]" must stay (review round 7: "Dear Email User").
  // The whole result stands for the address (one removed email address) with the domain's own
  // spans inside it; an empty address removes nothing.
  const cleanAddress = (address: string): Tracked => {
    const placeholder = addressPlaceholder(address);
    const at = placeholder.indexOf('@');
    const text =
      at < 0
        ? untouched(placeholder)
        : concat(`${PLACEHOLDER.email}@`, cleanHost(placeholder.slice(at + 1)));
    if (address === '') return text;
    return {
      ...text,
      spans: sortSpans([
        { start: 0, end: text.text.length, kind: 'email', original: address },
        ...text.spans,
      ]),
    };
  };
  const auth = email.headers?.auth;
  let senderName = clean(fields.name);
  if (high && !foundNames && senderName.text !== '') {
    senderName = {
      text: PLACEHOLDER.name,
      spans: [{ start: 0, end: PLACEHOLDER.name.length, kind: 'name', original: fields.name }],
      kept: [],
    };
  }
  // Every text the filter touched goes into the data as a token and is written back, with its
  // positions, by assemble(). The strings written as they are (rule names, result words, our own
  // fixed texts) hold no attacker text: the header parser keeps only lowercase result words.
  const tracked: Tracked[] = [];
  const marker = randomMarker();
  const token = (field: Tracked): string => {
    tracked.push(field);
    return `${TOKEN_MARK}${marker}${tracked.length - 1}${TOKEN_MARK}`;
  };
  const data = {
    rule_findings: findings
      .slice(0, PROMPT_LIMITS.findings)
      // Messages hold only limited email content (hostnames, our phrases), cleaned anyway; the
      // ones that quote words of the email get a fixed text.
      .map(({ rule, severity, message }) => ({
        rule,
        severity,
        message: FIXED_MESSAGES[rule] ?? token(clean(message)),
      })),
    sender_checks: auth
      ? {
          spf: auth.spf ?? 'none',
          dkim: auth.dkim.map((entry) =>
            entry.domain
              ? token(concat(`${entry.result} (`, cleanHost(entry.domain), ')'))
              : entry.result,
          ),
          dmarc: auth.dmarc ?? 'none',
          sender_domain_confirmed: auth.dmarc === 'pass',
        }
      : 'not available',
    email: {
      from: { name: token(senderName), address: token(cleanAddress(email.sender.address)) },
      ...(email.headers
        ? {
            reply_to: email.headers.replyTo.map((box) => token(cleanAddress(box.address))),
          }
        : {}),
      subject: token(clean(fields.subject)),
      links: email.links.slice(0, PROMPT_LIMITS.links).map((link, index) => ({
        text: token(clean(fields.linkTexts[index] ?? '')),
        // As written (not punycode), so a name in it is found.
        goes_to: parseUrl(link.href)?.hostname
          ? token(cleanHost(trueHost(link.href) || '(no host)'))
          : '(not a web link)',
      })),
      body: token(clean(fields.body)),
      body_cut: email.truncated || fields.body.length < normalizeText(email.bodyText).trim().length,
      sent_to_self: email.headers?.sentToSelf === true,
    },
  };
  const removed = none();
  for (const field of tracked) countSpans(removed, field);
  const { json, spans } = assemble(data, marker, tracked);
  return {
    json,
    removed,
    spans,
    // At "standard" no name is meant to be removed, so none can remain by mistake.
    namesChecked: !high || (foundNames !== undefined && !fromModel.dropped),
  };
}

/** Marks a token in the data skeleton: a private-use character `JSON.stringify` writes as it is. */
const TOKEN_MARK = '\uE000';

/** A JSON value as `JSON.stringify(_, null, 2)` writes it: only these shapes occur in the data. */
type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

/** The data with the tokens replaced by the real texts. */
function withTexts(value: Json, marker: string, tracked: readonly Tracked[]): Json {
  if (typeof value === 'string') {
    const found = new RegExp(`^${TOKEN_MARK}${marker}(\\d+)${TOKEN_MARK}$`, 'u').exec(value);
    return found ? (tracked[Number(found[1])]?.text ?? value) : value;
  }
  if (Array.isArray(value)) return value.map((item) => withTexts(item, marker, tracked));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, withTexts(item, marker, tracked)]),
    );
  }
  return value;
}

/**
 * The JSON text with every token replaced by its field's text, escaped as JSON does, and the
 * spans mapped into it. The result must equal `JSON.stringify` of the real data; if it does not
 * (a bug, or a token shape in the data), the real JSON goes out without positions: the sent data
 * never depends on the tracking.
 */
function assemble(
  data: Json,
  marker: string,
  tracked: readonly Tracked[],
): { json: string; spans: RedactedSpan[] } {
  const canonical = JSON.stringify(withTexts(data, marker, tracked), null, 2);
  const skeleton = JSON.stringify(data, null, 2);
  const tokens = new RegExp(`${TOKEN_MARK}${marker}(\\d+)${TOKEN_MARK}`, 'gu');
  const spans: RedactedSpan[] = [];
  let json = '';
  let last = 0;
  for (const found of skeleton.matchAll(tokens)) {
    const field = tracked[Number(found[1])];
    if (!field) return { json: canonical, spans: [] };
    json += skeleton.slice(last, found.index);
    const { escaped, offsets } = escapeWithOffsets(field);
    for (const span of field.spans) {
      spans.push({
        ...span,
        start: json.length + (offsets.get(span.start) ?? 0),
        end: json.length + (offsets.get(span.end) ?? 0),
      });
    }
    json += escaped;
    last = found.index + found[0].length;
  }
  json += skeleton.slice(last);
  if (json !== canonical) return { json: canonical, spans: [] };
  return { json, spans: sortSpans(spans) };
}

/**
 * A field's text escaped as inside a JSON string, piece by piece between the span boundaries, so
 * every boundary gets its offset in the escaped text.
 */
function escapeWithOffsets(field: Tracked): { escaped: string; offsets: Map<number, number> } {
  const boundaries = [
    ...new Set([0, field.text.length, ...field.spans.flatMap((span) => [span.start, span.end])]),
  ].toSorted((a, b) => a - b);
  const offsets = new Map<number, number>();
  let escaped = '';
  let from = 0;
  for (const boundary of boundaries) {
    escaped += JSON.stringify(field.text.slice(from, boundary)).slice(1, -1);
    offsets.set(boundary, escaped.length);
    from = boundary;
  }
  return { escaped, offsets };
}
