import { describe, expect, it } from 'vitest';
import type { Email } from '../../src/email';
import { hostOf } from '../../src/rules/domains';
import { checkLinks, linksLeaveSender } from '../../src/rules/links';
import { MAX_EVIDENCE_CHARS } from '../../src/rules/types';

const rulesFor = (text: string, href: string): string[] =>
  checkLinks([{ text, href }]).map((finding) => `${finding.rule}:${finding.severity}`);

describe('checkLinks: what real emails do (test set, 26 Nov 2026)', () => {
  const confirmed = { host: hostOf('shop.example'), confirmed: true };
  const ids = (text: string, href: string, sender = confirmed): string[] =>
    checkLinks([{ text, href }], sender).map((finding) => `${finding.rule}:${finding.severity}`);

  it('does not take a broken link for an international domain', () => {
    // A typographic quote as the whole href: the URL parser makes it `xn--ivg`.
    expect(rulesFor('Help', 'https://\u201d')).toEqual([]);
    expect(rulesFor('Shop', 'https://xn--shp-sna.example/')).toEqual([
      'international-domain:warning',
    ]);
  });

  it("reads the target in a click tracker's path (Amazon SES), and only there", () => {
    const tracked = 'https://p42.r.eu-west-1.awstrack.me/L0/https:%2F%2Fshop.example%2Fsale/1/abc';
    expect(rulesFor('shop.example', tracked)).toEqual([]);
    expect(rulesFor('bank.example', tracked)).toEqual(['link-text-mismatch:warning']);
    // Any other site could put a trusted name in its path.
    expect(rulesFor('shop.example', 'https://evil.example/L0/https:%2F%2Fshop.example/')).toEqual([
      'link-text-mismatch:warning',
    ]);
  });

  it("calls the confirmed sender's own sites with another ending a note", () => {
    expect(ids('www.shop.example', 'https://www.shop.test/ch')).toEqual([
      'link-text-mismatch:info',
    ]);
    // Not confirmed, or the text names another domain than the sender's: still a warning.
    expect(
      ids('www.shop.example', 'https://www.shop.test/', { ...confirmed, confirmed: false }),
    ).toEqual(['link-text-mismatch:warning']);
    expect(ids('www.shop.test', 'https://www.shop.example/')).toEqual([
      'link-text-mismatch:warning',
    ]);
    expect(ids('www.shop.example', 'https://evil.example/')).toEqual([
      'link-text-mismatch:warning',
    ]);
    // From a free email provider, anyone is a confirmed sender.
    const gmail = { host: hostOf('gmail.com'), confirmed: true };
    expect(ids('gmail.com', 'https://gmail.co/', gmail)).toEqual(['link-text-mismatch:warning']);
  });
});

/** An email from `address` with these links. */
const mail = (address: string, ...hrefs: string[]): Email => ({
  sender: { name: '', address },
  subject: '',
  bodyText: '',
  links: hrefs.map((href) => ({ text: 'x', href })),
  truncated: false,
});

describe('linksLeaveSender', () => {
  it("stays with links to the sender's company and to common sites", () => {
    expect(linksLeaveSender(mail('a@dpd.example'))).toBe(false);
    expect(
      linksLeaveSender(
        mail(
          'a@dpd.example',
          'https://www.dpd.example/x',
          'https://www.dpd.test/', // same name, other ending
          'https://www.dpdgroup.example/', // contains the name
          'https://www.instagram.com/dpd',
          'https://x.us1.list-manage.com/track?u=1', // a mailing service
          'mailto:help@else.example',
          'https://\u201d', // broken: no domain
        ),
      ),
    ).toBe(false);
  });

  it('leaves with a link to an unrelated site, a shortener or a free hosting site', () => {
    expect(
      linksLeaveSender(mail('a@dpd.example', 'https://dpd.example/', 'https://evil.example/')),
    ).toBe(true);
    expect(linksLeaveSender(mail('a@dpd.example', 'https://shorturl.at/abc'))).toBe(true);
    expect(linksLeaveSender(mail('a@dpd.example', 'https://sites.google.com/view/x'))).toBe(true);
  });

  it('gives a free email sender no company: only its own domain stays', () => {
    expect(linksLeaveSender(mail('someone@gmail.com', 'https://gmail-verify.example/'))).toBe(true);
    expect(linksLeaveSender(mail('someone@gmail.com', 'https://gmail.test/'))).toBe(true);
    expect(linksLeaveSender(mail('someone@gmail.com', 'https://mail.gmail.com/'))).toBe(false);
  });

  it("does not let another site stay by naming the sender's domain in a parameter", () => {
    expect(
      linksLeaveSender(
        mail('a@dpd.example', 'https://evil.example/login?ref=https://dpd.example/'),
      ),
    ).toBe(true);
    // A mailing service's click tracking that forwards to the sender stays.
    expect(
      linksLeaveSender(
        mail('a@dpd.example', 'https://x.list-manage.com/track?u=https://dpd.example/'),
      ),
    ).toBe(false);
  });

  it('follows a forwarding link to its target', () => {
    expect(
      linksLeaveSender(mail('a@dpd.example', 'https://www.google.com/url?q=https://evil.example/')),
    ).toBe(true);
  });

  it('lets a confirmed platform that sends for shops link to the shop', () => {
    const stripe: Email = {
      ...mail('invoice@stripe.com', 'https://shop.example/billing'),
      headers: { replyTo: [], auth: { server: 'mx.google.com', dkim: [], dmarc: 'pass' } },
    };
    expect(linksLeaveSender(stripe)).toBe(false);
    expect(linksLeaveSender({ ...stripe, headers: { replyTo: [] } })).toBe(true);
  });
});

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
