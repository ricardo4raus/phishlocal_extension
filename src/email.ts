/*
 * The email as PhishLocal sees it, and the message the side panel uses to ask the Gmail content
 * script for it. Shared by both, so they agree on the shape.
 *
 * Email content is written by whoever sent the email, i.e. possibly an attacker. Treat every
 * string here as untrusted data: show it only as text, never as HTML.
 */

export interface EmailLink {
  /** What the reader sees (the link text). */
  text: string;
  /** Where the link really goes (the `href`). */
  href: string;
}

export interface Mailbox {
  name: string;
  address: string;
}

/**
 * Results of the sender checks (SPF, DKIM, DMARC) from one `Authentication-Results` header
 * (RFC 8601), lowercase as written, e.g. `pass`, `fail`, `softfail`, `none`.
 */
export interface AuthResults {
  /** The server that ran the checks (the header's authserv-id), e.g. `mx.google.com`. */
  server: string;
  spf?: string;
  /** One entry per DKIM signature, with the signing domain (`header.d`) if given. */
  dkim: { result: string; domain?: string }[];
  dmarc?: string;
}

/** What the raw email's headers add to the visible email. */
export interface EmailHeaders {
  replyTo: Mailbox[];
  returnPath?: string;
  /**
   * The topmost `Authentication-Results` header: the one the receiving server added last.
   * Headers further down can be written by the sender and are never trusted.
   */
  auth?: AuthResults;
}

export interface Email {
  sender: Mailbox;
  subject: string;
  /** Visible text of the message body, at most {@link MAX_BODY_CHARS} characters. */
  bodyText: string;
  links: EmailLink[];
  /** True if `bodyText` was cut to {@link MAX_BODY_CHARS}. */
  truncated: boolean;
  /** Only when the raw email (with headers) was read. */
  headers?: EmailHeaders;
  /** True if part of the email's HTML could not be read (too large or too deeply nested). */
  incomplete?: boolean;
}

/** Upper limit for the body text sent between the content script and the side panel. */
export const MAX_BODY_CHARS = 20_000;

/** Upper limit for the number of links taken from one email. */
export const MAX_LINKS = 200;

/**
 * Upper limits for single fields, in characters. Real values stay far below them; hostile ones
 * are cut, so they cannot bloat the panel or, later, the AI prompt.
 */
export const FIELD_LIMITS = {
  name: 500,
  /** RFC 5321 allows at most 254 characters for a usable address. */
  address: 320,
  subject: 1_000,
  linkText: 1_000,
  href: 4_000,
} as const;

export const cut = (text: string, max: number): string =>
  text.length > max ? text.slice(0, max) : text;

export const cutMailbox = ({ name, address }: Mailbox): Mailbox => ({
  name: cut(name, FIELD_LIMITS.name),
  address: cut(address, FIELD_LIMITS.address),
});

export const cutLink = ({ text, href }: EmailLink): EmailLink => ({
  text: cut(text, FIELD_LIMITS.linkText),
  href: cut(href, FIELD_LIMITS.href),
});

export const READ_EMAIL = 'phishlocal/read-email';

export interface ReadEmailRequest {
  type: typeof READ_EMAIL;
}

/** `unreadable`: an email is open, but reading it failed (e.g. Gmail changed its page). */
export type ReadEmailFailure = 'no-email-open' | 'unreadable';

export type ReadEmailResponse =
  { ok: true; email: Email } | { ok: false; reason: ReadEmailFailure };

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

export const isReadEmailRequest = (value: unknown): value is ReadEmailRequest =>
  isRecord(value) && value.type === READ_EMAIL;

const isText = (value: unknown, max: number): value is string =>
  typeof value === 'string' && value.length <= max;

function isEmailLink(value: unknown): value is EmailLink {
  return (
    isRecord(value) &&
    isText(value.text, FIELD_LIMITS.linkText) &&
    isText(value.href, FIELD_LIMITS.href)
  );
}

/** True if `value` is a complete, size-checked `Email` (headers are added in the side panel only). */
export function isEmail(value: unknown): value is Email {
  if (!isRecord(value) || !isRecord(value.sender)) return false;
  return (
    isText(value.sender.name, FIELD_LIMITS.name) &&
    isText(value.sender.address, FIELD_LIMITS.address) &&
    isText(value.subject, FIELD_LIMITS.subject) &&
    isText(value.bodyText, MAX_BODY_CHARS) &&
    Array.isArray(value.links) &&
    value.links.length <= MAX_LINKS &&
    value.links.every(isEmailLink) &&
    typeof value.truncated === 'boolean'
  );
}

/** Checks the content script's answer before the side panel uses it. */
export function isReadEmailResponse(value: unknown): value is ReadEmailResponse {
  if (!isRecord(value)) return false;
  if (value.ok === true) return isEmail(value.email);
  return value.ok === false && (value.reason === 'no-email-open' || value.reason === 'unreadable');
}
