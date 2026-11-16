// Loading the "Show original" page, with fetch replaced (no network).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadOriginal, OriginalError } from '../src/content/gmail-original';
import { MAX_ORIGINAL_CHARS } from '../src/messages';

const URL_OM = new URL(
  'https://mail.google.com/mail/u/0/?ik=a1b2c3d4e5&view=om&permmsgid=msg-f%3A1',
);

interface Fake {
  status?: number;
  type?: ResponseType;
  url?: string;
  contentType?: string;
  body?: string;
}

/** A Response with the properties a real same-origin fetch has. */
function response({
  status = 200,
  type = 'basic',
  url = URL_OM.href,
  contentType = 'text/html; charset=utf-8',
  body = '<pre>raw</pre>',
}: Fake = {}): Response {
  const result = new Response(body, { status, headers: { 'content-type': contentType } });
  Object.defineProperty(result, 'type', { value: type });
  Object.defineProperty(result, 'url', { value: url });
  return result;
}

const stubFetch = (implementation: (input: URL, init?: RequestInit) => Promise<Response>) => {
  const fetchMock = vi.fn<(input: URL, init?: RequestInit) => Promise<Response>>(implementation);
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

const failure = async (promise: Promise<unknown>): Promise<string> => {
  try {
    await promise;
    return 'no error';
  } catch (error) {
    return error instanceof OriginalError ? error.reason : `other: ${String(error)}`;
  }
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('loadOriginal', () => {
  it('loads the page same-origin, without redirects or cache', async () => {
    const fetchMock = stubFetch(async () => response());
    expect(await loadOriginal(URL_OM)).toBe('<pre>raw</pre>');
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      credentials: 'same-origin',
      redirect: 'error',
      cache: 'no-store',
    });
  });

  it.each<[string, Fake]>([
    ['an error status', { status: 404 }],
    ['an opaque response', { type: 'opaque' }],
    ['another origin', { url: 'https://evil.example/' }],
    ['a non-HTML type', { contentType: 'application/json' }],
  ])('refuses %s', async (_label, fake) => {
    stubFetch(async () => response(fake));
    expect(await failure(loadOriginal(URL_OM))).toBe('request-failed');
  });

  it('reports a failed request (e.g. a redirect) and a timeout', async () => {
    stubFetch(async () => {
      throw new TypeError('Failed to fetch');
    });
    expect(await failure(loadOriginal(URL_OM))).toBe('request-failed');

    stubFetch(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('', 'AbortError')));
        }),
    );
    expect(await failure(loadOriginal(URL_OM, { timeoutMs: 20 }))).toBe('timeout');
  });

  it('stops when the caller aborts', async () => {
    stubFetch(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('', 'AbortError')));
        }),
    );
    const controller = new AbortController();
    const loading = loadOriginal(URL_OM, { signal: controller.signal });
    controller.abort();
    expect(await failure(loading)).toBe('request-failed');
  });

  it('reads at most the size limit', async () => {
    stubFetch(async () => response({ body: 'x'.repeat(MAX_ORIGINAL_CHARS + 50_000) }));
    expect(await loadOriginal(URL_OM)).toHaveLength(MAX_ORIGINAL_CHARS);
  });
});
