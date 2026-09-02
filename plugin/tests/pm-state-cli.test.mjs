import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeTempDir, gitEnv } from './helpers.mjs';

// npm test 從 repo 根目錄執行 vitest（--root plugin 不改變 cwd），所以用檔案位置解析。
const CLI = resolve(dirname(fileURLToPath(import.meta.url)), '../scripts/pm-state.mjs');

function run(cwd, ...args) {
  const r = spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: 'utf8', env: gitEnv() });
  return { code: r.status, out: r.stdout, err: r.stderr, json: r.stdout ? safeParse(r.stdout) : null };
}
function safeParse(s) { try { return JSON.parse(s); } catch { return null; } }
function git(cwd, ...args) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', env: gitEnv() });
  if (r.status !== 0) throw new Error(r.stderr);
  return r.stdout.trim();
}

describe('pm-state CLI', () => {
  it('init → get → set-type → start → done flow', () => {
    const dir = makeTempDir();
    expect(run(dir, 'init', 'demo').json.name).toBe('demo');
    expect(run(dir, 'init', 'demo').code).toBe(1);
    expect(run(dir, 'get').json.stage).toBe('env');
    expect(run(dir, 'set-type', 'web').json.type).toBe('web');
    expect(run(dir, 'start', 'env').json.stages.env.status).toBe('in_progress');
    const r = run(dir, 'done', 'env', '--commit', 'abc1234');
    expect(r.json.stages.env).toMatchObject({ status: 'done', commit: 'abc1234' });
    expect(r.json.stage).toBe('design');
  });

  it('start refuses out-of-order and reports to stderr', () => {
    const dir = makeTempDir();
    run(dir, 'init', 'demo');
    const r = run(dir, 'start', 'tech');
    expect(r.code).toBe(1);
    expect(r.err).toMatch(/pm-state: cannot start tech: design is pending/);
  });

  it('add-doc, block, add-issue, update-issue', () => {
    const dir = makeTempDir();
    run(dir, 'init', 'demo');
    expect(run(dir, 'add-doc', 'design', 'docs/product/prd.md').json.stages.design.docs).toEqual(['docs/product/prd.md']);
    run(dir, 'start', 'env');
    expect(run(dir, 'block', 'env', '--reason', '卡住').json.stages.env).toMatchObject({ status: 'blocked', reason: '卡住' });
    const a = run(dir, 'add-issue', '--stage', 'build', '--task', 'T1', '--symptom', '測試失敗', '--cause', '缺 mock');
    expect(a.json.id).toBe(1);
    expect(a.json.issue.task).toBe('T1');
    const u = run(dir, 'update-issue', '1', '--fix', '補 mock', '--commit', 'deadbee');
    expect(u.json).toMatchObject({ id: 1, fix: '補 mock', commit: 'deadbee' });
    expect(run(dir, 'get').json.issues[0].commit).toBe('deadbee');
  });

  it('history scans parent dir excluding self', () => {
    const root = makeTempDir();
    const other = join(root, 'other'); const me = join(root, 'me');
    mkdirSync(other); mkdirSync(me);
    run(other, 'init', 'other');
    run(other, 'add-issue', '--stage', 'build', '--symptom', 'x', '--cause', '沒鎖版本', '--fix', '加 lockfile');
    run(me, 'init', 'me');
    run(me, 'add-issue', '--stage', 'build', '--symptom', 'y', '--cause', '自己的');
    const h = run(me, 'history').json;
    expect(h).toEqual([{ cause: '沒鎖版本', count: 1, projects: ['other'], fixes: ['加 lockfile'] }]);
  });

  it('rebuild infers stages from files and git log', () => {
    const dir = makeTempDir();
    git(dir, 'init', '-b', 'main');
    writeFileSync(join(dir, 'CLAUDE.md'), '# x');
    git(dir, 'add', '-A'); git(dir, 'commit', '-q', '-m', 'chore(env): done');
    mkdirSync(join(dir, 'docs', 'product'), { recursive: true });
    writeFileSync(join(dir, 'docs', 'product', 'prd.md'), '# prd');
    const r = run(dir, 'rebuild', 'demo');
    expect(r.json.stages.env.status).toBe('done');
    expect(r.json.stages.env.commit).toMatch(/^[0-9a-f]{7,}$/);
    expect(r.json.stages.design.status).toBe('in_progress');
    expect(run(dir, 'get').json.stage).toBe('design');
  });

  it('unknown command exits 2 with usage', () => {
    const r = run(makeTempDir(), 'nope');
    expect(r.code).toBe(2);
    expect(r.err).toMatch(/usage/i);
  });
});
