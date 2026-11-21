import { describe, expect, it } from 'vitest';
import {
  cleanAiText,
  MAX_AI_TEXT,
  MAX_REASONS,
  overallRisk,
  parseVerdict,
  ruleRisk,
  VERDICT_SCHEMA,
} from '../../src/ai/verdict';
import type { Finding } from '../../src/rules';

const finding = (severity: Finding['severity']): Finding => ({
  rule: 'urgency',
  severity,
  message: 'x',
  evidence: [],
});

/** Digits in Arabic-Indic script, e.g. for "49". */
const arabicIndic = (digits: string): string =>
  [...digits].map((digit) => String.fromCodePoint(0x0660 + Number(digit))).join('');

describe('parseVerdict', () => {
  it('reads a valid answer, also inside a code fence', () => {
    const answer = { risk: 'suspicious', reasons: ['Time pressure.'], advice: 'Do not reply.' };
    expect(parseVerdict(JSON.stringify(answer))).toEqual(answer);
    expect(parseVerdict(`\`\`\`json\n${JSON.stringify(answer)}\n\`\`\``)).toEqual(answer);
  });

  it.each([
    ['no JSON', 'The email looks fine.'],
    ['an unknown risk', '{"risk":"fine","reasons":[],"advice":""}'],
    ['a missing field', '{"risk":"safe","reasons":[]}'],
    ['reasons that are not text', '{"risk":"safe","reasons":[1],"advice":""}'],
    ['a list instead of an object', '["safe"]'],
    ['null', 'null'],
  ])('rejects %s', (_label, text) => {
    expect(parseVerdict(text)).toBeUndefined();
  });

  it('keeps at most five reasons and cuts long text', () => {
    const verdict = parseVerdict(
      JSON.stringify({
        risk: 'dangerous',
        reasons: Array.from({ length: 8 }, (_, i) => `Reason ${i} ${'x'.repeat(500)}`),
        advice: 'a'.repeat(1_000),
      }),
    );
    expect(verdict?.reasons).toHaveLength(MAX_REASONS);
    // A short partial last word goes; a long word without dots stays, cut.
    expect(verdict?.reasons[0]).toBe(`Reason 0 ${'x'.repeat(MAX_AI_TEXT - 10)}…`);
    expect(verdict?.advice).toBe(`${'a'.repeat(MAX_AI_TEXT - 1)}…`);
    const words = parseVerdict(
      JSON.stringify({ risk: 'safe', reasons: ['word '.repeat(100)], advice: '' }),
    );
    expect(words?.reasons[0]?.length).toBeLessThanOrEqual(MAX_AI_TEXT);
    expect(words?.reasons[0]).toMatch(/^(?:word )*word…$/);
  });

  it('never leaves a domain or a loose accent that a cut or an invisible mark made', () => {
    // Found by the monkey test: the cut shortened a 30-letter ending to a valid-looking domain.
    const advice = `${'x'.repeat(280)} 0;.co.uk${'d'.repeat(30)}`;
    expect(cleanAiText(advice, { keepDomains: false })).toBe(`${'x'.repeat(280)}…`);
    const glued = `${'dringend'.repeat(30)}&#0;.co.uk${'d'.repeat(60)}`;
    expect(cleanAiText(glued, { keepDomains: false })).toBe(`${'dringend'.repeat(30)}&#0;…`);
    // Found in review: text without spaces lost everything but the ellipsis.
    const japanese = 'メール'.repeat(120);
    expect(cleanAiText(japanese)).toBe(`${japanese.slice(0, MAX_AI_TEXT - 1)}…`);
    // Review round 3: sentences end in "。" (read as "."); all whole sentences stay.
    const sentence = `${'メール'.repeat(9)}。`;
    const kept = cleanAiText(sentence.repeat(20));
    expect(kept).toBe(`${sentence.replace('。', '.').repeat(10)}…`);
    // Found by the monkey test: "https://" before a space is no link, but "https://…" reads as one.
    const scheme = `${'y'.repeat(280)} see https:// ${'z'.repeat(30)}`;
    expect(cleanAiText(scheme)).toBe(`${'y'.repeat(280)} see…`);
    // Found by the monkey test: an accent behind a direction mark stayed loose, so the known
    // address passed and then showed as "examplé".
    const known = new Set(['news@lumorabank.example']);
    const marked = `From news@lumorabank.example${String.fromCodePoint(0x200f, 0x0301)} today`;
    // Joined, "lumorabank.examplé" is no longer the known address, so it is removed.
    expect(cleanAiText(marked, { knownAddresses: known })).toBe('From [removed]é today');
  });

  it('removes links, addresses and phone numbers an injection could plant', () => {
    const verdict = parseVerdict(
      JSON.stringify({
        risk: 'safe',
        reasons: [
          'The link goes to paypa1.com, see https://evil.example/login or call +41 44 123 45 67',
        ],
        advice: 'Verify your account at secure-verify.example or write to help@evil.example.',
      }),
    );
    expect(verdict?.reasons).toEqual([
      'The link goes to paypa1.com, see [removed] or call [removed]',
    ]);
    expect(verdict?.advice).toBe('Verify your account at [removed] or write to [removed].');
  });

  it('also removes them when line breaks, invisible or fullwidth characters split them', () => {
    // Found by the monkey test: the spaces were joined only after the patterns had run.
    const zeroWidth = String.fromCodePoint(0x200b);
    const fullwidthFive = String.fromCodePoint(0xff15);
    const verdict = parseVerdict(
      JSON.stringify({
        risk: 'safe',
        reasons: [
          'Call +1\n555\t123\n4567',
          `Call +1 555${zeroWidth} 123 4567`,
          `Call +1 ${fullwidthFive.repeat(3)} 123 4567`,
          `Open https://${zeroWidth}evil.example`,
          'Call +1 555 123 4567https://evil.example/login',
        ],
        advice: `Write to help${zeroWidth}@evil.example`,
      }),
    );
    expect(verdict?.reasons).toEqual([
      'Call [removed]',
      'Call [removed]',
      'Call [removed]',
      'Open [removed]',
      'Call [removed][removed]',
    ]);
    expect(verdict?.advice).toBe('Write to [removed]');
  });

  it('removes links of any scheme, phone numbers in any digits, and domains with other dots', () => {
    // Found in review: these shapes passed every pattern.
    const ideographicStop = String.fromCodePoint(0x3002);
    const halfwidthStop = String.fromCodePoint(0xff61);
    const verdict = parseVerdict(
      JSON.stringify({
        risk: 'safe',
        reasons: [
          'Confirm at ftp://evil.example/login',
          'Call +49 30/1234 56789',
          `Call +${arabicIndic('49')} ${arabicIndic('30')} ${arabicIndic('12345678')}`,
          `Call 0170${String.fromCodePoint(0x2013)}1234567`,
        ],
        advice: `Log in at paypa1${halfwidthStop}secure${ideographicStop}example`,
      }),
    );
    expect(verdict?.reasons).toEqual([
      'Confirm at [removed]',
      'Call [removed]',
      'Call [removed]',
      'Call [removed]',
    ]);
    expect(verdict?.advice).toBe('Log in at [removed]');
  });
});

