import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkGh, createRepo, runGh } from './gh-run';

const dir = () => mkdtempSync(join(tmpdir(), 'pm-gh-'));

describe('gh runner', () => {
  it('reports a missing gh without throwing', async () => {
    const c = await checkGh(dir(), 'pm-definitely-missing-exe');
    expect(c).toMatchObject({ installed: false, version: null, authed: false });
    expect(c.detail).toMatch(/ENOENT/);
  });

  it('parses --version and auth status (git stands in for gh, so auth fails)', async () => {
    const c = await checkGh(dir(), 'git');
    expect(c.installed).toBe(true);
    expect(c.version).toMatch(/^git version/);
    expect(c.authed).toBe(false);
    expect(c.detail).toMatch(/auth/);
  });

  it('always reports the command as gh and uses the allow-listed argv', async () => {
    const r = await runGh(dir(), ['--version'], 'git');
    expect(r).toMatchObject({ ok: true, code: 0, command: 'gh --version' });
    const c = await createRepo(dir(), 'x', true, 'git');
    expect(c.ok).toBe(false);
    expect(c.command).toBe('gh repo create x --private --source=. --remote=origin --push');
  });
});
