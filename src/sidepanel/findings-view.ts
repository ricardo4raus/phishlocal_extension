import type { Finding, Severity } from '../rules';

const LABEL: Record<Severity, string> = { danger: 'Danger', warning: 'Warning', info: 'Note' };

/**
 * Lists the rule findings. Only as text (`textContent`): messages and evidence contain email
 * content, which may come from an attacker.
 */
export function showFindings(findings: readonly Finding[], list: HTMLUListElement): void {
  list.replaceChildren(
    ...findings.map((finding) => {
      const item = document.createElement('li');
      item.className = `finding ${finding.severity}`;
      const label = document.createElement('strong');
      label.textContent = `${LABEL[finding.severity]}: `;
      item.append(label, finding.message);
      return item;
    }),
  );
  if (findings.length === 0) {
    const item = document.createElement('li');
    item.textContent = 'The rules found no red flags.';
    list.append(item);
  }
}
