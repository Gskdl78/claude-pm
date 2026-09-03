import { EventEmitter } from 'node:events';
import { statSync } from 'node:fs';
import { join } from 'node:path';

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

/** 以輪詢方式監看 .pm/state.json 與 .git 的一組檔案；Windows 上比 fs.watch 可靠。 */
export class ProjectWatcher extends EventEmitter {
  private timer: NodeJS.Timeout | null = null;
  private readonly targets: Array<{ files: string[]; event: 'state' | 'git'; last: string }>;

  constructor(dir: string, private readonly intervalMs = 500) {
    super();
    const g = (...p: string[]) => join(dir, '.git', ...p);
    this.targets = [
      { files: [join(dir, '.pm', 'state.json')], event: 'state', last: '' },
      // logs/HEAD：commit 與切換；HEAD：切換分支；index：stage / unstage；MERGE_HEAD：合併開始與結束；
      // refs/heads（目錄 mtime）：新增 / 刪除分支；FETCH_HEAD：fetch / pull；packed-refs：gc 後的分支。
      {
        // refs/tags（目錄 mtime）：建立 / 刪除標籤；refs/stash：收藏的 push / pop / drop
        files: [g('logs', 'HEAD'), g('HEAD'), g('index'), g('MERGE_HEAD'), g('refs', 'heads'), g('FETCH_HEAD'), g('packed-refs'), g('refs', 'tags'), g('refs', 'stash')],
        event: 'git',
        last: '',
      },
    ];
  }

  start(): void {
    if (this.timer) return;
    for (const t of this.targets) t.last = groupSignature(t.files);
    this.timer = setInterval(() => this.tick(), this.intervalMs);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private tick(): void {
    for (const t of this.targets) {
      const now = groupSignature(t.files);
      if (now !== t.last) {
        t.last = now;
        this.emit(t.event);
      }
    }
  }
}
