import { describe, expect, it } from 'vitest';
import { PROMPT_LIMITS } from '../../src/ai/prompt';
import { type Email, MAX_BODY_CHARS } from '../../src/email';
import {
  cloudCut,
  type CloudData,
  cloudData,
  greetingNames,
  modelNames,
  nameSearchText,
  nameVariants,
  redactText,
  type RedactedKind,
  type RedactedSpan,
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

  it('removes names from link targets, address domains and DKIM domains too', () => {
    // Found in review round 5: these fields went out without the name filter.
    const data = JSON.parse(
      cloudData(
        email({
          sender: { name: '', address: 'info@anna-muster-secure.example' },
          bodyText: 'Dear Anna Muster,',
          links: [{ text: 'Open', href: 'https://secure.anna-muster.example/x?id=1' }],
          headers: {
            replyTo: [{ name: '', address: 'x@muster.example' }],
            auth: {
              server: 'mx.google.com',
              dkim: [{ result: 'pass', domain: 'anna-muster-secure.example' }],
            },
          },
        }),
        [],
        [],
      ).json,
    ) as unknown;
    expect(JSON.stringify(data)).not.toMatch(/anna|muster/i);
    expect(data).toMatchObject({
      email: {
        from: { address: '[email]@[name]-[name]-secure.example' },
        reply_to: ['[email]@[name].example'],
        links: [{ goes_to: 'secure.[name]-[name].example' }],
      },
    });
  });

  it('keeps "www." hosts as hosts and shows the host a link really goes to', () => {
    // Found in review round 6: the full filter turned "www." hosts into link placeholders, and a
    // host written to hide another one ("%2E") showed the false one.
    const data = cloudData(
      email({
        sender: { name: '', address: 'info@www.shop.example' },
        links: [
          { text: 'a', href: 'https://www.bank.example/login' },
          { text: 'b', href: 'https://lumorabank.example%2Eevil.example/x' },
          { text: 'c', href: 'https:evil.example/x' },
        ],
      }),
      [],
      [],
    );
    expect(JSON.parse(data.json)).toMatchObject({
      email: {
        from: { address: '[email]@www.shop.example' },
        links: [
          { goes_to: 'www.bank.example' },
          { goes_to: 'lumorabank.example.evil.example' },
          { goes_to: 'evil.example' },
        ],
      },
    });
    expect(data.removed.links).toBe(0);
    expect(redact('see https://lumorabank.example%2Eevil.example/x')).toBe(
      'see [link: lumorabank.example.evil.example]',
    );
  });

  it('finds names in hosts that end a sentence, in punycode, next to digits or full-width', () => {
    // Found in review round 7.
    expect(redact('Visit https://anna-muster.example. now', ['Anna Muster'])).toBe(
      'Visit [link: [name]-[name].example] now',
    );
    expect(redact('go https://m%C3%BCller.example/x', ['Müller'])).toBe(
      'go [link: [name].example]',
    );
    const data = JSON.parse(
      cloudData(
        email({
          sender: { name: '', address: 'x@ANNA1985.example' },
          bodyText: 'Dear Email User, Dear Anna,',
          links: [
            { text: 'a', href: 'https://müller.example./x' },
            {
              text: 'b',
              href: `https://${String.fromCodePoint(0xff41, 0xff4e, 0xff4e, 0xff41)}.example/`,
            },
          ],
        }),
        [],
        ['Müller'],
      ).json,
    ) as unknown;
    expect(data).toMatchObject({
      email: {
        from: { address: '[email]@[name]1985.example' },
        links: [{ goes_to: '[name].example' }, { goes_to: '[name].example' }],
      },
    });
  });

  it('reads only a clean host from a link', () => {
    // Found in review round 5: a percent-encoded path or punctuation rode along in the host.
    expect(redact('a https://evil.example%2Fuid%3D12345/x b')).toBe('a [link: evil.example] b');
    // The host the browser reads holds the name the text hid.
    expect(redact('a https://%41nna.example b', ['Anna'])).toBe('a [link: [name].example] b');
    expect(redact('(see https://evil.example).')).toBe('(see [link: evil.example]');
    expect(redact('a login.example\\verify?uid=7f3a9c2e b')).toBe('a [link: login.example] b');
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

/** An email from Lumora whose domain the given DMARC and DKIM results confirm or not. */
const lumoraEmail = (dmarc: string, dkim: string): Email =>
  email({
    sender: { name: 'Lumora', address: 'noreply@accounts.lumora.example' },
    subject: 'Lumora account',
    bodyText: 'Hi Anna Muster, you signed in to a site with Lumora.',
    headers: {
      replyTo: [],
      auth: {
        server: 'mx.google.com',
        spf: 'pass',
        dkim: [{ result: dkim, domain: 'lumora.example' }],
        dmarc,
      },
    },
  });

const parseCloudData = (json: string) =>
  JSON.parse(json) as {
    sender_checks: { dkim: string[] };
    email: { from: { name: string; address: string }; body: string };
  };

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
        sent_to_self: false,
      },
    });
    expect(data.json).not.toMatch(/anna|bounce|mx\.google|raw text/i);
    expect(data.namesChecked).toBe(true);
    // The sender and Reply-To addresses count too: they go out as "[email]@domain" and the
    // consent card lists and highlights them (28 Nov 2026).
    expect(data.removed).toEqual({ names: 2, emails: 2, numbers: 1, ibans: 0, links: 0 });
  });

  it('keeps every name at "standard", and removes the rest as at "high"', () => {
    const mail = email({
      sender: { name: 'Anna Muster', address: 'anna.muster@mail.example' },
      bodyText: 'Dear Anna Muster, pay to CH93 0076 2011 6238 5295 7 or call +41 79 123 45 67.',
      links: [{ text: 'Log in', href: 'https://secure.anna-muster.example/login?id=anna' }],
    });
    // Nano's list is ignored at "standard", even if one is passed.
    const data = cloudData(mail, findings, ['Anna Muster'], 'standard');
    const parsed = JSON.parse(data.json) as {
      email: { from: { name: string; address: string }; body: string; links: unknown[] };
    };
    expect(parsed.email.from).toEqual({ name: 'Anna Muster', address: '[email]@mail.example' });
    expect(parsed.email.body).toBe('Dear Anna Muster, pay to [iban] or call [number].');
    expect(parsed.email.links).toEqual([{ text: 'Log in', goes_to: 'secure.anna-muster.example' }]);
    expect(data.json).not.toMatch(/CH93|123 45 67|login\?id/);
    expect(data.namesChecked).toBe(true);
    expect(data.removed.names).toBe(0);
    // Without Nano's list the sender's name is kept too.
    const unchecked = JSON.parse(cloudData(mail, findings, undefined, 'standard').json) as {
      email: { from: { name: string } };
    };
    expect(unchecked.email.from.name).toBe('Anna Muster');
  });

  describe('a brand Nano takes for a name', () => {
    it('stays when the sender domain is confirmed (found in Chrome: "[email]@[name].com")', () => {
      const data = parseCloudData(
        cloudData(lumoraEmail('pass', 'pass'), [], ['Lumora', 'Anna Muster']).json,
      );
      expect(data.email.from).toEqual({
        name: 'Lumora',
        address: '[email]@accounts.lumora.example',
      });
      expect(data.sender_checks.dkim).toEqual(['pass (lumora.example)']);
      // The person is still removed.
      expect(data.email.body).toBe('Hi [name], you signed in to a site with Lumora.');
    });

    it('stays written in other case or with punctuation around it', () => {
      const data = parseCloudData(cloudData(lumoraEmail('pass', 'pass'), [], ['LUMORA.']).json);
      expect(data.email.from.name).toBe('Lumora');
    });

    it('is removed when only a DKIM signature passed: anyone can sign with a domain named like a person', () => {
      const data = parseCloudData(cloudData(lumoraEmail('none', 'pass'), [], ['Lumora']).json);
      expect(data.email.from.name).toBe('[name]');
      // A confirmed sender does not exempt another signer's label either.
      const signed = lumoraEmail('pass', 'pass');
      signed.bodyText = 'Anna said hello.';
      signed.headers?.auth?.dkim.push({ result: 'pass', domain: 'anna.example' });
      expect(parseCloudData(cloudData(signed, [], ['Anna']).json).email.body).toBe(
        '[name] said hello.',
      );
    });

    it('protects a person whose name is also the sender domain, when Nano lists the full name', () => {
      const anna = lumoraEmail('pass', 'pass');
      anna.sender = { name: 'Anna Muster', address: 'hello@anna.example' };
      anna.bodyText = 'Anna Muster here. Anna says hi.';
      const data = parseCloudData(cloudData(anna, [], ['Anna', 'Anna Muster']).json);
      expect(data.email.from).toEqual({ name: '[name]', address: '[email]@[name].example' });
      expect(data.email.body).toBe('[name] here. [name] says hi.');
    });

    it('is removed when no check confirmed the domain', () => {
      const data = parseCloudData(cloudData(lumoraEmail('fail', 'fail'), [], ['Lumora']).json);
      expect(data.email.from).toEqual({
        name: '[name]',
        address: '[email]@accounts.[name].example',
      });
      expect(data.sender_checks.dkim).toEqual(['fail ([name].example)']);
    });

    it('is removed as part of a longer name, and when a greeting names it', () => {
      const longer = parseCloudData(
        cloudData(lumoraEmail('pass', 'pass'), [], ['Anna Lumora']).json,
      );
      expect(longer.email.from.name).toBe('[name]');
      const greeted = lumoraEmail('pass', 'pass');
      greeted.bodyText = 'Dear Mr Lumora, you signed in.';
      expect(parseCloudData(cloudData(greeted, [], []).json).email.body).toBe(
        'Dear Mr [name], you signed in.',
      );
    });
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

/* ------------------------------------------------------------------------------------------------
 * Positions of the placeholders (28 Nov 2026): the consent card highlights them and shows the
 * original on the device. They must come from the filter's own replacements, never from a search
 * of the data, and the JSON they point into must stay exactly `JSON.stringify(_, null, 2)`.
 * --------------------------------------------------------------------------------------------- */
describe('cloudData spans', () => {
  const spansOf = (data: CloudData, kind?: RedactedKind) =>
    data.spans
      .filter((span) => kind === undefined || span.kind === kind)
      .map((span) => [data.json.slice(span.start, span.end), span.original]);

  /** Every span points at a placeholder of its kind, spans nest or stay apart, the JSON is canonical. */
  function wellFormed(data: CloudData): void {
    expect(data.json).toBe(JSON.stringify(JSON.parse(data.json), null, 2));
    const shape: Record<RedactedKind, RegExp> = {
      name: /^\[name\]$/,
      email: /^\[email\](?:@.*)?$/,
      number: /^\[number\]$/,
      iban: /^\[iban\]$/,
      link: /^\[link(?:: .*)?\]$/,
    };
    let previous: RedactedSpan | undefined;
    for (const span of data.spans) {
      expect(span.start).toBeGreaterThanOrEqual(0);
      expect(span.end).toBeGreaterThan(span.start);
      expect(span.end).toBeLessThanOrEqual(data.json.length);
      expect(data.json.slice(span.start, span.end)).toMatch(shape[span.kind]);
      if (previous) {
        expect(span.start).toBeGreaterThanOrEqual(previous.start);
        // Inside the previous one, or after it: never half in, half out.
        expect(span.end <= previous.end || span.start >= previous.end).toBe(true);
      }
      previous = span;
    }
    const counted: Removed = { names: 0, emails: 0, numbers: 0, ibans: 0, links: 0 };
    for (const span of data.spans) counted[`${span.kind}s`]++;
    expect(data.removed).toEqual(counted);
  }

  it('records every kind with its original, in JSON offsets', () => {
    const data = cloudData(
      email({
        sender: { name: 'Anna Muster', address: 'anna.muster@mail.example' },
        bodyText:
          'Dear Anna Muster, pay CH93 0076 2011 6238 5295 7, call +41 79 123 45 67, write to ' +
          'help@shop.example or open https://evil.example/pay?u=1',
      }),
      [],
      ['Anna Muster'],
    );
    wellFormed(data);
    expect(spansOf(data, 'name')).toEqual([
      ['[name]', 'Anna Muster'],
      ['[name]', 'Anna Muster'],
    ]);
    expect(spansOf(data, 'email')).toEqual([
      ['[email]@mail.example', 'anna.muster@mail.example'],
      ['[email]@shop.example', 'help@shop.example'],
    ]);
    expect(spansOf(data, 'iban')).toEqual([['[iban]', 'CH93 0076 2011 6238 5295 7']]);
    expect(spansOf(data, 'number')).toEqual([['[number]', '+41 79 123 45 67']]);
    expect(spansOf(data, 'link')).toEqual([
      ['[link: evil.example]', 'https://evil.example/pay?u=1'],
    ]);
  });

  it('keeps the offsets right after JSON escaping and surrogate pairs', () => {
    const body =
      'He said "hi"\\ and\nwent \u{1F600}anna@x.example\u{1F600} \u2028 \u0007 \u{1F600}+41 79 123 45 67';
    const data = cloudData(email({ sender: { name: '', address: '' }, bodyText: body }), [], []);
    wellFormed(data);
    expect(spansOf(data, 'email')).toEqual([['[email]@x.example', 'anna@x.example']]);
    expect(spansOf(data, 'number')).toEqual([['[number]', '+41 79 123 45 67']]);
  });

  it('nests a name or a number found inside a link host or an address domain', () => {
    const data = cloudData(
      email({
        sender: { name: '', address: 'info@0791234567.example' },
        bodyText: 'Dear Anna, see https://secure.anna-muster.example/x and anna@anna.example',
      }),
      [],
      ['Anna Muster'],
    );
    wellFormed(data);
    expect(spansOf(data)).toEqual([
      ['[email]@[number].example', 'info@0791234567.example'],
      ['[number]', '0791234567'],
      ['[name]', 'Anna'],
      ['[link: secure.[name]-[name].example]', 'https://secure.anna-muster.example/x'],
      ['[name]', 'anna'],
      ['[name]', 'muster'],
      ['[email]@[name].example', 'anna@anna.example'],
      ['[name]', 'anna'],
    ]);
  });

  it('gives a link whose host URL rewrote its own original, from the host it cleaned', () => {
    const data = cloudData(email({ bodyText: 'Open https://%41nna.example/x now' }), [], ['Anna']);
    wellFormed(data);
    expect(spansOf(data, 'link')).toEqual([['[link: [name].example]', 'https://%41nna.example/x']]);
    expect(spansOf(data, 'name')).toEqual([['[name]', 'anna']]);
  });

  it('marks nothing an attacker wrote to look removed, and survives token-shaped text', () => {
    const body =
      'Hi [name], mail [email]@x.example or [link: evil.example]; $& $1 $` \uE000abc0\uE000 end';
    const data = cloudData(email({ sender: { name: '', address: '' }, bodyText: body }), [], []);
    wellFormed(data);
    expect(data.spans).toEqual([]);
    expect(JSON.parse(data.json)).toMatchObject({ email: { body } });
  });

  it('counts the sender and Reply-To addresses at Standard, and the sender name at High', () => {
    const data = cloudData(
      email({
        sender: { name: 'Anna Muster', address: 'anna@mail.example' },
        headers: { replyTo: [{ name: '', address: 'collect@evil.example' }] },
      }),
      [],
      undefined,
      'standard',
    );
    wellFormed(data);
    expect(spansOf(data)).toEqual([
      ['[email]@mail.example', 'anna@mail.example'],
      ['[email]@evil.example', 'collect@evil.example'],
    ]);
    const high = cloudData(
      email({ sender: { name: 'Anna Muster', address: 'anna@mail.example' } }),
      [],
      undefined,
      'high',
    );
    wellFormed(high);
    expect(spansOf(high, 'name')).toEqual([['[name]', 'Anna Muster']]);
  });

  it('gives a placeholder that a later match cut into no span of its own', () => {
    // Found by the monkey test: "www.compte" becomes "[link: www.compte]" first, then the bare
    // link pattern reads "67.co.uk?[link:" up to the space. The text is as before; only the
    // whole new placeholder gets a span, the cut piece none.
    const data = cloudData(
      email({ sender: { name: '', address: '' }, bodyText: 'See 67.co.uk?www.compte now' }),
      [],
      [],
    );
    wellFormed(data);
    expect(JSON.parse(data.json)).toMatchObject({
      email: { body: 'See [link: 67.co.uk] www.compte] now' },
    });
    expect(spansOf(data)).toEqual([['[link: 67.co.uk]', '67.co.uk?www.compte']]);
  });

  it('handles a placeholder at the start or end of a trimmed text, and an IP link', () => {
    const data = cloudData(
      email({
        sender: { name: '', address: '' },
        subject: '  +41 79 123 45 67  ',
        bodyText: 'http://192.0.2.1/x ',
      }),
      [],
      [],
    );
    wellFormed(data);
    expect(spansOf(data)).toEqual([
      ['[number]', '+41 79 123 45 67'],
      ['[link: IP address]', 'http://192.0.2.1/x'],
    ]);
  });
});
