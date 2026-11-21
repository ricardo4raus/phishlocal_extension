/*
 * The privacy filter in front of the cloud "deep check". It runs on the device and builds the only
 * data that may leave it, after the user has seen it and agreed:
 *
 * - links become their host ("[link: evil.example]"): a phishing link's path and query often hold
 *   an ID that identifies the user;
 * - email addresses keep only their domain ("[email]@lumorabank.example");
 * - IBANs and long numbers (phone, card, customer and account numbers) become placeholders; dates
 *   stay, because deadlines are evidence;
 * - names become "[name]": the names Gemini Nano found on the device, the name after a greeting
 *   ("Dear Anna Muster"), and the sender's name when Nano could not look for names.
 *
 * Raw headers never go: they hold the user's address and server IP addresses. Of the headers,
 * only the sender check results (pass/fail and signing domains) and the Reply-To domains go.
 */
import { FULL_URL, normalizeText, replacePhoneNumbers } from '../ai/patterns';
import { PROMPT_LIMITS } from '../ai/prompt';
import { type Email, FIELD_LIMITS } from '../email';
import type { Finding } from '../rules';
import { parseUrl } from '../rules/domains';

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
    String.raw`(?::\d+)?[/?#]\S*`,
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

const count = (text: string, placeholder: string): number => text.split(placeholder).length - 1;

/** A link in the text as its host only. */
function linkPlaceholder(link: string): string {
  const url = parseUrl(/^www\./i.test(link) ? `https://${link}` : link);
  if (!url?.hostname) return '[link]';
  // An IP address would be read as a number by the next step and turn into "[number]".
  return /^[\d.]+$|^\[/.test(url.hostname) ? '[link: IP address]' : `[link: ${url.hostname}]`;
}

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
  // Names first, before any placeholder exists: a placeholder can then neither hide a name nor be
  // changed by one, and a name inside a link or an address goes with it (found in review round 3:
  // shielding placeholders afterwards let "[link: " in an email shield the names behind it).
  let clean = replaceNames(normalizeText(text), names, removed).replaceAll(FULL_URL, (link) => {
    removed.links++;
    return linkPlaceholder(link);
  });
  // Before the addresses: "anna:pw@host.example/x" is a link with a user name, not an address.
  clean = clean.replaceAll(BARE_LINK, (link) => {
    removed.links++;
    return linkPlaceholder(`https://${link}`);
  });
  clean = clean.replaceAll(ANY_ADDRESS, (address) => {
    removed.emails++;
    return addressPlaceholder(address);
  });
  clean = clean.replaceAll(IBAN, (iban) => {
    if ((iban.match(/\d/g)?.length ?? 0) < MIN_IBAN_DIGITS) return iban;
    removed.ibans++;
    return PLACEHOLDER.iban;
  });
  const before = count(clean, PLACEHOLDER.number);
  clean = replacePhoneNumbers(clean, PLACEHOLDER.number);
  removed.numbers += count(clean, PLACEHOLDER.number) - before;
  return clean.trim();
}

/** Characters around a word that is part of a host, an address or a link ("muster-family"). */
const IN_ADDRESS = /[@/:_-]/u;
const LETTER_OR_DIGIT = /[\p{L}\p{N}]/u;

/**
 * The word at `start`..`end` of `text` sits in a host, an address or a link: next to "@", "/",
 * ":", "_" or "-", or next to a dot inside a name ("muster.anna", not "the bank.").
 */
function inAddress(text: string, start: number, end: number): boolean {
  const [before = '', after = ''] = [text[start - 1], text[end]];
  return (
    IN_ADDRESS.test(before) ||
    IN_ADDRESS.test(after) ||
    (before === '.' && LETTER_OR_DIGIT.test(text[start - 2] ?? '')) ||
    (after === '.' && LETTER_OR_DIGIT.test(text[end + 1] ?? ''))
  );
}

