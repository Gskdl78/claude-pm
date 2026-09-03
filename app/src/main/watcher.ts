import { EventEmitter } from 'node:events';
import { statSync } from 'node:fs';
import { join } from 'node:path';
import { docsSignature } from './docs';

function signature(file: string): string {
  try {
    const s = statSync(file);
    return `${s.mtimeMs}:${s.size}`;
  } catch {
    return '-';
  }
}

function groupSignature(files: string[]): string {
  return files.map(signature).join('|');
}

export type WatchEvent = 'state' | 'git' | 'docs';

interface Target {
  event: WatchEvent;
  signature: () => string;
  /** 每幾個 tick 比對一次；docs 要遞迴 stat 整個目錄，放慢到 4 個 tick（2 秒） */
  every: number;
  last: string;
}

export const DOCS_EVERY = 4;

/** 以輪詢方式監看 .pm/state.json、.git 的一組檔案與 docs/**\/*.md；Windows 上比 fs.watch 可靠。 */
export class ProjectWatcher extends EventEmitter {
  private timer: NodeJS.Timeout | null = null;
  private ticks = 0;
  private readonly targets: Target[];

  /** stateOnly：只監看 .pm/state.json（背景 session 用，不需要 git 與 docs） */
  constructor(dir: string, private readonly intervalMs = 500, opts: { stateOnly?: boolean } = {}) {
    super();
    const g = (...p: string[]) => join(dir, '.git', ...p);
    const gitFiles = [g('logs', 'HEAD'), g('HEAD'), g('index'), g('MERGE_HEAD'), g('refs', 'heads'), g('FETCH_HEAD'), g('packed-refs'), g('refs', 'tags'), g('refs', 'stash')];
    const stateTarget: Target = { event: 'state', signature: () => groupSignature([join(dir, '.pm', 'state.json')]), every: 1, last: '' };
    if (opts.stateOnly) {
      this.targets = [stateTarget];
      return;
    }
    this.targets = [
      stateTarget,
      // logs/HEAD：commit 與切換；HEAD：切換分支；index：stage / unstage；MERGE_HEAD：合併開始與結束；
      // refs/heads（目錄 mtime）：新增 / 刪除分支；FETCH_HEAD：fetch / pull；packed-refs：gc 後的分支；
      // refs/tags（目錄 mtime）：建立 / 刪除標籤；refs/stash：收藏的 push / pop / drop
      { event: 'git', signature: () => groupSignature(gitFiles), every: 1, last: '' },
      { event: 'docs', signature: () => docsSignature(dir), every: DOCS_EVERY, last: '' },
    ];
  }

  start(): void {
    if (this.timer) return;
    for (const t of this.targets) t.last = t.signature();
    this.ticks = 0;
    this.timer = setInterval(() => this.tick(), this.intervalMs);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private tick(): void {
    this.ticks += 1;
    for (const t of this.targets) {
      if (this.ticks % t.every !== 0) continue;
      const now = t.signature();
      if (now !== t.last) {
        t.last = now;
        this.emit(t.event);
      }
    }
  }
}
