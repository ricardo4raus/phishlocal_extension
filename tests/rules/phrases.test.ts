import { describe, expect, it } from 'vitest';
import { ALL_PHRASES, checkPhrases } from '../../src/rules/phrases';
import { normalizeText } from '../../src/rules/words';

const check = (bodyText: string, subject = ''): string[] =>
  checkPhrases({ subject, bodyText }).map((finding) => finding.rule);

describe('checkPhrases', () => {
  it('finds each category and lists the phrases', () => {
    const findings = checkPhrases({
      subject: 'URGENT: account suspended',
      bodyText:
        'We noticed unusual activity. Confirm your identity within 24 hours and pay the fee.',
    });
    expect(findings).toEqual([
      {
        rule: 'urgency',
        severity: 'info',
        message: 'The email creates time pressure: "urgent", "within 24 hours".',
        evidence: ['urgent', 'within 24 hours'],
      },
      {
        rule: 'threat',
        severity: 'info',
        message: 'The email threatens consequences: "unusual activity".',
        evidence: ['unusual activity'],
      },
      {
        rule: 'credentials',
        severity: 'warning',
        message:
          'The email asks you to confirm your identity, log-in or card details: "confirm your identity".',
        evidence: ['confirm your identity'],
      },
      {
        rule: 'payment',
        severity: 'warning',
        message: 'The email asks for a payment: "pay the fee".',
        evidence: ['pay the fee'],
      },
    ]);
  });

  it.each([
    ['de', 'Ihr Konto wurde gesperrt. Bestätigen Sie Ihre Identität umgehend.'],
    ['fr', 'Activité inhabituelle : confirmez votre identité dans les 24 heures.'],
    ['es', 'Actividad inusual: confirme su identidad lo antes posible.'],
  ])('works in %s', (_language, text) => {
    expect(check(text)).toEqual(['urgency', 'threat', 'credentials']);
  });

  it('matches across line breaks, typographic apostrophes and full-width letters', () => {
    expect(check('Offer valid aujourd’hui seulement')).toEqual(['urgency']);
    expect(check('Please confirm\nyour   identity')).toEqual(['credentials']);
    expect(check('ＰＡＹ ＮＯＷ')).toEqual(['payment']);
  });

  it('is not fooled by invisible characters inside words', () => {
    expect(check('con\u200bfirm your iden\u00adtity within 2\u200d4 hours')).toEqual([
      'urgency',
      'credentials',
    ]);
  });

  it.each([
    'We will never ask for your password by email.',
    'Your November statement is ready in online banking.',
    'Sofortbildkamera im Angebot', // "sofort" inside a longer word
    'The insurgent group', // "urgent" inside a longer word
    '',
  ])('does not flag %j', (text) => {
    expect(check(text)).toEqual([]);
  });

  it('lists a phrase once and at most five per category', () => {
    const [finding] = checkPhrases({
      subject: '',
      bodyText: 'urgent urgent immediately act now right away as soon as possible last chance',
    });
    expect(finding?.evidence).toEqual([
      'urgent',
      'immediately',
      'act now',
      'right away',
      'as soon as possible',
    ]);
  });

  it('has only lowercase, normalized phrases that find themselves', () => {
    for (const phrase of ALL_PHRASES) {
      expect(phrase).toBe(normalizeText(phrase));
      expect(check(`x ${phrase} x`).length).toBeGreaterThan(0);
    }
  });

  it('stays fast on long text', () => {
    const start = performance.now();
    check('confirm your '.repeat(2_000));
    expect(performance.now() - start).toBeLessThan(500);
  });
});
