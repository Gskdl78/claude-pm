import { describe, it, expect, vi } from 'vitest';
import { PtyManager, buildClaudeArgs, findClaude, type PtyLike, type SpawnFn } from './pty';

function fakeSpawn() {
  const calls: Array<{ file: string; args: string[]; opts: { cwd: string; cols: number; rows: number } }> = [];
  const procs: Array<PtyLike & { emitData: (d: string) => void; emitExit: (c: number) => void; killed: boolean; written: string[]; size: [number, number] }> = [];
  const spawn: SpawnFn = (file, args, opts) => {
    let dataCb: (d: string) => void = () => {};
    let exitCb: (e: { exitCode: number }) => void = () => {};
    const p = {
      killed: false, written: [] as string[], size: [opts.cols, opts.rows] as [number, number],
      onData: (cb: (d: string) => void) => { dataCb = cb; },
      onExit: (cb: (e: { exitCode: number }) => void) => { exitCb = cb; },
      write: (d: string) => { p.written.push(d); },
      resize: (c: number, r: number) => { p.size = [c, r]; },
      kill: () => { p.killed = true; },
      emitData: (d: string) => dataCb(d),
      emitExit: (c: number) => exitCb({ exitCode: c }),
    };
    calls.push({ file, args, opts: { cwd: opts.cwd, cols: opts.cols, rows: opts.rows } });
    procs.push(p);
    return p;
  };
  return { spawn, calls, procs };
}

describe('buildClaudeArgs', () => {
  it('maps options to CLI args', () => {
    expect(buildClaudeArgs({ continue: true })).toEqual(['--continue']);
    expect(buildClaudeArgs({ continue: false, initialPrompt: '/stage-env' })).toEqual(['/stage-env']);
    expect(buildClaudeArgs({ continue: false })).toEqual([]);
  });
});

describe('PtyManager', () => {
  it('spawns through cmd.exe on win32 and forwards data/exit', () => {
    const f = fakeSpawn();
    const m = new PtyManager(f.spawn);
    const data = vi.fn(); const exit = vi.fn();
    m.on('data', data); m.on('exit', exit);
    m.start({ cwd: 'C:\\Projects\\x', command: 'claude', args: ['--continue'], cols: 100, rows: 40 });
    expect(m.isRunning()).toBe(true);
    const call = f.calls[0];
    if (process.platform === 'win32') {
      expect(call.file).toBe('cmd.exe');
      expect(call.args).toEqual(['/c', 'claude', '--continue']);
    } else {
      expect(call.file).toBe('claude');
      expect(call.args).toEqual(['--continue']);
    }
    expect(call.opts).toEqual({ cwd: 'C:\\Projects\\x', cols: 100, rows: 40 });
    f.procs[0].emitData('hello');
    expect(data).toHaveBeenCalledWith('hello');
    m.write('x'); m.resize(80, 24);
    expect(f.procs[0].written).toEqual(['x']);
    expect(f.procs[0].size).toEqual([80, 24]);
    f.procs[0].emitExit(3);
    expect(exit).toHaveBeenCalledWith(3);
    expect(m.isRunning()).toBe(false);
  });

  it('kills the previous process when started again, and ignores write/resize when idle', () => {
    const f = fakeSpawn();
    const m = new PtyManager(f.spawn);
    m.start({ cwd: 'a', command: 'claude', args: [], cols: 1, rows: 1 });
    m.start({ cwd: 'b', command: 'claude', args: [], cols: 1, rows: 1 });
    expect(f.procs[0].killed).toBe(true);
    m.kill();
    expect(f.procs[1].killed).toBe(true);
    expect(() => { m.write('x'); m.resize(1, 1); }).not.toThrow();
  });
});

describe('findClaude', () => {
  it('returns a shape with ok boolean', async () => {
    const r = await findClaude();
    expect(typeof r.ok).toBe('boolean');
    if (r.ok) expect(r.path).toMatch(/claude/i);
  });
});
