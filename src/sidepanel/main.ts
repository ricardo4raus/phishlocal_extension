import { InferenceSource } from 'firebase/ai';
import { runPrompt } from '../ai';
import { appCheckEnabled } from '../firebase';

function byId<T extends HTMLElement>(id: string): T {
  const element = document.querySelector<T>(`#${id}`);
  if (!element) throw new Error(`Side panel: #${id} is missing in index.html`);
  return element;
}

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

async function run(): Promise<void> {
  const prompt = promptInput.value.trim();
  if (!prompt) {
    setStatus('Enter a prompt first.', true);
    return;
  }

  const forceCloud = forceCloudInput.checked;
  runButton.disabled = true;
  output.textContent = '';

  // The first on-device prompt after a Chrome start can take minutes, so show that it is alive.
  const start = performance.now();
  const showProgress = (): void =>
    setStatus(
      `Running… ${seconds(performance.now() - start)} (the first on-device run can take minutes)`,
    );
  showProgress();
  const timer = setInterval(showProgress, 1000);

  try {
    const result = await runPrompt(prompt, forceCloud);
    setStatus(`${sourceLabel(result.source)} · ${seconds(result.durationMs)}`);
    output.textContent = result.text;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const hint =
      forceCloud && !appCheckEnabled
        ? ' (App Check is off: set VITE_APPCHECK_DEBUG_TOKEN in .env.local and use `npm run dev`.)'
        : '';
    setStatus(`Error: ${message}${hint}`, true);
  } finally {
    clearInterval(timer);
    runButton.disabled = false;
  }
}

runButton.addEventListener('click', () => void run());
