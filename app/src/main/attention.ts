export interface AttentionWindow {
  isFocused(): boolean;
  isDestroyed(): boolean;
  flashFrame(flag: boolean): void;
  on(event: 'focus', cb: () => void): unknown;
}

export type Notify = (title: string, body: string) => void;

export interface Attention {
  /** pty 進入閒置：視窗未聚焦時閃爍工作列並發系統通知 */
  idle(label: string): void;
  /** pty 恢復輸出：目前不需動作，保留給呼叫端對稱使用 */
  busy(): void;
}

/** 延遲載入 electron，避免 vitest 的 node 環境在 import 時載入它（與 pty.ts 的 node-pty 作法相同）。 */
function electronNotification(): typeof import('electron').Notification {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return (require('electron') as typeof import('electron')).Notification;
}

/** 用 Electron Notification 發通知；點擊通知把視窗帶到前景。 */
export function electronNotify(win: { show(): void; focus(): void; isDestroyed(): boolean }): Notify {
  return (title, body) => {
    const Notification = electronNotification();
    if (!Notification.isSupported()) return;
    const n = new Notification({ title, body });
    n.on('click', () => { if (!win.isDestroyed()) { win.show(); win.focus(); } });
    n.show();
  };
}

export function createAttention(deps: { win: AttentionWindow; notify: Notify }): Attention {
  const { win, notify } = deps;
  win.on('focus', () => { if (!win.isDestroyed()) win.flashFrame(false); });
  return {
    idle(label) {
      if (win.isDestroyed() || win.isFocused()) return;
      win.flashFrame(true);
      // 通知中心不可用或建立失敗時仍保留閃爍
      try { notify(`${label} 等待你的回覆`, '回到 claude-pm 繼續對話'); } catch { /* 忽略 */ }
    },
    busy() { /* 閃爍只由 focus 取消 */ },
  };
}
