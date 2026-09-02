import { EventEmitter } from 'node:events';
import { execFile } from 'node:child_process';
import type { ClaudeCheck } from '../shared/types';

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
  cwd: string;
  command: string;
  args: string[];
  cols: number;
  rows: number;
}

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

export class PtyManager extends EventEmitter {
  private proc: PtyLike | null = null;

  constructor(private readonly spawn: SpawnFn = defaultSpawn) {
    super();
  }

  start(opts: StartOptions): void {
    this.kill();
    const [file, args] = process.platform === 'win32'
      ? ['cmd.exe', ['/c', opts.command, ...opts.args]]
      : [opts.command, opts.args];
    const env = { ...process.env, TERM: 'xterm-256color', COLORTERM: 'truecolor' };
    const proc = this.spawn(file, args, { cwd: opts.cwd, cols: opts.cols, rows: opts.rows, env });
    this.proc = proc;
    proc.onData((d) => this.emit('data', d));
    proc.onExit(({ exitCode }) => {
      if (this.proc !== proc) return;
      this.proc = null;
      this.emit('exit', exitCode);
    });
  }

  write(data: string): void { this.proc?.write(data); }

  resize(cols: number, rows: number): void {
    if (cols > 0 && rows > 0) this.proc?.resize(cols, rows);
  }

  kill(): void {
    const p = this.proc;
    this.proc = null;
    try { p?.kill(); } catch { /* 已結束 */ }
  }

  isRunning(): boolean { return this.proc !== null; }
}
