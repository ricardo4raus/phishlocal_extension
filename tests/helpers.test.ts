// Self-checks for the detectors in helpers.ts, so the structure tests cannot pass vacuously.
import { describe, expect, it } from 'vitest';
import {
  findRemoteCodeLoads,
  htmlResourceUrls,
  isNonLocalUrl,
  unsafeScriptSources,
} from './helpers';

describe('findRemoteCodeLoads', () => {
  it.each([
    `importScripts("https://evil.example/x.js")`,
    `self.importScripts('a.js', 'https://evil.example/x.js')`,
    `import("https://cdn.example/mod.js")`,
    `import(/* @vite-ignore */ 'http://cdn.example/mod.js')`,
    'import(`//cdn.example/mod.js`)',
    `import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.0.0/firebase-app.js';`,
    `import{a as b}from"https://cdn.example/m.js"`,
    `export * from "https://cdn.example/m.js";`,
    `import 'https://cdn.example/side-effect.js';`,
    `<script src="https://cdn.example/x.js"></script>`,
    `<script type="module" src='//cdn.example/x.js'></script>`,
    `el.innerHTML = "<script src=\\"https://cdn.example/x.js\\"></script>"`,
  ])('flags %s', (code) => {
    expect(findRemoteCodeLoads(code)).not.toEqual([]);
  });

  it.each([
    `const url = "https://firebasevertexai.googleapis.com/v1beta";`,
    `fetch("https://generativelanguage.googleapis.com/v1beta/models")`,
    `import { a } from './assets/chunk-abc.js';`,
    `import './assets/background.ts-BJ4N6UWp.js';`,
    `import("./chunk.js")`,
    `new URL("./worker.js", import.meta.url)`,
    `const x = Array.from("https://example.com");`,
    `<script type="module" src="./main.ts"></script>`,
    `<script type="module" crossorigin src="/assets/index.js"></script>`,
  ])('does not flag %s', (code) => {
    expect(findRemoteCodeLoads(code)).toEqual([]);
  });
});

describe('htmlResourceUrls / isNonLocalUrl', () => {
  it('extracts script src and link href', () => {
    const html = `<script src="/a.js"></script><link rel="stylesheet" href='b.css'><script>1</script>`;
    expect(htmlResourceUrls(html)).toEqual(['/a.js', 'b.css']);
  });

  it.each(['https://x/a.js', 'http://x/a.js', '//x/a.js', 'data:text/js,1'])(
    '%s is non-local',
    (url) => {
      expect(isNonLocalUrl(url)).toBe(true);
    },
  );

  it.each(['/assets/a.js', './a.js', 'a.js', '../a.css'])('%s is local', (url) => {
    expect(isNonLocalUrl(url)).toBe(false);
  });
});

describe('unsafeScriptSources', () => {
  it('accepts the MV3 default policy', () => {
    expect(unsafeScriptSources("script-src 'self' 'wasm-unsafe-eval'; object-src 'self'")).toEqual(
      [],
    );
  });

  it.each([
    "script-src 'self' 'unsafe-eval'",
    "script-src 'self' https://cdn.example",
    "default-src 'self' https:",
    "script-src 'self' *",
  ])('flags %s', (csp) => {
    expect(unsafeScriptSources(csp)).not.toEqual([]);
  });
});
