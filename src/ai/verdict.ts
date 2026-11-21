/*
 * The AI's answer: its JSON schema, a strict reader, and how it combines with the rules.
 *
 * The answer comes from a model that read attacker-written text, so it is untrusted output
 * (OWASP LLM05): it is checked field by field, links and addresses in it are removed, and it can
 * never make an email look safer than the rules say (OWASP LLM01).
 */
import type { Finding } from '../rules';
import { EMAIL_ADDRESS, FULL_URL, normalizeText, replacePhoneNumbers } from './patterns';

export const RISKS = ['safe', 'suspicious', 'dangerous'] as const;
export type Risk = (typeof RISKS)[number];

export const MAX_REASONS = 5;
/** Longest reason or advice that is shown. */
export const MAX_AI_TEXT = 300;

/**
 * JSON Schema for the answer: on-device `responseConstraint`, later the cloud's schema too. Only
 * basic keywords (type, properties, required, enum, items), because Chrome's Prompt API supports
 * only part of JSON Schema; parseVerdict() enforces the limits.
 */
export const VERDICT_SCHEMA = {
  type: 'object',
  properties: {
    risk: { type: 'string', enum: [...RISKS] },
    reasons: { type: 'array', items: { type: 'string' } },
    advice: { type: 'string' },
  },
  required: ['risk', 'reasons', 'advice'],
};

export interface AiVerdict {
  risk: Risk;
  reasons: string[];
  advice: string;
}

/**
 * Full links, email addresses and phone numbers are removed from AI text: an injection in the
 * email could make the model repeat "verify at https://evil.example" or a phone number. Reasons
 * keep bare domains ("the link goes to paypa1.com" is the explanation users need); advice drops
 * them too, because advice should never send anyone anywhere.
 */
const BARE_DOMAIN = /\b[\w-]+(?:\.[\w-]+)*\.[a-z]{2,24}\b(?:\/\S*)?/gi;

/** Model output is short; longer text is cut before the patterns run. */
const MAX_RAW_AI_TEXT = 2_000;

export interface CleanOptions {
  /** Keep bare domains (reasons: yes; advice: no). */
  keepDomains?: boolean;
  /**
   * Email addresses of the email itself (sender, Reply-To), lowercase. They stay readable: the
   * user sees them anyway, and "the sender address x is unusual" needs them.
   */
  knownAddresses?: ReadonlySet<string>;
}

export function cleanAiText(
  text: string,
  { keepDomains = true, knownAddresses = new Set() }: CleanOptions = {},
): string {
  // Normalized first (see normalizeText), so split or disguised numbers and links are caught.
  let cleaned = replacePhoneNumbers(
    normalizeText(text.slice(0, MAX_RAW_AI_TEXT))
      .replaceAll(FULL_URL, '[removed]')
      .replaceAll(EMAIL_ADDRESS, (address) =>
        knownAddresses.has(address.toLowerCase()) ? address : '[removed]',
      ),
    '[removed]',
  );
  if (!keepDomains) cleaned = cleaned.replaceAll(BARE_DOMAIN, '[removed]');
  cleaned = cleaned.trim();
  return cleaned.length > MAX_AI_TEXT ? `${cleaned.slice(0, MAX_AI_TEXT - 1)}…` : cleaned;
}

const isRisk = (value: unknown): value is Risk =>
  typeof value === 'string' && (RISKS as readonly string[]).includes(value);

/**
 * Reads the model's answer, or undefined if it is not the expected JSON. `knownAddresses`: the
 * email's own addresses, which may stay in the reasons.
 */
export function parseVerdict(
  text: string,
  knownAddresses: ReadonlySet<string> = new Set(),
): AiVerdict | undefined {
  // Models sometimes wrap JSON in a code fence despite the constraint.
  const json = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    return undefined;
  }
  if (typeof value !== 'object' || value === null) return undefined;
  const { risk, reasons, advice } = value as Record<string, unknown>;
  if (!isRisk(risk) || typeof advice !== 'string' || !Array.isArray(reasons)) return undefined;
  if (!reasons.every((reason) => typeof reason === 'string')) return undefined;
  return {
    risk,
    reasons: (reasons as string[])
      .slice(0, MAX_REASONS)
      .map((reason) => cleanAiText(reason, { knownAddresses }))
      .filter((reason) => reason !== ''),
    advice: cleanAiText(advice, { keepDomains: false }),
  };
}

/** The risk the rules alone stand for: any danger finding is dangerous, any warning suspicious. */
export function ruleRisk(findings: readonly Finding[]): Risk {
  if (findings.some((finding) => finding.severity === 'danger')) return 'dangerous';
  if (findings.some((finding) => finding.severity === 'warning')) return 'suspicious';
  return 'safe';
}

const LEVEL: Record<Risk, number> = { safe: 0, suspicious: 1, dangerous: 2 };

/**
 * The overall risk: the higher of AI and rules. The AI can raise it, never lower it, with one
 * exception for false alarms: if the sender is confirmed (DMARC pass) and the rules found no
 * warning, the AI alone cannot raise it. Gemini Nano flags real security notices from Google and
 * others as suspicious (measured in Chrome); phishing from a confirmed but hijacked sender almost
 * always trips the rules too (requests for identity, log-in or card details, payments).
 */
export function overallRisk(
  ai: Risk | undefined,
  rules: Risk,
  { senderConfirmed = false }: { senderConfirmed?: boolean } = {},
): Risk {
  if (ai === undefined || (senderConfirmed && rules === 'safe')) return rules;
  return LEVEL[ai] > LEVEL[rules] ? ai : rules;
}
