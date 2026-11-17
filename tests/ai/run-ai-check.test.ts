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

const generateContent = vi.hoisted(() =>
  vi.fn<(prompt: string) => Promise<{ response: { text(): string } }>>(),
);
const models = vi.hoisted((): ModelParams[] => []);
vi.mock('firebase/ai', () => ({
  InferenceMode: {
    PREFER_ON_DEVICE: 'prefer_on_device',
    ONLY_ON_DEVICE: 'only_on_device',
    ONLY_IN_CLOUD: 'only_in_cloud',
  },
  getGenerativeModel: (_ai: unknown, params: ModelParams) => {
    models.push(params);
    return { generateContent };
  },
}));
vi.mock('../../src/firebase', () => ({ ai: {}, appCheckEnabled: false }));

const answer = (text: string) => ({ response: { text: () => text } });

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
    generateContent.mockResolvedValue(answer('{"risk":"safe","reasons":[],"advice":""}'));
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

  it('returns the checked verdict', async () => {
    generateContent.mockResolvedValue(
      answer('{"risk":"dangerous","reasons":["Fake bank."],"advice":"Delete it."}'),
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
});
