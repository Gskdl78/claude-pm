import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ProjectWatcher } from './watcher';

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function once(w: ProjectWatcher, ev: string, timeout = 2000): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`no ${ev} event`)), timeout);
    w.once(ev, () => { clearTimeout(t); resolve(); });
  });
}

describe('ProjectWatcher', () => {
  it('emits state when state.json appears or changes, git when HEAD log changes', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pm-watch-'));
    mkdirSync(join(dir, '.pm'));
    mkdirSync(join(dir, '.git', 'logs'), { recursive: true });
    const w = new ProjectWatcher(dir, 30);
    w.start();
    try {
      const p1 = once(w, 'state');
      writeFileSync(join(dir, '.pm', 'state.json'), '{"a":1}');
      await p1;

      await wait(50);
      const p2 = once(w, 'state');
      writeFileSync(join(dir, '.pm', 'state.json'), '{"a":22}');
      await p2;

      const p3 = once(w, 'git');
      writeFileSync(join(dir, '.git', 'logs', 'HEAD'), 'commit');
      await p3;
    } finally {
      w.stop();
    }
  });

  it('emits git when the index changes or a branch ref is created', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pm-watch-'));
    mkdirSync(join(dir, '.git', 'refs', 'heads'), { recursive: true });
    const w = new ProjectWatcher(dir, 30);
    w.start();
    try {
      const p1 = once(w, 'git');
      writeFileSync(join(dir, '.git', 'index'), 'DIRC');
      await p1;

      await wait(50);
      const p2 = once(w, 'git');
      writeFileSync(join(dir, '.git', 'refs', 'heads', 'dev'), 'abc');
      await p2;
    } finally {
      w.stop();
    }
  });

  it('emits git when a tag ref or the stash ref appears', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pm-watch-'));
    mkdirSync(join(dir, '.git', 'refs', 'tags'), { recursive: true });
    const w = new ProjectWatcher(dir, 30);
    w.start();
    try {
      const p1 = once(w, 'git');
      writeFileSync(join(dir, '.git', 'refs', 'tags', 'v1'), 'abc');
      await p1;

      await wait(50);
      const p2 = once(w, 'git');
      writeFileSync(join(dir, '.git', 'refs', 'stash'), 'abc');
      await p2;
    } finally {
      w.stop();
    }
  });

  it('does not emit after stop', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pm-watch-'));
    mkdirSync(join(dir, '.pm'));
    const w = new ProjectWatcher(dir, 30);
    let n = 0;
    w.on('state', () => { n += 1; });
    w.start();
    w.stop();
    writeFileSync(join(dir, '.pm', 'state.json'), '{}');
    await wait(120);
    expect(n).toBe(0);
  });

  it('emits docs when a markdown file under docs/ changes (slower cadence)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pm-watch-'));
    mkdirSync(join(dir, 'docs'));
    writeFileSync(join(dir, 'docs', 'a.md'), '#');
    const w = new ProjectWatcher(dir, 30);
    w.start();
    try {
      await wait(50);
      const p1 = once(w, 'docs');
      writeFileSync(join(dir, 'docs', 'a.md'), '# changed');
      await p1;
      const p2 = once(w, 'docs');
      writeFileSync(join(dir, 'docs', 'b.md'), '#');
      await p2;
    } finally {
      w.stop();
    }
  });

  it('stateOnly watcher ignores git and docs changes', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'pm-watch-'));
    mkdirSync(join(dir, '.pm')); mkdirSync(join(dir, '.git', 'logs'), { recursive: true }); mkdirSync(join(dir, 'docs'));
    const w = new ProjectWatcher(dir, 30, { stateOnly: true });
    const seen: string[] = [];
    w.on('git', () => seen.push('git')); w.on('docs', () => seen.push('docs'));
    w.start();
    try {
      const p = once(w, 'state');
      writeFileSync(join(dir, '.pm', 'state.json'), '{}');
      await p;
      writeFileSync(join(dir, '.git', 'logs', 'HEAD'), 'x'); writeFileSync(join(dir, 'docs', 'a.md'), '#');
      await wait(200);
      expect(seen).toEqual([]);
    } finally { w.stop(); }
  });
});
