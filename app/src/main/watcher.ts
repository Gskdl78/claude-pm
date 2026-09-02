import { EventEmitter } from 'node:events';
import { statSync } from 'node:fs';
import { join } from 'node:path';

type Sig = string | null;

function signature(file: string): Sig {
  try {
    const s = statSync(file);
    return `${s.mtimeMs}:${s.size}`;
  } catch {
    return null;
  }
}

/** 以輪詢方式監看 .pm/state.json 與 .git/logs/HEAD；Windows 上比 fs.watch 可靠。 */
export class ProjectWatcher extends EventEmitter {
  private timer: NodeJS.Timeout | null = null;
  private readonly targets: Array<{ file: string; event: 'state' | 'git'; last: Sig }>;

  constructor(dir: string, private readonly intervalMs = 500) {
    super();
    this.targets = [
      { file: join(dir, '.pm', 'state.json'), event: 'state', last: null },
      { file: join(dir, '.git', 'logs', 'HEAD'), event: 'git', last: null },
    ];
  }

  start(): void {
    if (this.timer) return;
    for (const t of this.targets) t.last = signature(t.file);
    this.timer = setInterval(() => this.tick(), this.intervalMs);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private tick(): void {
    for (const t of this.targets) {
      const now = signature(t.file);
      if (now !== t.last) {
        t.last = now;
        this.emit(t.event);
      }
    }
  }
}
