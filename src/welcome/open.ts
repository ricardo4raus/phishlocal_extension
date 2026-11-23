/*
 * Opens the welcome page once, after the first install. Updates (also a reload during
 * development) do not: the user knows PhishLocal by then. Opening an extension page in a tab
 * needs no permission.
 */

/** The welcome page in the build (built as an extra input, see vite.config.ts). */
export const WELCOME_PAGE = 'src/welcome/index.html';

export function openWelcome({ reason }: chrome.runtime.InstalledDetails): void {
  if (reason !== 'install') return;
  chrome.tabs.create({ url: chrome.runtime.getURL(WELCOME_PAGE) }).catch(() => {});
}
