/*
 * What the side panel shows for the messages from the Gmail tab: the opened email right away,
 * then again with its headers once Gmail's "Show original" page has been read.
 */
import type { Email } from '../email';
import type { GmailMessage, OriginalFailure } from '../messages';
import { headersFromOriginalPage } from '../raw/gmail-original-page';
import { m } from '../i18n';
import { HEADERS_HINT } from './email-view';

export interface GmailViewUi {
  /**
   * Shows an email with its rule findings. `headersNote` stands in for missing headers; `final`
   * is false while the headers are still loading.
   */
  show(email: Email, status: string, headersNote?: string, final?: boolean): void;
  /**
   * Hides the email view. `reason` says why there is nothing to show: no email is open on the
   * Gmail tab, the tab is not Gmail, or the open email could not be read.
   */
  hide(reason: EmptyReason): void;
  setStatus(text: string, isError?: boolean): void;
}

export type EmptyReason = 'idle' | 'not-gmail' | 'unreadable';

const FAILURES: Record<OriginalFailure, string> = m.gmail.failures;

const IDLE = m.gmail.idle;

const NOT_GMAIL = m.gmail.notGmail;

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
  const idle = (reason: EmptyReason, status: string, isError = false): void => {
    current = undefined;
    if (source === 'gmail') {
      source = 'none';
      ui.hide(reason);
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
      // The card says it all ("Sender confirmed by Gmail"): no status line.
      ui.show({ ...target.email, headers }, '');
    } else {
      ui.show(target.email, m.gmail.headersMissing(m.gmail.failures.unreadable), HEADERS_HINT);
    }
  }

  return {
    handle(message) {
      switch (message.type) {
        case 'email':
          current = { key: message.key, email: message.email };
          source = 'gmail';
          ui.show(
            message.email,
            // The card says "Checking the sender…" meanwhile.
            '',
            m.gmail.headersNote,
            false,
          );
          break;
        case 'original':
          if (current?.key === message.key) void addHeaders(current, message.html);
          break;
        case 'original-failed':
          if (current?.key === message.key) {
            ui.show(current.email, m.gmail.headersMissing(FAILURES[message.reason]), HEADERS_HINT);
          }
          break;
        case 'no-email':
          idle('idle', IDLE);
          break;
        case 'unreadable':
          idle('unreadable', m.gmail.unreadable, true);
          break;
      }
    },
    disconnected() {
      idle('not-gmail', NOT_GMAIL);
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
