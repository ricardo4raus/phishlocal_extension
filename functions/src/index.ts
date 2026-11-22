/**
 * PhishLocal's token server: one callable function that gives the extension a short-lived App
 * Check token, so the deep check can reach Firebase AI Logic from a public build.
 *
 * An extension cannot prove that it is the real PhishLocal (the attestation providers are for
 * websites and mobile apps), so this server does not try. It asks for a Firebase Auth user (the
 * extension signs in anonymously) and limits the tokens per user and for everyone per day. The
 * email itself never passes through here: the extension sends only its Auth ID token.
 */
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

    const db = getFirestore();
    const day = db.collection('tokenLimits').doc(dayKey(Date.now()));
    const user = day.collection('users').doc(uid);
    const decision = await db.runTransaction(async (transaction) => {
      const [daySnap, userSnap] = await transaction.getAll(day, user);
      const allCount = daySnap.exists ? storedCount(daySnap.get('count')) : 0;
      const userCount = userSnap.exists ? storedCount(userSnap.get('count')) : 0;
      const result = decide(userCount, allCount);
      if (result.ok) {
        transaction.set(day, { count: allCount + 1 });
        transaction.set(user, { count: userCount + 1 });
      }
      return result;
    });
    if (!decision.ok) {
      throw new HttpsError(
        'resource-exhausted',
        decision.reason === 'user' ? 'Daily limit for this user reached.' : 'Daily limit reached.',
        { reason: decision.reason },
      );
    }

    const { token, ttlMillis } = await getAppCheck().createToken(webAppId.value(), {
      ttlMillis: TOKEN_TTL_MS,
    });
    return { token, expireTimeMillis: Date.now() + ttlMillis };
  },
);
