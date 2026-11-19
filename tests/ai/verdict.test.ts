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
    expect(verdict?.reasons[0]?.length).toBe(MAX_AI_TEXT);
    expect(verdict?.advice.length).toBe(MAX_AI_TEXT);
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
});

describe('cleanAiText', () => {
  it('stays fast on long hostile output', () => {
    const start = performance.now();
    cleanAiText(`${'a.'.repeat(50_000)}x`, { keepDomains: false });
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
