/*
 * What the side panel shows for the messages from the Gmail tab: the opened email right away,
 * then again with its headers once Gmail's "Show original" page has been read.
 */
import type { Email } from '../email';
import type { GmailMessage, OriginalFailure } from '../messages';
import { headersFromOriginalPage } from '../raw/gmail-original-page';
import { HEADERS_HINT } from './email-view';

export interface GmailViewUi {
  /** Shows an email with its rule findings. `headersNote` stands in for missing headers. */
  show(email: Email, status: string, headersNote?: string): void;
  /** Hides the email view. */
  hide(): void;
  setStatus(text: string, isError?: boolean): void;
}

const CHECKED = 'Checked automatically. Nothing left your browser.';

const FAILURES: Record<OriginalFailure, string> = {
  'no-account-key': "Gmail's page has changed",
  'no-message-id': "Gmail's page has changed",
  'request-failed': 'Gmail did not deliver them',
  timeout: 'Gmail did not answer in time',
};

const IDLE =
  'Open an email in Gmail: while this panel is open, PhishLocal checks it automatically, on this device.';

const NOT_GMAIL =
  'Open Gmail in this tab to check emails automatically. If Gmail was open before PhishLocal ' +
  'was installed or updated, reload the Gmail tab.';

export interface GmailView {
  handle(message: GmailMessage): void;
  disconnected(): void;
  /** A pasted email or sample is shown now; Gmail no longer controls the view. */
  pasted(): void;
  /** The paste area was cleared. */
  cleared(): void;
}

export function createGmailView(ui: GmailViewUi): GmailView {
  let current: { key: string; email: Email } | undefined;
  /** Where the shown email came from; a pasted one stays until Gmail opens another email. */
  let source: 'none' | 'gmail' | 'paste' = 'none';

  /** No Gmail email to show: hide the Gmail email, but leave a pasted one alone. */
  const idle = (status: string, isError = false): void => {
    current = undefined;
    if (source === 'gmail') {
      source = 'none';
      ui.hide();
    }
    if (source !== 'paste') ui.setStatus(status, isError);
  };

  async function addHeaders(target: { key: string; email: Email }, html: string): Promise<void> {
    let headers;
    try {
      headers = await headersFromOriginalPage(html);
    } catch {
      headers = undefined;
    }
    if (current !== target) return;
    if (headers) {
      ui.show({ ...target.email, headers }, `${CHECKED} Sender checks read from Gmail.`);
    } else {
      ui.show(
        target.email,
        `${CHECKED} Sender checks not available: Gmail's page could not be read.`,
        HEADERS_HINT,
      );
    }
  }

  return {
    handle(message) {
      switch (message.type) {
        case 'email':
          current = { key: message.key, email: message.email };
          source = 'gmail';
          ui.show(message.email, `${CHECKED} Loading the sender checks…`, 'Loading from Gmail…');
          break;
        case 'original':
          if (current?.key === message.key) void addHeaders(current, message.html);
          break;
        case 'original-failed':
          if (current?.key === message.key) {
            ui.show(
              current.email,
              `${CHECKED} Sender checks not available: ${FAILURES[message.reason]}.`,
              HEADERS_HINT,
            );
          }
          break;
        case 'no-email':
          idle(IDLE);
          break;
        case 'unreadable':
          idle('Could not read this email. Gmail may have changed its page.', true);
          break;
      }
    },
    disconnected() {
      idle(NOT_GMAIL);
    },
    pasted() {
      current = undefined;
      source = 'paste';
    },
    cleared() {
      current = undefined;
      source = 'none';
    },
  };
}
