// What the side panel shows for the messages from the Gmail tab (UI replaced by a recorder).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Email } from '../src/email';
import * as originalPage from '../src/raw/gmail-original-page';
import { HEADERS_HINT } from '../src/sidepanel/email-view';
import { createGmailView, type GmailView } from '../src/sidepanel/gmail-view';

const email: Email = {
  sender: { name: 'Lumora Bank', address: 'news@lumorabank.example' },
  subject: 'Statement',
  bodyText: 'Hello',
  links: [],
  truncated: false,
};

const PAGE = `<pre>Authentication-Results: mx.google.com; spf=pass; dkim=pass header.d=lumorabank.example; dmarc=pass
From: Lumora Bank &lt;news@lumorabank.example&gt;
Subject: Statement

Hello</pre>`;

let calls: string[];
let shown: { email: Email; status: string; note?: string }[];
let view: GmailView;

/** Lets the asynchronous header parsing finish. */
const settle = async (): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, 20));
};

beforeEach(() => {
  calls = [];
  shown = [];
  view = createGmailView({
    show: (shownEmail, status, note) => {
      calls.push('show');
      shown.push({ email: shownEmail, status, note });
    },
    hide: (reason) => calls.push(`hide: ${reason}`),
    setStatus: (text, isError) => calls.push(`status${isError ? ' error' : ''}: ${text}`),
  });
});

describe('Gmail view', () => {
  it('shows an opened email at once and again with its headers', async () => {
    view.handle({ type: 'email', key: 'msg-f:1', email });
    expect(shown[0]).toEqual({
      email,
      status: 'Checked automatically on this device. Loading the sender checks…',
      note: 'Loading from Gmail…',
    });
    view.handle({ type: 'original', key: 'msg-f:1', html: PAGE });
    await settle();
    expect(shown[1]?.email.headers?.auth).toMatchObject({ server: 'mx.google.com', dmarc: 'pass' });
    expect(shown[1]?.status).toMatch(/Sender checks read from Gmail/);
  });

  it('ignores headers for an email that is no longer shown', async () => {
    view.handle({ type: 'email', key: 'msg-f:1', email });
    view.handle({ type: 'original', key: 'msg-f:1', html: PAGE });
    view.handle({ type: 'email', key: 'msg-f:2', email: { ...email, subject: 'Other' } });
    view.handle({ type: 'original', key: 'msg-f:3', html: PAGE });
    await settle();
    expect(shown.map((entry) => entry.email.subject)).toEqual(['Statement', 'Other']);
  });

  it('says why the headers are not available', async () => {
    view.handle({ type: 'email', key: 'msg-f:1', email });
    view.handle({ type: 'original-failed', key: 'msg-f:1', reason: 'timeout' });
    expect(shown[1]).toEqual({
      email,
      status:
        'Checked automatically on this device. Sender checks not available: Gmail did not answer in time.',
      note: HEADERS_HINT,
    });
    view.handle({ type: 'original', key: 'msg-f:1', html: '<p>no pre</p>' });
    await settle();
    expect(shown[2]?.status).toMatch(/Gmail's page could not be read/);
  });

  it('hides a Gmail email when none is open or the tab is left', () => {
    view.handle({ type: 'email', key: 'msg-f:1', email });
    view.handle({ type: 'no-email' });
    view.disconnected();
    expect(calls).toEqual([
      'show',
      'hide: idle',
      'status: Open an email in Gmail: while this panel is open, PhishLocal checks it automatically, on this device.',
      expect.stringMatching(/^status: Open Gmail in this tab/),
    ]);
  });

  it('leaves a pasted email alone until Gmail opens another one', () => {
    view.pasted();
    view.handle({ type: 'no-email' });
    view.disconnected();
    expect(calls).toEqual([]);
    view.handle({ type: 'email', key: 'msg-f:1', email });
    expect(calls).toEqual(['show']);
    view.cleared();
    view.handle({ type: 'no-email' });
    expect(calls.at(-1)).toMatch(/^status: Open an email in Gmail/);
  });

  it('reports an unreadable Gmail page as an error and hides the old email', () => {
    view.handle({ type: 'email', key: 'msg-f:1', email });
    view.handle({ type: 'unreadable' });
    expect(calls).toEqual([
      'show',
      'hide: unreadable',
      'status error: Could not read this email. Gmail may have changed its page.',
    ]);
  });

  it('ends the loading state when reading the headers fails unexpectedly', async () => {
    const failing = vi
      .spyOn(originalPage, 'headersFromOriginalPage')
      .mockRejectedValue(new Error('broken'));
    view.handle({ type: 'email', key: 'msg-f:1', email });
    view.handle({ type: 'original', key: 'msg-f:1', html: PAGE });
    await settle();
    expect(shown.at(-1)?.status).toMatch(/Gmail's page could not be read/);
    failing.mockRestore();
  });
});
