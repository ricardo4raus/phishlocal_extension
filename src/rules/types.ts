/** How serious a finding is. The final verdict combines these with the AI's answer. */
export type Severity = 'info' | 'warning' | 'danger';

export type RuleId =
  | 'dangerous-link'
  | 'hidden-link-target'
  | 'ip-link'
  | 'international-domain'
  | 'link-text-mismatch'
  | 'redirect-link'
  | 'lookalike-domain'
  | 'brand-in-domain'
  | 'brand-in-subdomain'
  | 'sender-name-domain'
  | 'sender-name-brand'
  | 'urgency'
  | 'threat'
  | 'credentials'
  | 'payment';

/** One red flag found by a rule, with the exact text that triggered it. */
export interface Finding {
  rule: RuleId;
  severity: Severity;
  /** One English sentence for the side panel and the AI prompt. */
  message: string;
  /** The link, domain or phrases that triggered the rule (email content: untrusted data). */
  evidence: string[];
}

/** Evidence comes from the email, so it is capped before it is shown or put into a prompt. */
export const MAX_EVIDENCE_CHARS = 200;

export const clip = (text: string): string =>
  text.length > MAX_EVIDENCE_CHARS ? `${text.slice(0, MAX_EVIDENCE_CHARS - 1)}…` : text;
