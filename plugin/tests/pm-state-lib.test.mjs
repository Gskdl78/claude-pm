import { describe, it, expect } from 'vitest';
import { existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { makeTempDir } from './helpers.mjs';
import {
  STAGES, initialState, statePath, readState, writeState, validate,
} from '../scripts/pm-state-lib.mjs';
import {
  prevStage, nextStage, startStage, finishStage, blockStage, addDoc, addIssue, updateIssue,
} from '../scripts/pm-state-lib.mjs';
import {
  collectHistory, summarizeHistory, rebuildState,
} from '../scripts/pm-state-lib.mjs';

describe('initialState', () => {
  it('has all stages pending and stage=env', () => {
    const s = initialState('demo');
    expect(s.version).toBe(1);
    expect(s.name).toBe('demo');
    expect(s.type).toBe('other');
    expect(s.stage).toBe('env');
    expect(Object.keys(s.stages)).toEqual(STAGES);
    for (const st of STAGES) expect(s.stages[st]).toEqual({ status: 'pending' });
    expect(s.issues).toEqual([]);
  });
});

describe('readState / writeState', () => {
  it('round-trips through .pm/state.json', () => {
    const dir = makeTempDir();
    const s = initialState('demo');
    writeState(dir, s);
    expect(existsSync(statePath(dir))).toBe(true);
    expect(existsSync(statePath(dir) + '.tmp')).toBe(false);
    expect(readState(dir)).toEqual(s);
  });

  it('throws "state not found" when missing', () => {
    const dir = makeTempDir();
    expect(() => readState(dir)).toThrow(/^state not found:/);
  });

  it('throws "state corrupt" on invalid JSON', () => {
    const dir = makeTempDir();
    mkdirSync(join(dir, '.pm'));
    writeFileSync(statePath(dir), '{not json');
    expect(() => readState(dir)).toThrow(/^state corrupt:/);
  });

  it('refuses to write an invalid state', () => {
    const dir = makeTempDir();
    const s = initialState('demo');
    s.type = 'bogus';
    expect(() => writeState(dir, s)).toThrow(/type/);
    expect(existsSync(statePath(dir))).toBe(false);
  });
});

describe('validate', () => {
  it('rejects wrong version, bad stage, bad status, missing issues', () => {
    const ok = initialState('x');
    expect(() => validate(ok)).not.toThrow();
    expect(() => validate({ ...ok, version: 2 })).toThrow(/version/);
    expect(() => validate({ ...ok, stage: 'nope' })).toThrow(/stage/);
    expect(() => validate({ ...ok, stages: { ...ok.stages, env: { status: 'weird' } } })).toThrow(/status/);
    expect(() => validate({ ...ok, issues: null })).toThrow(/issues/);
  });
});

describe('stage order', () => {
  it('prev/next', () => {
    expect(prevStage('env')).toBeNull();
    expect(prevStage('design')).toBe('env');
    expect(nextStage('verify')).toBe('done');
    expect(nextStage('build')).toBe('verify');
  });
});

describe('startStage / finishStage', () => {
  const now = new Date('2026-09-02T10:00:00Z');

  it('starts env without prerequisites', () => {
    const s = startStage(initialState('x'), 'env', now);
    expect(s.stage).toBe('env');
    expect(s.stages.env).toEqual({ status: 'in_progress', startedAt: now.toISOString() });
  });

  it('refuses to start design while env is pending', () => {
    expect(() => startStage(initialState('x'), 'design', now)).toThrow(/cannot start design: env is pending/);
  });

  it('finishes env and advances stage to design', () => {
    let s = startStage(initialState('x'), 'env', now);
    s = finishStage(s, 'env', { commit: 'abc123', now });
    expect(s.stages.env).toEqual({ status: 'done', startedAt: now.toISOString(), at: now.toISOString(), commit: 'abc123' });
    expect(s.stage).toBe('design');
  });

  it('refuses to finish a stage that is not in progress', () => {
    expect(() => finishStage(initialState('x'), 'env', { now })).toThrow(/cannot finish env: status is pending/);
  });

  it('finishing verify sets stage=done', () => {
    let s = initialState('x');
    for (const st of STAGES) {
      s = startStage(s, st, now);
      s = finishStage(s, st, { now });
    }
    expect(s.stage).toBe('done');
  });

  it('blockStage records reason', () => {
    let s = startStage(initialState('x'), 'env', now);
    s = blockStage(s, 'env', 'T3 審核 3 次未過');
    expect(s.stages.env.status).toBe('blocked');
    expect(s.stages.env.reason).toBe('T3 審核 3 次未過');
  });

  it('refuses to restart a stage that is already done', () => {
    let s = startStage(initialState('x'), 'env', now);
    s = finishStage(s, 'env', { now });
    expect(() => startStage(s, 'env', now)).toThrow(/cannot start env: already done/);
  });

  it('refuses to block a stage that is not in progress', () => {
    expect(() => blockStage(initialState('x'), 'env', '卡住')).toThrow(/cannot block env: status is pending/);
  });

  it('starting a blocked stage clears reason and sets in_progress', () => {
    let s = startStage(initialState('x'), 'env', now);
    s = blockStage(s, 'env', '卡住');
    s = startStage(s, 'env', now);
    expect(s.stages.env.status).toBe('in_progress');
    expect(s.stages.env.reason).toBeUndefined();
    expect('reason' in s.stages.env).toBe(false);
  });

  it('finishing without a commit leaves no commit field', () => {
    let s = startStage(initialState('x'), 'env', now);
    s = finishStage(s, 'env', { now });
    expect('commit' in s.stages.env).toBe(false);
  });

  it('rejects unknown stage names', () => {
    expect(() => startStage(initialState('x'), 'deploy', now)).toThrow(/unknown stage/);
  });
});

describe('addDoc', () => {
  it('appends and de-duplicates', () => {
    let s = initialState('x');
    s = addDoc(s, 'design', 'docs/product/prd.md');
    s = addDoc(s, 'design', 'docs/product/prd.md');
    s = addDoc(s, 'design', 'docs/product/demo/index.html');
    expect(s.stages.design.docs).toEqual(['docs/product/prd.md', 'docs/product/demo/index.html']);
  });
});

describe('issues', () => {
  const now = new Date('2026-09-02T10:00:00Z');

  it('addIssue assigns incrementing ids and defaults', () => {
    let s = initialState('x');
    const r1 = addIssue(s, { stage: 'build', task: 'T2', symptom: '測試失敗' }, now);
    const r2 = addIssue(r1.state, { stage: 'verify', symptom: '按鈕沒反應', cause: '事件未綁定', fix: '加上 onClick' }, now);
    expect(r1.issue.id).toBe(1);
    expect(r2.issue.id).toBe(2);
    expect(r2.state.issues).toHaveLength(2);
    expect(r1.issue).toEqual({
      id: 1, stage: 'build', task: 'T2', symptom: '測試失敗', cause: '', fix: '', commit: '', at: now.toISOString(),
    });
    expect(r2.issue.task).toBeNull();
  });

  it('addIssue validates stage and symptom', () => {
    expect(() => addIssue(initialState('x'), { stage: 'nope', symptom: 's' })).toThrow(/stage/);
    expect(() => addIssue(initialState('x'), { stage: 'build', symptom: '' })).toThrow(/symptom/);
  });

  it('updateIssue merges fields', () => {
    const { state } = addIssue(initialState('x'), { stage: 'verify', symptom: 's' }, now);
    const s2 = updateIssue(state, 1, { cause: 'c', fix: 'f', commit: 'deadbee' });
    expect(s2.issues[0]).toMatchObject({ cause: 'c', fix: 'f', commit: 'deadbee', symptom: 's' });
    expect(() => updateIssue(s2, 99, { fix: 'x' })).toThrow(/issue 99 not found/);
  });
});

describe('history', () => {
  it('collects issues from sibling projects and skips corrupt/excluded', () => {
    const root = makeTempDir();
    const a = join(root, 'a'); const b = join(root, 'b'); const c = join(root, 'c'); const me = join(root, 'me');
    let sa = initialState('a');
    sa = addIssue(sa, { stage: 'build', symptom: 'DB 連線逾時', cause: '沒有設定連線池', fix: '加 pool' }).state;
    writeState(a, sa);
    let sb = initialState('b');
    sb = addIssue(sb, { stage: 'verify', symptom: 'timeout', cause: '沒有設定連線池', fix: '設定 max=10' }).state;
    writeState(b, sb);
    mkdirSync(join(c, '.pm'), { recursive: true });
    writeFileSync(statePath(c), 'garbage');
    let sm = initialState('me');
    sm = addIssue(sm, { stage: 'build', symptom: 'should be excluded' }).state;
    writeState(me, sm);

    const issues = collectHistory(root, { exclude: me });
    expect(issues.map((i) => i.project).sort()).toEqual(['a', 'b']);

    const summary = summarizeHistory(issues);
    expect(summary).toHaveLength(1);
    expect(summary[0]).toEqual({
      cause: '沒有設定連線池', count: 2, projects: ['a', 'b'], fixes: ['加 pool', '設定 max=10'],
    });
  });

  it.skipIf(process.platform !== 'win32')('excludes the given dir case-insensitively on win32', () => {
    const root = makeTempDir();
    const me = join(root, 'Me');
    let sm = initialState('me');
    sm = addIssue(sm, { stage: 'build', symptom: 'should be excluded' }).state;
    writeState(me, sm);

    expect(collectHistory(root, { exclude: join(root, 'ME') })).toEqual([]);
  });

  it('summarize falls back to symptom when cause is empty', () => {
    const summary = summarizeHistory([
      { project: 'p', symptom: 'Crash', cause: '' },
      { project: 'q', symptom: 'crash', cause: '' },
    ]);
    expect(summary[0].count).toBe(2);
  });
});

describe('rebuildState', () => {
  const files = (list) => (p) => list.includes(p);

  it('empty project stays at env pending', () => {
    const s = rebuildState('x', { exists: files([]), commits: [] });
    expect(s.stage).toBe('env');
    expect(s.stages.env.status).toBe('pending');
  });

  it('env done, design in progress when prd exists without commit', () => {
    const s = rebuildState('x', {
      exists: files(['CLAUDE.md', 'docs/product/prd.md']),
      commits: ['chore(env): 環境搭建完成'],
    });
    expect(s.stages.env.status).toBe('done');
    expect(s.stages.design.status).toBe('in_progress');
    expect(s.stages.tech.status).toBe('pending');
    expect(s.stage).toBe('design');
  });

  it('through build done and verify in progress', () => {
    const s = rebuildState('x', {
      exists: files(['CLAUDE.md', 'docs/product/prd.md', 'docs/tech/tasks.md', 'docs/build/log.md', 'docs/verify/checklist.md']),
      commits: ['docs(verify): 產出驗證清單', 'feat: T1', 'docs(tech): 技術設計完成', 'docs(design): 產品設計完成', 'chore(env): x'],
    });
    expect(s.stages.build.status).toBe('done');
    expect(s.stages.verify.status).toBe('in_progress');
    expect(s.stage).toBe('verify');
  });

  it('records the newest matching commit hash when given "hash subject" lines', () => {
    const s = rebuildState('x', {
      exists: files(['CLAUDE.md']),
      commits: ['a1b2c3d chore(env): 環境搭建完成'],
    });
    expect(s.stages.env.status).toBe('done');
    expect(s.stages.env.commit).toBe('a1b2c3d');
  });
});
