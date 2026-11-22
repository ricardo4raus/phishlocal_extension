// The token server's limits (functions/src/limits.ts), pure functions without Firebase.
import { describe, expect, it } from 'vitest';
import {
  ALL_TOKENS_PER_DAY,
  dayKey,
  decide,
  storedCount,
  TOKEN_TTL_MS,
  USER_TOKENS_PER_DAY,
} from '../functions/src/limits';

describe('token server limits', () => {
  it('counts per UTC day', () => {
    expect(dayKey(Date.UTC(2026, 10, 22, 23, 59, 59))).toBe('2026-11-22');
    expect(dayKey(Date.UTC(2026, 10, 23, 0, 0, 0))).toBe('2026-11-23');
  });

  it('gives tokens until the user or everyone reaches the day’s limit', () => {
    expect(decide(0, 0)).toEqual({ ok: true });
    expect(decide(USER_TOKENS_PER_DAY - 1, ALL_TOKENS_PER_DAY - 1)).toEqual({ ok: true });
    expect(decide(USER_TOKENS_PER_DAY, 0)).toEqual({ ok: false, reason: 'user' });
    expect(decide(0, ALL_TOKENS_PER_DAY)).toEqual({ ok: false, reason: 'all' });
    // The cost ceiling comes first.
    expect(decide(USER_TOKENS_PER_DAY, ALL_TOKENS_PER_DAY)).toEqual({ ok: false, reason: 'all' });
  });

  it('treats a broken stored counter as full', () => {
    expect(storedCount(3)).toBe(3);
    for (const broken of [undefined, null, '3', -1, 1.5, Number.NaN]) {
      expect(decide(storedCount(broken), 0).ok).toBe(false);
    }
  });

  it('uses the shortest token lifetime the Admin SDK allows', () => {
    expect(TOKEN_TTL_MS).toBe(30 * 60 * 1000);
  });
});
