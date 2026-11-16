/*
 * Reads a raw email ("Show original", "View source", an .eml file's text): the visible email
 * plus the headers that the normal view hides (Reply-To, Return-Path, sender checks).
 *
 * The raw email is attacker-controlled. postal-mime parses it with tight limits; its HTML is
 * never rendered, only read with parse5 for links and text.
 */
import PostalMime, { type Address, type PostalMimeOptions } from 'postal-mime';
import { cut, cutMailbox, type Email, FIELD_LIMITS, type Mailbox } from '../email';
import { buildEmail, readHtml } from '../paste/parse-pasted-email';
import { parseAuthResults } from './auth-results';

/** Larger input is refused: postal-mime holds the whole message in memory. */
export const MAX_RAW_CHARS = 5_000_000;

/** At most this many Reply-To addresses are kept. */
const MAX_REPLY_TO = 10;

/**
 * Limits far below postal-mime's defaults: a phishing email needs none of the room that
 * hostile input could use to slow the panel down. Forwarded emails inside are not parsed.
 */
const LIMITS: PostalMimeOptions = {
  maxNestingDepth: 20,
  maxHeadersSize: 256 * 1024,
  maxPartCount: 500,
  maxRfc822NestingDepth: 0,
  maxForwardedAddresses: 100,
};

export class RawEmailError extends Error {}

function mailboxes(addresses: Address[] | undefined): Mailbox[] {
  return (addresses ?? [])
    .flatMap((address) => (address.group ? address.group : [address]))
    .slice(0, MAX_REPLY_TO)
    .map(({ name, address }) => cutMailbox({ name, address }));
}

/**
 * True if the text starts like a raw email: at least three header lines (`Name: value`, folded
 * lines allowed), a blank line, and one of the headers every raw email has.
 */
export function looksLikeRawEmail(text: string): boolean {
  const start = text.trimStart().slice(0, 64_000);
  const end = start.search(/\r?\n\r?\n/);
  if (end < 0) return false;
  const lines = start
    .slice(0, end)
    .split(/\r?\n/)
    .filter((line) => !/^[ \t]/.test(line));
  if (lines.length < 3 || !lines.every((line) => /^[A-Za-z0-9-]{1,76}:/.test(line))) return false;
  return lines.some((line) =>
    /^(?:from|received|return-path|delivered-to|message-id):/i.test(line),
  );
}

export async function parseRawEmail(raw: string): Promise<Email> {
  if (raw.length > MAX_RAW_CHARS) {
    throw new RawEmailError('The raw email is larger than 5 MB.');
  }
  let parsed;
  try {
    parsed = await PostalMime.parse(raw.trimStart(), LIMITS);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new RawEmailError(`The raw email could not be read (${reason}).`);
  }

  const [sender = { name: '', address: '' }] = mailboxes(parsed.from ? [parsed.from] : []);
  // Mail apps show the HTML part when there is one, so the rules check that text. A harmless
  // plain-text part next to a phishing HTML part must not hide it.
  const html = parsed.html ? readHtml(parsed.html) : undefined;
  const text = html?.text.trim() ? html.text : (parsed.text ?? '');
  const email = buildEmail({ text, html, sender, subject: parsed.subject ?? '' });

  // Only the topmost result counts: the receiving server adds it last, above everything the
  // sender wrote. A fake "dmarc=pass" further down is ignored.
  const topmost = parsed.headers.find((header) => header.key === 'authentication-results');
  return {
    ...email,
    headers: {
      replyTo: mailboxes(parsed.replyTo),
      ...(parsed.returnPath ? { returnPath: cut(parsed.returnPath, FIELD_LIMITS.address) } : {}),
      ...(topmost ? { auth: parseAuthResults(topmost.value) } : {}),
    },
  };
}
