import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll } from 'vitest';

const created = [];

export function makeTempDir(prefix = 'pm-test-') {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  created.push(dir);
  return dir;
}

export function gitEnv() {
  return {
    ...process.env,
    GIT_AUTHOR_NAME: 'pm-test',
    GIT_AUTHOR_EMAIL: 'pm-test@local',
    GIT_COMMITTER_NAME: 'pm-test',
    GIT_COMMITTER_EMAIL: 'pm-test@local',
    GIT_CONFIG_NOSYSTEM: '1',
  };
}

afterAll(() => {
  for (const d of created) {
    try { rmSync(d, { recursive: true, force: true }); } catch {}
  }
});
