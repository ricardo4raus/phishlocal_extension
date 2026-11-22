import { initializeApp } from 'firebase/app';
import { CustomProvider, initializeAppCheck } from 'firebase/app-check';
import { getAI, GoogleAIBackend } from 'firebase/ai';

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
 * The debug tokens are secrets, and Vite copies every VITE_* value it sees into the bundle. So:
 * - dev builds (`npm run dev`) read the developer's token;
 * - the judges build (`npm run build:judges`, mode "judges", written to dist-judges/) reads a
 *   separate token made only for the judges, which can be revoked after judging;
 * - `npm run build` reads neither: both conditions are constant `false` there, the bundler drops
 *   the branches, and no token reaches a normal release build.
 * The judges mode is checked first, so the developer's token (in `.env.local`, which Vite loads
 * in every mode) never reaches the judges build, even if something turns `DEV` on there.
 * Without App Check, on-device prompts still work; cloud requests are rejected.
 */
const debugToken =
  import.meta.env.MODE === 'judges'
    ? import.meta.env.VITE_APPCHECK_JUDGES_TOKEN
    : import.meta.env.DEV
      ? import.meta.env.VITE_APPCHECK_DEBUG_TOKEN
      : undefined;

/** Whether cloud requests can pass App Check in this build. */
export const appCheckEnabled = Boolean(debugToken);

if (debugToken) {
  // The SDK reads this global inside initializeAppCheck() and then exchanges the debug token for
  // App Check tokens itself, so it must be set first.
  self.FIREBASE_APPCHECK_DEBUG_TOKEN = debugToken;

  initializeAppCheck(firebaseApp, {
    // A provider is required. The reCAPTCHA providers load remote scripts, which Manifest V3
    // forbids, so we pass a CustomProvider. In debug mode the SDK never calls getToken().
    provider: new CustomProvider({
      getToken: () => Promise.reject(new Error('App Check: no provider outside debug mode.')),
    }),
    // No background requests: a token is fetched only when a cloud request needs one.
    isTokenAutoRefreshEnabled: false,
  });
}

// getAI() looks up App Check once, when the AI instance is created, so this must come after
// initializeAppCheck().
export const ai = getAI(firebaseApp, { backend: new GoogleAIBackend() });
