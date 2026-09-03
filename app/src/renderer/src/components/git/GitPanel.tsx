import { useCallback, useEffect, useRef, useState } from 'react';
import type { GitAction, GitBranches, GitCommit, GitDiffMode, GitExtras, GitResult, GitStatus, Notice, PublishChoice } from '../../../../shared/types';
import { buildGitArgs, describeGitAction, formatGitCommand } from '../../../../shared/git-actions';
import { explainGitError, gitResultText, isPushRejected } from '../../../../shared/git-errors';
import { describePublish } from '../../../../shared/gh-actions';
import { pm } from '../../api';
import { errorMessage } from '../../errors';
import { ConfirmDialog, type ConfirmRequest } from './ConfirmDialog';
import { OutputLog, type LogEntry } from './OutputLog';
import { ResizeHandle, useLogHeight } from './ResizeHandle';
import { DiffView } from './DiffView';
import { ChangesTab } from './ChangesTab';
import { BranchTab } from './BranchTab';
import { HistoryTab } from './HistoryTab';
import { NotRepo } from './NotRepo';
import { AdvancedTab, EMPTY_ADVANCED_FORM, type AdvancedForm } from './AdvancedTab';
import { PublishWizard } from './PublishWizard';

type Tab = 'changes' | 'branches' | 'history' | 'advanced';
const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'changes', label: '變更' }, { id: 'branches', label: '分支' }, { id: 'history', label: '歷史' }, { id: 'advanced', label: '進階' },
];

/** 工作目錄的編輯不會動到 .git，靠這個低頻輪詢補上（視窗可見且非 busy 時才跑）。 */
export const STATUS_POLL_MS = 3000;
const MAX_LOG = 200;
const EMPTY_BRANCHES: GitBranches = { current: '', all: [] };
const EMPTY_EXTRAS: GitExtras = { stashes: [], tags: [] };
// 沒有提示時共用同一個陣列，避免每次 render 都產生新的參考而重跑 effect
const NO_NOTICES: Notice[] = [];

interface Props {
  path: string | null;
  commits: GitCommit[];
  /** App 收到 project:git 事件時遞增；面板據此重讀狀態。 */
  revision: number;
  /** 來自 App 的提示（階段切換等），每筆只寫進輸出區一次 */
  notices?: Notice[];
}

type Pending =
  | { request: ConfirmRequest; action: GitAction }
  /** 發佈精靈：url 路線是 addRemote → push 兩個動作；create 路線走 gh */
  | { request: ConfirmRequest; publish: PublishChoice };
interface Viewer { title: string; text: string }

