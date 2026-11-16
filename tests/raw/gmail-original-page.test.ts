// A made-up "Show original" page (structure as measured on 16 Nov 2026), parsed without a DOM.
import { describe, expect, it } from 'vitest';
import { headersFromOriginalPage } from '../../src/raw/gmail-original-page';

/** The raw email the way Gmail puts it into the page: HTML-escaped inside one <pre>. */
function page(rawLines: string[]): string {
  const escaped = rawLines.join('\n').replaceAll('&', '&amp;').replaceAll('<', '&lt;');
  return `<!doctype html><html><head><title>Original</title></head><body>
    <table><tr><td>SPF:</td><td>PASS</td></tr></table>
    <a href="?view=att&amp;disp=comp">Download</a>
    <pre class="raw_message_text" id="raw_message_text">${escaped}</pre>
  </body></html>`;
}

const RAW = [
  'Delivered-To: you@receiver.example',
  'Return-Path: <bounce@mailer.lumorabank.example>',
  'Authentication-Results: mx.google.com;',
  '       dkim=pass header.i=@lumorabank.example;',
  '       spf=pass smtp.mailfrom=bounce@mailer.lumorabank.example;',
  '       dmarc=pass header.from=lumorabank.example',
  'Authentication-Results: fake.example; dmarc=fail',
  'From: Lumora Bank <news@lumorabank.example>',
  'Reply-To: Support <help@lumorabank.example>',
  'Subject: Statement',
  '',
  'Body with <b>tags</b> that is not read.',
];

describe('headersFromOriginalPage', () => {
  it("reads the headers and Gmail's topmost sender checks", async () => {
    expect(await headersFromOriginalPage(page(RAW))).toEqual({
      replyTo: [{ name: 'Support', address: 'help@lumorabank.example' }],
      returnPath: 'bounce@mailer.lumorabank.example',
      auth: {
        server: 'mx.google.com',
        spf: 'pass',
        dkim: [{ result: 'pass', domain: 'lumorabank.example' }],
        dmarc: 'pass',
      },
    });
  });

  it("drops sender checks that Gmail's server did not write on top", async () => {
    const headers = await headersFromOriginalPage(
      page(RAW.map((line) => line.replace('mx.google.com', 'mx.other.example'))),
    );
    expect(headers?.auth).toBeUndefined();
    expect(headers?.returnPath).toBe('bounce@mailer.lumorabank.example');
  });

  it.each([
    ['no <pre>', '<html><body><p>Error 404</p></body></html>'],
    ['an empty <pre>', '<pre></pre>'],
    ['a page that is not HTML', 'not html at all'],
  ])('returns nothing for %s', async (_label, html) => {
    expect(await headersFromOriginalPage(html)).toBeUndefined();
  });
});