describe('cleanAiText', () => {
  it('keeps dates and year ranges, which the phone pattern also matches', () => {
    // Found in review: deadlines are the evidence of a reason ("pay by 19/11/2026").
    const enDash = String.fromCodePoint(0x2013);
    for (const date of [
      '19.11.2026',
      '19/11/2026',
      '19/11/26',
      '2026-11-19',
      `2020${enDash}2025`,
    ]) {
      expect(cleanAiText(`Pay by ${date} or lose access.`)).toBe(`Pay by ${date} or lose access.`);
    }
  });

  it('keeps a date next to a time or another date, but not a phone number next to it', () => {
    // Found in review round 4: the time was part of the match, so the date went too.
    expect(cleanAiText('Frist 19.11.2026 12:00 Uhr')).toBe('Frist 19.11.2026 12:00 Uhr');
    expect(cleanAiText('Bis 19.11.2026 - 20.11.2026')).toBe('Bis 19.11.2026 - 20.11.2026');
    expect(cleanAiText('Call +41 79 123 45 67 by 19.11.2026')).toBe('Call [removed] by 19.11.2026');
    // A phone number right next to a date takes the date with it (the safe side).
    expect(cleanAiText('Call 19.11.2026 079 123 45 67')).toBe('Call [removed]');
    // Found in review round 5: a date between the groups split the number into short pieces.
    expect(cleanAiText('Call 079 19.11.2026 123 4567')).toBe('Call [removed]');
    expect(cleanAiText('Call 07912 19.11.2026 34567')).toBe('Call [removed]');
  });

  it('checks dates in other scripts by value too', () => {
    // Found in review round 4: Arabic-Indic digits skipped the value check.
    const implausible = `${arabicIndic('99')}.${arabicIndic('99')}.${arabicIndic('9999')}`;
    const real = `${arabicIndic('19')}.${arabicIndic('11')}.${arabicIndic('2026')}`;
    expect(cleanAiText(`Call ${implausible} now`)).toBe('Call [removed] now');
    expect(cleanAiText(`Pay by ${real} now`)).toBe(`Pay by ${real} now`);
  });

  it('still removes phone numbers that are shaped like dates', () => {
    // Found in review round 3: the first date check kept these as "dates".
    for (const number of ['0791-2345', '555-12-3456', '079.12.3456', '41.79.123', '12.34.5678']) {
      expect(cleanAiText(`Call ${number} to verify.`)).toBe('Call [removed] to verify.');
    }
  });

  it('removes phone numbers grouped with any dash, the minus sign, dots or bullets', () => {
    for (const code of [0x2212, 0x00b7, 0x2022, 0x301c, 0x2027, 0x30fb]) {
      const separator = String.fromCodePoint(code);
      expect(cleanAiText(`Call +49 30${separator}1234${separator}5678 now`)).toBe(
        'Call [removed] now',
      );
    }
  });

  it('stays fast on long hostile output', () => {
    const start = performance.now();
    cleanAiText(`${'a.'.repeat(50_000)}x`, { keepDomains: false });
    // Long digit runs split by spaces, dates in between, digits of another script.
    cleanAiText('1 '.repeat(5_000));
    cleanAiText('19.11.2026 1 '.repeat(500));
    cleanAiText(`${arabicIndic('1234567890').repeat(200)} `.repeat(2));
    expect(performance.now() - start).toBeLessThan(200);
  });
});

