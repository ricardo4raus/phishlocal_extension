/*
 * Chrome runs the content scripts from manifest.json only in pages loaded after the extension.
 * After an install or update (also a reload during development), an open Gmail tab has no
 * working content script until the user reloads it, so the side panel cannot read its email.
 * This injects the same content scripts into the open tabs they are meant for.
 *
 * Needs the "scripting" permission and host access to the same pages (Gmail only); Chrome shows
 * the same install warning as for the content script itself.
 */

/** Injects every manifest content script into the open tabs it matches. Never throws. */
export async function injectIntoOpenTabs(): Promise<void> {
  for (const script of chrome.runtime.getManifest().content_scripts ?? []) {
    const files = script.js ?? [];
    if (files.length === 0 || !script.matches?.length) continue;
    const tabs = await chrome.tabs.query({ url: script.matches }).catch(() => []);
    await Promise.all(
      tabs.map((tab) =>
        tab.id === undefined
          ? undefined
          : // A tab can refuse (e.g. discarded or still loading): it gets the script on load.
            chrome.scripting.executeScript({ target: { tabId: tab.id }, files }).catch(() => {}),
      ),
    );
  }
}

/** Only an install or an update of PhishLocal leaves open tabs without the content script. */
export function onInstalled({ reason }: chrome.runtime.InstalledDetails): void {
  if (reason === 'install' || reason === 'update') void injectIntoOpenTabs();
}
