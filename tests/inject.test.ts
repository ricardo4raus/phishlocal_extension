// Injecting the content script into Gmail tabs that were open before an install or update.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { injectIntoOpenTabs, onInstalled } from '../src/inject';

const executeScript = vi.fn<(injection: unknown) => Promise<unknown>>();
const query = vi.fn<(info: chrome.tabs.QueryInfo) => Promise<{ id?: number }[]>>();

beforeEach(() => {
  executeScript.mockReset().mockResolvedValue([]);
  query.mockReset().mockResolvedValue([{ id: 1 }, { id: undefined }, { id: 2 }]);
  vi.stubGlobal('chrome', {
    runtime: {
      getManifest: () => ({
        content_scripts: [
          { matches: ['https://mail.google.com/*'], js: ['assets/gmail.ts-loader-X.js'] },
        ],
      }),
    },
    tabs: { query },
    scripting: { executeScript },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('injectIntoOpenTabs', () => {
  it("injects the manifest's content script into the matching open tabs only", async () => {
    await injectIntoOpenTabs();
    expect(query).toHaveBeenCalledWith({ url: ['https://mail.google.com/*'] });
    expect(executeScript.mock.calls).toEqual([
      [{ target: { tabId: 1 }, files: ['assets/gmail.ts-loader-X.js'] }],
      [{ target: { tabId: 2 }, files: ['assets/gmail.ts-loader-X.js'] }],
    ]);
  });

  it('goes on when a tab refuses, and never throws', async () => {
    executeScript.mockRejectedValueOnce(new Error('Frame was removed'));
    await expect(injectIntoOpenTabs()).resolves.toBeUndefined();
    expect(executeScript).toHaveBeenCalledTimes(2);
    query.mockRejectedValueOnce(new Error('No access'));
    await expect(injectIntoOpenTabs()).resolves.toBeUndefined();
  });
});

describe('onInstalled', () => {
  it('injects after an install or update, not after a Chrome update', async () => {
    onInstalled({ reason: 'chrome_update' } as chrome.runtime.InstalledDetails);
    onInstalled({ reason: 'shared_module_update' } as chrome.runtime.InstalledDetails);
    await vi.waitFor(() => expect(query).not.toHaveBeenCalled());
    onInstalled({ reason: 'update' } as chrome.runtime.InstalledDetails);
    await vi.waitFor(() => expect(executeScript).toHaveBeenCalledTimes(2));
    onInstalled({ reason: 'install' } as chrome.runtime.InstalledDetails);
    await vi.waitFor(() => expect(executeScript).toHaveBeenCalledTimes(4));
  });
});
