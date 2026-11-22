import { describe, expect, it } from 'vitest';
import type { Email, EmailLink } from '../../src/email';
import { BRANDS } from '../../src/rules/brands';
import { hostOf } from '../../src/rules/domains';
import { checkLookalikes, skeleton, withinOneEdit } from '../../src/rules/lookalike';

function email(address: string, links: EmailLink[] = [], bodyText = ''): Email {
  return { sender: { name: '', address }, subject: '', bodyText, links, truncated: false };
}

const link = (href: string, text = 'Open'): EmailLink => ({ text, href });

const found = (mail: Email): string[] =>
  checkLookalikes(mail).map((finding) => `${finding.rule}:${finding.evidence[0]}`);

describe('skeleton', () => {
  it.each([
    ['paypa1', 'paypal'],
    ['paypai', 'paypal'],
    ['rnicrosoft', 'microsoft'],
    ['g00gle', 'google'],
    ['vvells', 'wells'],
  ])('maps %s like %s', (fake, real) => {
    expect(skeleton(fake)).toBe(skeleton(real));
  });
});

describe('withinOneEdit', () => {
  it.each([
    ['paypal', 'paypal', true],
    ['paypall', 'paypal', true],
    ['paypl', 'paypal', true],
    ['paypbl', 'paypal', true],
    ['papyal', 'paypal', true],
    ['payapl', 'paypal', true],
    ['pyapla', 'paypal', false],
    ['paypalxx', 'paypal', false],
    ['', 'a', true],
  ])('%s vs %s: %s', (a, b, expected) => {
    expect(withinOneEdit(a, b)).toBe(expected);
    expect(withinOneEdit(b, a)).toBe(expected);
  });
});

describe('checkLookalikes', () => {
  it('flags lookalikes of known brands in links and in the sender', () => {
    expect(found(email('service@paypa1.com', [link('https://www.g00gle.com/login')]))).toEqual([
      'lookalike-domain:paypa1.com',
      'lookalike-domain:www.g00gle.com',
    ]);
    expect(found(email('', [link('https://micros0ft-support.example/')]))).toEqual([
      'brand-in-domain:micros0ft-support.example',
    ]);
  });

  it('checks the target a link forwards to', () => {
    expect(found(email('', [link('https://www.google.com/url?q=https://paypa1.com/')]))).toEqual([
      'lookalike-domain:paypa1.com',
    ]);
  });

  it('warns about a brand name with a different ending', () => {
    expect(
      checkLookalikes(
        email('x@paypal-help.example', [
          link('https://www.paypal.support/'),
          link('https://paypal.com.co/login'),
        ]),
      ).map((finding) => `${finding.rule}:${finding.severity}:${finding.message}`),
    ).toEqual([
      'brand-in-domain:warning:paypal-help.example contains the name "paypal", but it is not paypal.com.',
      'brand-in-domain:warning:paypal.support uses the name "paypal" with a different ending; the real domain is paypal.com.',
      'brand-in-domain:warning:paypal.com.co uses the name "paypal" with a different ending; the real domain is paypal.com.',
    ]);
  });

  it('accepts the same name with another ending when it comes from the email', () => {
    // Companies use several country domains (shop.de, shop.ch).
    expect(found(email('news@lumorabank.example', [link('https://lumorabank.ch/')]))).toEqual([]);
  });

  it('flags a brand in front of a different domain, also short brand names', () => {
    expect(
      found(
        email('', [
          link('https://paypal.com.secure-login.example/'),
          link('https://dhl.parcel-fee.example/'),
        ]),
      ),
    ).toEqual([
      'brand-in-subdomain:paypal.com.secure-login.example',
      'brand-in-subdomain:dhl.parcel-fee.example',
    ]);
  });

  it('compares with the domains the email itself names', () => {
    const mail = email('security@lumora-bank-verify.example', [
      link('https://lumora-bank-verify.example/login', 'lumorabank.example/secure'),
    ]);
    expect(checkLookalikes(mail)).toEqual([
      {
        rule: 'brand-in-domain',
        severity: 'warning',
        message:
          'lumora-bank-verify.example contains the name "lumorabank", but it is not lumorabank.example.',
        evidence: ['lumora-bank-verify.example', 'lumorabank.example'],
        // The sender has the same domain, but only the link is marked.
        links: [0],
      },
    ]);
    expect(
      found(email('', [link('https://lumorabamk.example/')], 'Visit lumorabank.example')),
    ).toEqual(['lookalike-domain:lumorabamk.example']);
  });

  it('only warns about a name from the email in front of another domain', () => {
    // Mailing services build click-tracking hosts like this for their customers.
    const [finding] = checkLookalikes(
      email('news@lumorabank.example', [link('https://lumorabank.mailer.example/c/1')]),
    );
    expect(finding).toMatchObject({ rule: 'brand-in-subdomain', severity: 'warning' });
  });

  it("accepts the email's own name at a known mailing service, but not a brand's", () => {
    // Mailchimp builds click-tracking hosts like this for its customers (found in a real
    // newsletter during the Chrome test).
    expect(
      found(
        email('promotions@chessable.example', [
          link('https://chessable.us14.list-manage.com/track/click?u=1'),
        ]),
      ),
    ).toEqual([]);
    expect(
      found(email('x@news.example', [link('https://paypal.us14.list-manage.com/track/click')])),
    ).toEqual(['brand-in-subdomain:paypal.us14.list-manage.com']);
  });

  it('accepts the real domains of a brand and other parts of a domain', () => {
    expect(
      found(
        email('no-reply@accounts.google.com', [
          link('https://myaccount.google.com/'),
          link('https://lh3.googleusercontent.com/a.png'),
          link('https://www.youtube.com/'),
          link('https://login.microsoftonline.com/'),
          link('https://www.amazon.de/'),
          link('https://www.paypal.com/', 'paypal.com'),
        ]),
      ),
    ).toEqual([]);
  });

  it.each([
    ['apply.example', 'a typo-distance word next to a short brand name'],
    ['ups-and-downs.example', 'a short brand name inside another word'],
    ['post.example', 'a common word'],
    ['debattr.com', 'an unrelated domain'],
    ['c.gle', 'a redirect service'],
  ])('does not flag %s (%s)', (hostname) => {
    expect(found(email('a@news.example', [link(`https://${hostname}/`)]))).toEqual([]);
  });

  it('ignores short names from the email itself', () => {
    expect(found(email('a@abc.example', [link('https://abd.example/')]))).toEqual([]);
  });

  it('lists each domain once, with the strongest finding', () => {
    const mail = email('x@paypa1.com', [
      link('https://paypa1.com/a'),
      link('https://paypa1.com/b'),
    ]);
    expect(found(mail)).toEqual(['lookalike-domain:paypa1.com']);
  });

  it('has a usable main domain for every brand', () => {
    for (const brand of BRANDS) expect(hostOf(brand.domains[0]).label).toBeTruthy();
  });
});
