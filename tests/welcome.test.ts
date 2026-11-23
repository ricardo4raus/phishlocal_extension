// @vitest-environment jsdom
// The welcome page: opened once after the first install, in the panel's language, with buttons
// for the side panel, Gmail and the README.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import body from '../src/welcome/index.html?raw';
import { MESSAGES } from '../src/i18n';
import { GMAIL_URL, HOW_IT_WORKS_URL } from '../src/links';
import { setUpWelcome, type WelcomeApi } from '../src/welcome/main';
import { openWelcome, WELCOME_PAGE } from '../src/welcome/open';

function loadPage(): void {
  document.documentElement.innerHTML = body;
  for (const element of document.querySelectorAll('script, link')) element.remove();
}

const button = (id: string): HTMLButtonElement => {
  const element = document.querySelector<HTMLButtonElement>(`#${id}`);
  if (!element) throw new Error(`#${id} is missing`);
  return element;
};

/** A fake of the Chrome APIs the page uses; the current window comes when the test says so. */
function fakeApi(currentWindow: { id?: number } = { id: 7 }) {
  const pending: {
    resolve?: (value: { id?: number }) => void;
    reject?: (error: Error) => void;
  } = {};
  const open = vi.fn<(options: { windowId: number }) => Promise<void>>().mockResolvedValue();
  const create = vi.fn<(properties: { url: string }) => Promise<unknown>>().mockResolvedValue({});
  const api: WelcomeApi = {
    sidePanel: { open },
    windows: {
      getCurrent: () =>
        new Promise((resolve, reject) => {
          pending.resolve = resolve;
          pending.reject = reject;
        }),
    },
    tabs: { create },
  };
  return {
    api,
    open,
    create,
    windowKnown: async () => {
      pending.resolve?.(currentWindow);
      await Promise.resolve();
    },
    windowFails: async () => {
      pending.reject?.(new Error('No current window'));
      await Promise.resolve();
    },
  };
}

describe('openWelcome', () => {
  const create = vi.fn<(properties: { url: string }) => Promise<unknown>>();

  beforeEach(() => {
    create.mockReset().mockResolvedValue({});
    vi.stubGlobal('chrome', {
      runtime: { getURL: (path: string) => `chrome-extension://id/${path}` },
      tabs: { create },
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('opens the welcome page after the first install', () => {
    openWelcome({ reason: 'install' } as chrome.runtime.InstalledDetails);
    expect(create).toHaveBeenCalledWith({ url: `chrome-extension://id/${WELCOME_PAGE}` });
  });

  it('stays quiet after an update, a reload or a Chrome update', () => {
    for (const reason of ['update', 'chrome_update', 'shared_module_update']) {
      openWelcome({ reason } as chrome.runtime.InstalledDetails);
    }
    expect(create).not.toHaveBeenCalled();
  });

  it('never throws when the tab cannot be opened', async () => {
    create.mockRejectedValue(new Error('No window'));
    expect(() =>
      openWelcome({ reason: 'install' } as chrome.runtime.InstalledDetails),
    ).not.toThrow();
    await Promise.resolve();
  });
});

describe('the welcome page', () => {
  beforeEach(loadPage);

  it('names only keys that exist, uses every welcome text, and English is what it says', () => {
    const texts = { ...MESSAGES.en.html, ...MESSAGES.en.welcome };
    const keys = [...document.querySelectorAll<HTMLElement>('[data-t]')].map(
      (element) => element.dataset.t ?? '',
    );
    for (const key of keys) expect(Object.hasOwn(texts, key), key).toBe(true);
    for (const key of Object.keys(MESSAGES.en.welcome)) expect(keys, key).toContain(key);
    for (const element of document.querySelectorAll<HTMLElement>('[data-t]')) {
      const key = element.dataset.t as keyof typeof texts;
      expect(element.textContent?.replaceAll(/\s+/g, ' ').trim(), key).toBe(texts[key]);
    }
  });

  it("comes up in the panel's language, with the panel's privacy points", () => {
    setUpWelcome(document, fakeApi().api, MESSAGES.de, 'de');
    expect(document.documentElement.lang).toBe('de');
    expect(document.title).toBe(MESSAGES.de.welcome.title);
    expect(document.querySelector('h1')?.textContent).toBe(MESSAGES.de.welcome.title);
    expect(button('open-panel').textContent).toBe(MESSAGES.de.welcome.openPanel);
    expect(document.querySelector('[data-t="pointCloudLead"]')?.textContent).toBe(
      MESSAGES.de.html.pointCloudLead,
    );
  });

  it('opens the side panel within the click, once the window is known', async () => {
    const fake = fakeApi({ id: 7 });
    setUpWelcome(document, fake.api, MESSAGES.en, 'en');
    const openPanel = button('open-panel');
    expect(openPanel.disabled).toBe(true);
    await fake.windowKnown();
    expect(openPanel.disabled).toBe(false);
    openPanel.click();
    // Synchronously: Chrome refuses sidePanel.open after the user gesture has passed.
    expect(fake.open).toHaveBeenCalledWith({ windowId: 7 });
  });

  it('hides the panel button without the side panel API or a window', async () => {
    const noApi = fakeApi();
    setUpWelcome(document, { ...noApi.api, sidePanel: undefined }, MESSAGES.en, 'en');
    expect(button('open-panel').hidden).toBe(true);

    loadPage();
    const failing = fakeApi();
    setUpWelcome(document, failing.api, MESSAGES.en, 'en');
    await failing.windowFails();
    expect(button('open-panel').hidden).toBe(true);

    loadPage();
    const noWindow = fakeApi({});
    setUpWelcome(document, noWindow.api, MESSAGES.en, 'en');
    await noWindow.windowKnown();
    expect(button('open-panel').hidden).toBe(true);
    button('open-panel').click();
    expect(noWindow.open).not.toHaveBeenCalled();
  });

  it('opens Gmail and the README in new tabs', () => {
    const fake = fakeApi();
    setUpWelcome(document, fake.api, MESSAGES.en, 'en');
    button('open-gmail').click();
    button('how-it-works').click();
    expect(fake.create.mock.calls).toEqual([[{ url: GMAIL_URL }], [{ url: HOW_IT_WORKS_URL }]]);
  });

  it('has the flag button: another language is saved and the page reloads', () => {
    const reload = vi.fn<() => void>();
    setUpWelcome(document, fakeApi().api, MESSAGES.fr, 'fr', reload);
    expect(document.querySelector<HTMLElement>('#language-button .lang-flag')?.dataset.flag).toBe(
      'fr',
    );
    document.querySelector<HTMLButtonElement>('#language-menu button[lang="de"]')?.click();
    expect(localStorage.getItem('phishlocal.language')).toBe('de');
    expect(reload).toHaveBeenCalledTimes(1);
    localStorage.clear();
  });

  it('holds no <a>, <img> or <svg>', () => {
    expect(document.querySelectorAll('a, img, svg')).toHaveLength(0);
  });
});
