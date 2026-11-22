// "Sent to yourself": the email went from the user's own address to themselves and never came in
// from outside. Gmail adds no sender checks to such mail, which made Gemini Nano call a developer's
// error log suspicious (seen in Chrome, 22 Nov 2026). The fact comes from the headers only.
import { describe, expect, it } from 'vitest';
import { buildCloudPrompt, buildUserPrompt, promptData, SENT_TO_SELF_NOTE } from '../src/ai/prompt';
import type { Email } from '../src/email';
import { cloudData } from '../src/privacy/redact';
import { headersFromOriginalPage } from '../src/raw/gmail-original-page';
import { parseRawEmail } from '../src/raw/parse-raw-email';
import { senderStatus } from '../src/sidepanel/email-view';

const raw = (...lines: string[]): string => lines.join('\r\n');

/** The first line of a prompt: the task, before the data. */
const task = (prompt: string): string => prompt.split(String.fromCodePoint(10))[0] ?? '';

const body = ['Subject: ', 'Content-Type: text/plain', '', 'Console Error: two children', ''];

async function sentToSelf(...headers: string[]): Promise<boolean | undefined> {
  return (await parseRawEmail(raw(...headers, ...body))).headers?.sentToSelf;
}

describe('sent to yourself, from the headers', () => {
  it('is the sender delivered to their own mailbox, with no sender checks at all', async () => {
    expect(
      await sentToSelf(
        'Delivered-To: me@mail.example',
        'From: Me <Me@Mail.example>',
        'To: me@mail.example',
      ),
    ).toBe(true);
    // Without Delivered-To, the only To address decides.
    expect(await sentToSelf('From: me@mail.example', 'To: <me@mail.example>')).toBe(true);
  });

  it('is not when the email came in from outside (sender checks present)', async () => {
    // A forged "from yourself" email passed the receiving server, which wrote its checks.
    expect(
      await sentToSelf(
        'Delivered-To: me@mail.example',
        'Authentication-Results: mx.google.com; dmarc=fail header.from=mail.example',
        'From: me@mail.example',
        'To: me@mail.example',
      ),
    ).toBeUndefined();
  });

  it('is not for another sender, several recipients, or a lower Delivered-To', async () => {
    expect(
      await sentToSelf(
        'Delivered-To: me@mail.example',
        'From: boss@mail.example',
        'To: me@mail.example',
      ),
    ).toBeUndefined();
    expect(
      await sentToSelf('From: me@mail.example', 'To: me@mail.example, team@mail.example'),
    ).toBeUndefined();
    // Only the topmost Delivered-To counts (the receiving server's): a sender's own one below
    // it cannot make the email "yours".
    expect(
      await sentToSelf(
        'Delivered-To: me@mail.example',
        'Delivered-To: attacker@evil.example',
        'From: attacker@evil.example',
        'To: me@mail.example',
      ),
    ).toBeUndefined();
    expect(await sentToSelf('From: <>', 'To: <>')).toBeUndefined();
  });

  it('comes through Gmail\'s "Show original" page too', async () => {
    const lines = [
      'Delivered-To: me@mail.example',
      'From: Me <me@mail.example>',
      'To: me@mail.example',
      'Subject: ',
      '',
      'Body.',
    ];
    const escaped = lines.join('\n').replaceAll('&', '&amp;').replaceAll('<', '&lt;');
    const page = `<!doctype html><html><body><pre id="raw_message_text">${escaped}</pre></body></html>`;
    expect((await headersFromOriginalPage(page))?.sentToSelf).toBe(true);
  });
});

describe('sent to yourself, in the panel and the AI data', () => {
  const email: Email = {
    sender: { name: 'Me', address: 'me@mail.example' },
    subject: '',
    bodyText: 'Console Error: two children with the same key.',
    links: [{ text: 'Open the log', href: 'https://logs.example/view' }],
    truncated: false,
    headers: { replyTo: [], sentToSelf: true },
  };

  it('says "Sent from your own address" instead of "Sender not confirmed"', () => {
    expect(senderStatus(email, false, true)).toEqual({
      state: 'self',
      text: 'Sent from your own address',
      icon: 'info',
    });
    expect(senderStatus({ ...email, headers: { replyTo: [] } }, false, true).state).toBe(
      'unconfirmed',
    );
  });

  it('gives the AI a yes or no, never the address it was delivered to', () => {
    const data = promptData(email, []) as { email: { sent_to_self: boolean } };
    expect(data.email.sent_to_self).toBe(true);
    const cloud = JSON.parse(cloudData(email, [], [], 'standard').json) as {
      email: { sent_to_self: boolean };
    };
    expect(cloud.email.sent_to_self).toBe(true);
    const other = promptData({ ...email, headers: { replyTo: [] } }, []) as {
      email: { sent_to_self: boolean };
    };
    expect(other.email.sent_to_self).toBe(false);
  });

  it('says it in the task itself, in front of the data, only when it is true', () => {
    expect(task(buildUserPrompt(email, [], 'de'))).toBe(
      `Check this email for phishing. ${SENT_TO_SELF_NOTE} Write the reasons and the advice in German, also when the email is in another language.`,
    );
    expect(buildUserPrompt({ ...email, headers: { replyTo: [] } }, [], 'de')).not.toContain(
      SENT_TO_SELF_NOTE,
    );
    expect(task(buildCloudPrompt('{}', 'en', true))).toContain(SENT_TO_SELF_NOTE);
    expect(buildCloudPrompt('{}', 'en')).not.toContain(SENT_TO_SELF_NOTE);
  });
});
