import { EventEmitter } from 'node:events';
import { readdirSync, statSync } from 'node:fs';
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

/** refs 目錄底下最多列這麼多筆；正常 repo 遠不到，純粹避免異常目錄拖慢輪詢。 */
const MAX_REF_ENTRIES = 2000;

/**
 * ref 目錄（refs/heads、refs/tags）的簽章：遞迴列出每個 ref 檔的路徑與 mtime/size。
 *
 * 不能用目錄本身的 mtime：實測在 Windows 上，於目錄內新增檔案有約 2/3 的機率
 * 完全不會更新該目錄的 mtime（等一秒也不會），所以新分支 / 新標籤會被漏掉。
 * 檔案自己的 mtime 是可靠的，列出名稱也能抓到新增與刪除。
 */
function refsSignature(dir: string): string {
  const out: string[] = [];
  const walk = (cur: string, prefix: string): void => {
    let entries;
    try {
      entries = readdirSync(cur, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (out.length >= MAX_REF_ENTRIES) return;
      const rel = prefix ? `${prefix}/${e.name}` : e.name;
      if (e.isDirectory()) { walk(join(cur, e.name), rel); continue; }
      out.push(`${rel}:${signature(join(cur, e.name))}`);
    }
  };
  walk(dir, '');
  if (out.length === 0) return '-';
  return out.sort().join(',');
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
    const gitFiles = [g('logs', 'HEAD'), g('HEAD'), g('index'), g('MERGE_HEAD'), g('FETCH_HEAD'), g('packed-refs'), g('refs', 'stash')];
    // refs/heads 與 refs/tags 是目錄，要用內容列表當簽章（見 refsSignature 的說明）
    const refDirs = [g('refs', 'heads'), g('refs', 'tags')];
    const stateTarget: Target = { event: 'state', signature: () => groupSignature([join(dir, '.pm', 'state.json')]), every: 1, last: '' };
    if (opts.stateOnly) {
      this.targets = [stateTarget];
      return;
    }
    this.targets = [
      stateTarget,
      // logs/HEAD：commit 與切換；HEAD：切換分支；index：stage / unstage；MERGE_HEAD：合併開始與結束；
      // FETCH_HEAD：fetch / pull；packed-refs：gc 後的分支；refs/stash：收藏的 push / pop / drop；
      // refs/heads、refs/tags：新增 / 刪除 / 移動分支與標籤（列內容，不看目錄 mtime）
      {
        event: 'git',
        signature: () => `${groupSignature(gitFiles)}|${refDirs.map(refsSignature).join('|')}`,
        every: 1,
        last: '',
      },
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
