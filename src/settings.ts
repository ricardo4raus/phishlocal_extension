/*
 * Settings that can change without a new release, through Firebase Remote Config
 * (`src/remote-config.ts`). Each has a default here, and every value from Remote Config is
 * checked: a wrong, missing or out-of-range value falls back to its default.
 *
 * The prompt's security rules are not settings: Remote Config can only add guidance after them
 * (`extra_instructions`), and the rules stay the verdict's lower limit whatever the AI says.
 */

/** Cloud models the deep check may use. Anything else falls back to the default. */
export const CLOUD_MODELS = ['gemini-3.5-flash-lite', 'gemini-3.5-flash'] as const;
export type CloudModel = (typeof CLOUD_MODELS)[number];

export interface Settings {
  /** The deep check's cloud model. */
  cloudModel: CloudModel;
  /** Time limit of one on-device AI check run. */
  aiCheckTimeoutMs: number;
  /** Time limit of one cloud request of the deep check. */
  cloudTimeoutMs: number;
  /** Time limit of the deep check's on-device name search. */
  namesTimeoutMs: number;
  /** Extra guidance added after the fixed system messages; empty for none. */
  extraInstructions: string;
}

export const DEFAULT_SETTINGS: Readonly<Settings> = {
  cloudModel: 'gemini-3.5-flash-lite',
  aiCheckTimeoutMs: 60_000,
  cloudTimeoutMs: 30_000,
  namesTimeoutMs: 20_000,
  extraInstructions: '',
};

/** The Remote Config parameter names, as created in the Firebase console. */
export const PARAMETERS = {
  cloudModel: 'cloud_model',
  aiCheckTimeout: 'ai_check_timeout_s',
  cloudTimeout: 'cloud_timeout_s',
  namesTimeout: 'names_timeout_s',
  extraInstructions: 'extra_instructions',
} as const;

/** Allowed range of each time limit, in whole seconds. */
export const SECONDS_RANGE: Readonly<Record<string, readonly [number, number]>> = {
  [PARAMETERS.aiCheckTimeout]: [20, 300],
  [PARAMETERS.cloudTimeout]: [10, 120],
  [PARAMETERS.namesTimeout]: [5, 120],
};

export const MAX_EXTRA_INSTRUCTIONS = 500;

/**
 * Characters extra instructions may not hold: controls (except the line break), invisible format
 * characters such as bidi overrides and zero-width spaces, private-use, unassigned and surrogate
 * code points, and line or paragraph separators.
 */
const FORBIDDEN_CATEGORIES = /[\p{Cc}\p{Cf}\p{Co}\p{Cn}\p{Cs}\p{Zl}\p{Zp}]/u;

/**
 * Characters Unicode itself marks as "default ignorable" (they show nothing: the combining
 * grapheme joiner, Hangul fillers, variation selectors, which can hide data in text, and more),
 * and spaces other than the plain one, which can hide data the same way.
 */
const IGNORABLE_OR_ODD_SPACE = /\p{Default_Ignorable_Code_Point}|(?! )\p{Zs}/u;

/** Blank characters that are not "default ignorable": blank Braille, Khitan filler, null notehead. */
const BLANK_CODE_POINTS: ReadonlySet<number> = new Set([0x2800, 0x16fe4, 0x1d159]);

function hasHiddenCharacters(text: string): boolean {
  if (FORBIDDEN_CATEGORIES.test(text) || IGNORABLE_OR_ODD_SPACE.test(text)) return true;
  for (const character of text) {
    if (BLANK_CODE_POINTS.has(character.codePointAt(0) ?? 0)) return true;
  }
  return false;
}

function seconds(value: string | undefined, parameter: string, fallbackMs: number): number {
  const range = SECONDS_RANGE[parameter];
  if (value === undefined || !range || !/^\d{1,4}$/.test(value.trim())) return fallbackMs;
  const number = Number(value.trim());
  return number >= range[0] && number <= range[1] ? number * 1000 : fallbackMs;
}

function cloudModel(value: string | undefined): CloudModel {
  const model = value?.trim();
  return CLOUD_MODELS.find((name) => name === model) ?? DEFAULT_SETTINGS.cloudModel;
}

function extraInstructions(value: string | undefined): string {
  const text = value?.replaceAll('\r\n', '\n').trim() ?? '';
  // A value that breaks a rule is dropped whole, never cut: half a sentence can mean the opposite.
  const withoutBreaks = text.replaceAll('\n', ' ');
  if (text.length > MAX_EXTRA_INSTRUCTIONS || hasHiddenCharacters(withoutBreaks)) return '';
  return text;
}

/**
 * The settings for the given Remote Config values (parameter name → value as text; only values
 * that came from Remote Config). Never throws.
 */
export function readSettings(values: Readonly<Record<string, string | undefined>>): Settings {
  const value = (parameter: string): string | undefined =>
    Object.hasOwn(values, parameter) ? values[parameter] : undefined;
  return {
    cloudModel: cloudModel(value(PARAMETERS.cloudModel)),
    aiCheckTimeoutMs: seconds(
      value(PARAMETERS.aiCheckTimeout),
      PARAMETERS.aiCheckTimeout,
      DEFAULT_SETTINGS.aiCheckTimeoutMs,
    ),
    cloudTimeoutMs: seconds(
      value(PARAMETERS.cloudTimeout),
      PARAMETERS.cloudTimeout,
      DEFAULT_SETTINGS.cloudTimeoutMs,
    ),
    namesTimeoutMs: seconds(
      value(PARAMETERS.namesTimeout),
      PARAMETERS.namesTimeout,
      DEFAULT_SETTINGS.namesTimeoutMs,
    ),
    extraInstructions: extraInstructions(value(PARAMETERS.extraInstructions)),
  };
}
