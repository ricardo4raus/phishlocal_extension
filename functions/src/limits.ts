/**
 * The token server's limits, as pure functions (no Firebase imports), so the extension's tests
 * can check them without the server's dependencies.
 *
 * The limits count tokens, not requests: a token lets its holder reach Firebase AI Logic as often
 * as it likes for 30 minutes. They make abuse slow (a user and an IP address get a few tokens a
 * day, everyone together a fixed number); the cost itself is capped by the Gemini API quota and
 * the budget alert in Google Cloud (README, setup step 3).
 */

/** App Check tokens live 30 minutes, the shortest time the Admin SDK allows. */
export const TOKEN_TTL_MS = 30 * 60 * 1000;

/** Tokens per signed-in (anonymous) user and UTC day. */
export const USER_TOKENS_PER_DAY = 10;

/**
 * Tokens per IP address and UTC day. Anonymous users are free to create, so without this one
 * client could use up everyone's tokens for the day.
 */
export const IP_TOKENS_PER_DAY = 20;

/** Tokens for all users together per UTC day: the cost ceiling. */
export const ALL_TOKENS_PER_DAY = 500;

/** The UTC day of a time, as "2026-11-22": the key of that day's counters. */
export function dayKey(nowMs: number): string {
  return new Date(nowMs).toISOString().slice(0, 10);
}

export type Decision = { ok: true } | { ok: false; reason: 'user' | 'ip' | 'all' };

/** Whether one more token may be given, from the counts so far today. */
export function decide(counts: { user: number; ip: number; all: number }): Decision {
  if (!(counts.all < ALL_TOKENS_PER_DAY)) return { ok: false, reason: 'all' };
  if (!(counts.ip < IP_TOKENS_PER_DAY)) return { ok: false, reason: 'ip' };
  if (!(counts.user < USER_TOKENS_PER_DAY)) return { ok: false, reason: 'user' };
  return { ok: true };
}

/** Reads a stored counter; anything that is not a whole number of zero or more counts as full. */
export function storedCount(value: unknown): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
    ? value
    : Number.POSITIVE_INFINITY;
}
