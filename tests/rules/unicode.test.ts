import { describe, expect, it } from 'vitest';
import type { Email } from '../../src/email';
import { checkUnicode, revealOverrides } from '../../src/rules/unicode';

// Built from code points, so the source itself has no invisible or lookalike characters.
const ZWSP = String.fromCodePoint(0x200b);
const ZWJ = String.fromCodePoint(0x200d);
const SOFT_HYPHEN = String.fromCodePoint(0xad);
const CYRILLIC_A = String.fromCodePoint(0x430);
const CYRILLIC_O = String.fromCodePoint(0x43e);
const GREEK_ALPHA = String.fromCodePoint(0x3b1);
const RLO = String.fromCodePoint(0x202e);
const LRO = String.fromCodePoint(0x202d);

const email = (bodyText: string, extra: Partial<Email> = {}): Email => ({
  sender: { name: '', address: 'a@news.example' },
  subject: '',
  bodyText,
  links: [],
  truncated: false,
  ...extra,
});

const rules = (mail: Email): string[] => checkUnicode(mail).map((finding) => finding.rule);

describe('checkUnicode', () => {
  it('flags invisible characters inside words and shows them', () => {
    const [finding] = checkUnicode(email(`Please con${ZWSP}firm your iden${ZWJ}tity`));
    expect(finding).toEqual({
      rule: 'hidden-characters',
      severity: 'warning',
      message:
        'Words contain invisible characters, a trick to slip past filters: con<U+200B>firm, iden<U+200D>tity.',
      evidence: ['con<U+200B>firm', 'iden<U+200D>tity'],
    });
  });

  it('flags words that mix Latin with Cyrillic or Greek letters', () => {
    expect(rules(email(`Log in to p${CYRILLIC_A}ypal`))).toEqual(['mixed-script']);
    expect(rules(email('', { sender: { name: '', address: `x@p${CYRILLIC_A}ypal.com` } }))).toEqual(
      ['mixed-script'],
    );
    expect(
      rules(email('', { links: [{ text: `c${CYRILLIC_O}nfirm`, href: 'https://x.example' }] })),
    ).toEqual(['mixed-script']);
    expect(rules(email(`${GREEK_ALPHA}pple`))).toEqual(['mixed-script']);
    // Invisible characters don't split a mixed word into harmless parts.
    expect(rules(email(`p${ZWSP}${CYRILLIC_A}ypal`))).toEqual([
      'hidden-characters',
      'mixed-script',
    ]);
  });

  it('flags a direction override and shows it in the evidence', () => {
    const findings = checkUnicode(
      email('', { sender: { name: `${RLO}moc.lapyap`, address: 'x@evil.example' } }),
    );
    expect(findings).toEqual([
      {
        rule: 'direction-override',
        severity: 'warning',
        message:
          'Text contains a hidden direction switch (U+202E or U+202D) that makes it display differently than it is written, e.g. "moc.lapyap" shows as "paypal.com".',
        evidence: ['<U+202E>moc.lapyap'],
      },
    ]);
    expect(rules(email('', { subject: `Invoice ${LRO}fdp.exe` }))).toContain('direction-override');
  });

  it('shows direction overrides visibly, but leaves other direction marks for RTL text', () => {
    expect(revealOverrides(`a${RLO}b${LRO}c`)).toBe('a<U+202E>b<U+202D>c');
    const rightToLeftMark = String.fromCodePoint(0x200f);
    expect(revealOverrides(`abc${rightToLeftMark}`)).toBe(`abc${rightToLeftMark}`);
  });

  it.each([
    ['soft hyphens in long words', `Versand${SOFT_HYPHEN}bestätigung`],
    ['emoji sequences', `Family ${String.fromCodePoint(0x1f468, 0x200d, 0x1f469)}`],
    ['text in one alphabet', `Привет, ${'Ελλάδα'} and hello`],
    ['invisible characters between words', `Hello${ZWSP} world`],
  ])('does not flag %s', (_case, text) => {
    expect(rules(email(text))).toEqual([]);
  });

  it('stays fast on long words', () => {
    const start = performance.now();
    checkUnicode(email(`${'a'.repeat(20_000)} ${`a${ZWSP}`.repeat(5_000)}`));
    expect(performance.now() - start).toBeLessThan(500);
  });
});
