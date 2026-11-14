import {
  getGenerativeModel,
  InferenceMode,
  type InferenceSource,
  type LanguageModelExpected,
} from 'firebase/ai';
import { ai } from './firebase';

/** Languages Gemini Nano handles on-device. Chrome warns if a session is created without them. */
const ON_DEVICE_LANGUAGES = ['en', 'de', 'fr', 'es'];

const expectedText = (): LanguageModelExpected[] => [
  { type: 'text', languages: ON_DEVICE_LANGUAGES },
];

const onDeviceParams = {
  createOptions: { expectedInputs: expectedText(), expectedOutputs: expectedText() },
};

/**
 * Hybrid model: runs on-device when Gemini Nano is available, otherwise in the cloud.
 * The SDK decides by model availability only; an on-device error does not fall back.
 */
const hybridModel = getGenerativeModel(ai, {
  mode: InferenceMode.PREFER_ON_DEVICE,
  onDeviceParams,
});

/** Cloud only. Used to test the cloud path on a machine where Gemini Nano is available. */
const cloudModel = getGenerativeModel(ai, { mode: InferenceMode.ONLY_IN_CLOUD });

export interface PromptResult {
  text: string;
  /** Where the prompt ran. `undefined` if the SDK did not report it. */
  source: InferenceSource | undefined;
  durationMs: number;
}

export async function runPrompt(prompt: string, forceCloud = false): Promise<PromptResult> {
  const model = forceCloud ? cloudModel : hybridModel;
  const start = performance.now();
  const { response } = await model.generateContent(prompt);
  return {
    text: response.text(),
    source: response.inferenceSource,
    durationMs: performance.now() - start,
  };
}
