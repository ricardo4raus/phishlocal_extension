import { describe, expect, it } from 'vitest';
import {
  MAX_DOMAINS_IN_TEXT,
  domainsInText,
  forwardTarget,
  hostOf,
  hostOfAddress,
  parseUrl,
} from '../../src/rules/domains';

describe('hostOf', () => {
  it.each([
    ['accounts.google.com', 'google.com', 'google', 'accounts'],
    ['bar.co.uk', 'bar.co.uk', 'bar', ''],
    ['paypal.com.secure-login.example', 'secure-login.example', 'secure-login', 'paypal.com'],
    // Shared hosting: every site on github.io is its own domain.
    ['bank.github.io', 'bank.github.io', 'bank', ''],
    ['xn--pypal-4ve.com', 'xn--pypal-4ve.com', 'xn--pypal-4ve', ''],
  ])('reads %s', (hostname, domain, label, subdomain) => {
    expect(hostOf(hostname)).toEqual({ hostname, domain, label, subdomain, isIp: false });
  });

  it.each(['192.168.0.1', '[::1]'])('knows that %s is an IP address', (hostname) => {
    expect(hostOf(hostname)).toMatchObject({ isIp: true, domain: undefined });
  });

  it.each(['localhost', 'intranet', 'invoice.pdf'])('has no domain for %s', (hostname) => {
    expect(hostOf(hostname).domain).toBeUndefined();
  });
});

describe('parseUrl', () => {
  it('parses links like the browser does', () => {
    expect(parseUrl(' https://PayPal.COM/x ')?.hostname).toBe('paypal.com');
    expect(parseUrl('https://päypal.com/')?.hostname).toBe('xn--pypal-gra.com');
    expect(parseUrl('not a url')).toBeUndefined();
  });
});

const target = (href: string): string | undefined => forwardTarget(new URL(href))?.hostname;

describe('forwardTarget', () => {
  it('finds the address a link forwards to', () => {
    expect(target('https://www.google.com/url?sa=t&q=https://evil.example/x')).toBe('evil.example');
    expect(target('https://t.example/c?u=HTTPS%3A%2F%2Fevil.example')).toBe('evil.example');
  });

  it('ignores other parameters and stops after 20', () => {
    expect(target('https://shop.example/?id=42&ref=mail')).toBeUndefined();
    const many = Array.from({ length: 20 }, (_, i) => `p${i}=x`).join('&');
    expect(target(`https://shop.example/?${many}&u=https://evil.example`)).toBeUndefined();
  });
});

describe('hostOfAddress', () => {
  it('reads the domain of an email address', () => {
    expect(hostOfAddress('Security@Mail.Lumora-Bank.example')?.domain).toBe('lumora-bank.example');
    expect(hostOfAddress('"a@b"@bank.example')?.domain).toBe('bank.example');
  });

  it.each(['', 'no address', 'a@localhost', 'a@'])('has no host for %j', (address) => {
    expect(hostOfAddress(address)).toBeUndefined();
  });
});

const domains = (text: string): string[] => domainsInText(text).map((host) => host.hostname);

describe('domainsInText', () => {
  it('finds domains and URLs in text', () => {
    expect(
      domains('Log in at www.bank.example/login or https://Shop.example. Mail: a@help.example'),
    ).toEqual(['www.bank.example', 'shop.example', 'help.example']);
  });

  it('reads full-width letters, other dots and invisible characters like the browser', () => {
    expect(domains('ｐａｙｐａｌ．ｃｏｍ, paypal。de and pay\u200bpal.ch')).toEqual([
      'paypal.com',
      'paypal.de',
      'paypal.ch',
    ]);
  });

  it('ignores words that only look like domains', () => {
    expect(domains('Node.js costs CHF 1.99, e.g. in index.html or vite.config.ts')).toEqual([]);
  });

  it('lists each domain once and stops at the limit', () => {
    expect(domains('a.example a.example')).toEqual(['a.example']);
    const many = Array.from({ length: MAX_DOMAINS_IN_TEXT + 10 }, (_, i) => `d${i}.example`);
    expect(domainsInText(many.join(' '))).toHaveLength(MAX_DOMAINS_IN_TEXT);
  });

  it('stays fast on long hostile input', () => {
    const start = performance.now();
    domainsInText(`${'a-'.repeat(10_000)}.${'b.'.repeat(5_000)}`);
    expect(performance.now() - start).toBeLessThan(500);
  });
});
