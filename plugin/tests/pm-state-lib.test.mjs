import { describe, it, expect } from 'vitest';
import { existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { makeTempDir } from './helpers.mjs';
import {
  STAGES, initialState, statePath, readState, writeState, validate,
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
