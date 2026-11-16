import {
  type AuthResults,
  type Email,
  isReadEmailResponse,
  type Mailbox,
  READ_EMAIL,
  type ReadEmailRequest,
} from '../email';

export type ReadResult = { ok: true; email: Email } | { ok: false; message: string };

const NOT_GMAIL =
  'Open an email in Gmail in this tab, then click again. If Gmail was already open before ' +
  'PhishLocal was installed or updated, reload the Gmail tab first.';

/**
 * Asks the Gmail content script in the active tab for the open email. Reads only on request:
 * nothing is read from Gmail unless the user clicks.
 */
export async function readOpenEmail(): Promise<ReadResult> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id === undefined) return { ok: false, message: NOT_GMAIL };

  let response: unknown;
  try {
    const request: ReadEmailRequest = { type: READ_EMAIL };
    response = await chrome.tabs.sendMessage(tab.id, request);
  } catch {
    // No content script in this tab: not Gmail, or Gmail was opened before the extension loaded.
    return { ok: false, message: NOT_GMAIL };
  }
  if (!isReadEmailResponse(response)) {
    return {
      ok: false,
      message: 'Unexpected answer from the Gmail tab. Reload Gmail and try again.',
    };
  }
  if (!response.ok) {
    const message =
      response.reason === 'unreadable'
        ? 'Could not read this email. Gmail may have changed its page; please report it.'
        : 'No email is open. Open an email in Gmail, then click again.';
    return { ok: false, message };
  }
  return { ok: true, email: response.email };
}

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

/** Shows the email. Only as text (`textContent`): email content may come from an attacker. */
export function showEmail(email: Email, elements: EmailElements): void {
  elements.sender.textContent = mailbox(email.sender);
  elements.subject.textContent = email.subject || '–';

  const { headers } = email;
  elements.auth.textContent = headers ? authSummary(headers.auth) : HEADERS_HINT;
  elements.headerRows.hidden = !headers;
  elements.replyTo.textContent = headers?.replyTo.map(mailbox).join(', ') || '–';
  elements.returnPath.textContent = headers?.returnPath || '–';

  elements.links.replaceChildren(
    ...email.links.map((link) => {
      const item = document.createElement('li');
      item.textContent = `${link.text || '(no text)'} → ${link.href}`;
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
  elements.body.textContent = cut ? `${preview}…` : preview || '–';
  elements.details.hidden = false;
}
