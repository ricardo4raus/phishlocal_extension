import { describe, expect, it } from 'vitest';
import { PROMPT_LIMITS } from '../../src/ai/prompt';
import { type Email, MAX_BODY_CHARS } from '../../src/email';
import {
  cloudCut,
  cloudData,
  greetingNames,
  modelNames,
  nameSearchText,
  nameVariants,
  redactText,
  type Removed,
} from '../../src/privacy/redact';
import type { Finding } from '../../src/rules';

const counts = (): Removed => ({ names: 0, emails: 0, numbers: 0, ibans: 0, links: 0 });
const redact = (text: string, names: string[] = []): string =>
  redactText(text, nameVariants(names), counts());

const email = (overrides: Partial<Email> = {}): Email => ({
  sender: { name: 'Lumora Bank', address: 'service@lumorabank.example' },
  subject: 'Your account',
  bodyText: 'Hello',
  links: [],
  truncated: false,
  ...overrides,
});

describe('redactText', () => {
  it('keeps only the host of links, also of links with an ID in them', () => {
    expect(redact('Log in at https://evil.example/login?user=anna.muster&id=829301 now')).toBe(
      'Log in at [link: evil.example] now',
    );
    expect(redact('See www.evil.example/a/b')).toBe('See [link: www.evil.example]');
  });

  it('keeps only the domain of email addresses', () => {
    expect(redact('Sent to Anna.Muster+news@Mail.Example today')).toBe(
      'Sent to [email]@mail.example today',
    );
  });

  it('also removes addresses with other letters, without a top-level domain or cut short', () => {
    // Found by the monkey test: a field cut in the middle of an address kept its local part.
    expect(redact('Von jürgen.müller@mail.example')).toBe('Von [email]@mail.example');
    expect(redact('Write to anna.muster@gmail now')).toBe('Write to [email]@gmail now');
    expect(redact('Cut here: zq.canary@private.')).toBe('Cut here: [email]@private.');
    expect(redact('Follow @lumorabank')).toBe('Follow @lumorabank');
  });

  it('removes IBANs, written in one piece or in groups', () => {
    expect(redact('Pay to CH93 0076 2011 6238 5295 7 today')).toBe('Pay to [iban] today');
    expect(redact('IBAN DE89370400440532013000.')).toBe('IBAN [iban].');
    // Letters after a code that looks like a country and two digits are no IBAN.
    expect(redact('Room AB12 this test word')).toBe('Room AB12 this test word');
  });

  it('removes phone, card and account numbers, but keeps dates and short amounts', () => {
    expect(redact('Call +41 79 123 45 67 or 044/123 45 67')).toBe('Call [number] or [number]');
    expect(redact('Card 4111 1111 1111 1111 expires')).toBe('Card [number] expires');
    expect(redact('Customer no. 0012345678')).toBe('Customer no. [number]');
    expect(redact('Pay 1,250.00 EUR by 19.11.2026')).toBe('Pay 1,250.00 EUR by 19.11.2026');
  });

  it('replaces names and their parts as whole words only', () => {
    expect(redact('Anna Muster, Anna and Muster, not Annabel', ['Anna Muster'])).toBe(
      '[name], [name] and [name], not Annabel',
    );
  });

  it('treats names as text, not as patterns', () => {
    expect(redact('Hi A.B, AxB, C+D and CCD', ['A.B', 'C+D', '(['])).toBe(
      'Hi [name], AxB, [name] and CCD',
    );
  });

  it('counts what it removed', () => {
    const removed = counts();
    redactText(
      'Anna: https://a.example x@y.example +41 79 123 45 67 CH93 0076 2011 6238 5295 7',
      nameVariants(['Anna']),
      removed,
    );
    expect(removed).toEqual({ names: 1, emails: 1, numbers: 1, ibans: 1, links: 1 });
  });

  it('sees through invisible characters and line breaks', () => {
    const zeroWidth = String.fromCodePoint(0x200b);
    expect(redact(`Call +41 79${zeroWidth} 123\n45 67`)).toBe('Call [number]');
  });
});

