/*
 * The panel's text in the language of this page load. The language is fixed when the side panel
 * opens (the saved choice, else Chrome's language, else English); choosing another one in
 * Settings saves it and reloads the panel, so every part switches at once and no module needs to
 * redraw. Modules may read `m` at import time.
 */
import { de } from './de';
import { en, type Messages } from './en';
import { es } from './es';
import { fr } from './fr';
import { it } from './it';
import { type Language, resolveLanguage } from './languages';
import { pt } from './pt';

export const MESSAGES: Readonly<Record<Language, Messages>> = { en, de, fr, es, it, pt };

/** The language of this page load. */
export const language: Language = resolveLanguage();

/** The panel's text in {@link language}. */
export const m: Messages = MESSAGES[language];

const oneDecimal = new Intl.NumberFormat(language, {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

/** "1.4 s" ("1,4 s" in German): a duration in seconds with one decimal. */
export const seconds = (ms: number): string => `${oneDecimal.format(ms / 1000)} s`;

export type { Messages };
