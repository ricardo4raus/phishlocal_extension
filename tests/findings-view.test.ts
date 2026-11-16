// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { Finding } from '../src/rules';
import { showFindings, showRuleCheck } from '../src/sidepanel/findings-view';

function list(): HTMLUListElement {
  document.body.innerHTML = '<ul id="findings"><li>old</li></ul>';
  return document.getElementById('findings') as HTMLUListElement;
}

const texts = (element: HTMLUListElement): (string | null)[] =>
  [...element.children].map((child) => child.textContent);

const failingCheck = (): Finding[] => {
  throw new Error('boom');
};

describe('showFindings', () => {
  it('lists each finding with its severity, as text only', () => {
    const element = list();
    showFindings(
      [
        {
          rule: 'link-text-mismatch',
          severity: 'danger',
          message: 'The link text says <img src=x onerror=alert(1)>.',
          evidence: [],
        },
        { rule: 'urgency', severity: 'info', message: 'Time pressure.', evidence: [] },
      ],
      element,
    );
    expect(texts(element)).toEqual([
      'Danger: The link text says <img src=x onerror=alert(1)>.',
      'Note: Time pressure.',
    ]);
    expect(element.children[0]?.className).toBe('finding danger');
    expect(document.querySelector('img')).toBeNull();
  });

  it('says that no red flags does not mean safe', () => {
    const element = list();
    showFindings([], element);
    expect(texts(element)).toEqual([
      'The rules found no red flags. That does not prove the email is safe.',
    ]);
  });
});

describe('showRuleCheck', () => {
  it('shows the findings of the check', () => {
    const element = list();
    showRuleCheck(
      () => [{ rule: 'urgency', severity: 'info', message: 'Time pressure.', evidence: [] }],
      element,
    );
    expect(texts(element)).toEqual(['Note: Time pressure.']);
  });

  it('says when the check fails instead of throwing', () => {
    const element = list();
    expect(() => showRuleCheck(failingCheck, element)).not.toThrow();
    expect(texts(element)).toEqual([
      'Warning: The rule check failed (boom). Treat this email with care.',
    ]);
  });
});
