// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { showFindings } from '../src/sidepanel/findings-view';

function list(): HTMLUListElement {
  document.body.innerHTML = '<ul id="findings"><li>old</li></ul>';
  return document.getElementById('findings') as HTMLUListElement;
}

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
    expect([...element.children].map((item) => item.textContent)).toEqual([
      'Danger: The link text says <img src=x onerror=alert(1)>.',
      'Note: Time pressure.',
    ]);
    expect(element.children[0]?.className).toBe('finding danger');
    expect(document.querySelector('img')).toBeNull();
  });

  it('says when the rules found nothing', () => {
    const element = list();
    showFindings([], element);
    expect(element.textContent).toBe('The rules found no red flags.');
  });
});
