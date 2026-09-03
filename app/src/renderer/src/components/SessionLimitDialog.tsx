import { useRef } from 'react';
import type { ProjectInfo } from '../../../shared/types';
import { useFocusTrap } from '../hooks/useFocusTrap';

/** 與主程序的 MAX_SESSIONS 同步；只用在提示文字 */
export const MAX_SESSIONS_UI = 4;

interface Props {
  /** 想開卻超過上限的專案；null 時不顯示對話框 */
  pending: ProjectInfo | null;
  live: Array<{ path: string; name: string }>;
  /** 正在關閉某個 session：期間停用所有動作 */
  busy: boolean;
  onClose: (path: string) => void;
  onCancel: () => void;
}

/** session 已達上限時，讓使用者挑一個關掉再開新的。 */
export function SessionLimitDialog({ pending, live, busy, onClose, onCancel }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  useFocusTrap(ref, pending !== null);
  if (!pending) return null;
  return (
    <div ref={ref} className="dialog" role="dialog" aria-modal="true" aria-label="session 上限" onKeyDown={(e) => { if (e.key === 'Escape' && !busy) onCancel(); }}>
      <div className="dialog-box">
        <h3>同時開啟的 session 已達上限（{MAX_SESSIONS_UI}）</h3>
        <p>要開啟 {pending.name}，請先關閉一個：</p>
        {live.map((s) => (
          <div key={s.path} className="session-row">
            <span className="name" title={s.path}>{s.name}</span>
            <button disabled={busy} onClick={() => onClose(s.path)}>關閉</button>
          </div>
        ))}
        {/* 焦點預設在「取消」：Enter 不會直接關掉別人的 session */}
        <div className="dialog-actions"><button type="button" autoFocus disabled={busy} onClick={onCancel}>取消</button></div>
      </div>
    </div>
  );
}