describe('greetingNames', () => {
  it.each([
    ['Dear Anna Muster,', 'Anna Muster'],
    ['Dear Mr. John Smith,', 'John Smith'],
    ['Hallo Anna,', 'Anna'],
    ['Sehr geehrte Frau Muster', 'Muster'],
    ['Bonjour Marie Dupont', 'Marie Dupont'],
    ['Chère Marie,', 'Marie'],
    ['Hola Lucía,', 'Lucía'],
    ['Ciao Giulia,', 'Giulia'],
    ['Olá João,', 'João'],
    ['dear Anna', 'Anna'],
  ])('finds the name in "%s"', (text, name) => {
    expect(greetingNames(text)).toEqual([name]);
  });

  it.each([
    'Hello Dear Customer,',
    'Dear Customer,',
    'Dear valued customer,',
    'Sehr geehrte Damen und Herren,',
    'Hallo Kunde,',
    'Hello there',
    'This is fine',
  ])('finds no name in "%s"', (text) => {
    expect(greetingNames(text)).toEqual([]);
  });
});

describe('nameVariants', () => {
  it('gives each name and its parts, longest first, without titles', () => {
    expect(nameVariants(['Frau Anna Muster'])).toEqual(['Frau Anna Muster', 'Muster', 'Anna']);
  });

  it('ignores strings that are no names', () => {
    expect(nameVariants(['', 'A', '42'])).toEqual([]);
  });

  it('matches a full name in any case, but a single word only as written or in capitals', () => {
    // Found in review round 2: 2-letter surnames leaked, and parts in any case hit ordinary words.
    expect(nameVariants(['Wei Li'])).toEqual(['Wei Li', 'Wei', 'Li']);
    expect(redact('Mr Li asked, LI too; wei li; al cliente', ['Wei Li', 'Al Ng'])).toBe(
      'Mr [name] asked, [name] too; [name]; al cliente',
    );
    expect(redact('Your account will be closed by the bank.', ['Will Smith', 'Bank'])).toBe(
      'Your account will be closed by the bank.',
    );
  });

  it('removes names before anything else, also inside links and addresses', () => {
    // Found in review round 3: shielding placeholders let a "[link: " in the email shield the
    // names behind it, and names in hosts were lower-cased and kept.
    expect(
      redact('Read [link: here. Muster said hi. https://evil.example/x', ['Anna Muster']),
    ).toBe('Read [link: here. [name] said hi. [link: evil.example]');
    expect(redact('Who is Muster.Anna? anna@muster-family.example', ['Anna Muster'])).toBe(
      'Who is [name].[name]? [email]@[name]-family.example',
    );
    expect(redact('See https://anna-bank.example/x', ['Anna'])).toBe(
      'See [link: [name]-bank.example]',
    );
    // Found in review round 4: a "[name]" broke the address and link patterns, so the rest went.
    expect(
      redact('Login hans.muster@private.example or kd4711-anna@x.example', ['Anna Muster']),
    ).toBe('Login [email]@private.example or [email]@x.example');
    expect(
      redact('verify at secure.lumora-bank.example/verify?uid=7f3a9c2e1bd4', ['Lumora Bank']),
    ).toBe('verify at [link: secure.[name]-[name].example]');
    // Short parts do not take hosts' endings, and prose is no address.
    expect(redact('Visit evil.li/x and bank/insurance, e-mail', ['Li Wei', 'Bank'])).toBe(
      'Visit [link: evil.li] and bank/insurance, e-mail',
    );
  });

  it('matches names in any case, except a lower-case word outside an address', () => {
    // Found in review round 3: only "as written" and capitals were tried.
    expect(redact('Dear ANNA, thanks, Anna. Herr STRAUẞ', ['ANNA MUSTER', 'Strauß'])).toBe(
      'Dear [name], thanks, [name]. Herr [name]',
    );
  });
});

describe('modelNames', () => {
  it('splits a list in one entry and says when names were left out', () => {
    // Found in review: such entries were skipped, and the cap dropped names silently.
    expect(modelNames(['Peter Meier, Claudia Schneider-Rossi & Johann und Eva'])).toEqual({
      names: ['Peter Meier', 'Claudia Schneider-Rossi', 'Johann', 'Eva'],
      dropped: false,
    });
    const many = Array.from({ length: 80 }, (_, i) => `Name${String(i).padStart(2, '0')}`);
    expect(modelNames(many).names).toHaveLength(50);
    expect(modelNames(many).dropped).toBe(true);
    expect(modelNames(['x'.repeat(61)])).toEqual({ names: [], dropped: true });
    // Found in review round 2: "\b" is ASCII-only, so "Renée" was split at its last "e".
    expect(modelNames(['Renée Dupont', 'Maria e Silva', 'José y María']).names).toEqual([
      'Renée Dupont',
      'Maria',
      'Silva',
      'José',
      'María',
    ]);
  });
});

