/*
 * Watches Gmail while the side panel is connected: every email the user opens is read and
 * reported, then its "Show original" page for the headers. When the panel disconnects (it was
 * closed, or the user switched tabs), watching stops and nothing more is read.
 */
import { cut, type Email } from '../email';
import { type GmailMessage, isScanRequest, MAX_KEY_CHARS } from '../messages';
import { extractEmail, findOpenMessage } from './gmail-extract';
import {
  loadOriginal,
  OriginalError,
  originalUrl,
  readAccountKey,
  readMessageId,
} from './gmail-original';

/** The parts of a `chrome.runtime.Port` the watcher uses. */
export interface WatchPort {
  postMessage(message: GmailMessage): void;
  onMessage: { addListener(listener: (message: unknown) => void): void };
  onDisconnect: { addListener(listener: () => void): void };
}

/** Gmail changes its page all the time; the open email is checked at most this often. */
export const SCAN_DELAY_MS = 300;

/** Loaded "Show original" pages kept for reopened emails (each at most 1 MB). */
const MAX_CACHED_PAGES = 10;

/** A key for messages without an ID (should not happen in today's Gmail). */
const fallbackKey = (email: Email): string =>
  `text:${cut(`${email.sender.address}|${email.subject}`, MAX_KEY_CHARS - 5)}`;

export function watchGmail(
  port: WatchPort,
  page: { document: Document; location: Location } = { document, location },
): void {
  /** Key of the email last reported; `null` after "no email" was reported. */
  let reported: string | null | undefined;
  let loading: AbortController | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let connected = true;
  let accountKey: string | undefined;
  const pages = new Map<string, string>();

  const post = (message: GmailMessage): void => {
    if (!connected) return;
    try {
      port.postMessage(message);
    } catch {
      stop();
    }
  };

  const remember = (messageId: string, html: string): void => {
    pages.delete(messageId);
    pages.set(messageId, html);
    const oldest = pages.keys().next().value;
    if (pages.size > MAX_CACHED_PAGES && oldest !== undefined) pages.delete(oldest);
  };

  async function loadHeaders(key: string, messageId: string | undefined): Promise<void> {
    if (!messageId) return post({ type: 'original-failed', key, reason: 'no-message-id' });
    const cached = pages.get(messageId);
    if (cached !== undefined) return post({ type: 'original', key, html: cached });
    accountKey ??= readAccountKey(page.document);
    if (!accountKey) return post({ type: 'original-failed', key, reason: 'no-account-key' });

    const controller = new AbortController();
    loading = controller;
    try {
      const url = originalUrl(page.location, accountKey, messageId);
      const html = await loadOriginal(url, { signal: controller.signal });
      remember(messageId, html);
      if (loading === controller) post({ type: 'original', key, html });
    } catch (error) {
      // Another email was opened meanwhile: its own result follows, this one is dropped.
      if (loading !== controller) return;
      const reason = error instanceof OriginalError ? error.reason : 'request-failed';
      post({ type: 'original-failed', key, reason });
    } finally {
      if (loading === controller) loading = undefined;
    }
  }

  function scan(force = false): void {
    let message: Element | undefined;
    let email: Email | undefined;
    let messageId: string | undefined;
    try {
      message = findOpenMessage(page.document);
      messageId = message && readMessageId(message);
      // Reading the email is the expensive part, so it is skipped for the same message.
      if (!force && messageId !== undefined && messageId === reported) return;
      email = message && extractEmail(page.document);
    } catch {
      reported = undefined;
      post({ type: 'unreadable' });
      return;
    }
    if (!message || !email) {
      if (force || reported !== null) {
        reported = null;
        loading?.abort();
        post({ type: 'no-email' });
      }
      return;
    }
    const key = messageId ?? fallbackKey(email);
    if (!force && key === reported) return;
    reported = key;
    loading?.abort();
    loading = undefined;
    post({ type: 'email', key, email });
    void loadHeaders(key, messageId);
  }

  const schedule = (): void => {
    if (timer !== undefined) return;
    timer = setTimeout(() => {
      timer = undefined;
      scan();
    }, SCAN_DELAY_MS);
  };

  const observer = new MutationObserver(schedule);
  const view = page.document.defaultView;

  function stop(): void {
    connected = false;
    observer.disconnect();
    view?.removeEventListener('hashchange', schedule);
    clearTimeout(timer);
    loading?.abort();
  }

  observer.observe(page.document.body, { childList: true, subtree: true });
  view?.addEventListener('hashchange', schedule);
  port.onMessage.addListener((message) => {
    if (isScanRequest(message)) scan(true);
  });
  port.onDisconnect.addListener(stop);
  scan();
}