/**
 * Replaces the names in any case ("ANNA MUSTER", "Strauß" for "STRAUẞ"), with one exception, so a
 * name part does not hit ordinary words ("will" for "Will Smith", "bank"): a single word written
 * all in lower case counts only as written by Nano, or inside a host, an address or a link
 * ("muster-family.example", "anna.muster@"), where lower case is the rule.
 */
function replaceNames(text: string, names: readonly string[], removed: Removed): string {
  if (names.length === 0) return text;
  const exact = new Set(names);
  const pattern = new RegExp(
    String.raw`(?<![\p{L}\p{N}])(?:${names.map(escapeRegex).join('|')})(?![\p{L}\p{N}])`,
    'giu',
  );
  return text.replaceAll(pattern, (match: string, offset: number) => {
    const lowerWord = !match.includes(' ') && match === match.toLowerCase();
    if (lowerWord && !exact.has(match) && !inAddress(text, offset, offset + match.length)) {
      return match;
    }
    removed.names++;
    return PLACEHOLDER.name;
  });
}

/** What the user sees and, after agreeing, sends to the cloud. */
export interface CloudData {
  /** The data block, exactly as it is shown and sent. */
  json: string;
  removed: Removed;
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
    body: cloudCut(email.bodyText, PROMPT_LIMITS.body, email.truncated),
  };
}

/** The text Gemini Nano reads to find names: exactly the text the cloud data is built from. */
export function nameSearchText(email: Email): string {
  const fields = cloudFields(email);
  return [fields.name, fields.subject, ...fields.linkTexts, fields.body].join('\n');
}

/**
 * The cloud data for one email. `foundNames`: the names Gemini Nano found in
 * {@link nameSearchText}, or `undefined` if it could not look; then the sender's name is removed
 * entirely, since it may be a person's.
 */
export function cloudData(
  email: Email,
  findings: readonly Finding[],
  foundNames: readonly string[] | undefined,
): CloudData {
  const removed = none();
  const fields = cloudFields(email);
  const fromModel = modelNames(foundNames ?? []);
  const names = nameVariants([...greetingNames(nameSearchText(email)), ...fromModel.names]);
  const clean = (text: string): string => redactText(text, names, removed);
  const auth = email.headers?.auth;
  let senderName = clean(fields.name);
  if (!foundNames && senderName !== '') {
    removed.names++;
    senderName = PLACEHOLDER.name;
  }
  const data = {
    rule_findings: findings
      .slice(0, PROMPT_LIMITS.findings)
      // Messages hold only limited email content (hostnames, our phrases), cleaned anyway; the
      // ones that quote words of the email get a fixed text.
      .map(({ rule, severity, message }) => ({
        rule,
        severity,
        message: FIXED_MESSAGES[rule] ?? clean(message),
      })),
    sender_checks: auth
      ? {
          spf: auth.spf ?? 'none',
          dkim: auth.dkim.map((entry) =>
            entry.domain ? `${entry.result} (${entry.domain})` : entry.result,
          ),
          dmarc: auth.dmarc ?? 'none',
          sender_domain_confirmed: auth.dmarc === 'pass',
        }
      : 'not available',
    email: {
      from: { name: senderName, address: addressPlaceholder(email.sender.address) },
      ...(email.headers
        ? { reply_to: email.headers.replyTo.map((box) => addressPlaceholder(box.address)) }
        : {}),
      subject: clean(fields.subject),
      links: email.links.slice(0, PROMPT_LIMITS.links).map((link, index) => ({
        text: clean(fields.linkTexts[index] ?? ''),
        goes_to: parseUrl(link.href)?.hostname || '(not a web link)',
      })),
      body: clean(fields.body),
      body_cut: email.truncated || fields.body.length < normalizeText(email.bodyText).trim().length,
    },
  };
  return {
    json: JSON.stringify(data, null, 2),
    removed,
    namesChecked: foundNames !== undefined && !fromModel.dropped,
  };
}
