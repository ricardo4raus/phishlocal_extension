import { describe, expect, it } from 'vitest';
import type { AuthResults, Email, EmailHeaders } from '../../src/email';
import { parseRawEmail } from '../../src/raw/parse-raw-email';
import { checkEmail } from '../../src/rules';
import { checkHeaders } from '../../src/rules/headers';

const PASS: AuthResults = {
  server: 'mx.receiver.example',
  spf: 'pass',
  dkim: [{ result: 'pass', domain: 'lumorabank.example' }],
  dmarc: 'pass',
};

function email(headers: Partial<EmailHeaders> | undefined, address = 'news@lumorabank.example') {
  const mail: Email = {
    sender: { name: 'Lumora Bank', address },
    subject: '',
    bodyText: '',
    links: [],
    truncated: false,
  };
  return headers ? { ...mail, headers: { replyTo: [], auth: PASS, ...headers } } : mail;
}

const rules = (mail: Email): string[] =>
  checkHeaders(mail).map((finding) => `${finding.rule}:${finding.severity}`);

describe('checkHeaders', () => {
  it('has nothing to say without headers or when every check passes', () => {
    expect(rules(email(undefined))).toEqual([]);
    expect(rules(email({}))).toEqual([]);
  });

  it('flags a failed DMARC check as danger', () => {
    const [finding] = checkHeaders(email({ auth: { ...PASS, spf: 'fail', dmarc: 'fail' } }));
    expect(finding).toEqual({
      rule: 'dmarc-fail',
      severity: 'danger',
      message:
        "The sender's domain lumorabank.example does not confirm this email: DMARC failed (checked by mx.receiver.example).",
      evidence: ['mx.receiver.example'],
    });
  });

  it('warns when SPF fails and DKIM does not pass', () => {
    expect(
      rules(
        email({ auth: { server: 'mx.x.example', spf: 'softfail', dkim: [{ result: 'none' }] } }),
      ),
    ).toEqual(['auth-fail:warning']);
    expect(rules(email({ auth: { server: 'mx.x.example', dkim: [{ result: 'fail' }] } }))).toEqual([
      'auth-fail:warning',
    ]);
    // One passing check is enough without DMARC (forwarding breaks SPF).
    expect(rules(email({ auth: { ...PASS, spf: 'fail', dmarc: undefined } }))).toEqual([]);
  });

  it('notes a signature by another domain only without a DMARC result', () => {
    const otherSigner: AuthResults = {
      server: 'mx.x.example',
      spf: 'pass',
      dkim: [{ result: 'pass', domain: 'mailer.example' }],
    };
    expect(rules(email({ auth: otherSigner }))).toEqual(['dkim-other-domain:info']);
    expect(rules(email({ auth: { ...otherSigner, dmarc: 'pass' } }))).toEqual([]);
  });

  it('warns when replies go to another company', () => {
    const [finding] = checkHeaders(
      email({ replyTo: [{ name: 'Support', address: 'lumora.help@freemail.example' }] }),
    );
    expect(finding).toEqual({
      rule: 'reply-to-mismatch',
      severity: 'warning',
      message: "Replies go to freemail.example, not to the sender's domain lumorabank.example.",
      evidence: ['lumora.help@freemail.example'],
    });
  });

  it('accepts replies to the same company and notes another ending', () => {
    expect(
      rules(email({ replyTo: [{ name: '', address: 'help@support.lumorabank.example' }] })),
    ).toEqual([]);
    expect(
      rules(email({ replyTo: [{ name: '', address: 'help@paypal.de' }] }, 'x@paypal.com')),
    ).toEqual([]);
    expect(rules(email({ replyTo: [{ name: '', address: 'help@lumorabank.ch' }] }))).toEqual([
      'reply-to-mismatch:info',
    ]);
  });

  it('notes when a raw email has no sender checks', () => {
    expect(rules(email({ auth: undefined }))).toEqual(['no-auth-results:info']);
  });
});

const raw = (...lines: string[]): string => lines.join('\r\n');

describe('header rules on a raw email', () => {
  it('ignores a fake "dmarc=pass" below the receiving server\'s result', async () => {
    const mail = await parseRawEmail(
      raw(
        'Authentication-Results: mx.receiver.example; spf=fail; dkim=none; dmarc=fail header.from=lumorabank.example',
        'Authentication-Results: mx.receiver.example; spf=pass; dkim=pass; dmarc=pass',
        'From: Lumora Bank <security@lumorabank.example>',
        'Reply-To: lumora.help@freemail.example',
        'Subject: Confirm your identity',
        '',
        'Confirm your identity within 24 hours.',
      ),
    );
    expect(checkEmail(mail).map((finding) => `${finding.rule}:${finding.severity}`)).toEqual([
      'dmarc-fail:danger',
      'reply-to-mismatch:warning',
      'credentials:warning',
      'urgency:info',
    ]);
  });
});
