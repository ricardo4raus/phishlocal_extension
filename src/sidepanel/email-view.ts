import type { AuthResults, Email, EmailLink, Mailbox } from '../email';
import { hostOfAddress } from '../rules/domains';
import type { Finding, Severity } from '../rules';
import { revealOverrides } from '../rules/unicode';
import { GMAIL_SERVER } from '../raw/gmail-original-page';
import { linkDisplay } from './link-display';
import { m } from '../i18n';
import { el, icon, type IconName, setText } from './ui';

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
  body: HTMLElement;
  strip?: StripElements;
  links?: LinksElements;
}

/** The "Links" section (tier 2): flagged links as rows, the others one fold away. */
export interface LinksElements {
  /** The section, hidden when the email has no links. */
  section: HTMLElement;
  /** The heading "Links (N)", hidden when no link is flagged: the fold then says it. */
  heading: HTMLElement;
  /** The count in the heading. */
  count: HTMLElement;
  /** Rows for the links a finding names. */
  flagged: HTMLOListElement;
  /** The fold with the other links. */
  more: HTMLDetailsElement;
  moreSummary: HTMLElement;
  moreList: HTMLOListElement;
}

export interface ShowEmailOptions {
  /** Replaces the hint in "Sender checks" while an email has no headers ("Loading from Gmail…"). */
  headersNote?: string;
  /** Links named by findings are marked. */
  findings?: readonly Finding[];
  /** The Gmail headers are still loading: the sender status says "Checking the sender…". */
  loading?: boolean;
  /**
   * The headers were loaded from Gmail's page, where only Gmail's own server is trusted. Pasted
   * raw source can carry any text, so its confirmation is credited to "your mail server".
   */
  fromGmail?: boolean;
}

/** Where to get the headers when the email was read without them. */
export const HEADERS_HINT = m.email.headersHint;

const mailbox = ({ name, address }: Mailbox): string =>
  name && address ? `${name} <${address}>` : name || address || '–';

/** "SPF pass · DKIM pass (shop.example) · DMARC pass, checked by mx.example". */
export function authSummary(auth: AuthResults | undefined): string {
  if (!auth) return m.email.noAuth;
  const none = m.email.none;
  const dkim =
    auth.dkim.length === 0
      ? none
      : auth.dkim
          .map((entry) => (entry.domain ? `${entry.result} (${entry.domain})` : entry.result))
          .join(', ');
  return `SPF ${auth.spf ?? none} · DKIM ${dkim} · DMARC ${auth.dmarc ?? none}, ${m.email.checkedBy(auth.server)}`;
}

/** The sender status in plain words (tier 1): confirmed by whom, not confirmed, or still checking. */
export type SenderStatus = 'confirmed' | 'unconfirmed' | 'checking';

export function senderStatus(
  email: Email,
  loading = false,
  fromGmail = false,
): { state: SenderStatus; text: string; icon: IconName } {
  const auth = email.headers?.auth;
  if (auth?.dmarc === 'pass') {
    const text =
      fromGmail && auth.server === GMAIL_SERVER
        ? m.email.confirmedByGmail
        : m.email.confirmedByServer;
    return { state: 'confirmed', text, icon: 'check' };
  }
  if (loading && !email.headers) {
    return { state: 'checking', text: m.email.checkingSender, icon: 'dot' };
  }
  return { state: 'unconfirmed', text: m.email.unconfirmed, icon: 'alert' };
}

/** The sender's domain, the one thing in the strip that an attacker cannot choose freely. */
export function senderDomain(address: string): string {
  const host = hostOfAddress(address);
  return host?.domain ?? host?.hostname ?? '';
}

const MARK: Record<Severity, string> = m.severity;
const STRENGTH: Record<Severity, number> = { danger: 2, warning: 1, info: 0 };
const MARK_ICON: Record<Severity, IconName> = { danger: 'cross', warning: 'alert', info: 'info' };

/** Per link position: the most severe finding that names it. Notes (`info`) flag nothing. */
function linkSeverities(findings: readonly Finding[]): Map<number, Severity> {
  const severities = new Map<number, Severity>();
  for (const { severity, links = [] } of findings) {
    if (severity === 'info') continue;
    for (const index of links) {
      const known = severities.get(index);
      if (!known || STRENGTH[severity] > STRENGTH[known]) severities.set(index, severity);
    }
  }
  return severities;
}

