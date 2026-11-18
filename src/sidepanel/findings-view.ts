import type { Finding, Severity } from '../rules';

const LABEL: Record<Severity, string> = { danger: 'Danger', warning: 'Warning', info: 'Note' };

function item(severity: Severity, text: string): HTMLLIElement {
  const element = document.createElement('li');
  element.className = `finding ${severity}`;
  const label = document.createElement('strong');
  label.textContent = `${LABEL[severity]}: `;
  element.append(label, text);
  return element;
}

/** Link numbers named per finding; more are shortened to "…". */
const MAX_LINK_NUMBERS = 5;

/** " (link 2)" or " (links 1, 3, 4)": the numbers of the link list, which starts at 1. */
function linkNote(links: readonly number[] | undefined): string {
  if (!links || links.length === 0) return '';
  const numbers = links.slice(0, MAX_LINK_NUMBERS).map((index) => index + 1);
  const more = links.length > MAX_LINK_NUMBERS ? ', …' : '';
  return ` (${links.length === 1 ? 'link' : 'links'} ${numbers.join(', ')}${more})`;
}

/**
 * Lists the rule findings. Only as text (`textContent`): messages and evidence contain email
 * content, which may come from an attacker.
 */
export function showFindings(findings: readonly Finding[], list: HTMLUListElement): void {
  list.replaceChildren(
    ...findings.map((finding) =>
      item(finding.severity, `${finding.message}${linkNote(finding.links)}`),
    ),
  );
  if (findings.length === 0) {
    // Rules only catch known tricks, so "nothing found" must not read as "safe".
    const empty = document.createElement('li');
    empty.textContent = 'The rules found no red flags. That does not prove the email is safe.';
    list.append(empty);
  }
}

/**
 * Runs the rule check, lists its findings and returns them (undefined if a rule failed). If a
 * rule fails, the panel says so instead of showing a wrong error or nothing at all; the email
 * itself is still shown.
 */
export function showRuleCheck(
  check: () => Finding[],
  list: HTMLUListElement,
): Finding[] | undefined {
  let findings: Finding[];
  try {
    findings = check();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    list.replaceChildren(
      item('warning', `The rule check failed (${message}). Treat this email with care.`),
    );
    return undefined;
  }
  showFindings(findings, list);
  return findings;
}
