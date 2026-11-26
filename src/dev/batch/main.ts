/*
 * Batch check (dev builds only, see vite.config.ts): runs a folder of raw emails (.eml) through
 * the same steps as a pasted email in the side panel, on this device, one after the other, and
 * saves the results as CSV for the prompt tuning (docs/ai-check.md).
 *
 * The steps match the panel: parseRawEmail, checkEmail, the prompt with the findings, Gemini Nano
 * (runAiCheck, on-device only, the panel's time limit, one more try after a failure), and judge()
 * for the verdict shown. Email text is shown only with textContent. Nothing is sent anywhere:
 * the CSV is a local download.
 */
import { configureAi, ensureModelLoaded, runAiCheck, type AiCheckResult } from '../../ai';
import { buildUserPrompt } from '../../ai/prompt';
import { ruleRisk } from '../../ai/verdict';
import { m } from '../../i18n';
import { looksLikeRawEmail, parseRawEmail } from '../../raw/parse-raw-email';
import { loadSettings } from '../../remote-config';
import { checkEmail, type Finding } from '../../rules';
import { judge, ownAddresses } from '../../sidepanel/ai-view';

const byId = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const files = byId<HTMLInputElement>('batch-files');
const language = byId<HTMLSelectElement>('batch-language');
const start = byId<HTMLButtonElement>('batch-start');
const stop = byId<HTMLButtonElement>('batch-stop');
const save = byId<HTMLButtonElement>('batch-save');
const status = byId<HTMLElement>('batch-status');
const rows = byId<HTMLTableSectionElement>('batch-rows');

const COLUMNS = [
  'file',
  'rules_verdict',
  'rule_ids',
  'ai_risk',
  'verdict',
  'ai_seconds',
  'load_seconds',
  'tries',
  'reasons',
  'advice',
  'note',
] as const;
type Row = Record<(typeof COLUMNS)[number], string>;

const settings = await loadSettings();
configureAi(settings);

let results: Row[] = [];
let stopped: AbortController | undefined;

const secondsOf = (ms: number): string => (ms / 1000).toFixed(1);

/** Rule ids with their severity, notes left out, e.g. "lookalike-domain:danger". */
const ruleIds = (findings: Finding[]): string =>
  [
    ...new Set(
      findings
        .filter((finding) => finding.severity !== 'info')
        .map((finding) => `${finding.rule}:${finding.severity}`),
    ),
  ].join(' ');

/** One AI run with the panel's time limit; the batch's Stop ends it too. */
async function runOnce(
  prompt: string,
  lang: string,
  known: ReadonlySet<string>,
): Promise<AiCheckResult> {
  const timeout = AbortSignal.timeout(settings.aiCheckTimeoutMs);
  const signal = AbortSignal.any([stopped?.signal ?? new AbortController().signal, timeout]);
  try {
    const result = await runAiCheck(prompt, lang, known, signal);
    // Like the panel: a run stopped by the time limit is a failure, not a user's stop.
    if (!result.ok && result.reason === 'stopped' && timeout.aborted) {
      const limit = Math.round(settings.aiCheckTimeoutMs / 1000);
      return { ok: false, reason: 'failed', detail: `no answer within ${limit} s` };
    }
    return result;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return { ok: false, reason: 'failed', detail };
  }
}

/** Like the panel (ai-view.ts): one more try only for a failure that may not come back. */
const retryable = (result: AiCheckResult): boolean =>
  !result.ok &&
  (result.reason === 'unreadable-answer' ||
    (result.reason === 'failed' &&
      !/too large|quota|^no answer within/i.test(result.detail ?? '')));

