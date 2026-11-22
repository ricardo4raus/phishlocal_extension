/*
 * Loads the settings (`src/settings.ts`) from Firebase Remote Config when the side panel opens.
 *
 * Privacy: the requests go to Google and never hold email content; what they do hold is listed in
 * docs/ai-check.md ("Settings from Remote Config"). After a successful one, the next goes out
 * FETCH_INTERVAL_MS later at the earliest; in between, the values stored by the last are used.
 *
 * The values are read once per panel: a running check never changes its settings.
 */
import {
  ensureInitialized,
  fetchAndActivate,
  getAll,
  getRemoteConfig,
} from 'firebase/remote-config';
import { firebaseApp } from './firebase';
import { DEFAULT_SETTINGS, readSettings, type Settings } from './settings';

/** At most two requests a day; dev builds ask every minute so console changes show up. */
export const FETCH_INTERVAL_MS = import.meta.env.DEV ? 60_000 : 12 * 60 * 60 * 1000;

/**
 * How long the panel waits for Remote Config before it starts with the stored or default values.
 * A request that ends later still stores its values for the next panel.
 */
export const LOAD_LIMIT_MS = 2_000;

/** The settings for this panel. Never throws; any failure gives the defaults. */
export async function loadSettings(): Promise<Settings> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const remoteConfig = getRemoteConfig(firebaseApp);
    remoteConfig.settings.minimumFetchIntervalMillis = FETCH_INTERVAL_MS;
    remoteConfig.settings.fetchTimeoutMillis = 10_000;

    const loaded = (async () => {
      // The stored values first, so a slow request still leaves those of the last one. If even
      // they cannot be read within the limit (a slow or broken IndexedDB), the defaults apply.
      await ensureInitialized(remoteConfig);
      await fetchAndActivate(remoteConfig);
    })().catch(() => undefined);
    const limit = new Promise<void>((resolve) => {
      timer = setTimeout(resolve, LOAD_LIMIT_MS);
    });
    await Promise.race([loaded, limit]);

    // Only values set in Remote Config; the code's own defaults live in `settings.ts`.
    const values: Record<string, string> = {};
    for (const [parameter, value] of Object.entries(getAll(remoteConfig))) {
      if (value.getSource() === 'remote') values[parameter] = value.asString();
    }
    return readSettings(values);
  } catch {
    return { ...DEFAULT_SETTINGS };
  } finally {
    clearTimeout(timer);
  }
}
