// @vitest-environment jsdom
// The panel's languages: the dictionaries, the saved choice, the static text and the menu.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import body from '../src/sidepanel/index.html?raw';
import { MESSAGES } from '../src/i18n';
import type { Messages } from '../src/i18n/en';
import {
  LANGUAGE_KEY,
  languageFor,
  LANGUAGES,
  resolveLanguage,
  savedChoice,
  saveChoice,
} from '../src/i18n/languages';
import type { RuleId } from '../src/rules/types';
import { setUpLanguage, translatePage } from '../src/sidepanel/language-view';

const RULES = Object.keys(MESSAGES.en.titles) as RuleId[];

function loadPanel(): void {
  document.documentElement.innerHTML = body;
  for (const element of document.querySelectorAll('script, link')) element.remove();
}

/** Every string a dictionary yields, with sample arguments for its functions. */
function allTexts(messages: Messages): string[] {
  const texts: string[] = [];
  const walk = (value: unknown): void => {
    if (typeof value === 'string') texts.push(value);
    else if (typeof value === 'function') {
      const call = value as (...args: unknown[]) => unknown;
      // Counts are numbers, flags booleans, names strings: each function gets the kind it takes.
      for (const first of [1, 2, true, false, 'Name']) {
        let text: unknown;
        try {
          text = call(first, 'x', 'y');
        } catch {
          continue; // e.g. a string method on a number: not a call the panel makes
        }
        if (typeof text === 'string' && !text.includes('[object')) texts.push(text);
      }
    } else if (value && typeof value === 'object') Object.values(value).forEach(walk);
  };
  walk(messages);
  return texts;
}

/** The keys of every object in a dictionary, as paths ("verdict.word.safe"). */
function keyPaths(value: unknown, prefix = ''): string[] {
  if (!value || typeof value !== 'object') return [prefix];
  return Object.entries(value).flatMap(([key, inner]) => keyPaths(inner, `${prefix}.${key}`));
}

/** The key paths of a dictionary without `sentences` (optional in English: compared apart). */
const withoutSentences = (messages: Messages): string[] => keyPaths({ ...messages, sentences: {} });

describe('the dictionaries', () => {
  it('have exactly the keys of English in every language', () => {
    for (const language of LANGUAGES) {
      expect(withoutSentences(MESSAGES[language]), language).toEqual(withoutSentences(MESSAGES.en));
    }
  });

  it('give every other language its own sentence for every rule', () => {
    for (const language of LANGUAGES.filter((code) => code !== 'en')) {
      for (const rule of RULES) {
        expect(MESSAGES[language].sentences[rule], `${language} ${rule}`).toBeTruthy();
      }
    }
  });

  it('never produce an empty text or a missing value', () => {
    for (const language of LANGUAGES) {
      for (const text of allTexts(MESSAGES[language])) {
        expect(text, language).not.toMatch(/undefined|NaN|\[object /);
      }
    }
  });

  it('keep protocol names out of tiers 1 and 2', () => {
    for (const language of LANGUAGES) {
      const m = MESSAGES[language];
      const plainTiers = [
        m.titles,
        m.verdict,
        m.pill,
        m.banner,
        m.empty,
        m.flags,
        m.severity,
        m.deepCheck.chips,
        { ...m.sentences, 'dmarc-fail': '', 'auth-fail': '', 'dkim-other-domain': '' },
      ];
      for (const text of plainTiers.flatMap((part) => allTexts(part as unknown as Messages))) {
        expect(text, language).not.toMatch(/\b(?:SPF|DKIM|DMARC)\b/);
      }
      // The two sentences that replace protocol messages say it in plain words too.
      expect(m.sentences['dmarc-fail'], language).not.toMatch(/DMARC/);
      expect(m.sentences['auth-fail'], language).not.toMatch(/SPF|DKIM/);
    }
  });
});

describe('the language choice', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.unstubAllGlobals());

  it("maps Chrome's language to the panel's, else English", () => {
    expect(languageFor('de-CH')).toBe('de');
    expect(languageFor('pt_BR')).toBe('pt');
    expect(languageFor('FR')).toBe('fr');
    expect(languageFor('ja')).toBe('en');
    expect(languageFor('')).toBe('en');
  });

  it('is automatic until the user picks a language, then stays', () => {
    vi.stubGlobal('chrome', { i18n: { getUILanguage: () => 'es-ES' } });
    expect(savedChoice()).toBe('auto');
    expect(resolveLanguage()).toBe('es');
    expect(saveChoice('de')).toBe(true);
    expect(localStorage.getItem(LANGUAGE_KEY)).toBe('de');
    expect(resolveLanguage()).toBe('de');
    expect(saveChoice('auto')).toBe(true);
    expect(localStorage.getItem(LANGUAGE_KEY)).toBeNull();
    expect(resolveLanguage()).toBe('es');
  });

  it('ignores a stored value that is not a language', () => {
    localStorage.setItem(LANGUAGE_KEY, 'xx');
    expect(savedChoice()).toBe('auto');
    localStorage.setItem(LANGUAGE_KEY, '__proto__');
    expect(savedChoice()).toBe('auto');
  });

  it('falls back to English outside Chrome', () => {
    expect(resolveLanguage()).toBe('en');
  });
});

