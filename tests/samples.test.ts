import { describe, expect, it } from 'vitest';
import { isEmail } from '../src/email';
import { readPaste } from '../src/paste/read-paste';
import { SAMPLE_EMAILS } from '../src/paste/samples';

/** Real brands that must not appear in samples (contest rule: no third-party trademarks). */
const REAL_BRANDS = [
  'paypal',
  'google',
  'gmail',
  'amazon',
  'apple',
  'microsoft',
  'netflix',
  'dhl',
  'ups',
  'fedex',
  'post',
  'postfinance',
  'swisscom',
  'raiffeisen',
  'sparkasse',
];

const hostOf = (url: string): string =>
  new URL(url.startsWith('www.') || !url.includes('://') ? `https://${url}` : url).hostname;

/** Each sample read like the paste area reads it (raw samples with their headers). */
const READ = new Map(
  await Promise.all(
    SAMPLE_EMAILS.map(async ({ id, email }) => [id, (await readPaste(email)).email] as const),
  ),
);

describe('sample emails', () => {
  it('have unique ids and labels', () => {
    const ids = SAMPLE_EMAILS.map((sample) => sample.id);
    const labels = SAMPLE_EMAILS.map((sample) => sample.label);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('include phishing and harmless examples', () => {
    expect(SAMPLE_EMAILS.some((sample) => sample.id.startsWith('phishing-'))).toBe(true);
    expect(SAMPLE_EMAILS.some((sample) => sample.id.startsWith('harmless-'))).toBe(true);
  });

  describe.each(SAMPLE_EMAILS.map((sample) => [sample.id, sample] as const))(
    '%s',
    (_id, sample) => {
      const email = READ.get(sample.id)!;

      it('becomes a valid email with sender, subject, text and links', () => {
        expect(isEmail(email)).toBe(true);
        expect(email.sender.address).not.toBe('');
        expect(email.subject).not.toBe('');
        expect(email.bodyText).not.toBe('');
        expect(email.links.length).toBeGreaterThan(0);
      });

      it('uses only .example domains', () => {
        const hosts = [
          email.sender.address.split('@')[1] ?? '',
          ...email.links.flatMap((link) => [
            hostOf(link.href),
            ...(link.text.includes('.') ? [hostOf(link.text)] : []),
          ]),
        ];
        expect(hosts.filter((host) => !host.endsWith('.example'))).toEqual([]);
      });

      it('names no real brand', () => {
        const words = JSON.stringify(sample)
          .toLowerCase()
          .split(/[^a-z]+/);
        expect(REAL_BRANDS.filter((brand) => words.includes(brand))).toEqual([]);
      });
    },
  );
});
