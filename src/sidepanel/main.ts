import { InferenceSource } from 'firebase/ai';
import {
  configureAi,
  downloadOnDeviceModel,
  ensureModelLoaded,
  findNames,
  runAiCheck,
  runCloudCheck,
  runPrompt,
  warmUpOnDevice,
  type WarmUpResult,
} from '../ai';
import { answerLanguage } from '../ai/prompt';
import { appCheckEnabled } from '../firebase';
import type { Email } from '../email';
import { loadSettings } from '../remote-config';
import { checkEmail } from '../rules';
import { createAiCheck } from './ai-view';
import { createDeepCheck } from './deep-check-view';
import { showEmail } from './email-view';
import { createGmailView, type EmptyReason } from './gmail-view';
import { showRuleCheck } from './findings-view';
import { setUpPaste } from './paste-view';
import { countElapsed, seconds } from './ui';
import { watchActiveTab } from './watch';

/** Where "How it works" leads: the README of the public repository. */
const HOW_IT_WORKS_URL = 'https://github.com/ricardo4raus/phishlocal_extension#readme';

function byId<T extends HTMLElement>(id: string): T {
  const element = document.querySelector<T>(`#${id}`);
  if (!element) throw new Error(`Side panel: #${id} is missing in index.html`);
  return element;
}

// The settings from Remote Config (at most 2 s; otherwise the stored or default values), fixed
// for this panel before the first model session is made and before any button works. Until then
// the panel is inert (set in index.html), so no click or paste is lost to a listener that is not
// there yet; a status line outside it says "Starting…".
const settings = await loadSettings();
configureAi(settings);
byId<HTMLElement>('app').removeAttribute('inert');
byId<HTMLElement>('panel-starting').remove();

/* ------------------------------------------------------------------------------------------------
 * Parts that exist only in some builds: the sample row (dev and judges builds, for the demo and
 * for judges without phishing in their inbox) and the developer tools (dev builds).
 * --------------------------------------------------------------------------------------------- */

const isDev = import.meta.env.DEV;
const isJudges = import.meta.env.MODE === 'judges';
byId<HTMLElement>('sample-row').hidden = !(isDev || isJudges);
byId<HTMLElement>('dev-tools').hidden = !isDev;

/* ------------------------------------------------------------------------------------------------
 * The model pill (top bar) and the model banner: one state, shown twice.
 * --------------------------------------------------------------------------------------------- */

/** On-device model state, set by the warm-up. `failed`: the warm-up threw; a prompt retries it. */
type ModelState = WarmUpResult['state'] | 'loading' | 'downloading' | 'failed';
let modelState: ModelState = 'loading';

const modelPill = byId<HTMLElement>('model-pill');
const modelStatus = byId<HTMLElement>('model-status');
const modelProgress = byId<HTMLElement>('model-progress');
const modelBanner = byId<HTMLElement>('model-banner');
const modelBannerIcon = byId<HTMLElement>('model-banner-icon');
const modelBannerTitle = byId<HTMLElement>('model-banner-title');
const modelBannerText = byId<HTMLElement>('model-banner-text');
const modelBannerActions = byId<HTMLElement>('model-banner-actions');
const modelProgressBar = byId<HTMLElement>('model-progressbar');
const modelDownload = byId<HTMLButtonElement>('model-download');

const PILL_WORDS: Record<ModelState, string> = {
  loading: 'On-device AI loading',
  ready: 'On-device AI ready',
  downloading: 'On-device AI',
  'not-downloaded': 'AI not set up',
  unavailable: 'AI not available',
  failed: 'AI not loaded',
};

interface Banner {
  icon: 'download' | 'alert' | 'info';
  title: string;
  text: string;
}

/** What the banner says per state; states without an entry show no banner. */
const BANNERS: Partial<Record<ModelState, Banner>> = {
  'not-downloaded': {
    icon: 'download',
    title: 'Set up on-device AI',
    text: 'Chrome downloads Gemini Nano once, about 4 GB. After that, emails are checked on this device, also offline. Until then they get the basic checks only.',
  },
  downloading: {
    icon: 'download',
    title: 'Setting up on-device AI',
    text: 'Chrome is downloading Gemini Nano. The basic checks already work while you wait, and you can keep using Gmail.',
  },
  unavailable: {
    icon: 'alert',
    title: 'On-device AI is not available on this computer',
    text: 'Chrome cannot run Gemini Nano here. Emails get the basic checks only; the deep check in the cloud still works where it is offered.',
  },
  failed: {
    icon: 'alert',
    title: 'On-device AI could not load',
    text: '',
  },
};

