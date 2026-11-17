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

/**
 * Lists the rule findings. Only as text (`textContent`): messages and evidence contain email
 * content, which may come from an attacker.
 */
export function showFindings(findings: readonly Finding[], list: HTMLUListElement): void {
  list.replaceChildren(...findings.map((finding) => item(finding.severity, finding.message)));
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