function part(tag: 'div' | 'span' | 'strong', className: string, text: string): HTMLElement {
  const element = el(tag, className);
  setText(element, text);
  return element;
}

/**
 * One link row: its badge (when a finding names it), where it really goes (bold), and the
 * shortened URL (the full one as tooltip). The link's text is shown only in the red-flag row.
 */
function linkItem(link: EmailLink, severity: Severity | undefined): HTMLLIElement {
  const display = linkDisplay(link.href);
  const item = el('li', severity ? `link link--${severity}` : 'link');
  const head = el('div', 'link__head');
  if (severity) {
    const badge = el('span', `badge badge--${severity}`);
    badge.append(icon(MARK_ICON[severity], 'icon--s'), MARK[severity]);
    head.append(badge);
  }
  head.append(part('strong', 'link__domain', display.domain || m.email.invalidAddress));
  if (display.forwardsTo) {
    head.append(
      part('span', 'link__via', m.email.forwardsTo),
      part('strong', 'link__domain', display.forwardsTo),
    );
  }
  const url = part('div', 'link__url', display.short);
  url.title = revealOverrides(link.href);
  item.append(head, url);
  return item;
}

/**
 * Fills the "Links" section: flagged links as rows, the others under "N more links". Without
 * flagged links the fold alone is the section, titled "Links (N)", so the count is said once.
 */
function showLinks(email: Email, links: LinksElements, findings: readonly Finding[]): void {
  const severities = linkSeverities(findings);
  const flagged: HTMLLIElement[] = [];
  const rest: HTMLLIElement[] = [];
  email.links.forEach((link, index) => {
    const severity = severities.get(index);
    (severity ? flagged : rest).push(linkItem(link, severity));
  });
  links.section.hidden = email.links.length === 0;
  links.heading.hidden = flagged.length === 0;
  links.count.textContent = String(email.links.length);
  links.flagged.replaceChildren(...flagged);
  links.moreList.replaceChildren(...rest);
  links.more.hidden = rest.length === 0;
  // The fold closes for another email, not when the same email is shown again (with headers).
  const key = JSON.stringify(email.links);
  if (links.more.dataset.email !== key) {
    links.more.open = false;
    links.more.dataset.email = key;
  }
  links.moreSummary.textContent =
    flagged.length > 0 ? m.email.moreLinks(rest.length) : m.email.linksTitle(rest.length);
}

function showStrip(email: Email, strip: StripElements, loading: boolean, fromGmail: boolean): void {
  setText(strip.subject, email.subject || m.email.noSubject);
  const domain = senderDomain(email.sender.address);
  setText(strip.domain, domain || email.sender.address || m.email.unknownSender);
  setText(strip.name, email.sender.name ? `· ${email.sender.name}` : '');
  // The address line repeats the domain only when the address says more than it.
  setText(strip.address, domain && email.sender.address !== domain ? email.sender.address : '');
  const status = senderStatus(email, loading, fromGmail);
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
  const { headersNote = HEADERS_HINT, findings = [], loading = false, fromGmail = false } = options;
  if (elements.strip) showStrip(email, elements.strip, loading, fromGmail);
  setText(elements.sender, mailbox(email.sender));
  setText(elements.subject, email.subject || '–');

  const { headers } = email;
  // The summary holds domains from the headers (email content): direction overrides revealed.
  setText(elements.auth, headers ? authSummary(headers.auth) : headersNote);
  elements.headerRows.hidden = !headers;
  setText(elements.replyTo, headers?.replyTo.map(mailbox).join(', ') || '–');
  setText(elements.returnPath, headers?.returnPath || '–');

  if (elements.links) showLinks(email, elements.links, findings);

  // Cut by code points, so the preview never ends in half a character.
  const chars = [...email.bodyText];
  const preview = chars.slice(0, BODY_PREVIEW_CHARS).join('');
  const cut = chars.length > BODY_PREVIEW_CHARS || email.truncated;
  setText(elements.body, cut ? `${preview}…` : preview || '–');
  elements.details.hidden = false;
}
