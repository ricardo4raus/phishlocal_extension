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

/** Marks that the open email could not be read (so the failure is reported only once). */
const UNREADABLE = Symbol('unreadable');

/** A key for messages without an ID (should not happen in today's Gmail). */
const fallbackKey = (email: Email): string =>
  `text:${cut(`${email.sender.address}|${email.subject}`, MAX_KEY_CHARS - 5)}`;

export function watchGmail(
  port: WatchPort,
  page: { document: Document; location: Location } = { document, location },
): void {
  /** Key of the email last reported; `null` after "no email", `UNREADABLE` after a failure. */
  let reported: string | null | typeof UNREADABLE | undefined;
  /** Size of the reported message's content, to notice when Gmail renders more of it. */
  let reportedSize: number | undefined;
  /** The email last reported, to report it again only if its content changed. */
  let reportedEmail: string | undefined;
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

  /** Stops the running page request; its result is dropped. */
  const cancelLoading = (): void => {
    loading?.abort();
    loading = undefined;
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
    let size: number | undefined;
    try {
      message = findOpenMessage(page.document);
      messageId = message && readMessageId(message);
      size = message?.textContent?.length;
      // Reading the email (innerText) is the expensive part: skip it for the same message,
      // unless Gmail has rendered more of it since (cheap to notice with textContent).
      const same = messageId !== undefined && messageId === reported && size === reportedSize;
      if (!force && same) return;
      email = message && extractEmail(page.document);
    } catch {
      // Reported once: Gmail keeps changing its page, and each change would try again.
      if (force || reported !== UNREADABLE) {
        reported = UNREADABLE;
        cancelLoading();
        post({ type: 'unreadable' });
      }
      return;
    }
    if (!message || !email) {
      if (force || reported !== null) {
        reported = null;
        cancelLoading();
        post({ type: 'no-email' });
      }
      return;
    }
    const key = messageId ?? fallbackKey(email);
    const content = JSON.stringify(email);
    reportedSize = size;
    // Same message, same content (e.g. only Gmail's "5 minutes ago" changed): nothing to report.
    if (!force && key === reported && content === reportedEmail) return;
    const sameMessage = key === reported;
    reported = key;
    reportedEmail = content;
    if (!sameMessage) cancelLoading();
    post({ type: 'email', key, email });
    // The page of the same message is cached or still loading; its result follows.
    if (!sameMessage || !loading) void loadHeaders(key, messageId);
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
    cancelLoading();
  }

  observer.observe(page.document.body, { childList: true, subtree: true });
  view?.addEventListener('hashchange', schedule);
  port.onMessage.addListener((message) => {
    if (isScanRequest(message)) scan(true);
  });
  port.onDisconnect.addListener(stop);
  scan();
}