async function checkFile(file: File, lang: string): Promise<Row> {
  const row: Row = Object.fromEntries(COLUMNS.map((column) => [column, ''])) as Row;
  row.file = file.webkitRelativePath || file.name;
  const text = await file.text();
  if (!looksLikeRawEmail(text)) {
    row.note = 'not raw source';
    return row;
  }
  const email = await parseRawEmail(text).catch(() => undefined);
  if (!email) {
    row.note = 'raw source could not be read';
    return row;
  }
  let findings: Finding[] | undefined;
  try {
    findings = checkEmail(email);
  } catch {
    row.note = 'rules failed';
  }
  row.rules_verdict = findings ? ruleRisk(findings) : 'suspicious';
  row.rule_ids = findings ? ruleIds(findings) : '';

  // The model load is timed apart, outside the time limit, like in the panel.
  const loadStart = performance.now();
  const ready = await ensureModelLoaded(lang);
  row.load_seconds = secondsOf(performance.now() - loadStart);
  if (!ready) {
    row.note = 'on-device AI not ready';
    return row;
  }
  const prompt = buildUserPrompt(email, findings ?? [], lang);
  const known = ownAddresses(email);
  let result = await runOnce(prompt, lang, known);
  row.tries = '1';
  if (retryable(result) && !stopped?.signal.aborted) {
    if (await ensureModelLoaded(lang)) {
      result = await runOnce(prompt, lang, known);
      row.tries = '2';
    }
  }
  if (!result.ok) {
    row.note = `AI: ${result.reason}${result.detail ? ` (${result.detail})` : ''}`;
    return row;
  }
  const judged = judge(result.verdict, findings, email, m.judge.theAi);
  row.ai_risk = result.verdict.risk;
  row.verdict = judged.overall;
  row.ai_seconds = secondsOf(result.durationMs);
  row.reasons = judged.reasons.join(' | ');
  row.advice = judged.advice;
  row.note = judged.detail;
  return row;
}

function addRow(row: Row): void {
  const tr = document.createElement('tr');
  for (const value of [
    row.file,
    row.rules_verdict,
    row.ai_risk,
    row.verdict,
    row.ai_seconds,
    row.note,
  ]) {
    const td = document.createElement('td');
    td.textContent = value;
    tr.append(td);
  }
  rows.append(tr);
}

const emlFiles = (): File[] =>
  [...(files.files ?? [])]
    .filter((file) => file.name.toLowerCase().endsWith('.eml'))
    .toSorted((a, b) =>
      (a.webkitRelativePath || a.name).localeCompare(b.webkitRelativePath || b.name),
    );

files.addEventListener('change', () => {
  const count = emlFiles().length;
  start.disabled = count === 0;
  status.textContent = `${count} .eml files selected.`;
});

start.addEventListener('click', async () => {
  const list = emlFiles();
  const lang = language.value;
  results = [];
  rows.replaceChildren();
  stopped = new AbortController();
  start.disabled = true;
  files.disabled = true;
  stop.hidden = false;
  save.hidden = true;
  const began = performance.now();
  for (const [index, file] of list.entries()) {
    if (stopped.signal.aborted) break;
    status.textContent = `Checking ${index + 1} of ${list.length}: ${file.name}`;
    const row = await checkFile(file, lang).catch(
      (error: unknown): Row =>
        ({
          ...Object.fromEntries(COLUMNS.map((column) => [column, ''])),
          file: file.webkitRelativePath || file.name,
          note: `error: ${error instanceof Error ? error.message : String(error)}`,
        }) as Row,
    );
    results.push(row);
    addRow(row);
  }
  status.textContent = `${stopped.signal.aborted ? 'Stopped' : 'Done'}: ${results.length} of ${list.length} emails in ${secondsOf(performance.now() - began)} s.`;
  start.disabled = false;
  files.disabled = false;
  stop.hidden = true;
  save.hidden = results.length === 0;
});

stop.addEventListener('click', () => stopped?.abort());

/** RFC 4180 quoting; a leading =, +, - or @ is defused so a spreadsheet shows it as text. */
const cell = (value: string): string => {
  const safe = /^[=+\-@]/.test(value) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
};

save.addEventListener('click', () => {
  const csv = [
    COLUMNS.join(','),
    ...results.map((row) => COLUMNS.map((column) => cell(row[column])).join(',')),
  ].join('\r\n');
  // A BOM, so a spreadsheet reads the umlauts as UTF-8.
  const url = URL.createObjectURL(
    new Blob([String.fromCodePoint(0xfeff), csv], { type: 'text/csv' }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = 'results.csv';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
});
