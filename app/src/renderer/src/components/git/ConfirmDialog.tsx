import { useEffect, useRef, type KeyboardEvent } from 'react';

export interface ConfirmRequest {
  title: string;
  description: string;
  /** formatGitCommand 的結果，與主程序實際執行的 argv 同源。 */
  command: string;
  danger: boolean;
}

interface Props {
  request: ConfirmRequest | null;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({ request, onConfirm, onCancel }: Props) {
  const focusRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (request) focusRef.current?.focus(); }, [request]);
  if (!request) return null;
  const { title, description, command, danger } = request;
  const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
  return (
    <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="git-confirm-title" onKeyDown={onKeyDown}>
      <div className={`dialog-box confirm${danger ? ' danger' : ''}`}>
        <h3 id="git-confirm-title">確認：{title}</h3>
        <p className="confirm-desc">{description}</p>
        <div className="muted">將執行：</div>
        <pre className="confirm-cmd">{command}</pre>
        {danger && <div className="confirm-warn">⚠ 此操作不容易復原，請再次確認！</div>}
        <div className="dialog-actions">
          {/* 危險操作：焦點預設落在「取消」，Enter 不會觸發破壞性按鈕 */}
          <button type="button" ref={danger ? focusRef : undefined} onClick={onCancel}>取消</button>
          <button type="button" ref={danger ? undefined : focusRef} className={danger ? 'danger-btn' : 'primary'} onClick={onConfirm}>
            {danger ? '我了解風險，執行' : '確認'}
          </button>
        </div>
      </div>
    </div>
  );
}
