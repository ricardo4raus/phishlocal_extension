import { InferenceSource } from 'firebase/ai';
import { runPrompt, warmUpOnDevice, type WarmUpResult } from '../ai';
import { appCheckEnabled } from '../firebase';

function byId<T extends HTMLElement>(id: string): T {
  const element = document.querySelector<T>(`#${id}`);
  if (!element) throw new Error(`Side panel: #${id} is missing in index.html`);
  return element;
}

const modelStatus = byId<HTMLParagraphElement>('model-status');
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

/** Loads the on-device model as soon as the panel opens, so the first check does not wait. */
async function warmUp(): Promise<void> {
  const start = performance.now();
  const showLoading = (): void => {
    modelStatus.textContent = `Loading on-device model… ${seconds(performance.now() - start)}`;
  };
  showLoading();
  const timer = setInterval(showLoading, 1000);

  try {
    const result = await warmUpOnDevice();
    modelState = result.state;
    if (result.state === 'ready') {
      modelStatus.textContent = `On-device model ready (loaded in ${seconds(result.durationMs)})`;
    } else if (result.state === 'not-downloaded') {
      modelStatus.textContent = 'On-device model not downloaded yet. Prompts use the cloud.';
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

void warmUp();
