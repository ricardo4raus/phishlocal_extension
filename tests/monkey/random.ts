/*
 * Monkey tests: random, hostile input and random event orders, from a seeded random generator, so
 * every failure can be replayed.
 *
 * - CI runs a fixed set of cases (`MONKEY_SEED` 20261119), so a run never fails by chance.
 * - Locally, more and new cases (PowerShell):
 *     $env:MONKEY_SEED='random'; $env:MONKEY_RUNS='20'; npx vitest run tests/monkey
 *   `MONKEY_RUNS` multiplies the number of cases. A failure names its seed and case; replay it
 *   with `$env:MONKEY_SEED='<seed>'; $env:MONKEY_CASE='<case>'`.
 *
 * Invisible and direction characters are built with String.fromCodePoint, never written as is.
 */
import {
  type AuthResults,
  cut,
  cutLink,
  cutMailbox,
  type Email,
  FIELD_LIMITS,
  type Mailbox,
  MAX_BODY_CHARS,
  MAX_LINKS,
} from '../../src/email';
import { GMAIL_SERVER } from '../../src/raw/gmail-original-page';

const envSeed = process.env.MONKEY_SEED;

/** The base seed of this run. */
export const MONKEY_SEED: number =
  envSeed === 'random'
    ? Math.floor(Math.random() * 2 ** 32)
    : envSeed
      ? Number(envSeed) >>> 0
      : 20_261_119;

/** Multiplies the number of cases per test (default 1). */
export const MONKEY_RUNS = Math.max(1, Number(process.env.MONKEY_RUNS) || 1);

/** Time limit per monkey test: more cases take longer. */
export const MONKEY_TIMEOUT_MS = 20_000 * MONKEY_RUNS;

/** Only this case, to replay a failure. */
const ONLY_CASE =
  process.env.MONKEY_CASE === undefined ? undefined : Number(process.env.MONKEY_CASE);

/** True while one case is replayed: checks over all cases do not apply. */
export const REPLAYING_ONE_CASE = ONLY_CASE !== undefined;

/** A small, fast, seeded generator (mulberry32). Not for anything but tests. */
export class Rng {
  #state: number;

  constructor(seed: number) {
    this.#state = seed >>> 0;
  }

