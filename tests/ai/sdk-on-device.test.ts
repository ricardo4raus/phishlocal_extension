// The AI check through the real Firebase AI Logic SDK, with Chrome's Prompt API replaced by a
// fake (no model, no network). It proves what runAiCheck relies on in the installed SDK version:
// the on-device path passes our option objects, and the stop signal set on them, to Chrome.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The SDK's browser build, as in the extension. Its Node build has no on-device path at all and
// sends ONLY_ON_DEVICE requests to the cloud instead.
// (A path in a variable: the build has no type declarations of its own.)
const browserBuild = vi.hoisted(() => '../../node_modules/@firebase/ai/dist/esm/index.esm.js');
vi.mock('firebase/ai', () => import(/* @vite-ignore */ browserBuild));

vi.mock('../../src/firebase', async () => {
  const { initializeApp } = await import('firebase/app');
  const { getAI } = await import('firebase/ai');
  // A made-up project: the on-device path never contacts it.
  const app = initializeApp({ apiKey: 'test', projectId: 'test', appId: '1:1:web:1' }, 'sdk-test');
  return { ai: getAI(app), appCheckEnabled: false, cloudPass: async () => {} };
});

interface PromptOptions {
  signal?: AbortSignal;
  responseConstraint?: unknown;
}

let creates: { signal?: AbortSignal }[];
let prompts: PromptOptions[];
/** What the fake model writes for one prompt. */
let write: (controller: ReadableStreamDefaultController<string>, options: PromptOptions) => void;

beforeEach(() => {
  vi.resetModules();
  creates = [];
  prompts = [];
  // A request to the cloud fails the test instead of leaving the machine.
  vi.stubGlobal('fetch', () => {
    throw new Error('Network request in a test');
  });
  vi.stubGlobal('LanguageModel', {
    availability: async () => 'available',
    create: async (options: { signal?: AbortSignal }) => {
      creates.push(options);
      return {
        destroy: () => {},
        promptStreaming: (_input: unknown, promptOptions: PromptOptions) => {
          prompts.push(promptOptions);
          return new ReadableStream<string>({
            start: (controller) => write(controller, promptOptions),
          });
        },
      };
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('runAiCheck through the Firebase SDK', () => {
  it('never reaches the cloud when the Prompt API is gone', async () => {
    const { runAiCheck, warmUpOnDevice } = await import('../../src/ai');
    expect((await warmUpOnDevice('en')).state).toBe('ready');
    // The SDK would build the check model without its on-device path and use the cloud.
    vi.stubGlobal('LanguageModel', undefined);
    expect(await runAiCheck('prompt', 'en')).toEqual({ ok: false, reason: 'no-model' });
  });

  it('warms up with exactly the session settings the check then uses', async () => {
    write = (controller) => {
      controller.enqueue('{"risk":"safe","reasons":[],"advice":""}');
      controller.close();
    };
    const { runAiCheck, warmUpOnDevice } = await import('../../src/ai');
    await warmUpOnDevice('de');
    await runAiCheck('prompt', 'de');
    // The sessions we open ourselves (warm-up, ensureModelLoaded) match the check's.
    const [warmUp, check] = creates.map(({ signal: _signal, ...settings }) => settings);
    expect(creates).toHaveLength(2);
    expect(check).toEqual(warmUp);
    expect(warmUp).toMatchObject({ expectedOutputs: [{ type: 'text', languages: ['de'] }] });
  });

  it('reads a streamed answer and passes the stop signal to Chrome', async () => {
    write = (controller) => {
      controller.enqueue('{"risk":"suspicious",');
      controller.enqueue('"reasons":["Time pressure."],"advice":"Wait."}');
      controller.close();
    };
    const { runAiCheck } = await import('../../src/ai');
    const { VERDICT_SCHEMA } = await import('../../src/ai/verdict');
    const stop = new AbortController();
    const result = await runAiCheck('prompt', 'en', new Set(), stop.signal);
    expect(result).toMatchObject({
      ok: true,
      verdict: { risk: 'suspicious', reasons: ['Time pressure.'], advice: 'Wait.' },
    });
    const sent = prompts.at(-1);
    expect(sent?.responseConstraint).toBe(VERDICT_SCHEMA);
    expect(sent?.signal?.aborted).toBe(false);
    stop.abort();
    // The signal Chrome got for this run's session and prompt follows ours.
    expect(sent?.signal?.aborted).toBe(true);
    expect(creates.at(-1)?.signal?.aborted).toBe(true);
  });

  it('stops the prompt in Chrome and says how far it had come', async () => {
    write = (controller, options) => {
      controller.enqueue('{"risk":');
      options.signal?.addEventListener('abort', () =>
        controller.error(new DOMException('The operation was aborted.', 'AbortError')),
      );
    };
    const { runAiCheck } = await import('../../src/ai');
    const stop = new AbortController();
    const result = runAiCheck('prompt', 'en', new Set(), stop.signal);
    await vi.waitFor(() => expect(prompts).toHaveLength(1));
    stop.abort();
    expect(await result).toEqual({
      ok: false,
      reason: 'stopped',
      detail: 'the model had written 8 characters',
    });
  });

  it('stops an answer that does not end, in Chrome too', async () => {
    let chunks = 0;
    write = (controller, options) => {
      const more = (): void => {
        if (options.signal?.aborted) return;
        chunks++;
        controller.enqueue(' '.repeat(500));
        setTimeout(more, 0);
      };
      more();
    };
    const { runAiCheck } = await import('../../src/ai');
    const result = await runAiCheck('prompt', 'en');
    expect(result).toMatchObject({ ok: false, reason: 'failed' });
    expect(prompts[0]?.signal?.aborted).toBe(true);
    const seen = chunks;
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(chunks).toBe(seen);
  });
});
