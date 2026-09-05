import { describe, it, expect, beforeAll } from 'vitest';
import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { makeTempDir, gitEnv } from './helpers.mjs';
import {
  NAME_RE, validateName, isInitialized, renderTemplate, scaffoldProject, parseVars, MODEL_NAME_RE,
} from '../scripts/scaffold.mjs';

const PLUGIN_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');

beforeAll(() => {
  Object.assign(process.env, {
    GIT_AUTHOR_NAME: 'pm-test', GIT_AUTHOR_EMAIL: 'pm-test@local',
    GIT_COMMITTER_NAME: 'pm-test', GIT_COMMITTER_EMAIL: 'pm-test@local',
  });
});

function gitLog(cwd) {
  const r = spawnSync('git', ['log', '--format=%s'], { cwd, encoding: 'utf8', env: gitEnv() });
  return r.stdout.trim().split('\n');
}

describe('validateName', () => {
  it('accepts simple names and rejects bad ones', () => {
    expect(() => validateName('my-app')).not.toThrow();
    expect(() => validateName('App_2.0')).not.toThrow();
    const reserved = ['CON', 'con', 'PRN', 'AUX', 'NUL', 'nul.txt', 'COM1', 'com9.log', 'LPT1', 'lpt9'];
    for (const bad of ['', '.hidden', 'has space', 'a/b', 'a\\b', 'x'.repeat(65), 'CON?', 'trailing.', ...reserved]) {
      expect(() => validateName(bad), bad).toThrow(/invalid project name/);
    }
    expect(NAME_RE.test('ok')).toBe(true);
  });
});

describe('renderTemplate', () => {
  it('replaces {{vars}} and blanks unknown ones', () => {
    expect(renderTemplate('# {{name}} ({{type}}) {{missing}}', { name: 'a', type: 'web' })).toBe('# a (web) ');
  });
});

