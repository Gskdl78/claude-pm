import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import type { AppConfig, ConfigPatch, ModelName } from '../../../shared/types';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { LIMITS, MODEL_OPTIONS } from '../../../shared/config-schema';

export interface SettingsSubmit { root: string; patch: ConfigPatch }

interface Props {
  open: boolean;
  config: AppConfig;
  busy: boolean;
  error: string | null;
  onPickFolder: () => Promise<string | null>;
  onSave: (s: SettingsSubmit) => void;
  onCancel: () => void;
}

interface Form {
  root: string; implModel: ModelName; reviewModel: ModelName;
  maxRetries: string; termFontSize: string; logHeight: string; notifyOnIdle: boolean;
}

const MODEL_LABELS: Record<ModelName, string> = { opus: 'Opus', fable: 'Fable', sonnet: 'Sonnet' };

function fromConfig(c: AppConfig): Form {
  return {
    root: c.root, implModel: c.implModel, reviewModel: c.reviewModel,
    maxRetries: String(c.maxRetries), termFontSize: String(c.termFontSize), logHeight: String(c.logHeight),
    notifyOnIdle: c.notifyOnIdle,
  };
}

type NumField = 'maxRetries' | 'termFontSize' | 'logHeight';

/** 回傳錯誤訊息；合法回 null。 */
function numError(v: string, f: NumField): string | null {
  const n = Number(v);
  const { min, max } = LIMITS[f];
  return v.trim() !== '' && Number.isInteger(n) && n >= min && n <= max ? null : `請輸入 ${min}–${max} 的整數`;
}

export function SettingsDialog({ open, config, busy, error, onPickFolder, onSave, onCancel }: Props) {
  const [form, setForm] = useState<Form>(() => fromConfig(config));
  const wasOpen = useRef(open);
  // 每次打開都以目前設定重置，取消後不殘留上次的編輯
  useEffect(() => {
    if (open && !wasOpen.current) setForm(fromConfig(config));
    wasOpen.current = open;
  }, [open, config]);
  const rootRef = useRef<HTMLDivElement>(null);
  useFocusTrap(rootRef, open);

  if (!open) return null;

  const rootError = form.root.trim() === '' ? '請輸入資料夾路徑' : null;
  const errors: Record<NumField, string | null> = {
    maxRetries: numError(form.maxRetries, 'maxRetries'),
    termFontSize: numError(form.termFontSize, 'termFontSize'),
    logHeight: numError(form.logHeight, 'logHeight'),
  };
  const valid = !rootError && !errors.maxRetries && !errors.termFontSize && !errors.logHeight;

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!valid || busy) return;
    onSave({
      root: form.root.trim(),
      patch: {
        implModel: form.implModel, reviewModel: form.reviewModel,
        maxRetries: Number(form.maxRetries), termFontSize: Number(form.termFontSize), logHeight: Number(form.logHeight),
        notifyOnIdle: form.notifyOnIdle,
      },
    });
  };
  const pick = async () => { const r = await onPickFolder(); if (r) set('root', r); };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => { if (e.key === 'Escape' && !busy) onCancel(); };

  const modelSelect = (id: string, label: string, k: 'implModel' | 'reviewModel') => (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select id={id} value={form[k]} disabled={busy} onChange={(e) => set(k, e.target.value as ModelName)}>
        {MODEL_OPTIONS.map((m) => <option key={m} value={m}>{MODEL_LABELS[m]}</option>)}
      </select>
    </div>
  );
  const numInput = (id: string, label: string, k: NumField) => (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input id={id} type="number" value={form[k]} min={LIMITS[k].min} max={LIMITS[k].max} disabled={busy} onChange={(e) => set(k, e.target.value)} />
      {errors[k] && <div className="error">{errors[k]}</div>}
    </div>
  );

  return (
    <div ref={rootRef} className="dialog" role="dialog" aria-modal="true" aria-label="設定" onKeyDown={onKeyDown}>
      <form className="settings" onSubmit={submit}>
        <h3>設定</h3>
        <div className="field">
          <label htmlFor="settings-root">專案根目錄</label>
          <div className="row">
            <input id="settings-root" value={form.root} disabled={busy} autoFocus onChange={(e) => set('root', e.target.value)} />
            <button type="button" disabled={busy} onClick={() => { void pick(); }}>選擇…</button>
          </div>
          {rootError && <div className="error">{rootError}</div>}
          <div className="muted">改變根目錄會關閉目前專案並重新載入清單。</div>
        </div>
        {modelSelect('settings-impl', '預設實作模型', 'implModel')}
        {modelSelect('settings-review', '審核模型', 'reviewModel')}
        {numInput('settings-retries', '審核退回上限', 'maxRetries')}
        <div className="muted">模型與退回上限只影響之後建立或初始化的專案（寫進其 CLAUDE.md）。</div>
        {numInput('settings-font', '終端機字型大小', 'termFontSize')}
        {numInput('settings-log', '資訊框預設高度', 'logHeight')}
        <label className="check">
          <input type="checkbox" checked={form.notifyOnIdle} disabled={busy} onChange={(e) => set('notifyOnIdle', e.target.checked)} />
          Claude Code 等待輸入時閃爍並通知
        </label>
        {error && <div className="error">{error}</div>}
        <div className="dialog-actions">
          <button type="button" onClick={onCancel} disabled={busy}>取消</button>
          <button type="submit" disabled={!valid || busy}>{busy ? '儲存中…' : '儲存'}</button>
        </div>
      </form>
    </div>
  );
}
