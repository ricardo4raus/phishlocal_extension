import {
  getGenerativeModel,
  InferenceMode,
  type InferenceSource,
  type LanguageModelCreateOptions,
  type LanguageModelExpected,
  type LanguageModelPromptOptions,
} from 'firebase/ai';
import { SYSTEM_PROMPT } from './ai/prompt';
import { type AiVerdict, parseVerdict, VERDICT_SCHEMA } from './ai/verdict';
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

/**
 * The session settings of the AI check in one answer language. The warm-up loads exactly these:
 * Chrome loads the model once per settings, and that first load can take minutes. Measured
 * 19 Nov 2026: a session with the warm-up's former settings (all four output languages, no
 * system message) was ready in 3.6 s, yet the first check session (one output language, the
 * system message) then took 249 s to create; every later one took 0.0 s.
 *
 * The system message goes in as the session's first prompt, because the SDK does not pass
 * `systemInstruction` to the on-device model.
 */
function checkSessionOptions(language: string): LanguageModelCreateOptions {
  // Chrome needs the exact output language; inputs may be in any supported language.
  const inputs = ON_DEVICE_LANGUAGES.includes(language)
    ? ON_DEVICE_LANGUAGES
    : [...ON_DEVICE_LANGUAGES, language];
  return {
    expectedInputs: [{ type: 'text', languages: inputs }],
    expectedOutputs: [{ type: 'text', languages: [language] }],
    initialPrompts: [{ role: 'system', content: [{ type: 'text', value: SYSTEM_PROMPT }] }],
  };
}

/**
 * The AI check of real emails: on-device only, so no email ever reaches the cloud without the
 * user's consent (the consent step is planned for 21 Nov). The answer is constrained to the
 * verdict JSON schema.
 */
function createCheckModel(language: string) {
  const sessionOptions = checkSessionOptions(language);
  // Chrome's prompt() takes a `signal`; the SDK's type does not list it.
  const promptOptions: LanguageModelPromptOptions & { signal?: AbortSignal } = {
    responseConstraint: VERDICT_SCHEMA,
  };
  const model = getGenerativeModel(ai, {
    mode: InferenceMode.ONLY_ON_DEVICE,
    onDeviceParams: { createOptions: sessionOptions, promptOptions },
  });
  return { model, sessionOptions, promptOptions };
}

/** One check model per answer language, created on first use. */
const checkModels = new Map<string, ReturnType<typeof createCheckModel>>();

function checkModel(language: string): ReturnType<typeof createCheckModel> {
  let check = checkModels.get(language);
  if (!check) {
    check = createCheckModel(language);
    checkModels.set(language, check);
  }
  return check;
}

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
    // If a warm-up is still loading the model, wait for it instead of letting the SDK start a
    // second load at the same time. A failed warm-up is not fatal here: the SDK decides.
    await Promise.allSettled(warmUps.values());
  }
  const { response } = await model.generateContent(prompt);
  return {
    text: response.text(),
    source: response.inferenceSource,
    durationMs: performance.now() - start,
  };
}

export type AiCheckResult =
  | { ok: true; verdict: AiVerdict; durationMs: number }
  /**
   * `no-model`: Gemini Nano is not ready on this device, so there is no AI check (rules only).
   * `stopped`: the caller's signal stopped the run; `detail` says how far the model had come.
   */
  | { ok: false; reason: 'no-model' | 'unreadable-answer' | 'failed' | 'stopped'; detail?: string };

/**
 * Longest answer read. A real verdict is far shorter (five reasons and the advice, 300 characters
 * each, plus the JSON around them); a longer one is a model that does not stop.
 */
export const MAX_ANSWER_CHARS = 4_000;

const written = (text: string): string => `the model had written ${text.length} characters`;

/**
 * Runs the AI check of one email on-device, answering in `language`, and reads its answer
 * strictly. `knownAddresses`: the email's own addresses, which may stay in the reasons.
 *
 * `signal` stops the run in Chrome too, so a stopped run does not keep Gemini Nano busy: it works
 * on one prompt at a time, and the next check would wait behind it. The SDK has no signal for
 * on-device prompts, but it passes our option objects to Chrome by reference on every call
 * (`ChromeAdapterImpl` keeps `onDeviceParams` as given), so a signal set on them reaches this
 * run's session and prompt. Only one check runs at a time (the side panel's queue), so the
 * signal cannot reach another run. A test fails if the SDK stops passing them through.
 *
 * The answer is streamed, so a model that does not stop is cut off early and a stopped run says
 * how far it had come.
 */
