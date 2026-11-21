// The cloud deep check and the on-device name finder through the real Firebase AI Logic SDK, with
// the network and Chrome's Prompt API replaced by fakes. No request leaves the machine.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const browserBuild = vi.hoisted(() => '../../node_modules/@firebase/ai/dist/esm/index.esm.js');
vi.mock('firebase/ai', () => import(/* @vite-ignore */ browserBuild));

vi.mock('../../src/firebase', async () => {
  const { initializeApp } = await import('firebase/app');
  const { getAI, GoogleAIBackend } = await import('firebase/ai');
  // A made-up project; fetch is stubbed below.
  const app = initializeApp(
    { apiKey: 'test', projectId: 'test', appId: '1:1:web:1' },
    'cloud-test',
  );
  return { ai: getAI(app, { backend: new GoogleAIBackend() }), appCheckEnabled: false };
});

interface Sent {
  url: string;
  body: {
    contents: { parts: { text: string }[] }[];
    systemInstruction?: { parts: { text: string }[] };
    generationConfig?: Record<string, unknown>;
  };
  signal?: AbortSignal | null;
}

let sent: Sent[];
/** The cloud's answer text, or a function that answers the request itself. */
let answer: string | ((request: Sent) => Promise<Response>);

const reply = (text: string): Response =>
  new Response(
    JSON.stringify({
      candidates: [
        { content: { role: 'model', parts: [{ text }] }, finishReason: 'STOP', index: 0 },
      ],
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );

beforeEach(() => {
  vi.resetModules();
  sent = [];
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    const request: Sent = {
      url: String(url),
      body: JSON.parse(String(init.body)) as Sent['body'],
      signal: init.signal,
    };
    sent.push(request);
    return typeof answer === 'string' ? reply(answer) : answer(request);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('runCloudCheck through the Firebase SDK', () => {
  it('sends exactly the prompt, with the cloud system message and the verdict schema', async () => {
    answer = '{"risk":"dangerous","reasons":["Fake log-in page."],"advice":"Delete it."}';
    const { CLOUD_MODEL, runCloudCheck } = await import('../../src/ai');
    const { CLOUD_SYSTEM_PROMPT } = await import('../../src/ai/prompt');
    const { VERDICT_SCHEMA } = await import('../../src/ai/verdict');
    const prompt = 'The prompt the user agreed to.';
    const result = await runCloudCheck(prompt);
    expect(result).toMatchObject({
      ok: true,
      verdict: { risk: 'dangerous', reasons: ['Fake log-in page.'], advice: 'Delete it.' },
    });
    expect(sent).toHaveLength(1);
    const [request] = sent;
    expect(request?.url).toContain(`models/${CLOUD_MODEL}:generateContent`);
    expect(request?.body.contents).toEqual([{ role: 'user', parts: [{ text: prompt }] }]);
    expect(request?.body.systemInstruction?.parts[0]?.text).toBe(CLOUD_SYSTEM_PROMPT);
    expect(request?.body.generationConfig).toEqual({
      responseMimeType: 'application/json',
      responseJsonSchema: VERDICT_SCHEMA,
    });
  });

  it('cleans the answer like the on-device one', async () => {
    answer = JSON.stringify({
      risk: 'safe',
      reasons: ['Call +41 79 123 45 67 or see https://evil.example/login'],
      advice: 'Write to help@evil.example.',
    });
    const { runCloudCheck } = await import('../../src/ai');
    expect(await runCloudCheck('x')).toMatchObject({
      verdict: { reasons: ['Call [removed] or see [removed]'], advice: 'Write to [removed].' },
    });
  });

  it('reports an unreadable answer and a failed request', async () => {
    const { runCloudCheck } = await import('../../src/ai');
    answer = 'not json';
    expect(await runCloudCheck('x')).toEqual({ ok: false, reason: 'unreadable-answer' });
    answer = async () => new Response('{"error":{"message":"denied"}}', { status: 403 });
    // Short, without the request URL and its project ID.
    expect(await runCloudCheck('x')).toEqual({
      ok: false,
      reason: 'failed',
      detail: 'the cloud refused the request (HTTP 403)',
    });
  });

  it('reports a request that reaches its time limit in short words', async () => {
    vi.useFakeTimers();
    answer = (request) =>
      new Promise((_resolve, reject) => {
        request.signal?.addEventListener('abort', () =>
          reject(request.signal?.reason ?? new Error('aborted')),
        );
      });
    const { CLOUD_TIMEOUT_MS, runCloudCheck } = await import('../../src/ai');
    const result = runCloudCheck('x');
    await vi.advanceTimersByTimeAsync(CLOUD_TIMEOUT_MS);
    expect(await result).toEqual({
      ok: false,
      reason: 'failed',
      detail: `no answer within ${CLOUD_TIMEOUT_MS / 1000} s`,
    });
    vi.useRealTimers();
  });

  it('stops the request when its signal is aborted', async () => {
    answer = (request) =>
      new Promise((_resolve, reject) => {
        request.signal?.addEventListener('abort', () =>
          reject(new DOMException('The operation was aborted.', 'AbortError')),
        );
      });
    const { runCloudCheck } = await import('../../src/ai');
    const stop = new AbortController();
    const result = runCloudCheck('x', stop.signal);
    await vi.waitFor(() => expect(sent).toHaveLength(1));
    stop.abort();
    expect(await result).toEqual({ ok: false, reason: 'stopped' });
    expect(sent[0]?.signal?.aborted).toBe(true);
  });
});

describe('findNames through the Firebase SDK', () => {
  let names: string;
  let prompts: {
    input: unknown;
    options: { signal?: AbortSignal; responseConstraint?: unknown };
  }[];

  beforeEach(() => {
    prompts = [];
    names = '["Anna Muster"]';
    vi.stubGlobal('LanguageModel', {
      availability: async () => 'available',
      create: async () => ({
        destroy: () => {},
        prompt: async (input: unknown, options: (typeof prompts)[number]['options']) => {
          prompts.push({ input, options });
          return names;
        },
      }),
    });
  });

  it('asks Nano on the device and never the cloud', async () => {
    const { findNames } = await import('../../src/ai');
    expect(await findNames('Dear Anna Muster', 'de')).toEqual(['Anna Muster']);
    expect(prompts).toHaveLength(1);
    expect(JSON.stringify(prompts[0]?.input)).toContain('Dear Anna Muster');
    expect(prompts[0]?.options.responseConstraint).toEqual({
      type: 'array',
      items: { type: 'string' },
    });
    expect(sent).toHaveLength(0);
  });

  it('passes its stop signal to Chrome, and does not start once stopped', async () => {
    const { findNames } = await import('../../src/ai');
    const stop = new AbortController();
    await findNames('Dear Anna', 'en', stop.signal);
    expect(prompts[0]?.options.signal?.aborted).toBe(false);
    stop.abort();
    expect(prompts[0]?.options.signal?.aborted).toBe(true);
    expect(await findNames('Dear Anna', 'en', stop.signal)).toBeUndefined();
    expect(prompts).toHaveLength(1);
  });

  it('returns undefined for an unreadable answer', async () => {
    const { findNames } = await import('../../src/ai');
    for (const bad of ['no json', '{"names":[]}', '[1, 2]']) {
      names = bad;
      expect(await findNames('text', 'en')).toBeUndefined();
    }
  });

  it('takes at most 50 names', async () => {
    names = JSON.stringify(Array.from({ length: 80 }, (_, i) => `Name ${i}`));
    const { findNames } = await import('../../src/ai');
    expect(await findNames('text', 'en')).toHaveLength(50);
  });

  it('returns undefined without the Prompt API, and sends nothing to the cloud', async () => {
    const { findNames, warmUpOnDevice } = await import('../../src/ai');
    expect((await warmUpOnDevice('en')).state).toBe('ready');
    vi.stubGlobal('LanguageModel', undefined);
    expect(await findNames('Dear Anna', 'en')).toBeUndefined();
    expect(sent).toHaveLength(0);
  });
});
