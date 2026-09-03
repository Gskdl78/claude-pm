import { useState } from 'react';
import type { GitBranches, GitStatus } from '../../../../shared/types';
import { BRANCH_RE } from '../../../../shared/git-validate';

interface Props {
  status: GitStatus;
  branches: GitBranches;
  busy: boolean;
  /** 新分支名稱由 GitPanel 保管，切換分頁時不會遺失 */
  name: string;
  onNameChange: (name: string) => void;
  onSwitch: (branch: string) => void;
  onCreate: (branch: string) => void;
  onMerge: (branch: string) => void;
}

const NAME_HINT = '名稱不合法：不可含空白、..、~ ^ : ? * [ \\，不可以 - 或 . 開頭';

export function BranchTab({ status, branches, busy, name, onNameChange, onSwitch, onCreate, onMerge }: Props) {
  const others = branches.all.filter((b) => b !== status.branch);
  const [target, setTarget] = useState('');
  const [source, setSource] = useState('');
  // 下拉的選項會隨狀態變，選過的值不在清單裡時退回第一個
  const switchTo = others.includes(target) ? target : others[0] ?? '';
  const mergeFrom = others.includes(source) ? source : others[0] ?? '';
  const exists = branches.all.includes(name);
  const nameValid = BRANCH_RE.test(name) && !exists;
  const create = () => { if (nameValid) { onCreate(name); onNameChange(''); } };
  return (
    <div className="branch-tab">
      <div className="branch-current">
        目前分支：<b>{status.detached ? 'HEAD（未在任何分支上）' : status.branch}</b>
        {status.upstream && <span className="muted"> → {status.upstream}</span>}
      </div>
      <section>
        <label htmlFor="branch-switch">切換到</label>
        <div className="row">
          <select id="branch-switch" value={switchTo} disabled={busy || others.length === 0} onChange={(e) => setTarget(e.target.value)}>
            {others.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
          <button type="button" disabled={busy || !switchTo} onClick={() => onSwitch(switchTo)}>切換</button>
        </div>
        {others.length === 0 && <div className="muted small">沒有其他分支</div>}
      </section>
      <section>
        <label htmlFor="branch-new">新分支名稱</label>
        <div className="row">
          <input id="branch-new" value={name} disabled={busy} placeholder="例如 feature/login" onChange={(e) => onNameChange(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') create(); }} />
          <button type="button" disabled={busy || !nameValid} onClick={create}>新增</button>
        </div>
        {name && !nameValid && <div className="error small">{exists ? '分支已存在' : NAME_HINT}</div>}
      </section>
      <section>
        <label htmlFor="branch-merge">合併來源</label>
        <div className="row">
          <select id="branch-merge" value={mergeFrom} disabled={busy || others.length === 0} onChange={(e) => setSource(e.target.value)}>
            {others.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
          <button type="button" disabled={busy || !mergeFrom || status.merging} onClick={() => onMerge(mergeFrom)}>合併</button>
        </div>
        <div className="muted small">把來源分支的提交合併進目前分支</div>
      </section>
    </div>
  );
}
