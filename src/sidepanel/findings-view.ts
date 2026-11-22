/*
 * The red flags in the side panel (tier 2 in docs/ui-design.md): one row per danger or warning
 * finding, with a plain-word title and the evidence; `info` findings are notes in "Email details"
 * (tier 3). Everything is text (`textContent`): messages and evidence hold email content, which
 * may come from an attacker.
 */
import type { Email } from '../email';
import type { Finding, Severity } from '../rules';
import type { RuleId } from '../rules/types';
import { linkDisplay } from './link-display';
import { el, icon, setText } from './ui';

/** The plain-word title per rule (tier 1 and 2 never say "rule", "DKIM" or "DMARC"). */
export const TITLES: Record<RuleId, string> = {
  'dangerous-link': 'A link runs code instead of opening a page',
  'hidden-link-target': 'A link hides where it really goes',
  'ip-link': 'A link goes to a bare number address',
  'international-domain': 'A web address uses letters from another alphabet',
  'link-text-mismatch': "A link doesn't go where its text says",
  'redirect-link': 'A link goes through a forwarding service',
  'lookalike-domain': 'A web address imitates a known one',
  'brand-in-subdomain': 'A known name is used in front of another address',
  'brand-in-domain': "A web address contains a known name but isn't it",
  'sender-name-domain': "The sender's name doesn't match the address",
  'sender-name-brand': 'The sender claims a brand from another address',
  'hidden-characters': 'Words contain invisible characters',
  'mixed-script': 'Words mix letters from different alphabets',
  'direction-override': 'Text is written backwards to disguise an address',
  'reply-to-mismatch': 'Replies would go to a different company',
  'dmarc-fail': "The sender's address is forged",
  'auth-fail': "The sender's mail server didn't confirm this email",
  'dkim-other-domain': 'Signed by another domain',
  'no-auth-results': 'No sender checks in this email',
  'incomplete-check': 'Part of this email could not be checked',
  urgency: 'Time pressure',
  threat: 'Threatens consequences',
  credentials: 'Asks for passwords, identity or card details',
  payment: 'Asks for a payment',
};

const BADGE: Record<Severity, string> = { danger: 'Danger', warning: 'Warning', info: 'Note' };

/** Rules whose evidence is the words or phrases found: shown as chips. */
const PHRASE_RULES: ReadonlySet<RuleId> = new Set([
  'urgency',
  'threat',
  'credentials',
  'payment',
  'hidden-characters',
  'mixed-script',
]);

/** Rules about the sender: evidence is [name, address]. */
const SENDER_RULES: ReadonlySet<RuleId> = new Set(['sender-name-domain', 'sender-name-brand']);

/** Rules whose title says it all; the sentence adds the how. */
const SENTENCE_RULES: ReadonlySet<RuleId> = new Set([
  'direction-override',
  'reply-to-mismatch',
  'dmarc-fail',
  'auth-fail',
  'incomplete-check',
  'dangerous-link',
  'international-domain',
]);

/**
 * Plain-word sentences for rules whose own message names protocols (SPF, DKIM, DMARC): tier 2
 * never does. The rule's sentence stays in tier 3 (the notes) and in the prompt.
 */
const PLAIN_SENTENCES: Partial<Record<RuleId, string>> = {
  'dmarc-fail':
    "The sender's own mail service says this email did not come from them. That is the surest sign of a forged sender.",
  'auth-fail':
    'The checks that confirm a sender did not pass. Legitimate senders sometimes fail them too, so treat this as a warning, not proof.',
};

/** A paragraph of email-derived text, with direction overrides revealed. */
function sentence(text: string): HTMLElement {
  const paragraph = el('p', 'flag__sentence');
  setText(paragraph, text);
  return paragraph;
}

export interface FindingsElements {
  /** The "Red flags" section, hidden when there is none. */
  section: HTMLElement;
  /** The count in the heading. */
  count: HTMLElement;
  /** The rows, one per danger or warning finding. */
  list: HTMLUListElement;
  /** The notes (`info` findings) in "Email details". */
  notes: HTMLUListElement;
}

/** A labelled row of evidence: "Says" / "Opens". */
function row(label: string, value: string, strong = false): HTMLElement[] {
  const term = el('dt', 'flag__label', label);
  const detail = el('dd', strong ? 'flag__value flag__value--strong' : 'flag__value');
  setText(detail, value);
  return [term, detail];
}