describe('the static text', () => {
  beforeEach(loadPanel);

  it('names only keys that exist, and English is what index.html says', () => {
    const keys = [...document.querySelectorAll<HTMLElement>('[data-t]')].map(
      (element) => element.dataset.t ?? '',
    );
    const attributeKeys = [
      ...document.querySelectorAll<HTMLElement>(
        '[data-t-label], [data-t-title], [data-t-placeholder]',
      ),
    ].flatMap((element) =>
      [element.dataset.tLabel, element.dataset.tTitle, element.dataset.tPlaceholder].filter(
        (key) => key !== undefined,
      ),
    );
    for (const key of [...keys, ...attributeKeys]) {
      expect(Object.hasOwn(MESSAGES.en.html, key), key).toBe(true);
    }
    // Every text key of the dictionary is used.
    for (const key of Object.keys(MESSAGES.en.html)) {
      expect([...keys, ...attributeKeys], key).toContain(key);
    }
    // English text in index.html matches the dictionary, so a page before translation reads the same.
    for (const element of document.querySelectorAll<HTMLElement>('[data-t]')) {
      const key = element.dataset.t as keyof Messages['html'];
      expect(element.textContent?.replaceAll(/\s+/g, ' ').trim(), key).toBe(MESSAGES.en.html[key]);
    }
  });

  it('switches every marked text and attribute, and the page language', () => {
    translatePage(document, MESSAGES.de, 'de');
    expect(document.documentElement.lang).toBe('de');
    expect(document.querySelector('#empty-heading')?.textContent).toBe(
      MESSAGES.de.html.emptyHeading,
    );
    expect(document.querySelector('#read-email')?.getAttribute('aria-label')).toBe(
      MESSAGES.de.html.readAgain,
    );
    expect(document.querySelector('#read-email')?.getAttribute('title')).toBe(
      MESSAGES.de.html.readAgain,
    );
    expect(document.querySelector('#paste-sender')?.getAttribute('placeholder')).toBe(
      MESSAGES.de.html.senderPlaceholder,
    );
    // Icons next to a text stay: only the text span changes.
    expect(document.querySelector('#deep-check-send .icon')).not.toBeNull();
    expect(document.querySelector('#deep-check-send')?.textContent?.trim()).toBe(
      MESSAGES.de.html.send,
    );
    // The counts in the headings stay where they are.
    expect(document.querySelector('#flags-heading #flags-count')).not.toBeNull();
  });
});

describe('the language menu', () => {
  beforeEach(() => {
    localStorage.clear();
    loadPanel();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('offers Automatic first and each language in its own name, with the choice selected', () => {
    vi.stubGlobal('chrome', { i18n: { getUILanguage: () => 'fr-CH' } });
    localStorage.setItem(LANGUAGE_KEY, 'it');
    const select = document.querySelector<HTMLSelectElement>('#language-select');
    if (!select) throw new Error('no language menu');
    setUpLanguage(select, MESSAGES.en, () => {});
    expect([...select.options].map((option) => option.textContent)).toEqual([
      'Automatic (Français)',
      'English',
      'Deutsch',
      'Français',
      'Español',
      'Italiano',
      'Português',
    ]);
    expect(select.value).toBe('it');
    expect(select.options[3]?.lang).toBe('fr');
  });

  it('saves a new choice and reloads the panel; Automatic forgets it', () => {
    const select = document.querySelector<HTMLSelectElement>('#language-select');
    if (!select) throw new Error('no language menu');
    const reload = vi.fn<() => void>();
    setUpLanguage(select, MESSAGES.en, reload);
    expect(select.value).toBe('auto');
    select.value = 'pt';
    select.dispatchEvent(new Event('change'));
    expect(localStorage.getItem(LANGUAGE_KEY)).toBe('pt');
    expect(reload).toHaveBeenCalledTimes(1);
    select.value = 'auto';
    select.dispatchEvent(new Event('change'));
    expect(localStorage.getItem(LANGUAGE_KEY)).toBeNull();
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it('does not reload when the choice cannot be saved', () => {
    const select = document.querySelector<HTMLSelectElement>('#language-select');
    if (!select) throw new Error('no language menu');
    const reload = vi.fn<() => void>();
    setUpLanguage(select, MESSAGES.en, reload);
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    select.value = 'de';
    select.dispatchEvent(new Event('change'));
    expect(reload).not.toHaveBeenCalled();
    setItem.mockRestore();
  });
});
