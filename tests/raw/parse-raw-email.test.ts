// Runs in Node without a DOM on purpose: raw emails are parsed with postal-mime and parse5 only.
import { describe, expect, it } from 'vitest';
import {
  looksLikeRawEmail,
  MAX_RAW_CHARS,
  parseRawEmail,
  RawEmailError,
} from '../../src/raw/parse-raw-email';

const raw = (...lines: string[]): string => lines.join('\r\n');

const MULTIPART = raw(
  'Delivered-To: me@receiver.example',
  'Received: by 2002:a05::1 with SMTP id x; Mon, 16 Nov 2026 09:49:28 -0800 (PST)',
  'ARC-Authentication-Results: i=1; mx.receiver.example; dmarc=fail',
  'Return-Path: <bounce@mailer.lumorabank.example>',
  'Authentication-Results: mx.receiver.example;',
  '       dkim=pass header.i=@lumorabank.example;',
  '       spf=pass smtp.mailfrom=bounce@mailer.lumorabank.example;',
  '       dmarc=pass header.from=lumorabank.example',
  'Authentication-Results: fake.example; dmarc=fail',
  'From: =?UTF-8?Q?Lumora_Bank_=C3=9C?= <news@lumorabank.example>',
  'Reply-To: "Support" <help@lumora-support.example>, other@lumorabank.example',
  'Subject: =?UTF-8?B?WW91ciBzdGF0ZW1lbnQ=?=',
  'MIME-Version: 1.0',
  'Content-Type: multipart/alternative; boundary="b1"',
  '',
  '--b1',
  'Content-Type: text/plain; charset=utf-8',
  '',
  'Hello, your statement is ready: https://lumorabank.example/statement',
  '--b1',
  'Content-Type: text/html; charset=utf-8',
  '',
  '<p>Hello, <a href="https://lumorabank.example/statement">open your statement</a>',
  '<img src="https://tracker.example/p.gif"></p>',
  '--b1--',
  '',
);

describe('parseRawEmail', () => {
  it('reads the visible email and the hidden headers', async () => {
    const email = await parseRawEmail(MULTIPART);
    expect(email).toMatchObject({
      sender: { name: 'Lumora Bank Ü', address: 'news@lumorabank.example' },
      subject: 'Your statement',
      bodyText: 'Hello, your statement is ready: https://lumorabank.example/statement',
      truncated: false,
      headers: {
        replyTo: [
          { name: 'Support', address: 'help@lumora-support.example' },
          { name: '', address: 'other@lumorabank.example' },
        ],
        returnPath: 'bounce@mailer.lumorabank.example',
      },
    });
    expect(email.links).toEqual([
      { text: 'open your statement', href: 'https://lumorabank.example/statement' },
    ]);
  });

  it('trusts only the topmost Authentication-Results, not ARC or lower ones', async () => {
    const email = await parseRawEmail(MULTIPART);
    expect(email.headers?.auth).toEqual({
      server: 'mx.receiver.example',
      spf: 'pass',
      dkim: [{ result: 'pass', domain: 'lumorabank.example' }],
      dmarc: 'pass',
    });
  });

  it('uses the HTML as text when there is no plain-text part', async () => {
    const email = await parseRawEmail(
      raw(
        'From: a@shop.example',
        'Subject: Hi',
        'Content-Type: text/html',
        '',
        '<html><head><title>T</title><style>p{}</style></head><body><p>Line one</p><p>Line <b>two</b></p><script>x()</script></body></html>',
      ),
    );
    expect(email.bodyText).toBe('Line one\nLine two');
  });

  it('works without sender checks or Reply-To', async () => {
    const email = await parseRawEmail(raw('From: a@shop.example', 'Subject: Hi', '', 'Hello'));
    expect(email.headers).toEqual({ replyTo: [] });
  });

  it('refuses input over the size limit', async () => {
    await expect(parseRawEmail('x'.repeat(MAX_RAW_CHARS + 1))).rejects.toBeInstanceOf(
      RawEmailError,
    );
  });

  it('refuses deeply nested or huge messages instead of hanging', async () => {
    const nested = Array.from(
      { length: 30 },
      (_, i) => `Content-Type: multipart/mixed; boundary="b${i}"\r\n\r\n--b${i}\r\n`,
    ).join('');
    await expect(parseRawEmail(`From: a@x.example\r\n${nested}`)).rejects.toBeInstanceOf(
      RawEmailError,
    );
    const headers = Array.from({ length: 5_000 }, (_, i) => `X-H${i}: ${'v'.repeat(60)}`);
    await expect(parseRawEmail(raw('From: a@x.example', ...headers, '', 'x'))).rejects.toThrow(
      /could not be read/,
    );
  });
});

describe('looksLikeRawEmail', () => {
  it('recognizes raw source, also with folded header lines', () => {
    expect(looksLikeRawEmail(MULTIPART)).toBe(true);
    expect(looksLikeRawEmail(`\n\n${MULTIPART}`)).toBe(true);
  });

  it.each([
    'Dear customer,\n\nYour account is locked.',
    'Note: this is plain text\nAlso: with colons\nAnd: more\n\nbody',
    'From: a@x.example\nSubject: hi\n',
    '',
  ])('does not take normal text for raw source: %j', (text) => {
    expect(looksLikeRawEmail(text)).toBe(false);
  });
});
