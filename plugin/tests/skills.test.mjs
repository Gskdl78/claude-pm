import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SKILLS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'skills');

const STAGE_SKILLS = {
  'stage-env': { prefix: 'chore(env):' },
  'stage-design': { prefix: 'docs(design):' },
  'stage-tech': { prefix: 'docs(tech):' },
  'stage-build': { prefix: 'feat' },
  'stage-verify': { prefix: 'fix(verify):' },
};

function read(name) {
  return readFileSync(join(SKILLS_DIR, name, 'SKILL.md'), 'utf8');
}

function frontmatter(md) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(md);
  if (!m) return null;
  const fm = {};
  for (const line of m[1].split(/\r?\n/)) {
    const i = line.indexOf(':');
    if (i > 0) fm[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return fm;
}

describe('skill files', () => {
  for (const name of [...Object.keys(STAGE_SKILLS), 'pm-status']) {
    it(`${name} has valid frontmatter`, () => {
      const fm = frontmatter(read(name));
      expect(fm).not.toBeNull();
      expect(fm.name).toBe(name);
      expect(fm.description.length).toBeGreaterThan(20);
      expect(fm.description).not.toBe('placeholder');
    });
  }

  for (const [name, { prefix }] of Object.entries(STAGE_SKILLS)) {
    it(`${name} drives state and git`, () => {
      const md = read(name);
      const stage = name.replace('stage-', '');
      expect(md).toContain('node .pm/pm-state.mjs get');
      expect(md).toContain(`node .pm/pm-state.mjs start ${stage}`);
      expect(md).toContain(`node .pm/pm-state.mjs done ${stage}`);
      expect(md).toContain('git commit');
      expect(md).toContain(prefix);
    });
  }

  it('build and verify skills take the model policy and retry limit from CLAUDE.md', () => {
    for (const name of ['stage-build', 'stage-verify']) {
      const md = read(name);
      expect(md, name).toContain('模型政策');
      expect(md, name).toContain('審核退回上限');
      // 預設值仍要看得見，使用者沒改 CLAUDE.md 時才知道會用什麼
      expect(md, name).toContain('`opus`');
      expect(md, name).toContain('`fable`');
      // 退回上限一律用 N 表示，不可寫死次數
      expect(md, name).not.toMatch(/第 \d+ 次 FAIL/);
      expect(md, name).toContain('第 N 次');
      expect(md, name).toContain('VERDICT: PASS');
      expect(md, name).toContain('add-issue');
      expect(frontmatter(md).description, name).toContain('CLAUDE.md 模型政策');
    }
  });

  it('pm-status documents every CLI command', () => {
    const md = read('pm-status');
    for (const cmd of ['init', 'get', 'set-type', 'start', 'done', 'block', 'add-doc', 'add-issue', 'update-issue', 'history', 'rebuild']) {
      expect(md, cmd).toContain(`pm-state.mjs ${cmd}`);
    }
  });
});
