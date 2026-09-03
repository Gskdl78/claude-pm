export interface AttentionWindow {
  isFocused(): boolean;
  isDestroyed(): boolean;
  flashFrame(flag: boolean): void;
  on(event: 'focus', cb: () => void): unknown;
}

export type Notify = (title: string, body: string) => void;

export interface Attention {
  /** pty 進入閒置。background：這個 session 不是使用者正在看的專案 → 即使視窗聚焦也通知（不閃爍） */
  idle(label: string, opts?: { background?: boolean }): void;
}

/** 延遲載入 electron，避免 vitest 的 node 環境在 import 時載入它（與 pty.ts 的 node-pty 作法相同）。 */
function electronNotification(): typeof import('electron').Notification {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return (require('electron') as typeof import('electron')).Notification;
}

/** 用 Electron Notification 發通知；點擊通知把視窗帶到前景（最小化時先還原，Windows 才會真的浮上來）。 */
export function electronNotify(win: {
  show(): void;
  focus(): void;
  isDestroyed(): boolean;
  isMinimized(): boolean;
  restore(): void;
}): Notify {
  return (title, body) => {
    const Notification = electronNotification();
    if (!Notification.isSupported()) return;
    const n = new Notification({ title, body });
    n.on('click', () => {
      if (win.isDestroyed()) return;
      if (win.isMinimized()) win.restore();
      win.show();
      win.focus();
    });
    n.show();
  };
}

export function createAttention(deps: { win: AttentionWindow; notify: Notify }): Attention {
  const { win, notify } = deps;
  win.on('focus', () => { if (!win.isDestroyed()) win.flashFrame(false); });
  return {
    idle(label, opts) {
      if (win.isDestroyed()) return;
      const focused = win.isFocused();
      const background = opts?.background === true;
      if (!focused) win.flashFrame(true);
      if (focused && !background) return;
      const body = background ? `切換到 ${label} 專案繼續對話` : '回到 claude-pm 繼續對話';
      // 通知中心不可用或建立失敗時仍保留閃爍
      try { notify(`${label} 等待你的回覆`, body); } catch { /* 忽略 */ }
    },
  };
}