export async function runAiCheck(
  userPrompt: string,
  language: string,
  knownAddresses: ReadonlySet<string> = new Set(),
  signal?: AbortSignal,
): Promise<AiCheckResult> {
  const model = await warmUpOnDevice(language).catch(() => undefined);
  if (model?.state !== 'ready') return { ok: false, reason: 'no-model' };
  // Without Chrome's Prompt API the SDK creates no on-device adapter and then sends even
  // ONLY_ON_DEVICE requests to the cloud (`callCloudOrDevice`). An email must never get there.
  if (typeof LanguageModel === 'undefined') return { ok: false, reason: 'no-model' };
  const check = checkModel(language);
  const tooLong = new AbortController();
  const stop = signal ? AbortSignal.any([signal, tooLong.signal]) : tooLong.signal;
  check.sessionOptions.signal = stop;
  check.promptOptions.signal = stop;
  const start = performance.now();
  let text = '';
  try {
    const result = await check.model.generateContentStream(userPrompt);
    // The same answer, aggregated; its errors also reach the stream read below.
    result.response.catch(() => undefined);
    for await (const chunk of result.stream) {
      text += chunk.text();
      if (text.length > MAX_ANSWER_CHARS) {
        tooLong.abort();
        return {
          ok: false,
          reason: 'failed',
          detail: `the answer did not end (over ${MAX_ANSWER_CHARS} characters)`,
        };
      }
    }
  } catch (error) {
    if (signal?.aborted) return { ok: false, reason: 'stopped', detail: written(text) };
    const detail = error instanceof Error ? error.message : String(error);
    return { ok: false, reason: 'failed', detail };
  }
  if (signal?.aborted) return { ok: false, reason: 'stopped', detail: written(text) };
  const verdict = parseVerdict(text, knownAddresses);
  if (!verdict) return { ok: false, reason: 'unreadable-answer' };
  return { ok: true, verdict, durationMs: performance.now() - start };
}

export type WarmUpResult =
  | { state: 'ready'; durationMs: number }
  /** Model not on this device yet (Chrome downloads it on first use, about 4 GB). */
  | { state: 'not-downloaded' }
  /** No Prompt API or hardware not supported: prompts go to the cloud. */
  | { state: 'unavailable' };

/**
 * Kept open so Chrome keeps the model in memory while the side panel is open, one per answer
 * language. Never read: holding the reference is the whole point (it stops the session from
 * being garbage-collected).
 */
const warmSessions = new Map<string, LanguageModelSession>();

/** The warm-up run per answer language, shared by every caller, so nothing loads twice. */
const warmUps = new Map<string, Promise<WarmUpResult>>();

async function loadOnDeviceModel(language: string): Promise<WarmUpResult> {
  if (typeof LanguageModel === 'undefined') return { state: 'unavailable' };

  const availability = await LanguageModel.availability(checkSessionOptions(language));
  if (availability === 'unavailable') return { state: 'unavailable' };
  if (availability !== 'available') return { state: 'not-downloaded' };

  const start = performance.now();
  warmSessions.set(language, await LanguageModel.create(checkSessionOptions(language)));
  return { state: 'ready', durationMs: performance.now() - start };
}

/**
 * Loads Gemini Nano for the AI check in `language` before the first check, with exactly the
 * check's session settings (see checkSessionOptions). Loading can take minutes; afterwards every
 * new check session (the SDK creates one per prompt) starts at once. Sends no data and starts no
 * download. Every call for a language returns the same run; after a failure the next call
 * retries.
 */
export function warmUpOnDevice(language: string): Promise<WarmUpResult> {
  let warmUp = warmUps.get(language);
  if (!warmUp) {
    warmUp = loadOnDeviceModel(language).catch((error: unknown) => {
      warmUps.delete(language);
      throw error;
    });
    warmUps.set(language, warmUp);
  }
  return warmUp;
}

/**
 * Downloads Gemini Nano (about 4 GB, once) and loads it. Chrome starts the download only after a
 * user action, so this must run from a click. `onProgress` gets the share downloaded (0 to 1).
 * Without it, a fresh Chrome profile never gets the model and the AI check never runs.
 */
export async function downloadOnDeviceModel(
  language: string,
  onProgress: (loaded: number) => void,
): Promise<WarmUpResult> {
  if (typeof LanguageModel === 'undefined') return { state: 'unavailable' };
  const start = performance.now();
  const session = await LanguageModel.create({
    ...checkSessionOptions(language),
    monitor: (monitor) => {
      monitor.addEventListener('downloadprogress', (event) => onProgress(event.loaded));
    },
  });
  warmSessions.set(language, session);
  const result: WarmUpResult = { state: 'ready', durationMs: performance.now() - start };
  warmUps.set(language, Promise.resolve(result));
  return result;
}
