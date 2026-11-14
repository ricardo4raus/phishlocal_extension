import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { type Manifest, fromRoot, readJson, unsafeScriptSources } from './helpers';

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

  it('has a side panel whose file exists', () => {
    const path = manifest.side_panel?.default_path;
    expect(path, 'side_panel.default_path is not set').toBeTruthy();
    expect(existsSync(fromRoot(path!)), `${path} does not exist`).toBe(true);
  });

  it('has a module service worker whose file exists', () => {
    const worker = manifest.background?.service_worker;
    expect(worker, 'background.service_worker is not set').toBeTruthy();
    expect(existsSync(fromRoot(worker!)), `${worker} does not exist`).toBe(true);
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

  it('has no content_security_policy that allows remote or eval-ed scripts', () => {
    const csp = manifest.content_security_policy;
    const policies = typeof csp === 'string' ? [csp] : Object.values(csp ?? {});
    const problems = policies.flatMap((policy) => (policy ? unsafeScriptSources(policy) : []));
    expect(problems).toEqual([]);
  });
});