describe('review round 1 fixes', () => {
  it('matches names in any case', () => {
    expect(redact('Anna Muster, holder: ANNA MUSTER, login anna muster.', ['Anna Muster'])).toBe(
      '[name], holder: [name], login [name].',
    );
  });

  it('keeps only the host of links without a scheme that have a path', () => {
    expect(redact('Login at secure-login.example/verify?uid=7f3a9c2e1bd4 now')).toBe(
      'Login at [link: secure-login.example] now',
    );
    // Found in review round 2: a port, a punycode ending, an IP address or a user name in front.
    expect(redact('a login.example:8080/v?uid=zq b')).toBe('a [link: login.example] b');
    expect(redact('a login.xn--p1ai/v?uid=zq b')).toBe('a [link: login.xn--p1ai] b');
    expect(redact('a 192.168.10.20/v?uid=zq b')).toBe('a [link: IP address] b');
    expect(redact('a anna.muster:pw@host.example/x b')).toBe('a [link: host.example] b');
    // Found in review round 3: a "?" in the password, and IPv6 addresses.
    expect(redact('a anna:1234?x@evil.example/verify b')).toBe(
      'a anna:1234?[link: evil.example] b',
    );
    expect(redact('a [2001:db8::1]/verify?uid=zq b')).toBe('a [link: IP address] b');
    expect(redact('Visit lumorabank.example today.')).toBe('Visit lumorabank.example today.');
  });

  it('keeps only a domain-shaped part after the @', () => {
    const data = JSON.parse(
      cloudData(email({ sender: { name: '', address: 'anna@mail.example (Anna Muster)' } }), [], [])
        .json,
    ) as { email: { from: { address: string } } };
    expect(data.email.from.address).toBe('[email]@mail.example');
  });

  it('sends a fixed text for rule messages that quote words of the email', () => {
    const zeroWidth = String.fromCodePoint(0x200b);
    const finding: Finding = {
      rule: 'hidden-characters',
      severity: 'warning',
      message: `Words contain invisible characters, a trick to slip past filters: An${zeroWidth}na.`,
      evidence: [],
    };
    expect(cloudData(email(), [finding], ['Anna']).json).not.toMatch(/An.?na/);
  });

  it('uses greeting names even when Nano sends a flood, and then warns', () => {
    const flood = Array.from({ length: 60 }, (_, i) => `Person${i}`);
    const data = cloudData(email({ bodyText: 'Dear Anna Muster, verify.' }), [], flood);
    expect(data.json).not.toContain('Anna');
    expect(data.namesChecked).toBe(false);
  });

  it('splits names at hyphens too', () => {
    expect(nameVariants(['Claudia Schneider-Rossi'])).toContain('Rossi');
  });

  it.each([
    // Found in review round 3: greeting words later in the name are surnames.
    ['Dear Mr Gentile,', 'Gentile'],
    ['Dear Anna Morgen,', 'Anna Morgen'],
    ['Guten Tag Anna Muster', 'Anna Muster'],
    ['Grüezi Anna', 'Anna'],
    ['Buenos días Lucía', 'Lucía'],
    ['Good morning Anna,', 'Anna'],
    ['Bom dia João', 'João'],
  ])('finds the name in "%s"', (text, name) => {
    expect(greetingNames(text)).toEqual([name]);
  });
});

