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
      expect(md, name).toContain('（預設 `opus`）');
      expect(md, name).toContain('（預設 `fable`）');
      // 但不可寫死成 model `xxx`：model 一律要說「依 CLAUDE.md 的某某模型」
      expect(md, name).not.toMatch(/model `(opus|fable|sonnet)`/);
      // 退回上限一律用 N 表示，不可寫死次數
      expect(md, name).not.toMatch(/第 \d+ 次 FAIL/);
      expect(md, name).toContain('第 N 次');
      expect(md, name).toContain('VERDICT: PASS');
      expect(md, name).toContain('add-issue');
      expect(frontmatter(md).description, name).toContain('CLAUDE.md 模型政策');
    }
  });

  it('review prompts read the diff instead of re-sending the implementer report', () => {
    for (const name of ['stage-build', 'stage-verify']) {
      const md = read(name);
      // 貼「回報全文」等於同一份變更付兩次錢；審核者本來就會跑 git diff
      expect(md, name).not.toContain('<回報全文>');
      expect(md, name).toContain('git diff');
      expect(md, name).toContain('改了這些檔案');
    }
  });

  it('both skills gate on machine-checkable failures before spending a review subagent', () => {
    for (const name of ['stage-build', 'stage-verify']) {
      const md = read(name);
      expect(md, name).toContain('機器閘門');
      expect(md, name).toContain('不派審核 subagent');
      // 閘門不可自成一個計數器，否則退回次數失去上限
      expect(md, name).toContain('共用同一個計數器');
    }
  });

  it('stage-build can downgrade small tasks to the small model', () => {
    const md = read('stage-build');
    expect(md).toContain('小模型');
    expect(md).toContain('（預設 `sonnet`）');
    // 升級規則必須優先，否則含資安關鍵字的單模組任務會被降級
    expect(md).toMatch(/這條優先/);
  });

  it('pm-status documents every CLI command', () => {
    const md = read('pm-status');
    for (const cmd of ['init', 'get', 'set-type', 'start', 'done', 'block', 'add-doc', 'add-issue', 'update-issue', 'history', 'rebuild']) {
      expect(md, cmd).toContain(`pm-state.mjs ${cmd}`);
    }
  });
});
