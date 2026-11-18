import type { AuthResults, Email, EmailLink, Mailbox } from '../email';
import type { Finding, Severity } from '../rules';
import { revealOverrides } from '../rules/unicode';
import { linkDisplay } from './link-display';

/** Number of body characters shown in the panel (the full text is kept for the check). */
const BODY_PREVIEW_CHARS = 1_000;

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
}

/** Where to get the headers when the email was read without them. */
export const HEADERS_HINT =
  'Not available. For the full check with SPF, DKIM and DMARC: in Gmail, open ⋮ → Show original → ' +
  'Copy to clipboard, then paste it under "Or paste an email".';

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

/**
 * Puts email content into the page. Only as text (`textContent`): the content may come from an
 * attacker. Direction overrides are shown as `<U+202E>`, so "moc.lapyap" is not displayed as
 * "paypal.com" in the panel either.
 */
const setText = (element: HTMLElement, text: string): void => {
  element.textContent = revealOverrides(text);
};

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

/**
 * Shows the email. `headersNote` replaces the hint in "Sender checks" while an email has no
 * headers (e.g. "Loading from Gmail…"). Links named by `findings` are marked.
 */
export function showEmail(
  email: Email,
  elements: EmailElements,
  headersNote: string = HEADERS_HINT,
  findings: readonly Finding[] = [],
): void {
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