/** Shows the model state in the pill and the banner. `detail` is the error text for `failed`. */
function setModelState(state: ModelState, detail = ''): void {
  modelState = state;
  modelPill.dataset.state = state;
  modelStatus.textContent = PILL_WORDS[state];
  const banner = BANNERS[state];
  modelBanner.hidden = !banner;
  if (banner) {
    modelBanner.dataset.state = state;
    modelBannerIcon.dataset.icon = banner.icon;
    modelBannerTitle.textContent = banner.title;
    modelBannerText.textContent =
      state === 'failed'
        ? `${detail} Emails get the basic checks only until it loads; the next check tries again.`
        : banner.text;
  }
  modelBannerActions.hidden = state !== 'not-downloaded';
  modelProgressBar.hidden = state !== 'downloading';
}

/** The download percentage in the pill and the bar. */
function setDownloadProgress(loaded: number): void {
  const percent = Math.round(loaded * 100);
  modelProgress.textContent = `${percent}%`;
  modelProgressBar.style.setProperty('--progress', `${percent}%`);
  modelProgressBar.setAttribute('aria-valuenow', String(percent));
}

/* ------------------------------------------------------------------------------------------------
 * Developer tools: the hybrid test prompt (dev builds only).
 * --------------------------------------------------------------------------------------------- */

const promptInput = byId<HTMLTextAreaElement>('prompt');
const forceCloudRow = byId<HTMLLabelElement>('force-cloud-row');
const forceCloudInput = byId<HTMLInputElement>('force-cloud');
const runButton = byId<HTMLButtonElement>('run');
const status = byId<HTMLElement>('status');
const progress = byId<HTMLElement>('progress');
const output = byId<HTMLPreElement>('output');

// The cloud switch exists only to test the cloud path during development.
forceCloudRow.hidden = !isDev;

function setStatus(text: string, isError = false): void {
  status.textContent = text;
  status.classList.toggle('status--error', isError);
}

function sourceLabel(source: InferenceSource | undefined): string {
  if (source === InferenceSource.ON_DEVICE) return 'On-device (Gemini Nano)';
  if (source === InferenceSource.IN_CLOUD) return 'Cloud (Gemini via Firebase AI Logic)';
  return 'Unknown source';
}

/** Where the next prompt will most likely run (the SDK makes the final decision). */
function expectedRoute(forceCloud: boolean): 'cloud' | 'on-device' | 'unknown' {
  if (forceCloud || modelState === 'not-downloaded' || modelState === 'unavailable') return 'cloud';
  if (modelState === 'ready') return 'on-device';
  return 'unknown';
}

function progressText(forceCloud: boolean): string {
  const route = expectedRoute(forceCloud);
  if (route === 'cloud') return 'Running in the cloud…';
  if (route === 'on-device') return 'Running on-device…';
  if (modelState === 'loading')
    return 'Waiting for the on-device model (loading can take minutes)…';
  return 'Running…';
}

async function run(): Promise<void> {
  const prompt = promptInput.value.trim();
  if (!prompt) {
    setStatus('Enter a prompt first.', true);
    return;
  }

  const forceCloud = forceCloudInput.checked;
  runButton.disabled = true;
  output.textContent = '';

  // Waiting for the model can take minutes, so show that the panel is alive and where it runs.
  setStatus(progressText(forceCloud));
  const stopCounting = countElapsed(progress);

  try {
    const result = await runPrompt(prompt, forceCloud);
    setStatus(`${sourceLabel(result.source)} · ${seconds(result.durationMs)}`);
    output.textContent = result.text;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // Without App Check every cloud request is rejected. The SDK can also choose the cloud on its
    // own (model not ready), so the hint is shown whenever the prompt may have gone there.
    const hint =
      !appCheckEnabled && expectedRoute(forceCloud) !== 'on-device'
        ? ' (App Check is off: set VITE_APPCHECK_DEBUG_TOKEN in .env.local and use `npm run dev`.)'
        : '';
    setStatus(`Error: ${message}${hint}`, true);
  } finally {
    stopCounting();
    runButton.disabled = false;
  }
}

runButton.addEventListener('click', () => void run());

/* ------------------------------------------------------------------------------------------------
 * The email: empty state, strip, verdict, deep check, details.
 * --------------------------------------------------------------------------------------------- */

