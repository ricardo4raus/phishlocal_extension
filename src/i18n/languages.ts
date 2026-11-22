/*
 * The panel's languages and the user's choice. The choice is "auto" until the user picks one in
 * Settings; it is kept in this browser's local storage (the panel's own origin), never sent.
 */

/** The languages the panel and its AI answers come in. */
export const LANGUAGES = ['en', 'de', 'fr', 'es', 'it', 'pt'] as const;
export type Language = (typeof LANGUAGES)[number];

/** "auto": Chrome's language if the panel has it, else English. */
export type LanguageChoice = Language | 'auto';

/** Each language's name in itself, as the menu shows it. */
export const LANGUAGE_NAMES: Readonly<Record<Language, string>> = {
  en: 'English',
  de: 'Deutsch',
  fr: 'Français',
  es: 'Español',
  it: 'Italiano',
  pt: 'Português',
};

/** Where the choice is kept (local storage of the side panel's page). */
export const LANGUAGE_KEY = 'phishlocal.language';

export const isLanguage = (value: unknown): value is Language =>
  LANGUAGES.some((language) => language === value);

/** The panel's language for a browser language such as "de-CH"; English if the panel lacks it. */
export function languageFor(browserLanguage: string): Language {
  const code = browserLanguage.toLowerCase().split(/[-_]/)[0];
  return isLanguage(code) ? code : 'en';
}

/** Chrome's UI language, or "" outside Chrome (tests). */
function chromeLanguage(): string {
  try {
    return typeof chrome === 'undefined' ? '' : (chrome.i18n?.getUILanguage() ?? '');
  } catch {
    return '';
  }
}

/** The panel's page storage; none outside a page (Node warns when its own is touched). */
const storage = (): Storage | undefined =>
  typeof window === 'undefined' ? undefined : window.localStorage;

/** The stored choice; "auto" when there is none, it cannot be read, or it is not a language. */
export function savedChoice(): LanguageChoice {
  try {
    const value = storage()?.getItem(LANGUAGE_KEY);
    return isLanguage(value) ? value : 'auto';
  } catch {
    return 'auto';
  }
}

/** Saves the choice ("auto" removes it). Returns false if the browser refused. */
export function saveChoice(choice: LanguageChoice): boolean {
  try {
    const store = storage();
    if (!store) return false;
    if (choice === 'auto') store.removeItem(LANGUAGE_KEY);
    else store.setItem(LANGUAGE_KEY, choice);
    return true;
  } catch {
    return false;
  }
}

/** The language "auto" stands for in this browser. */
export const automaticLanguage = (): Language => languageFor(chromeLanguage());

/** The language of this page load: the saved choice, else the automatic one. */
export function resolveLanguage(choice: LanguageChoice = savedChoice()): Language {
  return choice === 'auto' ? automaticLanguage() : choice;
}
