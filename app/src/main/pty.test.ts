import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SessionManager, MAX_SESSIONS, buildClaudeArgs, findClaude, type PtyLike, type SpawnFn } from './pty';

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

const A = 'C:\\P\\a';
const B = 'C:\\P\\b';
const opts = { command: 'claude', args: [], cols: 80, rows: 24 };

describe('SessionManager', () => {
  // 假計時器只給閒置偵測用；findClaude 會真的執行外部指令，不能被凍住。
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('spawns one process per path with the path as cwd and routes data/exit by path', () => {
    const { spawn, calls, procs } = fakeSpawn();
    const m = new SessionManager(spawn);
    const data: Array<[string, string]> = []; const exits: Array<[string, number]> = [];
    m.on('data', (p: string, d: string) => data.push([p, d]));
    m.on('exit', (p: string, c: number) => exits.push([p, c]));
    m.start(A, opts); m.start(B, opts);
    expect(calls.map((c) => c.opts.cwd)).toEqual([A, B]);
    expect(m.list().map((s) => [s.path, s.label, s.running])).toEqual([[A, 'a', true], [B, 'b', true]]);
    procs[0]!.emitData('from a'); procs[1]!.emitData('from b');
    expect(data).toEqual([[A, 'from a'], [B, 'from b']]);
    m.write(A, 'x'); m.resize(B, 100, 30);
    expect(procs[0]!.written).toEqual(['x']); expect(procs[1]!.size).toEqual([100, 30]);
    procs[1]!.emitExit(0);
    expect(exits).toEqual([[B, 0]]);
    expect(m.has(B)).toBe(false); expect(m.has(A)).toBe(true);
  });

  it('enforces the session limit, but restarting an existing path does not count', () => {
    const { spawn, procs } = fakeSpawn();
    const m = new SessionManager(spawn);
    for (let i = 0; i < MAX_SESSIONS; i++) m.start(`C:\\P\\p${i}`, opts);
    expect(() => m.start('C:\\P\\extra', opts)).toThrow(/too many sessions/);
    m.start('C:\\P\\p0', opts);   // 同 path 重啟：舊的被 kill，數量不變
    expect(procs[0]!.killed).toBe(true);
    expect(m.list()).toHaveLength(MAX_SESSIONS);
  });

  it('drops data and exit from a superseded or killed process', () => {
    const { spawn, procs } = fakeSpawn();
    const m = new SessionManager(spawn);
    const events: string[] = [];
    m.on('data', (p: string, d: string) => events.push(`data:${d}`));
    m.on('exit', (p: string, c: number) => events.push(`exit:${c}`));
    m.start(A, opts);
    m.start(A, opts);
    procs[0]!.emitData('old'); procs[0]!.emitExit(1);
    procs[1]!.emitData('new');
    expect(events).toEqual(['data:new']);
    m.kill(A);
    procs[1]!.emitData('late'); procs[1]!.emitExit(0);
    expect(events).toEqual(['data:new']);
    expect(procs[1]!.killed).toBe(true);
  });

  it('emits idle per session after 3 s of silence and false on kill/exit', () => {
    const { spawn, procs } = fakeSpawn();
    const m = new SessionManager(spawn);
    const idle: Array<[string, boolean]> = [];
    m.on('idle', (p: string, i: boolean) => idle.push([p, i]));
    m.start(A, opts); m.start(B, opts);
    procs[0]!.emitData('x'); procs[1]!.emitData('y');
    vi.advanceTimersByTime(3000);
    expect(idle).toEqual([[A, true], [B, true]]);
    expect(m.list().map((s) => s.idle)).toEqual([true, true]);
    procs[0]!.emitData('more');
    expect(idle.at(-1)).toEqual([A, false]);
    m.kill(B);
    expect(idle.at(-1)).toEqual([B, false]);
    procs[0]!.emitExit(0);
    expect(idle.at(-1)).toEqual([A, false]);
  });

  it('killAll kills every session and list is empty', () => {
    const { spawn, procs } = fakeSpawn();
    const m = new SessionManager(spawn);
    m.start(A, opts); m.start(B, opts);
    m.killAll();
    expect(procs.every((p) => p.killed)).toBe(true);
    expect(m.list()).toEqual([]);
    expect(() => m.write(A, 'x')).not.toThrow();
  });
});

describe('findClaude', () => {
  it('returns a shape with ok boolean', async () => {
    const r = await findClaude();
    expect(typeof r.ok).toBe('boolean');
    if (r.ok) expect(r.path).toMatch(/claude/i);
  });
});