describe('rules as the lower limit', () => {
  it('maps findings to a risk', () => {
    expect(ruleRisk([])).toBe('safe');
    expect(ruleRisk([finding('info')])).toBe('safe');
    expect(ruleRisk([finding('info'), finding('warning')])).toBe('suspicious');
    expect(ruleRisk([finding('warning'), finding('danger')])).toBe('dangerous');
  });

  it('lets the AI raise the risk, never lower it', () => {
    expect(overallRisk('safe', 'dangerous')).toBe('dangerous');
    expect(overallRisk('suspicious', 'dangerous')).toBe('dangerous');
    expect(overallRisk('dangerous', 'safe')).toBe('dangerous');
    expect(overallRisk('suspicious', 'safe')).toBe('suspicious');
    expect(overallRisk(undefined, 'suspicious')).toBe('suspicious');
  });

  it('does not let the AI alone raise the risk of a confirmed sender without rule warnings', () => {
    const confirmed = { senderConfirmed: true };
    expect(overallRisk('suspicious', 'safe', confirmed)).toBe('safe');
    expect(overallRisk('dangerous', 'safe', confirmed)).toBe('safe');
    // With a rule warning, the AI may still raise it.
    expect(overallRisk('dangerous', 'suspicious', confirmed)).toBe('dangerous');
    expect(overallRisk('safe', 'dangerous', confirmed)).toBe('dangerous');
  });

  it('has a schema with only the basic keywords Chrome supports', () => {
    expect(VERDICT_SCHEMA.required).toEqual(['risk', 'reasons', 'advice']);
    expect(VERDICT_SCHEMA.properties.risk.enum).toEqual(['safe', 'suspicious', 'dangerous']);
    // Every key in the schema: the three field names and the basic keywords, nothing else.
    const keys = new Set(JSON.stringify(VERDICT_SCHEMA).match(/"\w+":/g));
    expect(keys).toEqual(
      new Set([
        '"type":',
        '"properties":',
        '"risk":',
        '"enum":',
        '"reasons":',
        '"items":',
        '"advice":',
        '"required":',
      ]),
    );
  });
});

describe("the email's own addresses", () => {
  it('stay readable in reasons, while planted ones and the advice are cleaned', () => {
    const verdict = parseVerdict(
      JSON.stringify({
        risk: 'suspicious',
        reasons: ['The sender No-Reply@Accounts.Google.com differs from help@evil.example.'],
        advice: 'Write to no-reply@accounts.google.com.',
      }),
      new Set(['no-reply@accounts.google.com']),
    );
    expect(verdict?.reasons).toEqual([
      'The sender No-Reply@Accounts.Google.com differs from [removed].',
    ]);
    expect(verdict?.advice).toBe('Write to [removed].');
  });
});