const emptySection = byId<HTMLElement>('empty');
const emptyHeading = byId<HTMLElement>('empty-heading');
const emptyText = byId<HTMLElement>('empty-text');
const emailSection = byId<HTMLElement>('email');
const readEmailButton = byId<HTMLButtonElement>('read-email');
const emailStatus = byId<HTMLParagraphElement>('email-status');
const emailElements = {
  details: byId<HTMLElement>('email-details'),
  sender: byId<HTMLElement>('email-sender'),
  subject: byId<HTMLElement>('email-subject'),
  auth: byId<HTMLElement>('email-auth'),
  headerRows: byId<HTMLElement>('email-header-rows'),
  replyTo: byId<HTMLElement>('email-reply-to'),
  returnPath: byId<HTMLElement>('email-return-path'),
  links: byId<HTMLOListElement>('email-links'),
  body: byId<HTMLElement>('email-body'),
  strip: {
    subject: byId<HTMLElement>('strip-subject'),
    domain: byId<HTMLElement>('strip-domain'),
    name: byId<HTMLElement>('strip-name'),
    address: byId<HTMLElement>('strip-address'),
    auth: byId<HTMLElement>('strip-auth'),
    authIcon: byId<HTMLElement>('strip-auth-icon'),
    authText: byId<HTMLElement>('strip-auth-text'),
  },
};
const findingsList = byId<HTMLUListElement>('email-findings');

/** The empty state's words per reason. */
const EMPTY: Record<EmptyReason, { heading: string; text: string }> = {
  idle: {
    heading: 'Open an email in Gmail',
    text: 'PhishLocal checks it here, automatically, while this panel is open. The email never leaves your browser.',
  },
  'not-gmail': {
    heading: 'Open Gmail in this tab',
    text: 'PhishLocal checks the emails you open in Gmail, automatically, while this panel is open. If Gmail was open before PhishLocal was installed or updated, reload the Gmail tab. You can also paste an email from any mail app.',
  },
  unreadable: {
    heading: 'Could not read this email',
    text: 'Gmail may have changed its page. You can paste the email instead.',
  },
};

function showEmpty(reason: EmptyReason): void {
  emptyHeading.textContent = EMPTY[reason].heading;
  emptyText.textContent = EMPTY[reason].text;
  emptySection.hidden = false;
  emailSection.hidden = true;
}

/** Where the deep check's privacy level is remembered in this browser. */
const PRIVACY_LEVEL_KEY = 'phishlocal.deepCheck.privacyLevel';

/** The AI check's answer language; the warm-up loads the model for exactly this one. */
const checkLanguage = answerLanguage(chrome.i18n.getUILanguage());

// The AI check of every shown email: on-device only, with the rules as its lower limit.
const aiCheck = createAiCheck(
  {
    verdict: byId<HTMLElement>('verdict'),
    overall: byId<HTMLElement>('ai-overall'),
    status: byId<HTMLElement>('ai-status'),
    reasons: byId<HTMLUListElement>('ai-reasons'),
    advice: byId<HTMLElement>('ai-advice'),
  },
  {
    run: runAiCheck,
    uiLanguage: () => chrome.i18n.getUILanguage(),
    modelReady: ensureModelLoaded,
    runTimeoutMs: settings.aiCheckTimeoutMs,
  },
);

// The cloud deep check: only on request, with the data cleaned on the device and shown first.
const deepCheck = createDeepCheck(
  {
    section: byId<HTMLElement>('deep-check'),
    intro: byId<HTMLElement>('deep-check-intro'),
    start: byId<HTMLButtonElement>('deep-check-start'),
    level: byId<HTMLSelectElement>('deep-check-level'),
    stop: byId<HTMLButtonElement>('deep-check-stop'),
    preview: byId<HTMLElement>('deep-check-preview'),
    removed: byId<HTMLElement>('deep-check-removed'),
    data: byId<HTMLElement>('deep-check-data'),
    send: byId<HTMLButtonElement>('deep-check-send'),
    cancel: byId<HTMLButtonElement>('deep-check-cancel'),
    status: byId<HTMLElement>('deep-check-status'),
    result: byId<HTMLElement>('deep-check-result'),
    overall: byId<HTMLElement>('deep-check-overall'),
    note: byId<HTMLElement>('deep-check-note'),
    reasons: byId<HTMLUListElement>('deep-check-reasons'),
    advice: byId<HTMLElement>('deep-check-advice'),
  },
  {
    available: appCheckEnabled,
    uiLanguage: () => chrome.i18n.getUILanguage(),
    modelReady: ensureModelLoaded,
    findNames,
    run: runCloudCheck,
    namesTimeoutMs: settings.namesTimeoutMs,
    cloudTimeoutMs: settings.cloudTimeoutMs,
    // A convenience only: without storage (private window, blocked site data) the default applies.
    savedLevel: () => {
      try {
        return localStorage.getItem(PRIVACY_LEVEL_KEY) ?? undefined;
      } catch {
        return undefined;
      }
    },
    saveLevel: (level) => {
      try {
        localStorage.setItem(PRIVACY_LEVEL_KEY, level);
      } catch {
        // Not remembered; the panel still works.
      }
    },
  },
);