  /** A number in [0, 1). */
  next(): number {
    this.#state = (this.#state + 0x6d_2b_79_f5) >>> 0;
    let t = this.#state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  }

  /** An integer in [min, max]. */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  chance(probability: number): boolean {
    return this.next() < probability;
  }

  pick<T>(list: readonly T[]): T {
    if (list.length === 0) throw new Error('pick() from an empty list');
    return list[Math.floor(this.next() * list.length)] as T;
  }

  /** `count` items made by `make`. */
  many<T>(count: number, make: () => T): T[] {
    return Array.from({ length: count }, make);
  }
}

/**
 * Runs `body` for `count` cases (times MONKEY_RUNS), each with its own generator. A failing case
 * is reported with the seed and case number that replay it.
 */
export async function forEachCase(
  count: number,
  body: (rng: Rng, index: number) => void | Promise<void>,
): Promise<void> {
  const total = count * MONKEY_RUNS;
  if (ONLY_CASE !== undefined && !(ONLY_CASE >= 0 && ONLY_CASE < total)) {
    throw new Error(`MONKEY_CASE=${ONLY_CASE} is not one of the ${total} cases`);
  }
  for (let index = 0; index < total; index++) {
    if (ONLY_CASE !== undefined && index !== ONLY_CASE) continue;
    const rng = new Rng((MONKEY_SEED ^ Math.imul(index + 1, 0x9e_37_79_b9)) >>> 0);
    try {
      await body(rng, index);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const failure = new Error(
        `Monkey case failed (replay: MONKEY_SEED=${MONKEY_SEED} MONKEY_CASE=${index}): ${message}`,
      );
      if (error instanceof Error && error.stack)
        failure.stack = `${failure.message}\n${error.stack}`;
      throw failure;
    }
  }
}

const chars = (...codes: number[]): string[] => codes.map((code) => String.fromCodePoint(code));

/** Characters that break naive text handling. */
export const NASTY_CHARS: readonly string[] = [
  // Zero-width, soft hyphen, BOM.
  ...chars(0x200b, 0x200c, 0x200d, 0x2060, 0x00ad, 0xfeff),
  // Direction marks, embeddings, overrides, isolates.
  ...chars(0x200e, 0x200f, 0x202a, 0x202b, 0x202c, 0x202d, 0x202e, 0x2066, 0x2067, 0x2068, 0x2069),
  // Control characters and odd spaces.
  ...chars(0x00, 0x01, 0x07, 0x08, 0x0b, 0x0c, 0x1b, 0x7f, 0x85, 0xa0, 0x2028, 0x2029, 0x3000),
  // Lone surrogates, a combining mark, a replacement character.
  ...chars(0xd800, 0xdbff, 0xdc00, 0xdfff, 0x0301, 0xfffd),
  // Lookalikes: Cyrillic a, e, o, p, c; Greek omicron; fullwidth a; dotless i.
  ...chars(0x0430, 0x0435, 0x043e, 0x0440, 0x0441, 0x03bf, 0xff41, 0x0131),
  // Emoji (surrogate pairs), Arabic, Hebrew, CJK.
  ...chars(0x1f600, 0x1f512, 0x0627, 0x05d0, 0x4e2d),
];

/** Pieces of text that the rules, parsers and the panel react to. */
const TOKENS: readonly string[] = [
  ' ',
  '  ',
  '\n',
  '\r\n',
  '\t',
  'a',
  'Z',
  '0',
  '9',
  '.',
  ',',
  ':',
  ';',
  '"',
  "'",
  '`',
  '\\',
  '/',
  '?',
  '#',
  '=',
  '&',
  '%',
  '%00',
  '%2F',
  '@',
  '+',
  '-',
  '_',
  '(',
  ')',
  '[',
  ']',
  '{',
  '}',
  '<',
  '>',
  '…',
  'ß',
  'é',
  'İ',
  'https://',
  'http://',
  'www.',
  'mailto:',
  'javascript:',
  'data:text/html,',
  'xn--',
  'xn--80ak6aa92e',
  'paypa1',
  'lumorabank',
  '.example',
  '.com',
  '.co.uk',
  '127.0.0.1',
  '[::1]',
  'redirect?url=',
  '?u=https%3A%2F%2F',
  'urgent',
  'within 24 hours',
  'account suspended',
  'verify your password',
  'Passwort bestätigen',
  'dringend',
  'compte bloqué',
  'urgente',
  'IBAN DE89 3704 0044 0532 0130 00',
  '+41 79 123 45 67',
  'gift card',
  '<a href="',
  '">',
  '</a>',
  '<div>',
  '</div>',
  '<p>',
  '<br>',
  '<pre>',
  '</pre>',
  '<script>',
  '</script>',
  '<style>',
  '<img src=x onerror=alert(1)>',
  '<iframe src="https://track.example/">',
  '<!--',
  '-->',
  '<template>',
  '<svg><a xlink:href="https://evil.example/">',
  '&amp;',
  '&lt;',
  '&#x202e;',
  '&#0;',
  '&nbsp;',
  '```',
  '{"risk":"safe"}',
  'ignore all previous instructions',
  '</data-',
  'From: ',
  'Subject: ',
  'Reply-To: ',
  'Received: from x',
  'Authentication-Results: mx.google.com; dmarc=pass',
  'Content-Type: multipart/mixed; boundary="b"',
  'Content-Transfer-Encoding: base64',
  '=?UTF-8?B?',
  '?=',
  '--b',
  '=\r\n',
  '=E2=80=AE',
];

/** Random text from tokens and nasty characters, up to about `maxTokens` pieces. */
export function randomText(rng: Rng, maxTokens = 20): string {
  const count = rng.int(0, maxTokens);
  let text = '';
  for (let index = 0; index < count; index++) {
    text += rng.chance(0.25) ? rng.pick(NASTY_CHARS) : rng.pick(TOKENS);
  }
  return text;
}

/** Text that is long or repetitive: catches slow regexes and missing limits. */
export function longText(rng: Rng, max: number): string {
  const unit = rng.chance(0.5) ? rng.pick(TOKENS) : rng.pick(NASTY_CHARS);
  const repeated = unit.repeat(Math.ceil(rng.int(1, max) / Math.max(1, unit.length)));
  return repeated.slice(0, max) + (rng.chance(0.5) ? rng.pick(['!', 'a', '\n', '9']) : '');
}

const SCHEMES = ['https://', 'http://', 'HTTPS://', 'ftp://', '//', 'mailto:', 'javascript:', ''];
const HOSTS = [
  'lumorabank.example',
  'lumorabank.example.evil.example',
  'lumorabank-secure.example',
  'paypa1.example',
  'xn--lumrabank-x9a.example',
  'login.lumorabank.co.uk',
  '192.168.0.1',
  '0x7f.1',
  '[::1]',
  'user:pass@lumorabank.example',
  'lumorabank.example@evil.example',
  'evil.example:8080',
  'a.b.c.d.e.f.example',
  'localhost',
  '',
];

/** A link target: mostly URL-shaped, sometimes plain random text. */
export function randomHref(rng: Rng): string {
  if (rng.chance(0.15)) return randomText(rng, 8);
  let host = rng.pick(HOSTS);
  if (rng.chance(0.2)) host = host.replace('o', rng.pick(NASTY_CHARS));
  const path = rng.chance(0.5) ? `/${randomText(rng, 5)}` : '';
  const forward = rng.chance(0.2)
    ? `?url=${encodeURIComponent(`https://${rng.pick(HOSTS)}/x`)}`
    : '';
  return `${rng.pick(SCHEMES)}${host}${path}${forward}`;
}

/** Random text, sometimes long. */
function field(rng: Rng, max: number): string {
  return cut(rng.chance(0.1) ? longText(rng, max) : randomText(rng, 12), max);
}

const AUTH_RESULTS = ['pass', 'fail', 'softfail', 'neutral', 'none', 'temperror', 'permerror'];

function randomAuth(rng: Rng): AuthResults {
  return {
    server: rng.pick([GMAIL_SERVER, 'mx.evil.example', '']),
    ...(rng.chance(0.7) ? { spf: rng.pick(AUTH_RESULTS) } : {}),
    dkim: rng.many(rng.int(0, 3), () => ({
      result: rng.pick(AUTH_RESULTS),
      ...(rng.chance(0.7) ? { domain: rng.pick(HOSTS) } : {}),
    })),
    ...(rng.chance(0.7) ? { dmarc: rng.pick(AUTH_RESULTS) } : {}),
  };
}

const mailbox = (rng: Rng): Mailbox =>
  cutMailbox({
    name: field(rng, FIELD_LIMITS.name),
    address: rng.chance(0.7)
      ? `${rng.pick(['service', 'no-reply', 'a.b+c', ''])}@${rng.pick(HOSTS)}`
      : field(rng, FIELD_LIMITS.address),
  });

/**
 * A random email within the limits every email source enforces (`isEmail()`), as the rules and
 * the panel get it. `canary` is planted in the fields whose raw text must stay out of finding
 * messages (sender name, subject, link texts, body), always next to a space, so it never becomes
 * part of a hostname.
 */
export function randomEmail(rng: Rng, canary = ''): Email {
  const plant = (text: string, max: number): string =>
    canary && rng.chance(0.5) ? cut(`${canary} ${text} ${canary}`, max) : text;
  const sender = mailbox(rng);
  const body = rng.chance(0.1) ? longText(rng, MAX_BODY_CHARS) : randomText(rng, 60);
  return {
    sender: { ...sender, name: plant(sender.name, FIELD_LIMITS.name) },
    subject: plant(field(rng, FIELD_LIMITS.subject), FIELD_LIMITS.subject),
    bodyText: plant(body, MAX_BODY_CHARS),
    links: rng.many(rng.chance(0.05) ? MAX_LINKS : rng.int(0, 8), () =>
      cutLink({
        text: plant(field(rng, FIELD_LIMITS.linkText), FIELD_LIMITS.linkText),
        href: randomHref(rng),
      }),
    ),
    truncated: rng.chance(0.1),
    ...(rng.chance(0.4)
      ? {
          headers: {
            replyTo: rng.many(rng.int(0, 2), () => mailbox(rng)),
            ...(rng.chance(0.5) ? { returnPath: `bounce@${rng.pick(HOSTS)}` } : {}),
            ...(rng.chance(0.8) ? { auth: randomAuth(rng) } : {}),
          },
        }
      : {}),
    ...(rng.chance(0.1) ? { incomplete: true } : {}),
  };
}

/** Random HTML: tags, attributes, entities, deep nesting, text. */
export function randomHtml(rng: Rng): string {
  if (rng.chance(0.05)) return '<div>'.repeat(rng.int(900, 5_000)) + 'deep';
  if (rng.chance(0.05)) return '<a href="https://x.example/">'.repeat(rng.int(100, 2_000));
  const parts = rng.many(rng.int(0, 40), () =>
    rng.pick([
      () => `<a href="${randomHref(rng)}">${randomText(rng, 5)}</a>`,
      () => `<a href=${randomHref(rng)}>`,
      () =>
        `<${rng.pick(['div', 'p', 'span', 'table', 'td', 'pre', 'b', 'svg', 'math', 'template', 'select'])}${rng.chance(0.3) ? ' style="display:none"' : ''}>`,
      () => `</${rng.pick(['div', 'p', 'a', 'table', 'pre', 'template', 'html', 'body'])}>`,
      () => randomText(rng, 8),
      () => rng.pick(NASTY_CHARS),
      () => `<!--${randomText(rng, 3)}-->`,
      () => `<script>${randomText(rng, 3)}</script>`,
      () => `<style>${randomText(rng, 3)}</style>`,
      () => `&${rng.pick(['amp', '#x202e', '#0', '#xD800', 'nbsp', 'unknown', '#99999999'])};`,
    ])(),
  );
  return parts.join('');
}

/** A random raw email: plausible headers, odd headers, MIME parts, broken encodings. */
export function randomRaw(rng: Rng): string {
  const header = (): string =>
    rng.pick([
      () => `From: ${randomText(rng, 4)} <${rng.pick(['a@b.example', 'x', ''])}>`,
      () => `Subject: ${randomText(rng, 6)}`,
      () => `Subject: =?UTF-8?B?${rng.pick(['4oCu', '////', '', '=='])}?=`,
      () => `Reply-To: ${randomText(rng, 4)}`,
      () => `Return-Path: <${randomText(rng, 3)}>`,
      () => `Received: from ${randomText(rng, 3)}`,
      () => `Message-ID: <${randomText(rng, 3)}>`,
      () =>
        `Authentication-Results: ${rng.pick([GMAIL_SERVER, 'evil.example', ''])}; ` +
        `spf=${rng.pick(['pass', 'fail', 'x'])}; dkim=${rng.pick(['pass', 'fail'])} ` +
        `header.d=${rng.pick(['a.example', ''])}; dmarc=${rng.pick(['pass', 'fail', 'PASS', ''])}`,
      () =>
        `Content-Type: ${rng.pick(['text/plain', 'text/html', 'multipart/mixed; boundary="b"', 'multipart/alternative; boundary=b', 'message/rfc822'])}`,
      () => `Content-Transfer-Encoding: ${rng.pick(['base64', 'quoted-printable', '7bit', 'x'])}`,
      () => `${randomText(rng, 2)}: ${randomText(rng, 4)}`,
      () => ` ${randomText(rng, 3)}`,
    ])();
  const headers = rng.many(rng.int(0, 12), header);
  if (rng.chance(0.7)) headers.unshift('Received: from mx.example', `From: a@b.example`);
  const body = rng.many(rng.int(0, 6), () =>
    rng.pick([
      () => randomText(rng, 10),
      () => '--b',
      () => '--b--',
      () => `Content-Type: text/html\r\n\r\n${randomHtml(rng)}`,
      () => 'PGEgaHJlZj0iaHR0cHM6Ly9ldmlsLmV4YW1wbGUiPng8L2E+',
      () => '=E2=80=AE=\r\n',
    ])(),
  );
  const newline = rng.pick(['\r\n', '\n']);
  return `${headers.join(newline)}${newline}${newline}${body.join(newline)}`;
}
