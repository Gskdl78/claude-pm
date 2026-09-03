import { useEffect, useState, type KeyboardEvent } from 'react';
import type { GhCheck, PublishChoice } from '../../../../shared/types';
import { REMOTE_URL_RE, REPO_NAME_RE } from '../../../../shared/git-validate';
import { pm } from '../../api';
import { errorMessage } from '../../errors';

interface Props {
  path: string;
  /** 沒有任何提交就沒東西可推，gh repo create --push 也會失敗 */
  noCommits: boolean;
  busy: boolean;
  onSubmit: (choice: PublishChoice) => void;
  onCancel: () => void;
}

export const NAME_HINT = '名稱不合法：只能用英數與 . _ -，最多 100 字，不可以 - 開頭';
export const URL_HINT = '網址不合法：只接受 https://主機/帳號/倉庫(.git) 或 git@主機:帳號/倉庫(.git)，不可含空白';

/** 資料夾名稱當預設倉庫名；不合法（中文、空白…）就留白讓使用者填。 */
export function defaultRepoName(path: string): string {
  const base = path.split(/[\\/]/).filter((s) => s.length > 0).pop() ?? '';
  return REPO_NAME_RE.test(base) ? base : '';
}

export function PublishWizard({ path, noCommits, busy, onSubmit, onCancel }: Props) {
  const [check, setCheck] = useState<GhCheck | null>(null);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [mode, setMode] = useState<'create' | 'url' | null>(null);
  const [name, setName] = useState(() => defaultRepoName(path));
  const [isPrivate, setIsPrivate] = useState(true);
  const [url, setUrl] = useState('');

  useEffect(() => {
    let cancelled = false;
    setCheck(null); setCheckError(null);
    pm.gh.check(path).then(
      (c) => { if (!cancelled) setCheck(c); },
      (e) => { if (!cancelled) setCheckError(errorMessage(e)); },
    );
    return () => { cancelled = true; };
  }, [path]);

  const canCreate = check !== null && check.installed && check.authed;
  // 使用者沒選之前：能用 gh 就預設新建，否則預設貼網址
  const effectiveMode = mode ?? (canCreate ? 'create' : 'url');
  const nameValid = REPO_NAME_RE.test(name);
  const urlValid = REMOTE_URL_RE.test(url);
  const ready = !busy && !noCommits && (effectiveMode === 'create' ? canCreate && nameValid : urlValid);
  const submit = () => {
    if (!ready) return;
    onSubmit(effectiveMode === 'create' ? { mode: 'create', name, isPrivate } : { mode: 'url', url });
  };
  const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };

  return (
    <div className="dialog" role="dialog" aria-modal="true" aria-label="發佈到 GitHub" onKeyDown={onKeyDown}>
      <div className="dialog-box wizard">
        <h3>發佈到 GitHub</h3>
        <p className="muted">這個專案還沒連到遠端倉庫。選一種方式，按「下一步」會先顯示將執行的指令再確認。</p>

        <section className="wizard-step">
          <div className="wizard-title">1. 偵測 GitHub CLI</div>
          {checkError && <div className="error small">偵測失敗：{checkError}</div>}
          {!check && !checkError && <div className="muted small">偵測 GitHub CLI…</div>}
          {check && (
            <>
              <div className="small">GitHub CLI：{check.installed ? `已安裝（${check.version ?? 'gh'}）` : '未安裝'}</div>
              <div className="small">登入狀態：{check.authed ? '已登入' : '未登入'}</div>
              {!check.installed && <div className="muted small">要用「新建」需先安裝：在終端機執行 winget install GitHub.cli，再執行 gh auth login。</div>}
              {check.installed && !check.authed && <div className="muted small">請在終端機執行 gh auth login，用瀏覽器完成登入後重新開啟精靈。</div>}
            </>
          )}
        </section>

        <section className="wizard-step">
          <div className="wizard-title">2. 選擇方式</div>
          <label>
            <input type="radio" name="publish-mode" aria-label="新建 GitHub 倉庫" checked={effectiveMode === 'create'} disabled={!canCreate} onChange={() => setMode('create')} />
            {' '}新建 GitHub 倉庫（由 gh 建立、設為 origin 並推送）
          </label>
          {effectiveMode === 'create' && (
            <div className="wizard-fields">
              <input aria-label="倉庫名稱" value={name} disabled={busy} onChange={(e) => setName(e.target.value)} />
              {name && !nameValid && <div className="error small">{NAME_HINT}</div>}
              <label><input type="radio" name="publish-vis" aria-label="私人" checked={isPrivate} onChange={() => setIsPrivate(true)} /> 私人（只有你看得到）</label>
              <label><input type="radio" name="publish-vis" aria-label="公開" checked={!isPrivate} onChange={() => setIsPrivate(false)} /> 公開（所有人都看得到）</label>
            </div>
          )}
          <label>
            <input type="radio" name="publish-mode" aria-label="貼現有倉庫網址" checked={effectiveMode === 'url'} onChange={() => setMode('url')} />
            {' '}貼現有倉庫網址（先在 GitHub 建好空倉庫）
          </label>
          {effectiveMode === 'url' && (
            <div className="wizard-fields">
              <input aria-label="倉庫網址" placeholder="https://github.com/你的帳號/倉庫.git" value={url} disabled={busy} onChange={(e) => setUrl(e.target.value.trim())} />
              {url && !urlValid && <div className="error small">{URL_HINT}</div>}
            </div>
          )}
        </section>

        <section className="wizard-step">
          <div className="wizard-title">3. 推送</div>
          <div className="muted small">推送若被拒（遠端已有你沒有的提交），面板會提示先「擷取」或「拉取（變基）」後再推送；不提供強制推送。</div>
          {noCommits && <div className="error small">還沒有任何提交：請先在「變更」頁提交一次，再發佈。</div>}
        </section>

        <div className="dialog-actions">
          <button type="button" onClick={onCancel}>取消</button>
          <button type="button" className="primary" disabled={!ready} onClick={submit}>下一步</button>
        </div>
      </div>
    </div>
  );
}