describe('cloudCut', () => {
  it('drops the cut word and any digits before it, so no half phone number goes', () => {
    const text = `${'word '.repeat(10)}call +41 79 123 45 67`;
    const cutAt = text.indexOf('79') + 5;
    expect(cloudCut(text, cutAt)).toBe(`${'word '.repeat(10)}call`);
  });

  it('trims a body at its limit even when no source marked it as cut', () => {
    // Found by the monkey test: half an IBAN at the end of a body cut without the flag.
    const bodyText = `Pay CH93 0076 ${'\t'.repeat(MAX_BODY_CHARS - 18)}2011`;
    expect(cloudData(email({ bodyText }), [], []).json).not.toContain('0076');
  });

  it('also trims a field that was cut where the email was read', () => {
    // Found by the monkey test: a subject cut at its limit in the middle of an IBAN kept the half.
    expect(cloudCut('Pay to CH93 0076 2011', 200, true)).toBe('Pay to CH');
    expect(
      cloudData(email({ subject: `Pay CH93 0076 ${'\t'.repeat(982)}2011` }), [], []),
    ).toMatchObject({ json: expect.not.stringContaining('0076') as unknown });
  });

  it('keeps short text as it is, normalized', () => {
    expect(cloudCut('  a\n b ', 10)).toBe('a b');
  });
});

describe('cloudData', () => {
  const findings: Finding[] = [
    { rule: 'urgency', severity: 'warning', message: 'Time pressure', evidence: ['raw text'] },
  ];

  it('sends no raw headers, no full addresses and no raw evidence', () => {
    const data = cloudData(
      email({
        sender: { name: 'Anna Muster', address: 'anna.muster@mail.example' },
        bodyText: 'Dear Anna Muster, call +41 79 123 45 67.',
        links: [{ text: 'Log in', href: 'https://evil.example/login?id=anna' }],
        headers: {
          replyTo: [{ name: 'X', address: 'collect@evil.example' }],
          returnPath: 'bounce-anna=mail.example@lists.example',
          auth: {
            server: 'mx.google.com',
            spf: 'pass',
            dkim: [{ result: 'pass', domain: 'mail.example' }],
            dmarc: 'pass',
          },
        },
      }),
      findings,
      ['Anna Muster'],
    );
    const parsed = JSON.parse(data.json) as unknown;
    expect(parsed).toEqual({
      rule_findings: [{ rule: 'urgency', severity: 'warning', message: 'Time pressure' }],
      sender_checks: {
        spf: 'pass',
        dkim: ['pass (mail.example)'],
        dmarc: 'pass',
        sender_domain_confirmed: true,
      },
      email: {
        from: { name: '[name]', address: '[email]@mail.example' },
        reply_to: ['[email]@evil.example'],
        subject: 'Your account',
        links: [{ text: 'Log in', goes_to: 'evil.example' }],
        body: 'Dear [name], call [number].',
        body_cut: false,
      },
    });
    expect(data.json).not.toMatch(/anna|bounce|mx\.google|raw text/i);
    expect(data.namesChecked).toBe(true);
    expect(data.removed).toEqual({ names: 2, emails: 0, numbers: 1, ibans: 0, links: 0 });
  });

  it("keeps a company's sender name when Nano found no person's name in it", () => {
    const data = JSON.parse(cloudData(email(), [], []).json) as { email: { from: unknown } };
    expect(data.email.from).toEqual({ name: 'Lumora Bank', address: '[email]@lumorabank.example' });
  });

  it('removes the sender name entirely when Nano could not look for names', () => {
    const data = cloudData(email(), [], undefined);
    expect(JSON.parse(data.json)).toMatchObject({ email: { from: { name: '[name]' } } });
    expect(data.namesChecked).toBe(false);
    expect(data.removed.names).toBe(1);
  });

  it('removes greeting names even without Nano', () => {
    const data = cloudData(email({ bodyText: 'Hallo Anna, bitte zahlen.' }), [], undefined);
    expect(JSON.parse(data.json)).toMatchObject({ email: { body: 'Hallo [name], bitte zahlen.' } });
  });

  it('says when the body was cut, and Nano reads exactly the text that is sent', () => {
    const long = email({ bodyText: `Hello ${'word '.repeat(PROMPT_LIMITS.body)}` });
    const data = JSON.parse(cloudData(long, [], []).json) as {
      email: { body: string; body_cut: boolean };
    };
    expect(data.email.body_cut).toBe(true);
    expect(data.email.body.length).toBeLessThanOrEqual(PROMPT_LIMITS.body);
    expect(nameSearchText(long)).toContain(data.email.body);
  });
});
