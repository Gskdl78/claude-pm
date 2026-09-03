import type { GitExtras, GitResetMode, GitStatus } from '../../../../shared/types';
import { RESET_MODES } from '../../../../shared/git-actions';
import { BRANCH_RE, MAX_STASH_MESSAGE, RESET_MODES_LIST, RESET_TARGET_RE } from '../../../../shared/git-validate';

export interface AdvancedForm {
  stashMessage: string;
  resetMode: GitResetMode;
  /** HEAD~n 或 hash；「歷史」頁的「重設到此」會填入 hash */
  resetTarget: string;
  tagName: string;
  /** 「歷史」頁帶進來的提交；null = 目前的提交（HEAD） */
  tagHash: string | null;
}

export const EMPTY_ADVANCED_FORM: AdvancedForm = { stashMessage: '', resetMode: 'mixed', resetTarget: 'HEAD~1', tagName: '', tagHash: null };

const TAG_HINT = '名稱不合法：不可含空白、..、~ ^ : ? * [ \\，不可以 - 或 . 開頭';
const TARGET_HINT = '目標不合法：請用 HEAD~n（退回 n 個提交）或提交的 hash';

interface Props {
  status: GitStatus;
  extras: GitExtras;
  busy: boolean;
  form: AdvancedForm;
  onFormChange: (form: AdvancedForm) => void;
  onStash: (message: string | null) => void;
  onStashPop: (index: number) => void;
  onStashDrop: (index: number) => void;
  onReset: (mode: GitResetMode, target: string) => void;
  onTag: (name: string, hash: string | null) => void;
  onDeleteTag: (name: string) => void;
}

export function AdvancedTab({ status, extras, busy, form, onFormChange, onStash, onStashPop, onStashDrop, onReset, onTag, onDeleteTag }: Props) {
  const set = (patch: Partial<AdvancedForm>) => onFormChange({ ...form, ...patch });
  const hasChanges = status.files.length > 0;
  const targetValid = RESET_TARGET_RE.test(form.resetTarget);
  const tagExists = extras.tags.includes(form.tagName);
  const tagValid = BRANCH_RE.test(form.tagName) && !tagExists;
  // 收藏、重設、建立標籤都需要至少一個提交
  const lock = busy || status.noCommits;
  return (
    <div className="advanced-tab">
      <section>
        <h4>收藏（stash）</h4>
        <div className="row">
          <input aria-label="收藏說明（選填）" placeholder="收藏說明（選填）" value={form.stashMessage} disabled={lock} maxLength={MAX_STASH_MESSAGE}
            onChange={(e) => set({ stashMessage: e.target.value })} />
          <button type="button" disabled={lock || !hasChanges} onClick={() => onStash(form.stashMessage.trim() || null)}>收藏目前變更</button>
        </div>
        <div className="muted small">{hasChanges ? '把所有未提交的變更（含新檔案）先收起來，之後再「取回」。' : '工作目錄沒有變更可收藏'}</div>
        {extras.stashes.length === 0 && <div className="muted empty">沒有收藏的變更</div>}
        {extras.stashes.map((s) => {
          const ref = `stash@{${s.index}}`;
          return (
            <div key={s.index} className="ref-row">
              <code>{ref}</code>
              <span className="ref-name" title={s.message}>{s.message}</span>
              <button type="button" className="mini-text" aria-label={`取回收藏：${ref}`} title="取回" disabled={busy} onClick={() => onStashPop(s.index)}>取回</button>
              <button type="button" className="mini-text danger-text" aria-label={`丟棄收藏：${ref}`} title="丟棄" disabled={busy} onClick={() => onStashDrop(s.index)}>丟棄</button>
            </div>
          );
        })}
      </section>

      <section>
        <h4>重設（reset）</h4>
        <div className="modes">
          {RESET_MODES_LIST.map((m) => (
            <label key={m} className={m === 'hard' ? 'danger-text' : ''}>
              <input type="radio" name="reset-mode" aria-label={m} checked={form.resetMode === m} disabled={lock} onChange={() => set({ resetMode: m })} />
              {' '}{m}：{RESET_MODES[m]}
            </label>
          ))}
        </div>
        <div className="row">
          <input aria-label="重設目標" value={form.resetTarget} disabled={lock} onChange={(e) => set({ resetTarget: e.target.value.trim() })} />
          <button type="button" className={form.resetMode === 'hard' ? 'danger-btn' : ''} disabled={lock || !targetValid}
            onClick={() => onReset(form.resetMode, form.resetTarget)}>重設</button>
        </div>
        {form.resetTarget && !targetValid
          ? <div className="error small">{TARGET_HINT}</div>
          : <div className="muted small">HEAD~n = 退回 n 個提交；在「歷史」頁按「重設到此」會自動填入 hash</div>}
      </section>

      <section>
        <h4>標籤（tag）</h4>
        <div className="row">
          <input aria-label="標籤名稱" placeholder="例如 v1.0" value={form.tagName} disabled={lock} onChange={(e) => set({ tagName: e.target.value })} />
          <button type="button" disabled={lock || !tagValid} onClick={() => onTag(form.tagName, form.tagHash)}>建立標籤</button>
        </div>
        <div className="muted small">
          {form.tagHash
            ? <>於提交 <code>{form.tagHash}</code>　<button type="button" className="mini-text" aria-label="改為目前提交" disabled={busy} onClick={() => set({ tagHash: null })}>改為目前提交</button></>
            : '於目前的提交（HEAD）'}
        </div>
        {form.tagName && !tagValid && <div className="error small">{tagExists ? '標籤已存在' : TAG_HINT}</div>}
        {extras.tags.length === 0 && <div className="muted empty">沒有標籤</div>}
        {extras.tags.map((t) => (
          <div key={t} className="ref-row">
            <span className="ref-name" title={t}>{t}</span>
            <button type="button" className="mini-text danger-text" aria-label={`刪除標籤：${t}`} title="刪除" disabled={busy} onClick={() => onDeleteTag(t)}>刪除</button>
          </div>
        ))}
      </section>

      {status.noCommits && <div className="muted small">還沒有任何提交：收藏、重設與標籤都需要至少一個提交。</div>}
    </div>
  );
}
