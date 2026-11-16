import { describe, expect, it } from 'vitest';
import type { Email } from '../../src/email';
import { parsePastedEmail } from '../../src/paste/parse-pasted-email';
import { SAMPLE_EMAILS } from '../../src/paste/samples';
import { checkEmail, MAX_FINDINGS } from '../../src/rules';

const sample = (id: string): Email => {
  const found = SAMPLE_EMAILS.find((candidate) => candidate.id === id);
  if (!found) throw new Error(`no sample ${id}`);
  return parsePastedEmail(found.email);
};

const rules = (email: Email): string[] =>
  checkEmail(email).map((finding) => `${finding.rule}:${finding.severity}`);

describe('checkEmail on the samples', () => {
  it('flags the bank phishing sample', () => {
    expect(rules(sample('phishing-bank-en'))).toEqual([
      'brand-in-domain:warning',
      'link-text-mismatch:warning',
      'credentials:warning',
      'urgency:info',
      'threat:info',
    ]);
  });

  it('flags the parcel phishing sample', () => {
    expect(rules(sample('phishing-parcel-de'))).toEqual(['payment:warning', 'threat:info']);
  });

  it('finds no warning in the harmless sample', () => {
    expect(rules(sample('harmless-newsletter-en'))).toEqual([]);
  });

  it('flags every phishing sample and no harmless one', () => {
    for (const { id, email } of SAMPLE_EMAILS) {
      const serious = checkEmail(parsePastedEmail(email)).some(
        (finding) => finding.severity !== 'info',
      );
      expect(serious, id).toBe(id.startsWith('phishing-'));
    }
  });
});

describe('checkEmail', () => {
  const base: Email = {
    sender: { name: '', address: 'a@news.example' },
    subject: '',
    bodyText: '',
    links: [],
    truncated: false,
  };

  it('puts the most severe findings first', () => {
    const email: Email = {
      ...base,
      subject: 'Urgent',
      links: [
        { text: 'news.example', href: 'https://other.example/' },
        { text: 'Open', href: 'javascript:alert(1)' },
      ],
    };
    expect(rules(email)).toEqual([
      'dangerous-link:danger',
      'link-text-mismatch:warning',
      'urgency:info',
    ]);
  });

  it('lists repeated links once and caps the findings', () => {
    const repeated = Array.from({ length: 50 }, () => ({ text: 'x', href: 'javascript:x' }));
    expect(rules({ ...base, links: repeated })).toEqual(['dangerous-link:danger']);

    const many = Array.from({ length: 50 }, (_, i) => ({
      text: `site${i}.example`,
      href: `https://other${i}.example/`,
    }));
    expect(checkEmail({ ...base, links: many })).toHaveLength(MAX_FINDINGS);
  });

  it('finds nothing in an empty email', () => {
    expect(checkEmail({ ...base, sender: { name: '', address: '' } })).toEqual([]);
  });
});
