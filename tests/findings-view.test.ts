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

const finding = (links: number[]): Finding => ({
  rule: 'dangerous-link',
  severity: 'danger',
  message: 'Bad link.',
  evidence: [],
  links,
});

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

  it('names the links behind a finding, at most five', () => {
    const element = list();
    showFindings(
      [finding([1]), finding([0, 2]), finding([0, 1, 2, 3, 4, 5]), finding([])],
      element,
    );
    expect(texts(element)).toEqual([
      'Danger: Bad link. (link 2)',
      'Danger: Bad link. (links 1, 3)',
      'Danger: Bad link. (links 1, 2, 3, 4, 5, …)',
      'Danger: Bad link.',
    ]);
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
