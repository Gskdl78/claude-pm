import { EventEmitter } from 'node:events';

export interface IdleTimers {
  set(fn: () => void, ms: number): unknown;
  clear(handle: unknown): void;
}

const globalTimers: IdleTimers = {
  set: (fn, ms) => {
    const t = setTimeout(fn, ms);
    t.unref?.();
    return t;
  },
  clear: (h) => clearTimeout(h as NodeJS.Timeout),
};

type Phase = 'silent' | 'busy' | 'idle';

/**
 * 以「pty 連續 silenceMs 毫秒沒有任何輸出」判定 Claude Code 在等使用者輸入。
 * 不解析提示符字元：思考中的 spinner 與執行指令的計時器都會持續輸出，
 * 真正靜默幾乎只剩等待輸入一種情況。
 *
 * 狀態：silent（尚無輸出）→ busy → idle → busy …；reset() 回到 silent。
 */
export class IdleDetector extends EventEmitter {
  private phase: Phase = 'silent';
  private handle: unknown = null;

  constructor(private readonly silenceMs = 3000, private readonly timers: IdleTimers = globalTimers) {
    super();
  }

  feed(): void {
    this.clearTimer();
    // 先切換狀態再發事件，讓同步監聽器呼叫 isIdle() 時看到的是最新狀態
    const wasIdle = this.phase === 'idle';
    this.phase = 'busy';
    if (wasIdle) this.emit('busy');
    this.handle = this.timers.set(() => {
      this.handle = null;
      this.phase = 'idle';
      this.emit('idle');
    }, this.silenceMs);
  }

  reset(): void {
    this.clearTimer();
    this.phase = 'silent';
  }

  isIdle(): boolean { return this.phase === 'idle'; }

  private clearTimer(): void {
    if (this.handle !== null) { this.timers.clear(this.handle); this.handle = null; }
  }
}
