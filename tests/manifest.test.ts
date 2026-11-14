import { describe, expect, it } from 'vitest';
import {
  type Manifest,
  contentScriptMatches,
  cspProblems,
  fileExistsExactCase,
  fromRoot,
  readJson,
  repoRoot,
  webAccessibleResourceProblems,
} from './helpers';

/*
 * PERMISSION ALLOW-LISTS
 * These must be updated deliberately whenever the extension needs a new permission.
 * Every addition widens what PhishLocal can access, so it needs a reason (privacy is the core
 * selling point) and should be mentioned in the PR description.
 */
const ALLOWED_PERMISSIONS: readonly string[] = ['sidePanel'];
const ALLOWED_HOST_PERMISSIONS: readonly string[] = [];
const ALLOWED_OPTIONAL_PERMISSIONS: readonly string[] = [];
const ALLOWED_OPTIONAL_HOST_PERMISSIONS: readonly string[] = [];
/** Pages content scripts may run on. Will become ['https://mail.google.com/*'] for Gmail. */
const ALLOWED_CONTENT_SCRIPT_MATCHES: readonly string[] = [];

const sorted = (list: readonly string[] | undefined): string[] => [...(list ?? [])].sort();

const manifest = readJson<Manifest>(fromRoot('manifest.json'));
const pkg = readJson<{ version: string }>(fromRoot('package.json'));

describe('manifest.json (source)', () => {
  it('is Manifest V3', () => {
    expect(manifest.manifest_version).toBe(3);
  });

  it('is named PhishLocal', () => {
    expect(manifest.name).toBe('PhishLocal');
  });

  it('has the same version as package.json', () => {
    expect(manifest.version).toBe(pkg.version);
  });

  it('declares an action (toolbar icon opens the side panel)', () => {
    expect(manifest.action).toBeDefined();
  });

  it('has a side panel whose file exists (exact case)', () => {
    const path = manifest.side_panel?.default_path;
    expect(path, 'side_panel.default_path is not set').toBeTruthy();
    expect(fileExistsExactCase(repoRoot, path!), `${path} does not exist`).toBe(true);
  });

  it('has a module service worker whose file exists (exact case)', () => {
    const worker = manifest.background?.service_worker;
    expect(worker, 'background.service_worker is not set').toBeTruthy();
    expect(fileExistsExactCase(repoRoot, worker!), `${worker} does not exist`).toBe(true);
    expect(manifest.background?.type).toBe('module');
  });

  it('requests only allow-listed permissions', () => {
    expect(sorted(manifest.permissions)).toEqual(sorted(ALLOWED_PERMISSIONS));
    expect(sorted(manifest.optional_permissions)).toEqual(sorted(ALLOWED_OPTIONAL_PERMISSIONS));
  });

  it('requests only allow-listed host permissions', () => {
    expect(sorted(manifest.host_permissions)).toEqual(sorted(ALLOWED_HOST_PERMISSIONS));
    expect(sorted(manifest.optional_host_permissions)).toEqual(
      sorted(ALLOWED_OPTIONAL_HOST_PERMISSIONS),
    );
  });

  it('runs content scripts only on allow-listed pages', () => {
    expect(sorted(contentScriptMatches(manifest))).toEqual(sorted(ALLOWED_CONTENT_SCRIPT_MATCHES));
  });

  it('exposes web_accessible_resources only to content-script pages', () => {
    expect(webAccessibleResourceProblems(manifest, ALLOWED_CONTENT_SCRIPT_MATCHES)).toEqual([]);
  });

  it('cannot be messaged by websites or other extensions (no externally_connectable)', () => {
    expect(manifest.externally_connectable).toBeUndefined();
  });

  it('has no extension_pages CSP that allows remote, inline or eval-ed code', () => {
    const csp = manifest.content_security_policy;
    // MV3 requires the object form; `sandbox` pages are isolated and may be looser.
    expect(typeof csp === 'string', 'content_security_policy must be an object in MV3').toBe(false);
    const policy = typeof csp === 'object' ? csp.extension_pages : undefined;
    expect(policy === undefined ? [] : cspProblems(policy)).toEqual([]);
  });
});
