import { describe, expect, it } from 'vitest';
import {
  cutMiddle,
  linkDisplay,
  MAX_OTHER_CHARS,
  MAX_PATH_CHARS,
} from '../src/sidepanel/link-display';

describe('cutMiddle', () => {
  it('keeps short text and cuts long text in the middle', () => {
    expect(cutMiddle('abc', 3)).toBe('abc');
    expect(cutMiddle('abcdefghij', 5)).toBe('abc…j');
    expect(cutMiddle('x'.repeat(100), 40)).toHaveLength(40);
  });

  it('never splits a character in two', () => {
    const emoji = String.fromCodePoint(0x1f600);
    const cut = cutMiddle(emoji.repeat(10), 5);
    expect([...cut]).toHaveLength(5);
    expect(cut).toBe(`${emoji.repeat(3)}…${emoji}`);
  });
});

describe('linkDisplay', () => {
  it('shows the registrable domain and a short URL without https://', () => {
    expect(linkDisplay('https://login.paypa1-secure.example/')).toEqual({
      domain: 'paypa1-secure.example',
      short: 'login.paypa1-secure.example',
    });
    expect(linkDisplay('http://shop.example:8080/a?b=1#c')).toEqual({
      domain: 'shop.example',
      short: 'http://shop.example:8080/a?b=1#c',
    });
  });

  it('cuts a long path in the middle, but never the host', () => {
    const host = `${'a'.repeat(60)}.bank.example`;
    const display = linkDisplay(`https://${host}/${'p'.repeat(200)}/end`);
    expect(display.short.startsWith(`${host}/ppp`)).toBe(true);
    expect(display.short.endsWith('/end')).toBe(true);
    expect(display.short).toHaveLength(host.length + MAX_PATH_CHARS);
  });

  it('leaves out the decoy before an "@"', () => {
    expect(linkDisplay('https://lumorabank.example@account-check.example/verify')).toEqual({
      domain: 'account-check.example',
      short: 'account-check.example/verify',
    });
  });

  it('names the final target of a forwarding link', () => {
    expect(linkDisplay('https://www.google.com/url?q=https://evil.example/x')).toMatchObject({
      domain: 'google.com',
      forwardsTo: 'evil.example',
    });
    // Forwarding within the same domain is not worth a note.
    expect(linkDisplay('https://a.shop.example/r?u=https://b.shop.example/')).not.toHaveProperty(
      'forwardsTo',
    );
  });

  it('shows IP addresses and punycode as they are', () => {
    expect(linkDisplay('http://192.168.0.1/login').domain).toBe('192.168.0.1');
    // "pаypal" with a Cyrillic "а" (U+0430).
    const cyrillic = `p${String.fromCodePoint(0x430)}ypal.example`;
    expect(linkDisplay(`https://${cyrillic}/`).domain).toMatch(/^xn--[a-z0-9-]+\.example$/);
  });

  it('handles mailto, code and invalid links', () => {
    expect(linkDisplay('mailto:help%40bank.example?subject=Hi')).toEqual({
      domain: 'bank.example',
      short: 'mailto:help@bank.example',
    });
    const code = linkDisplay(`javascript:${'a'.repeat(100)}`);
    expect(code.domain).toBe('javascript:');
    expect(code.short).toHaveLength(MAX_OTHER_CHARS);
    expect(linkDisplay('not a link')).toEqual({ domain: '', short: 'not a link' });
    expect(linkDisplay('mailto:%E0%A4%A')).toMatchObject({ domain: 'mailto:' });
  });
});
