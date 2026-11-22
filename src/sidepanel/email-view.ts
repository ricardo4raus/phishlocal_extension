import type { AuthResults, Email, EmailLink, Mailbox } from '../email';
import { hostOfAddress } from '../rules/domains';
import type { Finding, Severity } from '../rules';
import { revealOverrides } from '../rules/unicode';
import { GMAIL_SERVER } from '../raw/gmail-original-page';
import { linkDisplay } from './link-display';
import { type IconName, setText } from './ui';

/** Number of body characters shown in the panel (the full text is kept for the check). */
const BODY_PREVIEW_CHARS = 1_000;

/** The email strip: subject, sender with the domain first, and the sender status. */
export interface StripElements {
  subject: HTMLElement;
  domain: HTMLElement;
  name: HTMLElement;
  address: HTMLElement;
  /** The sender status line; its `data-state` picks the icon's colour. */
  auth: HTMLElement;
  authIcon: HTMLElement;
  authText: HTMLElement;
}

export interface EmailElements {
  details: HTMLElement;
  sender: HTMLElement;
  subject: HTMLElement;
  auth: HTMLElement;
  headerRows: HTMLElement;
  replyTo: HTMLElement;
  returnPath: HTMLElement;
  links: HTMLOListElement;
  body: HTMLElement;
  strip?: StripElements;
}

export interface ShowEmailOptions {
  /** Replaces the hint in "Sender checks" while an email has no headers ("Loading from Gmail…"). */
  headersNote?: string;
  /** Links named by findings are marked. */
  findings?: readonly Finding[];
  /** The Gmail headers are still loading: the sender status says "Checking the sender…". */
  loading?: boolean;
}

/** Where to get the headers when the email was read without them. */
export const HEADERS_HINT =
  'Not available. For the full check with SPF, DKIM and DMARC: in Gmail, open ⋮ → Show original → ' +
  'Copy to clipboard, then paste it under "Check another email".';

const mailbox = ({ name, address }: Mailbox): string =>
  name && address ? `${name} <${address}>` : name || address || '–';

/** "SPF pass · DKIM pass (shop.example) · DMARC pass, checked by mx.example". */
export function authSummary(auth: AuthResults | undefined): string {
  if (!auth) return 'None in the headers: the sender cannot be verified.';
  const dkim =
    auth.dkim.length === 0
      ? 'none'
      : auth.dkim
          .map((entry) => (entry.domain ? `${entry.result} (${entry.domain})` : entry.result))
          .join(', ');
  return `SPF ${auth.spf ?? 'none'} · DKIM ${dkim} · DMARC ${auth.dmarc ?? 'none'}, checked by ${auth.server}`;
}

/** The sender status in plain words (tier 1): confirmed by whom, not confirmed, or still checking. */
export type SenderStatus = 'confirmed' | 'unconfirmed' | 'checking';

export function senderStatus(
  email: Email,
  loading = false,
): { state: SenderStatus; text: string; icon: IconName } {
  const auth = email.headers?.auth;
  if (auth?.dmarc === 'pass') {
    const by = auth.server === GMAIL_SERVER ? 'Gmail' : 'your mail server';
    return { state: 'confirmed', text: `Sender confirmed by ${by}`, icon: 'check' };
  }
  if (loading && !email.headers) {
    return { state: 'checking', text: 'Checking the sender…', icon: 'dot' };
  }
  return { state: 'unconfirmed', text: 'Sender not confirmed', icon: 'alert' };
}

/** The sender's domain, the one thing in the strip that an attacker cannot choose freely. */
export function senderDomain(address: string): string {
  const host = hostOfAddress(address);
  return host?.domain ?? host?.hostname ?? '';
}

const MARK: Record<Severity, string> = { danger: 'Danger', warning: 'Warning', info: 'Note' };
const STRENGTH: Record<Severity, number> = { danger: 2, warning: 1, info: 0 };

/** Per link position: the most severe finding that names it. */
function linkSeverities(findings: readonly Finding[]): Map<number, Severity> {
  const severities = new Map<number, Severity>();
  for (const { severity, links = [] } of findings) {
    for (const index of links) {
      const known = severities.get(index);
      if (!known || STRENGTH[severity] > STRENGTH[known]) severities.set(index, severity);
    }
  }
  return severities;
}

function part(tag: 'div' | 'span' | 'strong', className: string, text: string): HTMLElement {
  const element = document.createElement(tag);
  element.className = className;
  setText(element, text);
  return element;
}

/**
 * One link: its mark, where it really goes (bold), the shortened URL (the full one as tooltip)
 * and its text.
 */
function linkItem(link: EmailLink, severity: Severity | undefined): HTMLLIElement {
  const display = linkDisplay(link.href);
  const item = document.createElement('li');
  item.className = severity ? `link ${severity}` : 'link';
  const head = document.createElement('div');
  if (severity) head.append(part('span', 'mark', `${MARK[severity]}: `));
  head.append(part('strong', 'domain', display.domain || 'Not a valid web address'));
  if (display.forwardsTo) {
    head.append(' forwards to ', part('strong', 'domain', display.forwardsTo));
  }
  const url = part('div', 'url', display.short);
  url.title = revealOverrides(link.href);
  item.append(head, url, part('div', 'link-text', `Text: ${link.text || '(none)'}`));
  return item;
}

function showStrip(email: Email, strip: StripElements, loading: boolean): void {
  setText(strip.subject, email.subject || '(no subject)');
  const domain = senderDomain(email.sender.address);
  setText(strip.domain, domain || email.sender.address || 'Unknown sender');
  setText(strip.name, email.sender.name ? `· ${email.sender.name}` : '');
  // The address line repeats the domain only when the address says more than it.
  setText(strip.address, domain && email.sender.address !== domain ? email.sender.address : '');
  const status = senderStatus(email, loading);
  strip.auth.dataset.state = status.state;
  strip.authIcon.dataset.icon = status.icon;
  strip.authText.textContent = status.text;
}

/**
 * Shows the email: the strip (when the panel has one) and the details. `headersNote` replaces
 * the hint in "Sender checks" while an email has no headers (e.g. "Loading from Gmail…").
 */
export function showEmail(
  email: Email,
  elements: EmailElements,
  options: ShowEmailOptions = {},
): void {
  const { headersNote = HEADERS_HINT, findings = [], loading = false } = options;
  if (elements.strip) showStrip(email, elements.strip, loading);
  setText(elements.sender, mailbox(email.sender));
  setText(elements.subject, email.subject || '–');

  const { headers } = email;
  elements.auth.textContent = headers ? authSummary(headers.auth) : headersNote;
  elements.headerRows.hidden = !headers;
  setText(elements.replyTo, headers?.replyTo.map(mailbox).join(', ') || '–');
  setText(elements.returnPath, headers?.returnPath || '–');

  const severities = linkSeverities(findings);
  elements.links.replaceChildren(
    ...email.links.map((link, index) => linkItem(link, severities.get(index))),
  );
  if (email.links.length === 0) {
    const item = document.createElement('li');
    item.className = 'empty';
    item.textContent = 'No links';
    elements.links.append(item);
  }

  const preview = email.bodyText.slice(0, BODY_PREVIEW_CHARS);
  const cut = email.bodyText.length > BODY_PREVIEW_CHARS || email.truncated;
  setText(elements.body, cut ? `${preview}…` : preview || '–');
  elements.details.hidden = false;
}
