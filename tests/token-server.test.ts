// The extension's token client, with a fake fetch: no request leaves the machine.
import { describe, expect, it, vi } from 'vitest';
import {
  TOKEN_FUNCTION,
  TOKEN_REGION,
  TokenServerError,
  tokenFetcher,
  tokenUrl,
} from '../src/token-server';

const NOW = 1_800_000_000_000;
const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function fetcher(answer: Response | Error, idToken: () => Promise<string> = async () => 'id-1') {
  const fetch = vi.fn<(url: string | URL | Request, init?: RequestInit) => Promise<Response>>(
    async () => {
      if (answer instanceof Error) throw answer;
      return answer;
    },
  );
  const getToken = tokenFetcher({
    url: 'https://example.test/appCheckToken',
    idToken,
    fetch: fetch as unknown as typeof globalThis.fetch,
    now: () => NOW,
  });
  return { fetch, getToken };
}

async function failure(promise: Promise<unknown>): Promise<TokenServerError> {
  const error = await promise.then(
    () => undefined,
    (thrown: unknown) => thrown,
  );
  expect(error).toBeInstanceOf(TokenServerError);
  return error as TokenServerError;
}

describe('tokenUrl', () => {
  it('names the function in its region, like functions/src/index.ts', () => {
    expect(tokenUrl('demo-project')).toBe(
      `https://${TOKEN_REGION}-demo-project.cloudfunctions.net/${TOKEN_FUNCTION}`,
    );
  });
});

describe('tokenFetcher', () => {
  it('sends only the ID token, as a callable-function request, and returns the token', async () => {
    const { fetch, getToken } = fetcher(
      json({ result: { token: 'app-check-1', expireTimeMillis: NOW + 1_800_000 } }),
    );
    expect(await getToken()).toEqual({ token: 'app-check-1', expireTimeMillis: NOW + 1_800_000 });
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0] ?? [];
    expect(url).toBe('https://example.test/appCheckToken');
    expect(init?.method).toBe('POST');
    expect(init?.headers).toEqual({
      'Content-Type': 'application/json',
      Authorization: 'Bearer id-1',
    });
    expect(init?.body).toBe('{"data":{}}');
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it('reports the daily limit as its own kind', async () => {
    const { getToken } = fetcher(
      json({ error: { status: 'RESOURCE_EXHAUSTED', message: 'Daily limit reached.' } }, 429),
    );
    const error = await failure(getToken());
    expect(error.kind).toBe('limit');
  });

  it('reports other refusals with their HTTP status only', async () => {
    const { getToken } = fetcher(
      json({ error: { status: 'UNAUTHENTICATED', message: 'https://secret.example/x' } }, 401),
    );
    const error = await failure(getToken());
    expect(error.kind).toBe('failed');
    expect(error.message).toBe('the token server refused (HTTP 401)');
  });

  it.each([
    ['no JSON', new Response('<html>', { status: 200 })],
    ['no result', json({ data: 1 })],
    ['an empty token', json({ result: { token: '', expireTimeMillis: NOW + 1 } })],
    ['a huge token', json({ result: { token: 'x'.repeat(10_000), expireTimeMillis: NOW + 1 } })],
    ['an expired token', json({ result: { token: 't', expireTimeMillis: NOW } })],
    ['a time as text', json({ result: { token: 't', expireTimeMillis: String(NOW + 1) } })],
    ['an array', json([{ token: 't', expireTimeMillis: NOW + 1 }])],
  ])('refuses an answer with %s', async (_name, response) => {
    const { getToken } = fetcher(response);
    expect((await failure(getToken())).kind).toBe('failed');
  });

  it('counts a refusal without a readable body as a failure, not as the limit', async () => {
    const { getToken } = fetcher(new Response('Too Many Requests', { status: 429 }));
    const error = await failure(getToken());
    expect(error.kind).toBe('failed');
    expect(error.message).toBe('the token server refused (HTTP 429)');
  });

  it('gives up after its time limit', async () => {
    const { getToken } = fetcher(new DOMException('The operation timed out.', 'TimeoutError'));
    const error = await failure(getToken());
    expect(error.message).toBe('no answer from the token server (TimeoutError)');
  });

  it('reports a network failure by name only, without its message', async () => {
    const { getToken } = fetcher(new TypeError('Failed to fetch https://project-id.example'));
    const error = await failure(getToken());
    expect(error.kind).toBe('failed');
    expect(error.message).toBe('no answer from the token server (TypeError)');
  });

  it('does not ask the server when the sign-in fails, and names the Auth error code', async () => {
    const signInError = Object.assign(
      new Error('Firebase: Error (auth/admin-restricted-operation).'),
      {
        code: 'auth/admin-restricted-operation',
      },
    );
    const { fetch, getToken } = fetcher(json({}), async () => {
      throw signInError;
    });
    const error = await failure(getToken());
    expect(error.message).toBe('sign-in failed (auth/admin-restricted-operation)');
    expect(fetch).not.toHaveBeenCalled();
  });
});
