/*
 * The welcome page, shown once after the first install (open.ts): the logo, what PhishLocal does,
 * how to start and how privacy is kept, in the panel's language (the same saved choice: the page
 * shares the panel's origin). Its buttons open the side panel, Gmail and the README.
 */
import { language, m, type Messages } from '../i18n';
import type { Language } from '../i18n/languages';
import { GMAIL_URL, HOW_IT_WORKS_URL } from '../links';
import { translatePage } from '../sidepanel/language-view';

/** The Chrome APIs the page uses; `chrome` itself in the extension, a fake in the tests. */
export interface WelcomeApi {
  sidePanel?: { open?: (options: { windowId: number }) => Promise<void> };
  windows: { getCurrent: () => Promise<{ id?: number }> };
  tabs: { create: (properties: { url: string }) => Promise<unknown> };
}

export function setUpWelcome(
  root: Document,
  api: WelcomeApi,
  messages: Messages = m,
  pageLanguage: Language = language,
): void {
  translatePage(root, messages, pageLanguage, { ...messages.html, ...messages.welcome });

  const button = (id: string): HTMLButtonElement => {
    const element = root.querySelector<HTMLButtonElement>(`#${id}`);
    if (!element) throw new Error(`Welcome page: #${id} is missing in index.html`);
    return element;
  };

  // Chrome opens the side panel only within the click's user gesture, so the click handler must
  // not wait for anything: the window is looked up now. Without the API (older Chrome) or a
  // window, the button goes and step 1 still says how to open the panel.
  const openPanel = button('open-panel');
  const open = api.sidePanel?.open?.bind(api.sidePanel);
  let windowId: number | undefined;
  if (typeof open !== 'function') {
    openPanel.hidden = true;
  } else {
    openPanel.disabled = true;
    api.windows.getCurrent().then(
      ({ id }) => {
        windowId = id;
        openPanel.disabled = false;
        openPanel.hidden = id === undefined;
      },
      () => {
        openPanel.hidden = true;
      },
    );
    openPanel.addEventListener('click', () => {
      if (windowId !== undefined) open({ windowId }).catch(() => {});
    });
  }

  const openTab = (url: string) => () => {
    api.tabs.create({ url }).catch(() => {});
  };
  button('open-gmail').addEventListener('click', openTab(GMAIL_URL));
  button('how-it-works').addEventListener('click', openTab(HOW_IT_WORKS_URL));
}

// In the extension only; the tests call setUpWelcome themselves.
if (typeof chrome !== 'undefined' && chrome.runtime?.id) setUpWelcome(document, chrome);
