import {
  getGenerativeModel,
  InferenceMode,
  type InferenceSource,
  type LanguageModelCreateOptions,
  type LanguageModelExpected,
} from 'firebase/ai';
import { ai } from './firebase';

/** Languages Gemini Nano handles on-device. Chrome warns if a session is created without them. */
const ON_DEVICE_LANGUAGES = ['en', 'de', 'fr', 'es'];

const expectedText = (): LanguageModelExpected[] => [
  { type: 'text', languages: ON_DEVICE_LANGUAGES },
];

/** Shared by the SDK and the warm-up, so both ask Chrome for the same model configuration. */
const createOptions = (): LanguageModelCreateOptions => ({
  expectedInputs: expectedText(),
  expectedOutputs: expectedText(),
});

/**
 * Hybrid model: runs on-device when Gemini Nano is available, otherwise in the cloud.
 * The SDK decides by model availability only; an on-device error does not fall back.
 */
const hybridModel = getGenerativeModel(ai, {
  mode: InferenceMode.PREFER_ON_DEVICE,
  onDeviceParams: { createOptions: createOptions() },
});

/** Cloud only. Used to test the cloud path on a machine where Gemini Nano is available. */
const cloudModel = getGenerativeModel(ai, { mode: InferenceMode.ONLY_IN_CLOUD });

export interface PromptResult {
  text: string;
  /** Where the prompt ran. `undefined` if the SDK did not report it. */
  source: InferenceSource | undefined;
  durationMs: number;
}

export async function runPrompt(prompt: string, forceCloud = false): Promise<PromptResult> {
  const model = forceCloud ? cloudModel : hybridModel;
  const start = performance.now();
  if (!forceCloud) {
    // If the warm-up is still loading the model, wait for it instead of letting the SDK start a
    // second load. A failed warm-up is not fatal here: the SDK decides on its own.
    await warmUpOnDevice().catch(() => undefined);
  }
  const { response } = await model.generateContent(prompt);
  return {
    text: response.text(),
    source: response.inferenceSource,
    durationMs: performance.now() - start,
  };
}

export type WarmUpResult =
  | { state: 'ready'; durationMs: number }
  /** Model not on this device yet (Chrome downloads it on first use, about 4 GB). */
  | { state: 'not-downloaded' }
  /** No Prompt API or hardware not supported: prompts go to the cloud. */
  | { state: 'unavailable' };

/**
 * Kept open so Chrome keeps the model in memory while the side panel is open. Never read: holding
 * the reference is the whole point (it stops the session from being garbage-collected).
 */
// oxlint-disable-next-line no-unused-vars
let warmSession: LanguageModelSession | undefined;

/** The one warm-up run, shared by every caller so the model is never loaded twice in parallel. */
let warmUp: Promise<WarmUpResult> | undefined;

async function loadOnDeviceModel(): Promise<WarmUpResult> {
  if (typeof LanguageModel === 'undefined') return { state: 'unavailable' };

  const availability = await LanguageModel.availability(createOptions());
  if (availability === 'unavailable') return { state: 'unavailable' };
  if (availability !== 'available') return { state: 'not-downloaded' };

  const start = performance.now();
  warmSession = await LanguageModel.create(createOptions());
  return { state: 'ready', durationMs: performance.now() - start };
}

/**
 * Loads Gemini Nano into memory before the first prompt. Loading can take minutes; afterwards
 * every new session (the SDK creates one per prompt) starts in about 0.1 s. Sends no data and
 * starts no download. Every call returns the same run; after a failure the next call retries.
 */
export function warmUpOnDevice(): Promise<WarmUpResult> {
  warmUp ??= loadOnDeviceModel().catch((error: unknown) => {
    warmUp = undefined;
    throw error;
  });
  return warmUp;
}
