import { initializeApp } from 'firebase/app';
import { CustomProvider, getToken, initializeAppCheck } from 'firebase/app-check';
import { getAI, GoogleAIBackend } from 'firebase/ai';
import { getAuth, signInAnonymously, type Auth } from 'firebase/auth/web-extension';
import { tokenFetcher, tokenUrl } from './token-server';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const firebaseApp = initializeApp(firebaseConfig);

/*
 * App Check (enforced for Firebase AI Logic, so cloud requests need a valid token).
 *
 * Normal builds get their tokens from PhishLocal's token server (`functions/`, see
 * `src/token-server.ts`): the extension signs in anonymously and the server hands out a token
 * that lasts 30 minutes, with daily limits per user and for everyone.
 *
 * Dev and judges builds can use a debug token instead. The debug tokens are secrets, and Vite
 * copies every VITE_* value it sees into the bundle. So:
 * - dev builds (`npm run dev`) read the developer's token;
 * - the judges build (`npm run build:judges`, mode "judges", written to dist-judges/) reads a
 *   separate token made only for the judges, which can be revoked after judging;
 * - `npm run build` reads neither: both conditions are constant `false` there, the bundler drops
 *   the branches, and no token reaches a normal release build.
 * The judges mode is checked first, so the developer's token (in `.env.local`, which Vite loads
 * in every mode) never reaches the judges build, even if something turns `DEV` on there.
 * Without a debug token, dev and judges builds use the token server too.
 */
const debugToken =
  import.meta.env.MODE === 'judges'
    ? import.meta.env.VITE_APPCHECK_JUDGES_TOKEN
    : import.meta.env.DEV
      ? import.meta.env.VITE_APPCHECK_DEBUG_TOKEN
      : undefined;

/** Whether this build can reach the cloud at all: it needs a Firebase project. */
export const appCheckEnabled = Boolean(firebaseConfig.projectId && firebaseConfig.appId);

/**
 * The anonymous user for the token server, on a second Firebase app without App Check: Firebase
 * Auth asks App Check for a token on every request, and App Check would ask the token server,
 * which needs this sign-in first. Nothing runs before the first token request.
 */
function anonymousIdToken(): () => Promise<string> {
  let auth: Auth | undefined;
  return async () => {
    auth ??= getAuth(initializeApp(firebaseConfig, 'token-server-sign-in'));
    await auth.authStateReady();
    const user = auth.currentUser ?? (await signInAnonymously(auth)).user;
    return user.getIdToken();
  };
}

if (debugToken) {
  // The SDK reads this global inside initializeAppCheck() and then exchanges the debug token for
  // App Check tokens itself, so it must be set first.
  self.FIREBASE_APPCHECK_DEBUG_TOKEN = debugToken;
}

/**
 * The reCAPTCHA providers load remote scripts, which Manifest V3 forbids, so both paths use a
 * CustomProvider. In debug mode the SDK never calls its getToken().
 */
const appCheck = appCheckEnabled
  ? initializeAppCheck(firebaseApp, {
      provider: new CustomProvider({
        getToken: debugToken
          ? () => Promise.reject(new Error('App Check: debug mode has no provider.'))
          : tokenFetcher({ url: tokenUrl(firebaseConfig.projectId), idToken: anonymousIdToken() }),
      }),
      // No background requests: a token is fetched only when a cloud request needs one.
      isTokenAutoRefreshEnabled: false,
    })
  : undefined;

/**
 * Makes sure a valid App Check token is at hand before a cloud request, so a failure (daily
 * limit, no connection) is reported as itself, not as the AI request's "HTTP 401". Throws the
 * provider's error, e.g. a `TokenServerError`. Uses the cached token while it lasts.
 */
export async function cloudPass(): Promise<void> {
  if (appCheck) await getToken(appCheck);
}

// getAI() looks up App Check once, when the AI instance is created, so this must come after
// initializeAppCheck().
export const ai = getAI(firebaseApp, { backend: new GoogleAIBackend() });
