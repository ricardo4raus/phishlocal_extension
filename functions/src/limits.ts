/**
 * The token server's limits, as pure functions (no Firebase imports), so the extension's tests
 * can check them without the server's dependencies.
 *
 * A token lets the extension reach Firebase AI Logic for its lifetime, so the limits count tokens:
 * one user gets a few per day, and all users together get a fixed number, which caps the cost.
 */

/** App Check tokens live 30 minutes, the shortest time the Admin SDK allows. */
export const TOKEN_TTL_MS = 30 * 60 * 1000;

/** Tokens per signed-in (anonymous) user and UTC day. */
export const USER_TOKENS_PER_DAY = 10;

/** Tokens for all users together per UTC day: the cost ceiling. */
export const ALL_TOKENS_PER_DAY = 500;

/** The UTC day of a time, as "2026-11-22": the key of that day's counters. */
export function dayKey(nowMs: number): string {
  return new Date(nowMs).toISOString().slice(0, 10);
}

export type Decision = { ok: true } | { ok: false; reason: 'user' | 'all' };

/** Whether one more token may be given, from the counts so far today. */
export function decide(userCount: number, allCount: number): Decision {
  if (!(allCount < ALL_TOKENS_PER_DAY)) return { ok: false, reason: 'all' };
  if (!(userCount < USER_TOKENS_PER_DAY)) return { ok: false, reason: 'user' };
  return { ok: true };
}

/** Reads a stored counter; anything that is not a whole number of zero or more counts as full. */
export function storedCount(value: unknown): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
    ? value
    : Number.POSITIVE_INFINITY;
}
