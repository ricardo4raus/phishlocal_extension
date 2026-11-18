import { InferenceSource } from 'firebase/ai';
import {
  downloadOnDeviceModel,
  ensureModelLoaded,
  runAiCheck,
  runPrompt,
  warmUpOnDevice,
  type WarmUpResult,
} from '../ai';
import { answerLanguage } from '../ai/prompt';
import { appCheckEnabled } from '../firebase';
import type { Email } from '../email';
import { checkEmail } from '../rules';
import { createAiCheck } from './ai-view';
import { showEmail } from './email-view';
import { createGmailView } from './gmail-view';
import { showRuleCheck } from './findings-view';
import { setUpPaste } from './paste-view';
import { watchActiveTab } from './watch';

function byId<T extends HTMLElement>(id: string): T {
  const element = document.querySelector<T>(`#${id}`);
  if (!element) throw new Error(`Side panel: #${id} is missing in index.html`);
  return element;
}

const modelStatus = byId<HTMLParagraphElement>('model-status');
const modelDownload = byId<HTMLButtonElement>('model-download');
const promptInput = byId<HTMLTextAreaElement>('prompt');
const forceCloudRow = byId<HTMLLabelElement>('force-cloud-row');
const forceCloudInput = byId<HTMLInputElement>('force-cloud');
const runButton = byId<HTMLButtonElement>('run');
const status = byId<HTMLParagraphElement>('status');
const output = byId<HTMLPreElement>('output');

// The cloud switch exists only to test the cloud path during development.
forceCloudRow.hidden = !import.meta.env.DEV;

function setStatus(text: string, isError = false): void {
  status.textContent = text;
  status.classList.toggle('error', isError);
}

function sourceLabel(source: InferenceSource | undefined): string {
  if (source === InferenceSource.ON_DEVICE) return 'On-device (Gemini Nano)';
  if (source === InferenceSource.IN_CLOUD) return 'Cloud (Gemini via Firebase AI Logic)';
  return 'Unknown source';
}

const seconds = (ms: number): string => `${(ms / 1000).toFixed(1)} s`;

/** On-device model state, set by the warm-up. `failed`: the warm-up threw; a prompt retries it. */
type ModelState = WarmUpResult['state'] | 'loading' | 'failed';
let modelState: ModelState = 'loading';

/** Where the next prompt will most likely run (the SDK makes the final decision). */
function expectedRoute(forceCloud: boolean): 'cloud' | 'on-device' | 'unknown' {
  if (forceCloud || modelState === 'not-downloaded' || modelState === 'unavailable') return 'cloud';
  if (modelState === 'ready') return 'on-device';
  return 'unknown';
}

function progressText(forceCloud: boolean, elapsedMs: number): string {
  const elapsed = seconds(elapsedMs);
  const route = expectedRoute(forceCloud);
  if (route === 'cloud') return `Running in the cloud… ${elapsed}`;
  if (route === 'on-device') return `Running on-device… ${elapsed}`;
  if (modelState === 'loading') {
    return `Waiting for the on-device model… ${elapsed} (loading can take minutes)`;
  }
  return `Running… ${elapsed}`;
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
  const start = performance.now();
  const showProgress = (): void => setStatus(progressText(forceCloud, performance.now() - start));
  showProgress();
  const timer = setInterval(showProgress, 1000);

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
    clearInterval(timer);
    runButton.disabled = false;
  }
}

runButton.addEventListener('click', () => void run());

const readEmailButton = byId<HTMLButtonElement>('read-email');
const emailStatus = byId<HTMLParagraphElement>('email-status');
const emailElements = {
  details: byId<HTMLDListElement>('email-details'),
  sender: byId<HTMLElement>('email-sender'),
  subject: byId<HTMLElement>('email-subject'),
  auth: byId<HTMLElement>('email-auth'),
  headerRows: byId<HTMLElement>('email-header-rows'),
  replyTo: byId<HTMLElement>('email-reply-to'),
  returnPath: byId<HTMLElement>('email-return-path'),
  links: byId<HTMLOListElement>('email-links'),
  body: byId<HTMLElement>('email-body'),
};
const findingsList = byId<HTMLUListElement>('email-findings');

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
  },
);

