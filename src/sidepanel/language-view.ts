/*
 * The panel's language: its static text (index.html) in the language of this page load, and the
 * language menu in Settings. Choosing a language saves it and reloads the panel, so every part
 * comes up in that language at once; "Automatic" follows Chrome's language.
 */
import type { Messages } from '../i18n';
import {
  automaticLanguage,
  type Language,
  LANGUAGE_NAMES,
  LANGUAGES,
  type LanguageChoice,
  savedChoice,
  saveChoice,
} from '../i18n/languages';

/** A page's static text by `data-t` key; only string entries are used. */
export type PageTexts = Readonly<Record<string, unknown>>;

const htmlText = (texts: PageTexts, key: string | undefined): string | undefined => {
  const text = key !== undefined && Object.hasOwn(texts, key) ? texts[key] : undefined;
  return typeof text === 'string' ? text : undefined;
};

/**
 * Puts the static text of `root` into `messages`' language: `data-t` sets the text, `data-t-label`
 * the aria-label, `data-t-title` the tooltip, `data-t-placeholder` the placeholder. The keys come
 * from `texts` (the panel's `html` unless a page brings its own). An unknown key keeps the page's
 * English text (a test checks that every key exists).
 */
export function translatePage(
  root: Document,
  messages: Messages,
  language: Language,
  texts: PageTexts = messages.html,
): void {
  root.documentElement.lang = language;
  for (const element of root.querySelectorAll<HTMLElement>('[data-t]')) {
    const text = htmlText(texts, element.dataset.t);
    if (text !== undefined) element.textContent = text;
  }
  const attributes = [
    ['tLabel', 'aria-label'],
    ['tTitle', 'title'],
    ['tPlaceholder', 'placeholder'],
  ] as const;
  for (const [data, attribute] of attributes) {
    const selector = `[data-t-${attribute === 'aria-label' ? 'label' : attribute}]`;
    for (const element of root.querySelectorAll<HTMLElement>(selector)) {
      const text = htmlText(texts, element.dataset[data]);
      if (text !== undefined) element.setAttribute(attribute, text);
    }
  }
}

const option = (value: LanguageChoice, text: string, lang: Language): HTMLOptionElement => {
  const element = document.createElement('option');
  element.value = value;
  element.textContent = text;
  element.lang = lang;
  return element;
};

/**
 * Fills the language menu and keeps the choice: "Automatic (Deutsch)" first, then each language
 * in its own name. A change is saved and the panel reloads in the new language.
 */
export function setUpLanguage(
  select: HTMLSelectElement,
  messages: Messages,
  reload: () => void = () => location.reload(),
): void {
  const automatic = automaticLanguage();
  select.replaceChildren(
    option('auto', messages.automatic(LANGUAGE_NAMES[automatic]), automatic),
    ...LANGUAGES.map((language) => option(language, LANGUAGE_NAMES[language], language)),
  );
  // The automatic entry is written in the panel's language, the others in their own.
  select.options[0]?.removeAttribute('lang');
  select.value = savedChoice();
  select.addEventListener('change', () => {
    const choice = select.value;
    if (choice !== 'auto' && !LANGUAGES.some((language) => language === choice)) return;
    if (saveChoice(choice as LanguageChoice)) reload();
  });
}
