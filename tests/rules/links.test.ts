import { describe, expect, it } from 'vitest';
import { checkLinks } from '../../src/rules/links';
import { MAX_EVIDENCE_CHARS } from '../../src/rules/types';

const rulesFor = (text: string, href: string): string[] =>
  checkLinks([{ text, href }]).map((finding) => `${finding.rule}:${finding.severity}`);

describe('checkLinks', () => {
  it.each([
    'javascript:alert(1)',
    ' JavaScript:alert(1)',
    'data:text/html,<script>x</script>',
    'file:///C:/x.exe',
  ])('flags %s as dangerous', (href) => {
    expect(rulesFor('Open', href)).toEqual(['dangerous-link:danger']);
  });

  it('flags a fake domain in front of an @', () => {
    const [finding] = checkLinks([
      { text: 'Log in', href: 'https://bank.example@evil.example/login' },
    ]);
    expect(finding).toEqual({
      rule: 'hidden-link-target',
      severity: 'danger',
      message: 'A link hides its real target behind an "@": it goes to evil.example.',
      evidence: ['https://bank.example@evil.example/login'],
      links: [0],
    });
    // Only a password before the "@": the message still reads well.
    expect(checkLinks([{ text: 'x', href: 'https://:pw@evil.example/' }])[0]?.message).toBe(
      'A link hides its real target behind an "@": it goes to evil.example.',
    );
  });

  it('flags IP addresses and international domains', () => {
    expect(rulesFor('Log in', 'http://192.168.10.5/login')).toEqual(['ip-link:warning']);
    expect(rulesFor('Log in', 'https://päypal.com/')).toEqual(['international-domain:warning']);
  });

  it('flags link text that names a different domain', () => {
    const [finding] = checkLinks([
      { text: 'lumorabank.example/secure', href: 'https://lumora-bank-verify.example/login' },
    ]);
    expect(finding).toEqual({
      rule: 'link-text-mismatch',
      severity: 'warning',
      message:
        'The link text says lumorabank.example, but the link goes to lumora-bank-verify.example.',
      evidence: ['lumorabank.example/secure', 'https://lumora-bank-verify.example/login'],
      links: [0],
    });
  });

  it('names the position of the link behind each finding', () => {
    const findings = checkLinks([
      { text: 'Home', href: 'https://news.example/' },
      { text: 'Open', href: 'javascript:x' },
    ]);
    expect(findings.map((finding) => finding.links)).toEqual([[1]]);
  });

  it('reads full-width and ideographic link texts', () => {
    expect(rulesFor('ｐａｙｐａｌ．ｃｏｍ', 'https://evil.example/')).toEqual([
      'link-text-mismatch:warning',
    ]);
    expect(rulesFor('paypal。com', 'https://evil.example/')).toEqual([
      'link-text-mismatch:warning',
    ]);
  });

  it('accepts other parts of the same domain', () => {
    expect(rulesFor('google.com', 'https://accounts.google.com/x')).toEqual([]);
    expect(rulesFor('www.bank.example', 'https://bank.example/')).toEqual([]);
  });

  it('compares the link text with the target a link forwards to', () => {
    const [finding] = checkLinks([
      { text: 'google.com', href: 'https://www.google.com/url?q=https://evil.example/login' },
    ]);
    expect(finding).toMatchObject({
      rule: 'link-text-mismatch',
      severity: 'warning',
      message:
        'The link text says google.com, but the link forwards to evil.example (through www.google.com).',
    });
    // Outlook safe links that forward to the promised domain are fine.
    expect(
      rulesFor(
        'bank.example',
        'https://eur01.safelinks.protection.outlook.com/?url=https%3A%2F%2Fwww.bank.example%2F',
      ),
    ).toEqual([]);
  });

  it('checks the final target of a forwarding link for IP addresses and international letters', () => {
    expect(rulesFor('Open', 'https://www.google.com/url?q=http://192.168.10.5/login')).toEqual([
      'ip-link:warning',
    ]);
    expect(rulesFor('Open', 'https://www.google.com/url?q=https://xn--pypal-4ve.com/')).toEqual([
      'international-domain:warning',
    ]);
  });

  it('only notes a redirect service (real emails use them too)', () => {
    expect(rulesFor('debattr.com', 'https://c.gle/AGSJx')).toEqual(['redirect-link:info']);
    expect(
      rulesFor('bank.example', 'https://eur01.safelinks.protection.outlook.com/?url=x'),
    ).toEqual(['redirect-link:info']);
  });

  it.each([
    ['Google-Konto aufrufen', 'https://c.gle/AGSJx'],
    ['Click here', 'https://evil.example/'],
    ['Write to us', 'mailto:help@bank.example'],
    ['Call', 'tel:+41000000000'],
    ['broken', 'https://'],
    ['relative', '/inbox'],
  ])('does not flag %j → %s', (text, href) => {
    expect(rulesFor(text, href)).toEqual([]);
  });

  it('caps the evidence', () => {
    const href = `https://evil.example/${'x'.repeat(5_000)}`;
    const [finding] = checkLinks([{ text: 'bank.example', href }]);
    expect(finding?.evidence.every((item) => item.length <= MAX_EVIDENCE_CHARS)).toBe(true);
  });
});
