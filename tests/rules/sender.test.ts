import { describe, expect, it } from 'vitest';
import { checkSender } from '../../src/rules/sender';
import { normalizeText, wordsPattern } from '../../src/rules/words';

const rulesFor = (name: string, address: string): string[] =>
  checkSender({ name, address }).map((finding) => `${finding.rule}:${finding.severity}`);

describe('checkSender', () => {
  it('flags a sender name that shows another address or domain', () => {
    const [finding] = checkSender({ name: 'service@paypal.com', address: 'x@evil.example' });
    expect(finding).toEqual({
      rule: 'sender-name-domain',
      severity: 'danger',
      message: 'The sender name shows paypal.com, but the email comes from evil.example.',
      evidence: ['service@paypal.com', 'x@evil.example'],
    });
    expect(rulesFor('Lumora Bank (lumorabank.example)', 'a@lumora-verify.example')).toEqual([
      'sender-name-domain:danger',
    ]);
  });

  it('flags a brand name with an address outside its known domains', () => {
    expect(rulesFor('PayPal Service', 'service@paypal-help.example')).toEqual([
      'sender-name-brand:warning',
    ]);
    expect(rulesFor('ＤＨＬ Express', 'track@parcel.example')).toEqual([
      'sender-name-brand:warning',
    ]);
    expect(rulesFor('La   Poste', 'info@colis.example')).toEqual(['sender-name-brand:warning']);
  });

  it('flags a sender domain with international letters, also without a name', () => {
    const address = `x@p${String.fromCodePoint(0x430)}ypal.com`;
    expect(rulesFor('', address)).toEqual(['international-domain:warning']);
    expect(rulesFor('PayPal', address)).toEqual([
      'international-domain:warning',
      'sender-name-brand:warning',
    ]);
  });

  it.each([
    ['PayPal.de', 'service@paypal.com'],
    ['Shop.ch', 'news@shop.de'],
    ['YouTube (youtube.com)', 'no-reply@google.com'],
    ['PayPal', 'service@paypal.com'],
    ['Google', 'no-reply@accounts.google.com'],
    ['Amazon.de', 'versandbestaetigung@amazon.de'],
    ['Lumora Bank', 'news@lumorabank.example'],
    ['Group Updates', 'news@club.example'],
    ['Applebees Fan Club', 'news@club.example'],
    ['', 'x@evil.example'],
    ['PayPal', ''],
  ])('does not flag %j <%s>', (name, address) => {
    expect(rulesFor(name, address)).toEqual([]);
  });
});

describe('wordsPattern', () => {
  it('matches whole words and phrases with any spacing and case', () => {
    const pattern = wordsPattern(['act now', 'c.o.d (cash)']);
    expect('Please ACT\n now!'.match(pattern)).toEqual(['ACT\n now']);
    expect('pay c.o.d (cash) today'.match(pattern)).toEqual(['c.o.d (cash)']);
    expect('react nowhere'.match(pattern)).toBeNull();
  });

  it('normalizes compatibility letters and apostrophes', () => {
    expect(normalizeText('Ｕｒｇｅｎｔ – don’t')).toBe("urgent – don't");
  });
});
