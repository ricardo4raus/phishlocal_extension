// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { Email } from '../src/email';
import type { Finding } from '../src/rules';
import {
  type FindingsElements,
  showFindings,
  showRuleCheck,
  TITLES,
} from '../src/sidepanel/findings-view';

const email: Email = {
  sender: { name: 'Lumora Bank Security', address: 'security@lumora-bank-verify.example' },
  subject: 'Locked',
  bodyText: 'Confirm within 24 hours.',
  links: [
    { text: 'lumorabank.example/secure', href: 'https://lumora-bank-verify.example/login?id=1' },
    { text: 'Help', href: 'https://www.google.com/url?q=https://evil.example/' },
    { text: '<img src=x onerror=alert(1)>', href: 'https://evil.example/' },
  ],
  truncated: false,
};

const get = (id: string) => document.getElementById(id) as HTMLElement;

/** A fresh "Red flags" section and notes list, as in index.html. */
function elements(): FindingsElements {
  document.body.innerHTML =
    '<section id="flags" hidden><span id="count"></span><ul id="list"><li>old</li></ul></section>' +
    '<ul id="notes"></ul>';
  return {
    section: get('flags'),
    count: get('count'),
    list: get('list') as HTMLUListElement,
    notes: get('notes') as HTMLUListElement,
  };
}

const rows = (list: HTMLElement): HTMLElement[] => [...list.children] as HTMLElement[];
const text = (element: Element | null | undefined): string => element?.textContent ?? '';

const finding = (rule: Finding['rule'], severity: Finding['severity'], extra = {}): Finding => ({
  rule,
  severity,
  message: 'The sentence.',
  evidence: [],
  ...extra,
});

const failingCheck = (): Finding[] => {
  throw new Error('boom');
};

describe('showFindings', () => {
  it('shows danger and warning findings as rows with a title, info as notes', () => {
    const els = elements();
    showFindings(
      [
        finding('link-text-mismatch', 'warning', { links: [0] }),
        finding('dmarc-fail', 'danger'),
        finding('urgency', 'info', { evidence: ['within 24 hours'] }),
      ],
      els,
      email,
    );
    expect(els.section.hidden).toBe(false);
    expect(els.count.textContent).toBe('2');
    const flags = rows(els.list);
    expect(flags.map((row) => row.className)).toEqual([
      'flag finding warning',
      'flag finding danger',
    ]);
    expect(text(flags[0]?.querySelector('.badge'))).toBe('Warning');
    expect(text(flags[0]?.querySelector('.flag__title'))).toBe(TITLES['link-text-mismatch']);
    expect(text(flags[1]?.querySelector('.badge'))).toBe('Danger');
    // The note keeps the rule's sentence (tier 3).
    expect(rows(els.notes).map((row) => row.textContent)).toEqual(['Time pressure: The sentence.']);
  });

  it('shows what a link says and where it opens, as text only', () => {
    const els = elements();
    showFindings(
      [
        finding('link-text-mismatch', 'warning', { links: [0, 1] }),
        finding('redirect-link', 'warning', { links: [1] }),
        finding('lookalike-domain', 'danger', {
          evidence: ['lumora-bank-verify.example', 'lumorabank.example'],
          links: [2],
        }),
      ],
      els,
      email,
    );
    const [mismatch, redirect, lookalike] = rows(els.list);
    expect(text(mismatch?.querySelector('.flag__rows'))).toBe(
      'Sayslumorabank.example/secureOpenslumora-bank-verify.example',
    );
    expect(text(mismatch?.querySelector('.flag__sentence'))).toBe('1 more link like this.');
    // A forwarding link opens its final target.
    expect(text(redirect?.querySelector('.flag__rows'))).toBe('SaysHelpOpensevil.example');
    expect(text(lookalike?.querySelector('.flag__rows'))).toBe(
      'Looks likelumorabank.exampleIslumora-bank-verify.example',
    );
    expect(document.querySelector('img')).toBeNull();
  });

  it('shows phrases as chips, the sender as name and address, and plain sentences', () => {
    const els = elements();
    showFindings(
      [
        finding('credentials', 'warning', { evidence: ['confirm your identity', 'log in'] }),
        finding('sender-name-domain', 'danger', {
          evidence: ['service@paypal.com', 'x@evil.example'],
        }),
        finding('incomplete-check', 'warning', { message: 'Part was not read.' }),
        finding('ip-link', 'warning'),
      ],
      els,
      email,
    );
    const [phrases, sender, sentence, noLink] = rows(els.list);
    expect([...(phrases?.querySelectorAll('.chip') ?? [])].map((chip) => chip.textContent)).toEqual(
      ['confirm your identity', 'log in'],
    );
    expect(text(sender?.querySelector('.flag__rows'))).toBe(
      'Name saysservice@paypal.comAddress isx@evil.example',
    );
    expect(text(sentence?.querySelector('.flag__sentence'))).toBe('Part was not read.');
    // A link rule without a link to show falls back to its sentence.
    expect(text(noLink?.querySelector('.flag__sentence'))).toBe('The sentence.');
  });

  it('reveals direction overrides in the evidence', () => {
    const els = elements();
    const rlo = String.fromCodePoint(0x202e);
    showFindings([finding('threat', 'warning', { evidence: [`${rlo}moc.lapyap`] })], els, email);
    expect(text(els.list.querySelector('.chip'))).toBe('<U+202E>moc.lapyap');
  });

  it('hides the section without red flags and says so under the notes', () => {
    const els = elements();
    showFindings([finding('redirect-link', 'info', { links: [1] })], els, email);
    expect(els.section.hidden).toBe(true);
    expect(els.count.textContent).toBe('0');
    expect(rows(els.list)).toHaveLength(0);
    showFindings([], els, email);
    expect(rows(els.notes).map((row) => row.textContent)).toEqual(['None.']);
  });

  it('has a title for every rule', () => {
    for (const title of Object.values(TITLES)) {
      expect(title).toMatch(/^[A-Z]/);
      expect(title).not.toMatch(/rule|DKIM|DMARC|SPF/);
    }
  });
});

describe('showRuleCheck', () => {
  it('shows the findings of the check and returns them', () => {
    const els = elements();
    const findings = [finding('payment', 'warning', { evidence: ['pay now'] })];
    expect(showRuleCheck(() => findings, els, email)).toBe(findings);
    expect(rows(els.list)).toHaveLength(1);
  });

  it('says when the check fails instead of throwing, as a warning', () => {
    const els = elements();
    expect(showRuleCheck(failingCheck, els, email)).toBeUndefined();
    const [row] = rows(els.list);
    expect(row?.className).toBe('flag finding warning');
    expect(text(row?.querySelector('.flag__sentence'))).toBe(
      'The basic checks could not finish (boom). Treat this email with care.',
    );
  });
});