describe('scaffoldProject', () => {
  it('seeds skills, scripts, state, CLAUDE.md, gitignore and an initial commit', () => {
    const root = makeTempDir();
    const target = join(root, 'demo');
    const r = scaffoldProject({ targetDir: target, pluginDir: PLUGIN_DIR });
    expect(r).toEqual({ targetDir: target, name: 'demo' });

    for (const rel of [
      '.claude/skills/stage-env/SKILL.md',
      '.claude/skills/stage-design/SKILL.md',
      '.claude/skills/stage-tech/SKILL.md',
      '.claude/skills/stage-build/SKILL.md',
      '.claude/skills/stage-verify/SKILL.md',
      '.claude/skills/pm-status/SKILL.md',
      '.pm/pm-state.mjs', '.pm/pm-state-lib.mjs', '.pm/state.json', 'CLAUDE.md', '.gitignore',
    ]) expect(existsSync(join(target, rel)), rel).toBe(true);

    const claude = readFileSync(join(target, 'CLAUDE.md'), 'utf8');
    expect(claude).toMatch(/^# demo/);
    expect(claude).toContain('專案類型：other');
    expect(claude).toContain('（尚無歷史注意事項）');
    expect(isInitialized(target)).toBe(true);
    expect(JSON.parse(readFileSync(join(target, '.pm/state.json'), 'utf8')).name).toBe('demo');
    expect(gitLog(target)).toEqual(['chore: init project']);
  });

  it('refuses to scaffold twice and validates the name', () => {
    const root = makeTempDir();
    const target = join(root, 'twice');
    scaffoldProject({ targetDir: target, pluginDir: PLUGIN_DIR, git: false });
    expect(() => scaffoldProject({ targetDir: target, pluginDir: PLUGIN_DIR, git: false })).toThrow(/already initialized/);
    expect(() => scaffoldProject({ targetDir: join(root, 'bad name'), pluginDir: PLUGIN_DIR, git: false })).toThrow(/invalid project name/);
  });

  it('keeps an existing CLAUDE.md and .git', () => {
    const root = makeTempDir();
    const target = join(root, 'existing');
    mkdirSync(target);
    writeFileSync(join(target, 'CLAUDE.md'), '# keep me');
    spawnSync('git', ['init', '-b', 'main'], { cwd: target, env: gitEnv() });
    writeFileSync(join(target, 'a.txt'), 'a');
    spawnSync('git', ['add', '-A'], { cwd: target, env: gitEnv() });
    spawnSync('git', ['commit', '-q', '-m', 'first'], { cwd: target, env: gitEnv() });

    scaffoldProject({ targetDir: target, pluginDir: PLUGIN_DIR });
    expect(readFileSync(join(target, 'CLAUDE.md'), 'utf8')).toBe('# keep me');
    expect(gitLog(target)).toEqual(['chore: init project', 'first']);
  });

  it('stages only the seeded files, leaving unrelated changes untouched', () => {
    const root = makeTempDir();
    const target = join(root, 'dirty');
    mkdirSync(target);
    spawnSync('git', ['init', '-b', 'main'], { cwd: target, env: gitEnv() });
    writeFileSync(join(target, 'a.txt'), 'a');
    spawnSync('git', ['add', '-A'], { cwd: target, env: gitEnv() });
    spawnSync('git', ['commit', '-q', '-m', 'first'], { cwd: target, env: gitEnv() });
    writeFileSync(join(target, 'dirty.txt'), 'do not commit me');

    scaffoldProject({ targetDir: target, pluginDir: PLUGIN_DIR });

    const files = spawnSync('git', ['show', '--name-only', '--format=', 'HEAD'], { cwd: target, encoding: 'utf8', env: gitEnv() }).stdout;
    expect(files).not.toContain('dirty.txt');
    expect(files).toContain('.pm/state.json');
    const status = spawnSync('git', ['status', '--porcelain', '--', 'dirty.txt'], { cwd: target, encoding: 'utf8', env: gitEnv() }).stdout;
    expect(status.trim()).toBe('?? dirty.txt');
  });

  it('CLI prints JSON', () => {
    const root = makeTempDir();
    const target = join(root, 'cli');
    const r = spawnSync(process.execPath, [join(PLUGIN_DIR, 'scripts', 'scaffold.mjs'), target, 'cli', '--no-git'], { encoding: 'utf8', env: gitEnv() });
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout)).toEqual({ targetDir: target, name: 'cli' });
  });

  it('renders the model policy from defaults when no vars are given', () => {
    const root = makeTempDir();
    const target = join(root, 'defaults');
    scaffoldProject({ targetDir: target, pluginDir: PLUGIN_DIR, git: false });
    const claude = readFileSync(join(target, 'CLAUDE.md'), 'utf8');
    expect(claude).toContain('實作 subagent：`opus`');
    expect(claude).toContain('審核 subagent：一律 `fable`');
    expect(claude).toContain('審核退回上限 3 次；第 3 次仍不過');
    expect(claude).not.toMatch(/\{\{\w+\}\}/);
  });

  it('renders the model policy from vars', () => {
    const root = makeTempDir();
    const target = join(root, 'vars');
    scaffoldProject({ targetDir: target, pluginDir: PLUGIN_DIR, git: false, vars: { implModel: 'sonnet', reviewModel: 'opus', smallModel: 'fable', maxRetries: 5 } });
    const claude = readFileSync(join(target, 'CLAUDE.md'), 'utf8');
    expect(claude).toContain('實作 subagent：`sonnet`');
    expect(claude).toContain('改用 `opus`');
    expect(claude).toContain('小任務降級用 `fable`');
    expect(claude).toContain('審核退回上限 5 次；第 5 次仍不過');
  });

  it('defaults the small model to sonnet', () => {
    const target = join(makeTempDir(), 'small-default');
    scaffoldProject({ targetDir: target, pluginDir: PLUGIN_DIR, git: false });
    expect(readFileSync(join(target, 'CLAUDE.md'), 'utf8')).toContain('小任務降級用 `sonnet`');
  });

  it('renders pinned notes from --pinned-file and （無） without it', () => {
    // 範本在 Windows 上可能以 CRLF 簽出，斷言跨行內容前先正規化換行。
    const readClaude = (dir) => readFileSync(join(dir, 'CLAUDE.md'), 'utf8').replace(/\r\n/g, '\n');
    const root = makeTempDir();
    const pinned = join(root, 'pinned-notes.md');
    writeFileSync(pinned, '- Env 缺少 .env → 建議：加 .env.example\n');
    const a = join(root, 'with');
    scaffoldProject({ targetDir: a, pluginDir: PLUGIN_DIR, git: false, vars: { pinnedFile: pinned } });
    const claudeA = readClaude(a);
    expect(claudeA).toContain('## 固定注意事項\n- Env 缺少 .env → 建議：加 .env.example\n');
    expect(claudeA).toContain('## 注意事項（來自歷史專案）\n（尚無歷史注意事項）');
    const b = join(root, 'without');
    scaffoldProject({ targetDir: b, pluginDir: PLUGIN_DIR, git: false });
    expect(readClaude(b)).toContain('## 固定注意事項\n（無）\n');
    const c = join(root, 'missing');
    scaffoldProject({ targetDir: c, pluginDir: PLUGIN_DIR, git: false, vars: { pinnedFile: join(root, 'nope.md') } });
    expect(readClaude(c)).toContain('## 固定注意事項\n（無）\n');
  });

  it('writes CLAUDE.md with a single line-ending style', () => {
    const root = makeTempDir();
    const pinned = join(root, 'pinned-notes.md');
    // 釘選檔一律是 LF；範本在 Windows 上可能是 CRLF，代入後不可混用。
    writeFileSync(pinned, '- Env 缺少 .env → 建議：加 .env.example\n- Timeout → 建議：加重試\n');
    const target = join(root, 'eol');
    scaffoldProject({ targetDir: target, pluginDir: PLUGIN_DIR, git: false, vars: { pinnedFile: pinned } });
    const out = readFileSync(join(target, 'CLAUDE.md'), 'utf8');
    expect(out).toContain('加重試');
    expect(/\r\n/.test(out) && /(?<!\r)\n/.test(out)).toBe(false);
  });

  it('cli accepts model flags', () => {
    const root = makeTempDir();
    const target = join(root, 'cli');
    const r = spawnSync(process.execPath, [join(PLUGIN_DIR, 'scripts', 'scaffold.mjs'), target, '--no-git', '--impl-model=sonnet', '--max-retries=2'], { encoding: 'utf8', env: gitEnv() });
    expect(r.status).toBe(0);
    const claude = readFileSync(join(target, 'CLAUDE.md'), 'utf8');
    expect(claude).toContain('實作 subagent：`sonnet`');
    expect(claude).toContain('審核退回上限 2 次');
  });
});

describe('parseVars', () => {
  it('extracts model flags and leaves the rest', () => {
    const { vars, rest } = parseVars(['C:\\x\\demo', '--impl-model=sonnet', 'demo', '--review-model=fable', '--small-model=haiku', '--max-retries=7', '--no-git']);
    expect(vars).toEqual({ implModel: 'sonnet', reviewModel: 'fable', smallModel: 'haiku', maxRetries: 7 });
    expect(rest).toEqual(['C:\\x\\demo', 'demo', '--no-git']);
    expect(parseVars(['--pinned-file=C:\\x\\p.md']).vars).toEqual({ pinnedFile: 'C:\\x\\p.md' });
    expect(parseVars(['--pinned-file=']).vars).toEqual({});
  });
  it('rejects bad values', () => {
    expect(() => parseVars(['--max-retries=0'])).toThrow(/max-retries/);
    expect(() => parseVars(['--max-retries=abc'])).toThrow(/max-retries/);
    expect(() => parseVars(['--impl-model=GPT 5'])).toThrow(/impl-model/);
    expect(() => parseVars(['--small-model=GPT 5'])).toThrow(/small-model/);
    expect(MODEL_NAME_RE.test('claude-fable-5.1')).toBe(true);
  });
});
