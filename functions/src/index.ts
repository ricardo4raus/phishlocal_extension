/**
 * PhishLocal's token server: one callable function that gives the extension a short-lived App
 * Check token, so the deep check can reach Firebase AI Logic from a public build.
 *
 * An extension cannot prove that it is the real PhishLocal (the attestation providers are for
 * websites and mobile apps), so this server does not try. It asks for a Firebase Auth user (the
 * extension signs in anonymously) and limits the tokens per user, per IP address and for everyone
 * per day (functions/src/limits.ts). The email itself never passes through here: the extension
 * sends only its Auth ID token.
 */
import { createHmac, randomBytes } from 'node:crypto';
import { initializeApp } from 'firebase-admin/app';
import { getAppCheck } from 'firebase-admin/app-check';
import { getFirestore } from 'firebase-admin/firestore';
import { defineString } from 'firebase-functions/params';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { dayKey, decide, storedCount, TOKEN_TTL_MS } from './limits.js';

initializeApp();

/** The web app the tokens are for (its "1:…:web:…" ID); the deploy script writes it. */
const webAppId = defineString('WEB_APP_ID');

/** The answer, as the extension's App Check CustomProvider needs it. */
export interface TokenAnswer {
  token: string;
  expireTimeMillis: number;
}

/** The document ID for an IP address on one day: an HMAC-SHA-256 with that day's random key. */
function ipKey(daySalt: string, ip: string): string {
  return createHmac('sha256', daySalt).update(ip).digest('hex');
}

export const appCheckToken = onCall(
  {
    region: 'europe-west6',
    // Only extension pages may call it from a browser. (CORS does not stop other clients; the
    // Auth user and the limits do.)
    cors: /^chrome-extension:\/\/[a-p]{32}$/,
    // This function is how the extension gets its first App Check token, so it cannot ask for one.
    enforceAppCheck: false,
    maxInstances: 2,
    concurrency: 20,
    memory: '256MiB',
    timeoutSeconds: 10,
  },
  async (request): Promise<TokenAnswer> => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError('unauthenticated', 'Sign-in required.');

    // The token first: if it fails, no slot of the day is used up. A token that the limits then
    // refuse is never sent out.
    const { token, ttlMillis } = await getAppCheck().createToken(webAppId.value(), {
      ttlMillis: TOKEN_TTL_MS,
    });

    const db = getFirestore();
    const day = db.collection('tokenLimits').doc(dayKey(Date.now()));
    const user = day.collection('users').doc(uid);
    const ip = request.rawRequest.ip;
    const decision = await db.runTransaction(async (transaction) => {
      const daySnap = await transaction.get(day);
      // The IP address is stored only as an HMAC with a random key for the day, kept with that
      // day's counters, so the stored value does not reveal the address.
      const salt = daySnap.get('salt');
      const daySalt =
        typeof salt === 'string' && salt.length === 64 ? salt : randomBytes(32).toString('hex');
      const address = ip ? day.collection('addresses').doc(ipKey(daySalt, ip)) : undefined;
      const [userSnap, addressSnap] = await Promise.all([
        transaction.get(user),
        address ? transaction.get(address) : undefined,
      ]);
      const counts = {
        all: daySnap.exists ? storedCount(daySnap.get('count')) : 0,
        user: userSnap.exists ? storedCount(userSnap.get('count')) : 0,
        ip: addressSnap?.exists ? storedCount(addressSnap.get('count')) : 0,
      };
      const result = decide(counts);
      if (result.ok) {
        transaction.set(day, { count: counts.all + 1, salt: daySalt });
        transaction.set(user, { count: counts.user + 1 });
        if (address) transaction.set(address, { count: counts.ip + 1 });
      }
      return result;
    });
    if (!decision.ok) {
      throw new HttpsError('resource-exhausted', 'Daily limit reached.', {
        reason: decision.reason,
      });
    }
    return { token, expireTimeMillis: Date.now() + ttlMillis };
  },
);
