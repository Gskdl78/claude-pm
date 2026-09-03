import { EventEmitter } from 'node:events';
import { execFile } from 'node:child_process';
import { basename } from 'node:path';
import { IdleDetector } from './pty-idle';
import type { ClaudeCheck, SessionInfo } from '../shared/types';

export interface PtyLike {
  onData(cb: (data: string) => void): void;
  onExit(cb: (e: { exitCode: number }) => void): void;
  write(data: string): void;
  resize(cols: number, rows: number): void;
  kill(): void;
}

export interface SpawnOptions {
  cwd: string;
  cols: number;
  rows: number;
  env: NodeJS.ProcessEnv;
}

export type SpawnFn = (file: string, args: string[], opts: SpawnOptions) => PtyLike;

export interface StartOptions {
  command: string;
  args: string[];
  cols: number;
  rows: number;
}

export const MAX_SESSIONS = 4;

/** 預設 spawn：延遲載入 node-pty，避免測試環境載入原生模組。 */
const defaultSpawn: SpawnFn = (file, args, opts) => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pty = require('node-pty') as typeof import('node-pty');
  return pty.spawn(file, args, {
    name: 'xterm-256color',
    cwd: opts.cwd,
    cols: opts.cols,
    rows: opts.rows,
    env: opts.env as Record<string, string>,
    useConpty: true,
  });
};

export function buildClaudeArgs(opts: { continue: boolean; initialPrompt?: string }): string[] {
  if (opts.continue) return ['--continue'];
  if (opts.initialPrompt) return [opts.initialPrompt];
  return [];
}

export function findClaude(): Promise<ClaudeCheck> {
  const [file, args] = process.platform === 'win32' ? ['where.exe', ['claude']] : ['which', ['claude']];
  return new Promise((resolve) => {
    execFile(file, args, { windowsHide: true }, (err, stdout) => {
      const first = (stdout || '').split(/\r?\n/).map((s) => s.trim()).find(Boolean);
      if (err || !first) resolve({ ok: false });
      else resolve({ ok: true, path: first });
    });
  });
}

interface Session { proc: PtyLike; idle: IdleDetector; label: string }

/**
 * 每個專案一個 pty；事件一律帶 path。被取代或已 kill 的行程的輸出與 exit 全部丟棄，
 * 閒置偵測每個 session 各自一個 IdleDetector。
 */
export class SessionManager extends EventEmitter {
  private readonly sessions = new Map<string, Session>();

  constructor(
    private readonly spawn: SpawnFn = defaultSpawn,
    private readonly idleFactory: () => IdleDetector = () => new IdleDetector(),
  ) {
    super();
  }

  start(path: string, opts: StartOptions): void {
    if (this.sessions.has(path)) this.kill(path);
    if (this.sessions.size >= MAX_SESSIONS) throw new Error('too many sessions');
    const [file, args] = process.platform === 'win32'
      ? ['cmd.exe', ['/c', opts.command, ...opts.args]]
      : [opts.command, opts.args];
    const env = { ...process.env, TERM: 'xterm-256color', COLORTERM: 'truecolor' };
    const proc = this.spawn(file, args, { cwd: path, cols: opts.cols, rows: opts.rows, env });
    const idle = this.idleFactory();
    const s: Session = { proc, idle, label: basename(path) };
    this.sessions.set(path, s);
    idle.on('idle', () => this.emit('idle', path, true));
    idle.on('busy', () => this.emit('idle', path, false));
    proc.onData((d) => {
      if (this.sessions.get(path) !== s) return;
      idle.feed();
      this.emit('data', path, d);
    });
    proc.onExit(({ exitCode }) => {
      if (this.sessions.get(path) !== s) return;
      this.sessions.delete(path);
      idle.reset();
      this.emit('idle', path, false);
      this.emit('exit', path, exitCode);
    });
  }

  write(path: string, data: string): void { this.sessions.get(path)?.proc.write(data); }

  resize(path: string, cols: number, rows: number): void {
    if (cols > 0 && rows > 0) this.sessions.get(path)?.proc.resize(cols, rows);
  }

  kill(path: string): void {
    const s = this.sessions.get(path);
    if (!s) return;
    this.sessions.delete(path);
    s.idle.reset();
    try { s.proc.kill(); } catch { /* 已結束 */ }
    this.emit('idle', path, false);
  }

  killAll(): void { for (const p of [...this.sessions.keys()]) this.kill(p); }

  list(): SessionInfo[] {
    return [...this.sessions.entries()].map(([path, s]) => ({ path, label: s.label, running: true, idle: s.idle.isIdle() }));
  }

  has(path: string): boolean { return this.sessions.has(path); }

  label(path: string): string { return this.sessions.get(path)?.label ?? basename(path); }
}