/** The evidence of a finding, in the form that fits its rule. */
function evidence(finding: Finding, email: Email | undefined): HTMLElement[] {
  const { rule } = finding;
  if (PHRASE_RULES.has(rule)) {
    if (finding.evidence.length === 0) return [];
    const chips = el('div', 'cluster');
    for (const phrase of finding.evidence) {
      const chip = el('span', 'chip');
      setText(chip, phrase);
      chips.append(chip);
    }
    return [chips];
  }
  if (SENDER_RULES.has(rule)) {
    const [name = '', address = ''] = finding.evidence;
    const rows = el('dl', 'flag__rows');
    rows.append(...row('Name says', name), ...row('Address is', address, true));
    return [rows];
  }
  if (SENTENCE_RULES.has(rule)) return [sentence(PLAIN_SENTENCES[rule] ?? finding.message)];
  // Link rules: what the link says, and where it really goes.
  const index = finding.links?.[0];
  const link = index === undefined ? undefined : email?.links[index];
  const rows = el('dl', 'flag__rows');
  if (rule === 'lookalike-domain' || rule === 'brand-in-domain' || rule === 'brand-in-subdomain') {
    const [host = '', reference] = finding.evidence;
    if (reference) rows.append(...row('Looks like', reference));
    rows.append(...row('Is', host, true));
  } else if (link) {
    const display = linkDisplay(link.href);
    if (link.text) rows.append(...row('Says', link.text));
    const target = display.forwardsTo ?? display.domain;
    rows.append(...row('Opens', target || link.href, true));
  } else {
    return [sentence(finding.message)];
  }
  const more = finding.links && finding.links.length > 1 ? finding.links.length - 1 : 0;
  const parts: HTMLElement[] = [rows];
  if (more > 0) {
    parts.push(
      el('p', 'flag__sentence', `${more} more ${more === 1 ? 'link' : 'links'} like this.`),
    );
  }
  return parts;
}

/** One red-flag row: badge, title, evidence. */
function flagRow(finding: Finding, email: Email | undefined): HTMLLIElement {
  const item = el('li', `flag finding ${finding.severity}`);
  const head = el('div', 'flag__head');
  const badge = el('span', `badge badge--${finding.severity}`);
  badge.append(
    icon(finding.severity === 'danger' ? 'cross' : 'alert', 'icon--s'),
    BADGE[finding.severity],
  );
  head.append(badge, el('span', 'flag__title', TITLES[finding.rule]));
  item.append(head, ...evidence(finding, email));
  return item;
}

/** One note (tier 3): the rule's sentence. */
function noteRow(finding: Finding): HTMLLIElement {
  const item = el('li', 'note-row');
  const label = el('strong', '', `${TITLES[finding.rule]}: `);
  const message = el('span');
  setText(message, finding.message);
  item.append(label, message);
  return item;
}

/**
 * Shows the findings: danger and warning as red-flag rows, `info` as notes. `email` gives the
 * link rows their text and target.
 */
export function showFindings(
  findings: readonly Finding[],
  elements: FindingsElements,
  email?: Email,
): void {
  const flags = findings.filter((finding) => finding.severity !== 'info');
  const notes = findings.filter((finding) => finding.severity === 'info');
  elements.list.replaceChildren(...flags.map((finding) => flagRow(finding, email)));
  elements.count.textContent = String(flags.length);
  elements.section.hidden = flags.length === 0;
  elements.notes.replaceChildren(...notes.map(noteRow));
  if (notes.length === 0) elements.notes.append(el('li', 'note-row', 'None.'));
}

/**
 * Runs the rule check, shows its findings and returns them (undefined if a rule failed). If a
 * rule fails, the panel says so as a warning instead of showing nothing; the email itself is
 * still shown.
 */
export function showRuleCheck(
  check: () => Finding[],
  elements: FindingsElements,
  email?: Email,
): Finding[] | undefined {
  let findings: Finding[];
  try {
    findings = check();
  } catch (error) {
    // The error text could hold email content: the console gets it, the panel a fixed sentence.
    console.error('PhishLocal: the rule check failed', error);
    showFindings(
      [
        {
          rule: 'incomplete-check',
          severity: 'warning',
          message: 'The basic checks could not finish. Treat this email with care.',
          evidence: [],
        },
      ],
      elements,
      email,
    );
    return undefined;
  }
  showFindings(findings, elements, email);
  return findings;
}
