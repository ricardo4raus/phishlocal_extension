// The token server's limits (functions/src/limits.ts), pure functions without Firebase.
import { describe, expect, it } from 'vitest';
import {
  ALL_TOKENS_PER_DAY,
  dayKey,
  IP_TOKENS_PER_DAY,
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

  it('gives tokens until the user, the IP address or everyone reaches the day’s limit', () => {
    expect(decide({ user: 0, ip: 0, all: 0 })).toEqual({ ok: true });
    expect(
      decide({
        user: USER_TOKENS_PER_DAY - 1,
        ip: IP_TOKENS_PER_DAY - 1,
        all: ALL_TOKENS_PER_DAY - 1,
      }),
    ).toEqual({ ok: true });
    expect(decide({ user: USER_TOKENS_PER_DAY, ip: 0, all: 0 })).toEqual({
      ok: false,
      reason: 'user',
    });
    expect(decide({ user: 0, ip: IP_TOKENS_PER_DAY, all: 0 })).toEqual({ ok: false, reason: 'ip' });
    expect(decide({ user: 0, ip: 0, all: ALL_TOKENS_PER_DAY })).toEqual({
      ok: false,
      reason: 'all',
    });
    // The ceiling for everyone comes first, then the IP address (new users are free).
    expect(
      decide({ user: USER_TOKENS_PER_DAY, ip: IP_TOKENS_PER_DAY, all: ALL_TOKENS_PER_DAY }),
    ).toEqual({ ok: false, reason: 'all' });
    expect(decide({ user: USER_TOKENS_PER_DAY, ip: IP_TOKENS_PER_DAY, all: 0 })).toEqual({
      ok: false,
      reason: 'ip',
    });
  });

  it('treats a broken stored counter as full', () => {
    expect(storedCount(3)).toBe(3);
    for (const broken of [undefined, null, '3', -1, 1.5, Number.NaN]) {
      expect(decide({ user: storedCount(broken), ip: 0, all: 0 }).ok).toBe(false);
    }
  });

  it('uses the shortest token lifetime the Admin SDK allows', () => {
    expect(TOKEN_TTL_MS).toBe(30 * 60 * 1000);
  });
});
