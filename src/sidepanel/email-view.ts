import type { AuthResults, Email, Mailbox } from '../email';
import { revealOverrides } from '../rules/unicode';

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
  links: HTMLUListElement;
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

/**
 * Shows the email. `headersNote` replaces the hint in "Sender checks" while an email has no
 * headers (e.g. "Loading from Gmail…").
 */
export function showEmail(
  email: Email,
  elements: EmailElements,
  headersNote: string = HEADERS_HINT,
): void {
  setText(elements.sender, mailbox(email.sender));
  setText(elements.subject, email.subject || '–');

  const { headers } = email;
  elements.auth.textContent = headers ? authSummary(headers.auth) : headersNote;
  elements.headerRows.hidden = !headers;
  setText(elements.replyTo, headers?.replyTo.map(mailbox).join(', ') || '–');
  setText(elements.returnPath, headers?.returnPath || '–');

  elements.links.replaceChildren(
    ...email.links.map((link) => {
      const item = document.createElement('li');
      setText(item, `${link.text || '(no text)'} → ${link.href}`);
      return item;
    }),
  );
  if (email.links.length === 0) {
    const item = document.createElement('li');
    item.textContent = 'No links';
    elements.links.append(item);
  }

  const preview = email.bodyText.slice(0, BODY_PREVIEW_CHARS);
  const cut = email.bodyText.length > BODY_PREVIEW_CHARS || email.truncated;
  setText(elements.body, cut ? `${preview}…` : preview || '–');
  elements.details.hidden = false;
}
