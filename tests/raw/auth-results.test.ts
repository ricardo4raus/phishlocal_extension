import { describe, expect, it } from 'vitest';
import { parseAuthResults } from '../../src/raw/auth-results';

describe('parseAuthResults', () => {
  it('reads the results Gmail writes', () => {
    expect(
      parseAuthResults(
        'mx.google.com; dkim=pass header.i=@mailer.shop.example header.s=hs2 header.b=Lr8MaGp+; ' +
          'dkim=pass header.i=@shop.example header.s=hs1 header.b=dFQd5WFe; ' +
          'spf=pass (google.com: domain of bounce@mailer.shop.example designates 192.0.2.25 as permitted sender) ' +
          'smtp.mailfrom=bounce@mailer.shop.example; ' +
          'dmarc=pass (p=QUARANTINE sp=QUARANTINE dis=NONE) header.from=shop.example',
      ),
    ).toEqual({
      server: 'mx.google.com',
      spf: 'pass',
      dkim: [
        { result: 'pass', domain: 'mailer.shop.example' },
        { result: 'pass', domain: 'shop.example' },
      ],
      dmarc: 'pass',
    });
  });

  it('reads failures, versions, header.d and odd spacing', () => {
    expect(
      parseAuthResults(
        'mx.receiver.example 1;\r\n\tspf = softfail smtp.mailfrom=x.example;\r\n\tdkim/1=fail header.d=Bank.Example;dmarc=FAIL header.from=bank.example',
      ),
    ).toEqual({
      server: 'mx.receiver.example',
      spf: 'softfail',
      dkim: [{ result: 'fail', domain: 'bank.example' }],
      dmarc: 'fail',
    });
  });

  it('ignores semicolons and results inside comments and quotes', () => {
    expect(
      parseAuthResults(
        'mx.example; spf=fail (comment; dmarc=pass (nested) still comment) smtp.mailfrom="a;dmarc=pass@x.example"; dmarc=fail',
      ),
    ).toMatchObject({ spf: 'fail', dmarc: 'fail' });
  });

  it('keeps the first result per method and caps DKIM results', () => {
    const results = parseAuthResults(
      `mx.example; dmarc=fail; dmarc=pass; ${Array.from({ length: 20 }, () => 'dkim=none').join('; ')}`,
    );
    expect(results?.dmarc).toBe('fail');
    expect(results?.dkim).toHaveLength(10);
  });

  it.each(['', ';spf=pass', '<script>; spf=pass', '(only a comment)'])(
    'rejects a value without a server name: %j',
    (value) => {
      expect(parseAuthResults(value)).toBeUndefined();
    },
  );

  it('stays fast on long hostile values', () => {
    const start = performance.now();
    parseAuthResults(`mx.example; ${'('.repeat(50_000)}${'spf=pass; '.repeat(10_000)}`);
    parseAuthResults(`mx.example; ${'"'.repeat(1)}${'a;'.repeat(100_000)}`);
    expect(performance.now() - start).toBeLessThan(500);
  });
});
