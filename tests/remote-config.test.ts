// Loading the settings from Firebase Remote Config, with the SDK replaced (no network).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '../src/settings';

interface FakeValue {
  source: 'remote' | 'default' | 'static';
  text: string;
}

const sdk = vi.hoisted(() => ({
  settings: { minimumFetchIntervalMillis: 0, fetchTimeoutMillis: 0 },
  stored: {} as Record<string, FakeValue>,
  fetched: {} as Record<string, FakeValue>,
  active: {} as Record<string, FakeValue>,
  fetch: 'ok' as 'ok' | 'fail' | 'hang',
  broken: false,
}));

vi.mock('firebase/remote-config', () => ({
  getRemoteConfig: () => {
    if (sdk.broken) throw new Error('remote-config/indexed-db-unavailable');
    return { settings: sdk.settings };
  },
  ensureInitialized: async () => {
    sdk.active = { ...sdk.stored };
  },
  fetchAndActivate: () => {
    if (sdk.fetch === 'hang') return new Promise(() => {});
    if (sdk.fetch === 'fail') return Promise.reject(new Error('remote-config/fetch-status'));
    sdk.active = { ...sdk.fetched };
    return Promise.resolve(true);
  },
  getAll: () =>
    Object.fromEntries(
      Object.entries(sdk.active).map(([key, value]) => [
        key,
        { getSource: () => value.source, asString: () => value.text },
      ]),
    ),
}));
vi.mock('../src/firebase', () => ({ firebaseApp: {} }));

const remote = (text: string): FakeValue => ({ source: 'remote', text });

beforeEach(() => {
  vi.useFakeTimers();
  sdk.stored = {};
  sdk.fetched = {};
  sdk.active = {};
  sdk.fetch = 'ok';
  sdk.broken = false;
});

afterEach(() => {
  vi.useRealTimers();
});

describe('loadSettings', () => {
  it('uses the fetched values and fetches at most twice a day', async () => {
    sdk.fetched = { cloud_model: remote('gemini-3.5-flash'), cloud_timeout_s: remote('45') };
    const { FETCH_INTERVAL_MS, loadSettings } = await import('../src/remote-config');
    expect(await loadSettings()).toEqual({
      ...DEFAULT_SETTINGS,
      cloudModel: 'gemini-3.5-flash',
      cloudTimeoutMs: 45_000,
    });
    expect(sdk.settings.minimumFetchIntervalMillis).toBe(FETCH_INTERVAL_MS);
    expect(FETCH_INTERVAL_MS).toBeGreaterThanOrEqual(60_000);
  });

  it('ignores values that did not come from Remote Config', async () => {
    sdk.fetched = { cloud_model: { source: 'static', text: 'gemini-3.5-flash' } };
    const { loadSettings } = await import('../src/remote-config');
    expect(await loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('checks every value: a bad one falls back to its default', async () => {
    sdk.fetched = {
      cloud_model: remote('some-other-model'),
      ai_check_timeout_s: remote('9999'),
      extra_instructions: remote(`Hidden${String.fromCodePoint(0x202e)}text`),
    };
    const { loadSettings } = await import('../src/remote-config');
    expect(await loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('uses the stored values when the fetch fails', async () => {
    sdk.stored = { names_timeout_s: remote('30') };
    sdk.fetch = 'fail';
    const { loadSettings } = await import('../src/remote-config');
    expect((await loadSettings()).namesTimeoutMs).toBe(30_000);
  });

  it('starts with the stored values when the fetch takes too long', async () => {
    sdk.stored = { names_timeout_s: remote('30') };
    sdk.fetch = 'hang';
    const { LOAD_LIMIT_MS, loadSettings } = await import('../src/remote-config');
    const settings = loadSettings();
    await vi.advanceTimersByTimeAsync(LOAD_LIMIT_MS);
    expect((await settings).namesTimeoutMs).toBe(30_000);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('gives the defaults when Remote Config cannot run', async () => {
    sdk.broken = true;
    const { loadSettings } = await import('../src/remote-config');
    expect(await loadSettings()).toEqual(DEFAULT_SETTINGS);
  });
});
