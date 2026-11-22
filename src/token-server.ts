/**
 * The extension's side of the token server (`functions/src/index.ts`): fetches a short-lived App
 * Check token for the deep check. No Firebase imports, so tests can run it with a fake `fetch`.
 *
 * The request carries only the anonymous user's Auth ID token, never email content. It is made
 * only when the deep check sends data (the App Check SDK asks for a token on the first cloud
 * request and keeps it until it expires), never when the panel opens.
 */

import { en } from './i18n/en';

/** Must match `region` and the export name in `functions/src/index.ts`. */
export const TOKEN_REGION = 'europe-west6';
export const TOKEN_FUNCTION = 'appCheckToken';

/** Without an answer in this time the token request fails. */
export const TOKEN_TIMEOUT_MS = 15_000;

/** App Check tokens are JWTs of about 1 KB; anything far larger is not one. */
const MAX_TOKEN_LENGTH = 8_192;

/** The function's URL for a Firebase project. */
export function tokenUrl(projectId: string): string {
  return `https://${TOKEN_REGION}-${projectId}.cloudfunctions.net/${TOKEN_FUNCTION}`;
}

/**
 * Why no token came: `limit` when the server's daily limit is reached (for this user or for all
 * users), `failed` for everything else (no connection, server error, an answer we cannot read).
 */
export class TokenServerError extends Error {
  readonly kind: 'limit' | 'failed';

  constructor(kind: 'limit' | 'failed', message: string) {
    super(message);
    this.name = 'TokenServerError';
    this.kind = kind;
  }
}

export interface TokenServerDeps {
  url: string;
  /** The anonymous user's Firebase Auth ID token (signs in on first use). */
  idToken: () => Promise<string>;
  fetch?: typeof fetch;
  timeoutMs?: number;
  now?: () => number;
}

/** The shape the App Check `CustomProvider` expects from `getToken()`. */
export interface AppCheckTokenAnswer {
  token: string;
  expireTimeMillis: number;
}

/**
 * Returns a `getToken()` for an App Check `CustomProvider`. Each call asks the server for a new
 * token (the SDK caches it), through the callable-function protocol: POST `{"data": {}}` with the
 * ID token as bearer; the answer is `{"result": …}` or `{"error": {"status": …}}`.
 */
export function tokenFetcher(deps: TokenServerDeps): () => Promise<AppCheckTokenAnswer> {
  const doFetch = deps.fetch ?? ((input, init) => fetch(input, init));
  const now = deps.now ?? Date.now;
  return async () => {
    let idToken: string;
    try {
      idToken = await deps.idToken();
    } catch (error) {
      throw new TokenServerError('failed', en.errors.signInFailed(errorName(error)));
    }
    let response: Response;
    try {
      response = await doFetch(deps.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ data: {} }),
        signal: AbortSignal.timeout(deps.timeoutMs ?? TOKEN_TIMEOUT_MS),
      });
    } catch (error) {
      throw new TokenServerError('failed', en.errors.tokenNoAnswer(errorName(error)));
    }
    const body: unknown = await response.json().catch(() => undefined);
    const answer = readAnswer(body, now());
    if (response.ok && answer) return answer;
    if (errorStatus(body) === 'RESOURCE_EXHAUSTED') {
      throw new TokenServerError('limit', 'daily limit reached');
    }
    throw new TokenServerError('failed', en.errors.tokenRefused(String(response.status)));
  };
}

function readAnswer(body: unknown, now: number): AppCheckTokenAnswer | undefined {
  if (!isRecord(body) || !isRecord(body.result)) return undefined;
  const { token, expireTimeMillis } = body.result;
  if (typeof token !== 'string' || token.length === 0 || token.length > MAX_TOKEN_LENGTH) {
    return undefined;
  }
  if (typeof expireTimeMillis !== 'number' || !Number.isFinite(expireTimeMillis)) return undefined;
  if (expireTimeMillis <= now) return undefined;
  return { token, expireTimeMillis };
}

function errorStatus(body: unknown): unknown {
  return isRecord(body) && isRecord(body.error) ? body.error.status : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * The error's code ("auth/admin-restricted-operation") or name, never its message: messages can
 * hold URLs with the project ID.
 */
function errorName(error: unknown): string {
  const code = isRecord(error) ? error.code : undefined;
  if (typeof code === 'string' && /^[a-z-]{1,40}\/[a-z-]{1,60}$/.test(code)) return code;
  return error instanceof Error ? error.name : 'unknown error';
}
