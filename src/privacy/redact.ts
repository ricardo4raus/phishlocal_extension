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
import { EMAIL_ADDRESS, FULL_URL, normalizeText, replacePhoneNumbers } from '../ai/patterns';
import { PROMPT_LIMITS } from '../ai/prompt';
import type { Email } from '../email';
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
 * An IBAN: country code, check digits, then 11 to 30 letters or digits, written in one piece or in
 * groups of four. At least 8 digits in it, so that words after "AB12" are not taken for one.
 */
const IBAN =
  /(?<![\p{L}\p{N}])[A-Z]{2}\d{2}(?: ?[A-Z\d]{4}){2,7}(?: ?[A-Z\d]{1,4})?(?![\p{L}\p{N}])/giu;
const MIN_IBAN_DIGITS = 8;

/** Greetings in the six languages; the capitalized words after one are taken as a name. */
const GREETINGS = [
  'dear',
  'hello',
  'hi',
  'hey',
  'liebe',
  'lieber',
  'liebes',
  'hallo',
  'guten tag',
  'sehr geehrte',
  'sehr geehrter',
  'bonjour',
  'bonsoir',
  'salut',
  'cher',
  'chère',
  'hola',
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

/** A greeting pattern for one word, capitalized or not ("dear" matches "Dear" and "dear"). */
const greetingPattern = (word: string): string =>
  `[${word[0]?.toUpperCase()}${word[0]}]${word.slice(1)}`;

const escapeRegex = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);

const GREETING = new RegExp(
  String.raw`(?<![\p{L}\p{N}])(?:${GREETINGS.map(greetingPattern).join('|')})((?:,? \p{Lu}[\p{L}'-]*\.?){1,4})`,
  'gu',
);

/**
 * The names right after a greeting ("Hallo Anna Muster," gives "Anna Muster"). Titles and
 * generic words ("Dear Customer") are skipped, so the generic greeting stays as evidence.
 */
export function greetingNames(text: string): string[] {
  const names: string[] = [];
  for (const [, words = ''] of normalizeText(text).matchAll(GREETING)) {
    const name: string[] = [];
    for (const word of words.replace(/^,/, '').trim().split(' ')) {
      const bare = word.replace(/\.$/, '');
      if (NOT_NAMES.has(bare.toLowerCase())) {
        if (name.length > 0) break;
        continue;
      }
      name.push(bare);
    }
    if (name.length > 0) names.push(name.join(' '));
  }
  return names;
}

/** Longest name taken from the model; longer strings are no name. */
const MAX_NAME = 60;
/** Most names used; more are ignored (an injection could send a flood). */
const MAX_NAMES = 50;

/**
 * The names to replace: each full name and its parts ("Anna Muster", "Anna", "Muster"), at least
 * 2 characters and with a letter, without titles. Longest first, so a full name goes in one piece.
 */
export function nameVariants(names: readonly string[]): string[] {
  const variants = new Set<string>();
  for (const raw of names.slice(0, MAX_NAMES)) {
    const name = normalizeText(raw).trim();
    if (name.length > MAX_NAME) continue;
    for (const part of [name, ...name.split(' ')]) {
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
  return url?.hostname ? `[link: ${url.hostname}]` : '[link]';
}

/** An email address as its domain only. */
export function addressPlaceholder(address: string): string {
  const at = address.lastIndexOf('@');
  const domain = at >= 0 ? address.slice(at + 1).toLowerCase() : '';
  return domain ? `${PLACEHOLDER.email}@${domain}` : PLACEHOLDER.email;
}

/**
 * Removes personal data from one text and counts what it removed (into `removed`). `names` are
 * the variants from {@link nameVariants}.
 */
export function redactText(text: string, names: readonly string[], removed: Removed): string {
  let clean = normalizeText(text).replaceAll(FULL_URL, (link) => {
    removed.links++;
    return linkPlaceholder(link);
  });
  clean = clean.replaceAll(EMAIL_ADDRESS, (address) => {
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
  if (names.length > 0) {
    const pattern = new RegExp(
      String.raw`(?<![\p{L}\p{N}])(?:${names.map(escapeRegex).join('|')})(?![\p{L}\p{N}])`,
      'gu',
    );
    clean = clean.replaceAll(pattern, () => {
      removed.names++;
      return PLACEHOLDER.name;
    });
  }
  return clean.trim();
}

/** What the user sees and, after agreeing, sends to the cloud. */
export interface CloudData {
  /** The data block, exactly as it is shown and sent. */
  json: string;
  removed: Removed;
  /** True if Gemini Nano looked for names; otherwise only greetings and the sender name count. */
  namesChecked: boolean;
}

/**
 * A field as far as it goes to the cloud, normalized. A cut can split a phone number, an address
 * or a name into pieces too short for the patterns, so a cut field loses its last word and any
 * digits and signs before it ("… call +41 79 12" ends at "call").
 */
export function cloudCut(text: string, max: number): string {
  const normalized = normalizeText(text).trim();
  if (normalized.length <= max) return normalized;
  return normalized
    .slice(0, max)
    .replace(/\S*$/u, '')
    .replace(/[^\p{L}]*$/u, '');
}

/** The email's text fields as far as they go to the cloud, before the names are removed. */
function cloudFields(email: Email) {
  return {
    name: cloudCut(email.sender.name, PROMPT_LIMITS.name),
    subject: cloudCut(email.subject, PROMPT_LIMITS.subject),
    linkTexts: email.links
      .slice(0, PROMPT_LIMITS.links)
      .map((link) => cloudCut(link.text, PROMPT_LIMITS.linkText)),
    body: cloudCut(email.bodyText, PROMPT_LIMITS.body),
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
  const names = nameVariants([...(foundNames ?? []), ...greetingNames(nameSearchText(email))]);
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
      // Messages hold only limited email content (hostnames, our phrases), cleaned anyway.
      .map(({ rule, severity, message }) => ({ rule, severity, message: clean(message) })),
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
  return { json: JSON.stringify(data, null, 2), removed, namesChecked: foundNames !== undefined };
}
