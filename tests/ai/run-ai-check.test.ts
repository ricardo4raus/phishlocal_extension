// The on-device AI check with Firebase AI Logic and Chrome's model replaced (no model, no network).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface ModelParams {
  mode: string;
  onDeviceParams?: {
    createOptions?: {
      initialPrompts?: { role: string; content: { value: string }[] }[];
      expectedInputs?: unknown;
      expectedOutputs?: unknown;
    };
    promptOptions?: { responseConstraint?: unknown };
  };
}

interface StreamResult {
  stream: AsyncGenerator<{ text(): string }>;
  response: Promise<unknown>;
}
const generateContent = vi.hoisted(() => vi.fn<(prompt: string) => Promise<StreamResult>>());
const models = vi.hoisted((): ModelParams[] => []);
vi.mock('firebase/ai', () => ({
  InferenceMode: {
    PREFER_ON_DEVICE: 'prefer_on_device',
    ONLY_ON_DEVICE: 'only_on_device',
    ONLY_IN_CLOUD: 'only_in_cloud',
  },
  getGenerativeModel: (_ai: unknown, params: ModelParams) => {
    models.push(params);
    return { generateContent, generateContentStream: generateContent };
  },
}));
vi.mock('../../src/firebase', () => ({ ai: {}, appCheckEnabled: false }));

/** A streamed answer in the given pieces. */
function answer(...chunks: string[]): StreamResult {
  async function* stream() {
    for (const chunk of chunks) yield { text: () => chunk };
  }
  return { stream: stream(), response: Promise.resolve() };
}

let availability: string;

beforeEach(() => {
  vi.resetModules();
  models.length = 0;
  generateContent.mockReset();
  availability = 'available';
  vi.stubGlobal('LanguageModel', {
    availability: async () => availability,
    create: async () => ({ destroy: () => {} }),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('runAiCheck', () => {
  it('runs on-device only, with the system message, the schema and the answer language', async () => {
    const { VERDICT_SCHEMA } = await import('../../src/ai/verdict');
    const { SYSTEM_PROMPT } = await import('../../src/ai/prompt');
    const { runAiCheck } = await import('../../src/ai');
    generateContent.mockImplementation(async () =>
      answer('{"risk":"safe","reasons":[],"advice":""}'),
    );
    await runAiCheck('prompt', 'it');
    await runAiCheck('prompt', 'it');
    await runAiCheck('prompt', 'de');
    const checks = models.filter((params) => params.mode === 'only_on_device');
    // One model per answer language, created once.
    expect(checks).toHaveLength(2);
    const italian = checks[0]?.onDeviceParams?.createOptions;
    expect(italian?.initialPrompts).toEqual([
      { role: 'system', content: [{ type: 'text', value: SYSTEM_PROMPT }] },
    ]);
    expect(italian).toMatchObject({
      expectedInputs: [{ type: 'text', languages: ['en', 'de', 'fr', 'es', 'it'] }],
      expectedOutputs: [{ type: 'text', languages: ['it'] }],
    });
    expect(checks[1]?.onDeviceParams?.createOptions).toMatchObject({
      expectedInputs: [{ type: 'text', languages: ['en', 'de', 'fr', 'es'] }],
      expectedOutputs: [{ type: 'text', languages: ['de'] }],
    });
    expect(checks[0]?.onDeviceParams?.promptOptions?.responseConstraint).toBe(VERDICT_SCHEMA);
    // Real emails never go to a model that can use the cloud.
    expect(models.filter((params) => params.mode === 'prefer_on_device')).toHaveLength(1);
  });

  it('returns the checked verdict, read from the streamed pieces', async () => {
    generateContent.mockResolvedValue(
      answer('{"risk":"dangerous",', '"reasons":["Fake bank."],', '"advice":"Delete it."}'),
    );
    const { runAiCheck } = await import('../../src/ai');
    const result = await runAiCheck('prompt', 'en');
    expect(result).toMatchObject({
      ok: true,
      verdict: { risk: 'dangerous', reasons: ['Fake bank.'], advice: 'Delete it.' },
    });
    expect(generateContent).toHaveBeenCalledWith('prompt');
  });

  it('does not try without a ready on-device model', async () => {
    availability = 'downloadable';
    const { runAiCheck } = await import('../../src/ai');
    expect(await runAiCheck('prompt', 'en')).toEqual({ ok: false, reason: 'no-model' });
    expect(generateContent).not.toHaveBeenCalled();
  });

  it('reports an answer it cannot read and a failed run', async () => {
    const { runAiCheck } = await import('../../src/ai');
    generateContent.mockResolvedValueOnce(answer('I think it is fine.'));
    expect(await runAiCheck('prompt', 'en')).toEqual({ ok: false, reason: 'unreadable-answer' });
    generateContent.mockRejectedValueOnce(new Error('The input is too large.'));
    expect(await runAiCheck('prompt', 'en')).toEqual({
      ok: false,
      reason: 'failed',
      detail: 'The input is too large.',
    });
  });

  it('cuts off an answer that does not end', async () => {
    const { runAiCheck, MAX_ANSWER_CHARS } = await import('../../src/ai');
    let pieces = 0;
    async function* endless() {
      for (;;) {
        pieces++;
        yield { text: () => ' '.repeat(100) };
      }
    }
    generateContent.mockResolvedValueOnce({ stream: endless(), response: Promise.resolve() });
    expect(await runAiCheck('prompt', 'en')).toEqual({
      ok: false,
      reason: 'failed',
      detail: `the answer did not end (over ${MAX_ANSWER_CHARS} characters)`,
    });
    expect(pieces).toBe(MAX_ANSWER_CHARS / 100 + 1);
  });

  it('says how far a stopped run had come', async () => {
    const { runAiCheck } = await import('../../src/ai');
    const controller = new AbortController();
    async function* stopped() {
      yield { text: () => '{"risk":' };
      controller.abort();
      throw new DOMException('The operation was aborted.', 'AbortError');
    }
    generateContent.mockResolvedValueOnce({ stream: stopped(), response: Promise.resolve() });
    expect(await runAiCheck('prompt', 'en', new Set(), controller.signal)).toEqual({
      ok: false,
      reason: 'stopped',
      detail: 'the model had written 8 characters',
    });
  });

  it('downloads the model on request, reports progress, and then counts it as ready', async () => {
    availability = 'downloadable';
    const created: { monitor?: (monitor: { addEventListener: unknown }) => void }[] = [];
    vi.stubGlobal('LanguageModel', {
      availability: async () => availability,
      create: async (options: (typeof created)[number]) => {
        created.push(options);
        options.monitor?.({
          addEventListener: (_type: string, listener: (event: { loaded: number }) => void) => {
            listener({ loaded: 0.5 });
            listener({ loaded: 1 });
          },
        });
        return { destroy: () => {} };
      },
    });
    const { downloadOnDeviceModel, warmUpOnDevice } = await import('../../src/ai');
    const progress: number[] = [];
    const result = await downloadOnDeviceModel((loaded) => progress.push(loaded));
    expect(result.state).toBe('ready');
    expect(progress).toEqual([0.5, 1]);
    // The warm-up now reports ready without loading again.
    expect((await warmUpOnDevice()).state).toBe('ready');
    expect(created).toHaveLength(1);
  });
});
