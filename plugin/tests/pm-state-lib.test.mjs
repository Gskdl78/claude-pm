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
