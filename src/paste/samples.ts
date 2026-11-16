/*
 * Built-in sample emails, so the demo works without a real inbox and offline.
 *
 * Made up on purpose: fictional brands only (the contest rules forbid third-party trademarks in
 * the submission) and only `.example` domains (reserved, never a real website). They are data:
 * the HTML is parsed with parse5 like a paste, never rendered.
 */
import type { PastedEmail } from './parse-pasted-email';

export interface SampleEmail {
  id: string;
  label: string;
  email: PastedEmail;
}

export const SAMPLE_EMAILS: readonly SampleEmail[] = [
  {
    id: 'phishing-bank-en',
    label: 'Phishing: bank account locked (English)',
    email: {
      sender: 'Lumora Bank Security <security@lumora-bank-verify.example>',
      subject: 'Urgent: your account has been locked',
      text: [
        'Dear customer,',
        '',
        'We detected unusual activity and locked your Lumora Bank account.',
        'Confirm your identity within 24 hours or your account will be closed permanently.',
        '',
        'Confirm now: lumorabank.example/secure',
        '',
        'Lumora Bank Security Team',
      ].join('\n'),
      html: [
        '<p>Dear customer,</p>',
        '<p>We detected unusual activity and locked your Lumora Bank account.<br>',
        'Confirm your identity within 24 hours or your account will be closed permanently.</p>',
        '<p>Confirm now: <a href="https://lumora-bank-verify.example/login?id=4821">',
        'lumorabank.example/secure</a></p>',
        '<p>Lumora Bank Security Team</p>',
      ].join(''),
    },
  },
  {
    id: 'phishing-parcel-de',
    label: 'Phishing: Paket mit Zollgebühr (Deutsch)',
    email: {
      sender: 'Paketo Express <noreply@paketo-zustellung.example>',
      subject: 'Ihr Paket konnte nicht zugestellt werden',
      text: [
        'Guten Tag',
        '',
        'Ihr Paket wartet im Verteilzentrum. Es fehlt eine Zollgebühr von CHF 1.99.',
        'Bezahlen Sie heute, sonst wird das Paket an den Absender zurückgeschickt.',
        '',
        'Jetzt bezahlen: https://paketo-zustellung.example/gebuehr',
        '',
        'Ihr Paketo Express Team',
      ].join('\n'),
    },
  },
  {
    id: 'harmless-newsletter-en',
    label: 'Harmless: monthly statement (English)',
    email: {
      sender: 'Lumora Bank <news@lumorabank.example>',
      subject: 'Your November statement is ready',
      text: [
        'Hello,',
        '',
        'Your monthly statement is ready in online banking.',
        'We will never ask for your password by email.',
        '',
        'Open online banking: lumorabank.example',
        '',
        'Lumora Bank',
      ].join('\n'),
      html: [
        '<p>Hello,</p>',
        '<p>Your monthly statement is ready in online banking.<br>',
        'We will never ask for your password by email.</p>',
        '<p>Open online banking: <a href="https://lumorabank.example/">lumorabank.example</a></p>',
        '<p>Lumora Bank</p>',
      ].join(''),
    },
  },
];