function setEmailStatus(text: string, isError = false): void {
  emailStatus.textContent = text;
  emailStatus.classList.toggle('status--error', isError);
}

/**
 * Shows an email from Gmail or the paste area with its rule findings; long texts get a note.
 * `headersNote` stands in for the sender checks while an email has no headers.
 */
function displayEmail(email: Email, message: string, headersNote?: string, final = true): void {
  const findings = showRuleCheck(() => checkEmail(email), findingsList);
  showEmail(email, emailElements, { headersNote, findings, loading: !final });
  emptySection.hidden = true;
  emailSection.hidden = false;
  setEmailStatus(email.truncated ? `${message} The text is long and was cut.` : message);
  aiCheck.shown(email, findings, final);
  deepCheck.shown(email, findings, final);
}

function hideEmail(reason: EmptyReason = 'idle'): void {
  emailElements.details.hidden = true;
  aiCheck.hidden();
  deepCheck.hidden();
  showEmpty(reason);
}

// While the panel is open, every email opened in Gmail is checked automatically.
const gmailView = createGmailView({
  show: displayEmail,
  hide: hideEmail,
  setStatus: setEmailStatus,
});
const watch = watchActiveTab({
  onMessage: (message) => gmailView.handle(message),
  onDisconnected: () => gmailView.disconnected(),
});

readEmailButton.addEventListener('click', () => watch.scan());

/* ------------------------------------------------------------------------------------------------
 * Paste: the fallback for other mail apps (and, in dev and judges builds, the samples).
 * --------------------------------------------------------------------------------------------- */

const pasteFold = byId<HTMLDetailsElement>('paste');
const pasteText = byId<HTMLTextAreaElement>('paste-text');
const pasteStatus = byId<HTMLElement>('paste-status');

function setPasteStatus(text: string, isError = false): void {
  pasteStatus.textContent = text;
  pasteStatus.classList.toggle('status--error', isError);
}

setUpPaste(
  {
    sender: byId<HTMLInputElement>('paste-sender'),
    subject: byId<HTMLInputElement>('paste-subject'),
    text: pasteText,
    use: byId<HTMLButtonElement>('paste-use'),
    clear: byId<HTMLButtonElement>('paste-clear'),
    sample: byId<HTMLSelectElement>('sample-select'),
    loadSample: byId<HTMLButtonElement>('sample-load'),
  },
  {
    onEmail: (email, message) => {
      gmailView.pasted();
      setPasteStatus('');
      displayEmail(email, message);
    },
    onError: (message) => {
      gmailView.pasted();
      hideEmail();
      setPasteStatus(message, true);
    },
    onClear: () => {
      gmailView.cleared();
      hideEmail();
      setPasteStatus('');
      setEmailStatus('');
    },
  },
);

byId<HTMLButtonElement>('paste-open').addEventListener('click', () => {
  pasteFold.open = true;
  pasteText.focus();
});

byId<HTMLButtonElement>('how-it-works').addEventListener('click', () => {
  void chrome.tabs.create({ url: HOW_IT_WORKS_URL });
});

/* ------------------------------------------------------------------------------------------------
 * The on-device model: warm-up when the panel opens, download on request.
 * --------------------------------------------------------------------------------------------- */

/** Loads the on-device model as soon as the panel opens, so the first check does not wait. */
async function warmUp(): Promise<void> {
  setModelState('loading');
  const stopCounting = countElapsed(modelProgress);
  try {
    const result = await warmUpOnDevice(checkLanguage);
    // A download started meanwhile (the button is a click away) owns the state until it ends.
    if (modelState !== 'downloading') setModelState(result.state);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (modelState !== 'downloading') setModelState('failed', `${message}.`);
  } finally {
    stopCounting();
  }
}

/** Downloads the model on click: Chrome allows the download only after a user action. */
async function downloadModel(): Promise<void> {
  modelDownload.disabled = true;
  setModelState('downloading');
  setDownloadProgress(0);
  // A progress event can arrive after the download ended; it must not show a stale percentage.
  let done = false;
  try {
    const result = await downloadOnDeviceModel(checkLanguage, (loaded) => {
      if (!done) setDownloadProgress(loaded);
    });
    done = true;
    modelProgress.textContent = '';
    setModelState(result.state);
    // The email on screen was checked by the rules only: give it the AI check now.
    if (result.state === 'ready') aiCheck.recheck();
  } catch (error) {
    done = true;
    modelProgress.textContent = '';
    const message = error instanceof Error ? error.message : String(error);
    setModelState('failed', `The download failed: ${message}.`);
  } finally {
    modelDownload.disabled = false;
  }
}

modelDownload.addEventListener('click', () => void downloadModel());

showEmpty('idle');
void warmUp();
