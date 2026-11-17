/*
 * Keeps a port to the active tab while the side panel is open. If the tab is Gmail, its content
 * script reports every email the user opens; otherwise the port closes at once. Switching tabs
 * or reloading Gmail reconnects. No permission is needed: `chrome.tabs.connect` reaches only
 * our own content script, and the tab events used here carry no URLs.
 */
import { type GmailMessage, isGmailMessage, type ScanRequest, WATCH_PORT } from '../messages';

export interface WatchCallbacks {
  /** A validated message from the Gmail tab. */
  onMessage(message: GmailMessage): void;
  /** The active tab is not (or no longer) a Gmail tab with our content script. */
  onDisconnected(): void;
}

export interface Watch {
  /** Reads the open email again (the "Read open email" button). */
  scan(): void;
}

export function watchActiveTab(callbacks: WatchCallbacks): Watch {
  let port: chrome.runtime.Port | undefined;
  let tabId: number | undefined;
  let windowId: number | undefined;
  /** Counts connect attempts; only the newest may open a port. */
  let attempts = 0;

  async function connect(): Promise<void> {
    const attempt = ++attempts;
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    // A newer attempt started meanwhile (tab switch, reload, click): it opens the port.
    if (attempt !== attempts) return;
    // Close the old port: its content script stops reading.
    port?.disconnect();
    port = undefined;
    tabId = tab?.id;
    windowId = tab?.windowId;
    if (tabId === undefined) {
      callbacks.onDisconnected();
      return;
    }
    let next: chrome.runtime.Port;
    try {
      next = chrome.tabs.connect(tabId, { name: WATCH_PORT });
    } catch {
      // Some tabs (e.g. chrome:// pages) refuse the connection outright.
      callbacks.onDisconnected();
      return;
    }
    port = next;
    next.onMessage.addListener((message: unknown) => {
      if (port === next && isGmailMessage(message)) callbacks.onMessage(message);
    });
    next.onDisconnect.addListener(() => {
      // Reading lastError marks the expected "no content script here" as handled.
      void chrome.runtime.lastError;
      if (port !== next) return;
      port = undefined;
      callbacks.onDisconnected();
    });
  }

  chrome.tabs.onActivated.addListener((info) => {
    if (windowId === undefined || info.windowId === windowId) void connect();
  });
  // A reloaded Gmail tab gets a new content script: connect again once it has loaded.
  chrome.tabs.onUpdated.addListener((id, change) => {
    if (id === tabId && change.status === 'complete' && port === undefined) void connect();
  });
  void connect();

  return {
    scan() {
      if (!port) {
        void connect();
        return;
      }
      const request: ScanRequest = { type: 'scan' };
      port.postMessage(request);
    },
  };
}