export function GitPanel({ path, commits, revision, notices = NO_NOTICES }: Props) {
  const [status, setStatus] = useState<GitStatus | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [branches, setBranches] = useState<GitBranches>(EMPTY_BRANCHES);
  const [tab, setTab] = useState<Tab>('changes');
  const [busy, setBusy] = useState(false);
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [pending, setPending] = useState<Pending | null>(null);
  const [viewer, setViewer] = useState<Viewer | null>(null);
  // 分頁切換會卸載另一個分頁，輸入必須留在這裡才不會被清掉
  const [message, setMessage] = useState('');
  const [amend, setAmend] = useState(false);
  const [newBranch, setNewBranch] = useState('');
  const [adv, setAdv] = useState<AdvancedForm>(EMPTY_ADVANCED_FORM);
  const [extras, setExtras] = useState<GitExtras>(EMPTY_EXTRAS);
  const [wizardOpen, setWizardOpen] = useState(false);
  // 推送被拒後顯示「先擷取 / 拉取（變基）」提示列；推送、拉取、擷取成功即清除
  const [rejected, setRejected] = useState(false);
  // 每次面板動作結束 +1，讓「進階」分頁重讀收藏與標籤
  const [actionSeq, setActionSeq] = useState(0);
  const seqRef = useRef(0);
  const extrasSeqRef = useRef(0);
  const statusErrorRef = useRef<string | null>(null);
  const pathRef = useRef(path);
  const [logHeight, setLogHeight] = useLogHeight();
  const logId = useRef(0);
  pathRef.current = path;

  const log = useCallback((kind: LogEntry['kind'], text: string, detail?: string) => {
    logId.current += 1;
    const entry: LogEntry = { id: logId.current, kind, text, ...(detail ? { detail } : {}) };
    setEntries((prev) => [...prev, entry].slice(-MAX_LOG));
  }, []);

  const refresh = useCallback(async () => {
    if (!path) { setStatus(null); return; }
    seqRef.current += 1;
    const seq = seqRef.current;
    try {
      const st = await pm.git.status(path);
      const br = st.isRepo ? await pm.git.branches(path) : EMPTY_BRANCHES;
      // 被更新的 refresh 或專案切換取代的結果一律丟棄
      if (seq !== seqRef.current || pathRef.current !== path) return;
      statusErrorRef.current = null;
      setStatusError(null);
      setStatus((prev) => (JSON.stringify(prev) === JSON.stringify(st) ? prev : st));
      setBranches((prev) => (JSON.stringify(prev) === JSON.stringify(br) ? prev : br));
    } catch (e) {
      if (seq !== seqRef.current || pathRef.current !== path) return;
      const text = `讀取 git 狀態失敗：${errorMessage(e)}`;
      setStatusError(text);
      // 每 3 秒輪詢一次，同一個錯誤只記一次，不然輸出區會被洗版
      if (statusErrorRef.current !== text) { statusErrorRef.current = text; log('error', text); }
    }
  }, [path, log]);

  // 專案切換：輸出、對話框、分頁與輸入回到初始
  useEffect(() => {
    setEntries([]); setPending(null); setViewer(null); setTab('changes'); setStatus(null);
    setStatusError(null); statusErrorRef.current = null;
    setMessage(''); setAmend(false); setNewBranch('');
    setAdv(EMPTY_ADVANCED_FORM); setExtras(EMPTY_EXTRAS); setWizardOpen(false); setRejected(false);
  }, [path]);

  // 必須排在上面的重設之後：同一次 render 換專案又收到提示時，才不會先寫進輸出再被清空
  const lastNoticeRef = useRef(0);
  useEffect(() => {
    for (const n of notices) {
      if (n.id <= lastNoticeRef.current) continue;
      lastNoticeRef.current = n.id;
      log(n.kind ?? 'hint', n.text);
    }
  }, [notices, log]);

  // 專案切換與 watcher 事件（revision）→ 立即重讀
  useEffect(() => { void refresh(); }, [refresh, revision]);

  useEffect(() => {
    if (!path) return undefined;
    const tick = () => { if (document.visibilityState === 'visible' && !busy) void refresh(); };
    const timer = setInterval(tick, STATUS_POLL_MS);
    window.addEventListener('focus', tick);
    return () => { clearInterval(timer); window.removeEventListener('focus', tick); };
  }, [path, refresh, busy]);

  // 收藏與標籤只在「進階」分頁顯示：分頁開啟、watcher 事件（revision）或面板動作（actionSeq）後重讀，不跟著 3 秒輪詢
  const refreshExtras = useCallback(async () => {
    if (!path) return;
    extrasSeqRef.current += 1;
    const seq = extrasSeqRef.current;
    try {
      const ex = await pm.git.extras(path);
      // 被更新的 refreshExtras 或專案切換取代的結果一律丟棄
      if (seq !== extrasSeqRef.current || pathRef.current !== path) return;
      setExtras((prev) => (JSON.stringify(prev) === JSON.stringify(ex) ? prev : ex));
    } catch (e) {
      if (seq !== extrasSeqRef.current || pathRef.current !== path) return;
      log('error', `讀取收藏與標籤失敗：${errorMessage(e)}`);
    }
  }, [path, log]);

  useEffect(() => { if (tab === 'advanced') void refreshExtras(); }, [tab, refreshExtras, revision, actionSeq]);

  /** 寫入指令與結果；回傳是否成功。推送被拒時打開提示列，同步類動作成功時關掉它。 */
  const report = useCallback((r: GitResult, kind: GitAction['kind'] | 'publish'): boolean => {
    log('cmd', r.command);
    if (r.ok) {
      log('ok', '完成 ✓');
      if (kind === 'push' || kind === 'pull' || kind === 'pullRebase' || kind === 'fetch' || kind === 'publish') setRejected(false);
      return true;
    }
    const text = gitResultText(r);
    log('error', explainGitError(text) ?? '執行失敗，原始輸出如下：', text);
    if ((kind === 'push' || kind === 'publish') && isPushRejected(text)) setRejected(true);
    return false;
  }, [log]);

  /** 依序執行，任一步失敗就停（發佈精靈的「設定遠端 → 推送」靠這個）。 */
  const execute = useCallback(async (...actions: GitAction[]) => {
    if (!path) return;
    setBusy(true);
    try {
      for (const action of actions) {
        const r = await pm.git.run(path, action);
        // 期間換了專案：舊專案的結果不該進新專案的輸出，也不該觸發新專案的重讀
        if (pathRef.current !== path) return;
        const ok = report(r, action.kind);
        if (!ok) return;
        // 成功才清空輸入，失敗時要留著讓使用者改
        if (action.kind === 'commit') { setMessage(''); setAmend(false); }
        if (action.kind === 'stash') setAdv((a) => ({ ...a, stashMessage: '' }));
        if (action.kind === 'tag') setAdv((a) => ({ ...a, tagName: '', tagHash: null }));
      }
    } catch (e) {
      if (pathRef.current !== path) return;
      log('error', errorMessage(e));
    } finally {
      setBusy(false);
      if (pathRef.current === path) { setActionSeq((n) => n + 1); void refresh(); }
    }
  }, [path, log, report, refresh]);

  /** 發佈精靈的 create 路線：gh 自己建倉庫、設 origin、推送，不經 git:run。 */
  const publishWithGh = useCallback(async (name: string, isPrivate: boolean) => {
    if (!path) return;
    setBusy(true);
    try {
      const r = await pm.gh.repoCreate(path, name, isPrivate);
      if (pathRef.current !== path) return;
      report(r, 'publish');
    } catch (e) {
      if (pathRef.current !== path) return;
      log('error', errorMessage(e));
    } finally {
      setBusy(false);
      if (pathRef.current === path) { setActionSeq((n) => n + 1); void refresh(); }
    }
  }, [path, log, report, refresh]);

  const request = useCallback((action: GitAction) => {
    if (!status || busy) return;
    const spec = describeGitAction(action, status);
    if (!spec) { void execute(action); return; }
    const command = formatGitCommand(buildGitArgs(action, { hasHead: !status.noCommits }));
    setPending({ request: { ...spec, command }, action });
  }, [status, busy, execute]);

  const confirmPending = () => {
    if (!pending) return;
    const p = pending;
    setPending(null);
    if ('action' in p) { void execute(p.action); return; }
    if (p.publish.mode === 'url') { void execute({ kind: 'addRemote', url: p.publish.url }, { kind: 'push' }); return; }
    void publishWithGh(p.publish.name, p.publish.isPrivate);
  };

  /** 精靈只收集選擇；確認框顯示確切指令後才執行。 */
  const submitPublish = (choice: PublishChoice) => {
    setWizardOpen(false);
    setPending({ request: describePublish(choice), publish: choice });
  };

  const syncAction = (kind: 'push' | 'pull') => {
    if (!status) return;
    if (!status.hasRemote) { setWizardOpen(true); return; }
    request({ kind });
  };

  const openDiff = async (file: string, mode: GitDiffMode) => {
    if (!path) return;
    try { setViewer({ title: `差異：${file}`, text: await pm.git.diff(path, file, mode) }); }
    catch (e) { log('error', `無法讀取差異：${errorMessage(e)}`); }
  };

  const openCommit = async (hash: string) => {
    if (!path) return;
    try { setViewer({ title: `提交：${hash}`, text: await pm.git.show(path, hash) }); }
    catch (e) { log('error', `無法讀取提交：${errorMessage(e)}`); }
  };

  const logPane = (
    <>
      <ResizeHandle height={logHeight} onHeight={setLogHeight} />
      <div className="git-log" style={{ height: logHeight }}><OutputLog entries={entries} /></div>
    </>
  );

  const dialogs = (
    <>
      <ConfirmDialog request={pending?.request ?? null} onConfirm={confirmPending} onCancel={() => setPending(null)} />
      {viewer && <DiffView title={viewer.title} text={viewer.text} onClose={() => setViewer(null)} />}
      {wizardOpen && path && status && (
        <PublishWizard path={path} noCommits={status.noCommits} busy={busy} onSubmit={submitPublish} onCancel={() => setWizardOpen(false)} />
      )}
    </>
  );

  if (!path) return <div className="git-panel"><div className="muted pad">選擇專案後顯示 git 狀態</div></div>;
  if (!status) {
    return (
      <div className="git-panel">
        {statusError
          ? <div className="error pad" role="alert">{statusError}</div>
          : <div className="muted pad">讀取 git 狀態…</div>}
        {logPane}
        {dialogs}
      </div>
    );
  }
  if (!status.isRepo) {
    return (
      <div className="git-panel">
        <NotRepo busy={busy} onInit={() => request({ kind: 'init' })} />
        {logPane}
        {dialogs}
      </div>
    );
  }

  const conflicts = status.files.filter((f) => f.conflicted).length;
  const changeCount = status.files.length;
  return (
    <div className="git-panel">
      <header className="git-head">
        <div className="git-branch" title={status.upstream ? `上游：${status.upstream}` : '沒有上游分支'}>
          <span className="dot">●</span>
          <span className="branch-name">{status.detached ? 'HEAD（分離）' : status.branch}</span>
          {status.ahead > 0 && <span className="pill">↑{status.ahead}</span>}
          {status.behind > 0 && <span className="pill warn">↓{status.behind}</span>}
          {!status.hasRemote && <span className="pill">無遠端</span>}
        </div>
        <div className="git-sync">
          <button type="button" disabled={busy} onClick={() => syncAction('push')}>推送</button>
          <button type="button" disabled={busy} onClick={() => syncAction('pull')}>拉取</button>
          <button type="button" disabled={busy || !status.hasRemote} onClick={() => request({ kind: 'fetch' })}>擷取</button>
        </div>
      </header>
      {(status.merging || conflicts > 0) && (
        <div className="git-conflict">
          <span>
            {status.merging ? '合併進行中' : '有衝突'}{conflicts > 0 ? `：${conflicts} 個檔案有衝突` : ''}。請解決衝突後把檔案「標記為已解決」再提交（可交給 Claude Code）。
          </span>
          {/* 只有 MERGE_HEAD 存在時 merge --abort 才有意義；變基 / 還原 / 取回收藏的衝突另有指令，錯誤對映表會說明 */}
          {status.merging && (
            <button type="button" className="danger-text" disabled={busy} onClick={() => request({ kind: 'abortMerge' })}>中止合併</button>
          )}
        </div>
      )}
      {rejected && (
        <div className="git-rejected" role="status">
          <span>推送被拒：遠端有你沒有的提交。先「擷取」看看，或「拉取（變基）」把本地提交接到遠端之後再推送。不提供強制推送。</span>
          <button type="button" disabled={busy} onClick={() => request({ kind: 'fetch' })}>先擷取</button>
          <button type="button" disabled={busy} onClick={() => request({ kind: 'pullRebase' })}>拉取（變基）</button>
          <button type="button" className="mini-text" aria-label="關閉推送提示" onClick={() => setRejected(false)}>✕</button>
        </div>
      )}
      <nav className="git-tabs" role="tablist">
        {TABS.map((t) => (
          <button type="button" key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>
            {t.id === 'changes' && changeCount > 0 ? `${t.label}（${changeCount}）` : t.label}
          </button>
        ))}
      </nav>
      <div className="git-body" role="tabpanel">
        {tab === 'changes' && (
          <ChangesTab status={status} busy={busy}
            message={message} amend={amend} onMessageChange={setMessage} onAmendChange={setAmend}
            onStage={(file) => request({ kind: 'stage', file })}
            onUnstage={(file) => request({ kind: 'unstage', file })}
            onStageAll={() => request({ kind: 'stageAll' })}
            onUnstageAll={() => request({ kind: 'unstageAll' })}
            onDiscard={(file, untracked) => request({ kind: 'discard', file, untracked })}
            onDiff={(file, mode) => { void openDiff(file, mode); }}
            onCommit={(message, amend) => request({ kind: 'commit', message, amend })} />
        )}
        {tab === 'branches' && (
          <BranchTab status={status} branches={branches} busy={busy}
            name={newBranch} onNameChange={setNewBranch}
            onSwitch={(branch) => request({ kind: 'switch', branch })}
            onCreate={(branch) => request({ kind: 'createBranch', branch })}
            onMerge={(branch) => request({ kind: 'merge', branch })} />
        )}
        {tab === 'history' && (
          <HistoryTab commits={commits} busy={busy} onShow={(hash) => { void openCommit(hash); }}
            onRevert={(hash) => request({ kind: 'revert', hash })}
            onResetTo={(hash) => { setAdv((a) => ({ ...a, resetTarget: hash })); setTab('advanced'); }}
            onTag={(hash) => { setAdv((a) => ({ ...a, tagHash: hash })); setTab('advanced'); }} />
        )}
        {tab === 'advanced' && (
          <AdvancedTab status={status} extras={extras} busy={busy} form={adv} onFormChange={setAdv}
            onStash={(message) => request({ kind: 'stash', message })}
            onStashPop={(index) => request({ kind: 'stashPop', index })}
            onStashDrop={(index) => request({ kind: 'stashDrop', index })}
            onReset={(mode, target) => request({ kind: 'reset', mode, target })}
            onTag={(name, hash) => request({ kind: 'tag', name, hash })}
            onDeleteTag={(name) => request({ kind: 'deleteTag', name })} />
        )}
      </div>
      {logPane}
      {dialogs}
    </div>
  );
}
