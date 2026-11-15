/*
 * Minimal types for Chrome's built-in Prompt API (`LanguageModel`), used only to warm up the
 * on-device model. TypeScript's DOM types do not include it yet. Prompts go through Firebase AI
 * Logic, not through this API.
 */

type LanguageModelAvailability = 'unavailable' | 'downloadable' | 'downloading' | 'available';

interface LanguageModelSession {
  destroy(): void;
}

interface LanguageModelStatic {
  availability(
    options?: import('firebase/ai').LanguageModelCreateCoreOptions,
  ): Promise<LanguageModelAvailability>;
  create(options?: import('firebase/ai').LanguageModelCreateOptions): Promise<LanguageModelSession>;
}

/** `undefined` in browsers without the Prompt API. */
declare var LanguageModel: LanguageModelStatic | undefined;
