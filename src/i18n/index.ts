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

/**
 * The engine's English reason for a failure (built from `en.errors`) in the panel's language:
 * "no answer within 60 s; the model had written 120 characters" → German, French, …. Parts it
 * does not know (an SDK's own message) stay as they are.
 */
export function localDetail(detail: string, messages: Messages = m): string {
  const errors = messages.errors;
  const patterns: [RegExp, (match: string) => string][] = [
    [/^no answer within (\d+) s$/, errors.noAnswerWithin],
    [/^the model had written (\d+) characters$/, errors.modelWrote],
    [/^the answer did not end \(over (\d+) characters\)$/, errors.tooLong],
    [/^the cloud refused the request \(HTTP (\d{3})\)$/, errors.refused],
    [/^no answer from the token server \(([\w/-]+)\)$/, errors.tokenNoAnswer],
    [/^the token server refused \(HTTP (\d{3})\)$/, errors.tokenRefused],
    [/^sign-in failed \(([\w/-]+)\)$/, errors.signInFailed],
  ];
  const fixed: Record<string, string> = {
    [en.errors.cloudFailed]: errors.cloudFailed,
    [en.errors.offline]: errors.offline,
  };
  return detail
    .split('; ')
    .map((part) => {
      if (Object.hasOwn(fixed, part)) return fixed[part] ?? part;
      for (const [pattern, translate] of patterns) {
        const value = pattern.exec(part)?.[1];
        if (value !== undefined) return translate(value);
      }
      return part;
    })
    .join('; ');
}