function setEmailStatus(text: string, isError = false): void {
  emailStatus.textContent = text;
  emailStatus.classList.toggle('error', isError);
}

/**
 * Shows an email from Gmail or the paste area with its rule findings; long texts get a note.
 * `headersNote` stands in for the sender checks while an email has no headers.
 */
function displayEmail(email: Email, message: string, headersNote?: string, final = true): void {
  const findings = showRuleCheck(() => checkEmail(email), findingsList);
  showEmail(email, emailElements, headersNote, findings);
  setEmailStatus(email.truncated ? `${message} The text is long and was cut.` : message);
  aiCheck.shown(email, findings, final);
}

function hideEmail(): void {
  emailElements.details.hidden = true;
  aiCheck.hidden();
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

setUpPaste(
  {
    sender: byId<HTMLInputElement>('paste-sender'),
    subject: byId<HTMLInputElement>('paste-subject'),
    text: byId<HTMLTextAreaElement>('paste-text'),
    use: byId<HTMLButtonElement>('paste-use'),
    clear: byId<HTMLButtonElement>('paste-clear'),
    sample: byId<HTMLSelectElement>('sample-select'),
    loadSample: byId<HTMLButtonElement>('sample-load'),
  },
  {
    onEmail: (email, message) => {
      gmailView.pasted();
      displayEmail(email, message);
    },
    onError: (message) => {
      gmailView.pasted();
      hideEmail();
      setEmailStatus(message, true);
    },
    onClear: () => {
      gmailView.cleared();
      hideEmail();
      setEmailStatus('');
    },
  },
);

/** Loads the on-device model as soon as the panel opens, so the first check does not wait. */
async function warmUp(): Promise<void> {
  const start = performance.now();
  const showLoading = (): void => {
    modelStatus.textContent = `Loading on-device model… ${seconds(performance.now() - start)}`;
  };
  showLoading();
  const timer = setInterval(showLoading, 1000);

  try {
    const result = await warmUpOnDevice(checkLanguage);
    modelState = result.state;
    if (result.state === 'ready') {
      modelStatus.textContent = `On-device model ready (loaded in ${seconds(result.durationMs)})`;
    } else if (result.state === 'not-downloaded') {
      modelStatus.textContent =
        'On-device model not downloaded yet. The AI check needs it; the rule checks work without it.';
      modelDownload.hidden = false;
    } else {
      modelStatus.textContent =
        'On-device model not available on this device. Prompts use the cloud.';
    }
  } catch (error) {
    modelState = 'failed';
    const message = error instanceof Error ? error.message : String(error);
    modelStatus.textContent = `On-device model could not load: ${message}`;
  } finally {
    clearInterval(timer);
  }
}

/** Downloads the model on click: Chrome allows the download only after a user action. */
async function downloadModel(): Promise<void> {
  modelDownload.disabled = true;
  modelStatus.textContent = 'Downloading the on-device model… 0 %';
  try {
    const result = await downloadOnDeviceModel(checkLanguage, (loaded) => {
      modelStatus.textContent = `Downloading the on-device model… ${Math.round(loaded * 100)} %`;
    });
    modelState = result.state;
    if (result.state === 'ready') {
      modelStatus.textContent = 'On-device model ready.';
      modelDownload.hidden = true;
      // The email on screen was checked by the rules only: give it the AI check now.
      aiCheck.recheck();
    } else {
      modelStatus.textContent = 'On-device model not available on this device.';
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    modelStatus.textContent = `The download failed: ${message}`;
  } finally {
    modelDownload.disabled = false;
  }
}

modelDownload.addEventListener('click', () => void downloadModel());

void warmUp();
