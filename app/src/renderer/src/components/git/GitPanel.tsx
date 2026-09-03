import { useCallback, useEffect, useRef, useState } from 'react';
import type { GitAction, GitBranches, GitCommit, GitDiffMode, GitStatus } from '../../../../shared/types';
import { buildGitArgs, describeGitAction, formatGitCommand } from '../../../../shared/git-actions';
import { explainGitError, gitResultText } from '../../../../shared/git-errors';
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

type Tab = 'changes' | 'branches' | 'history';
const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'changes', label: '變更' }, { id: 'branches', label: '分支' }, { id: 'history', label: '歷史' },
];

/** 工作目錄的編輯不會動到 .git，靠這個低頻輪詢補上（視窗可見且非 busy 時才跑）。 */
export const STATUS_POLL_MS = 3000;
const MAX_LOG = 200;
const NO_REMOTE_HINT = '尚未設定遠端倉庫：請先在終端機執行 git remote add origin <網址>，之後再推送。（「發佈到 GitHub」精靈將於下一批次提供）';
const EMPTY_BRANCHES: GitBranches = { current: '', all: [] };

interface Props {
  path: string | null;
  commits: GitCommit[];
  /** App 收到 project:git 事件時遞增；面板據此重讀狀態。 */
  revision: number;
}

interface Pending { request: ConfirmRequest; action: GitAction }
interface Viewer { title: string; text: string }

export function GitPanel({ path, commits, revision }: Props) {
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
  const seqRef = useRef(0);
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
  }, [path]);

  // 專案切換與 watcher 事件（revision）→ 立即重讀
  useEffect(() => { void refresh(); }, [refresh, revision]);

  useEffect(() => {
    if (!path) return undefined;
    const tick = () => { if (document.visibilityState === 'visible' && !busy) void refresh(); };
    const timer = setInterval(tick, STATUS_POLL_MS);
    window.addEventListener('focus', tick);
    return () => { clearInterval(timer); window.removeEventListener('focus', tick); };
  }, [path, refresh, busy]);

  const execute = useCallback(async (action: GitAction) => {
    if (!path) return;
    setBusy(true);
    try {
      const r = await pm.git.run(path, action);
      // 期間換了專案：舊專案的結果不該進新專案的輸出，也不該觸發新專案的重讀
      if (pathRef.current !== path) return;
      log('cmd', r.command);
      if (r.ok) {
        log('ok', '完成 ✓');
        // 提交成功才清空輸入，失敗時訊息要留著讓使用者改
        if (action.kind === 'commit') { setMessage(''); setAmend(false); }
      } else {
        const text = gitResultText(r);
        log('error', explainGitError(text) ?? '執行失敗，原始輸出如下：', text);
      }
    } catch (e) {
      if (pathRef.current !== path) return;
      log('error', errorMessage(e));
    } finally {
      setBusy(false);
      if (pathRef.current === path) void refresh();
    }
  }, [path, log, refresh]);

  const request = useCallback((action: GitAction) => {
    if (!status || busy) return;
    const spec = describeGitAction(action, status);
    if (!spec) { void execute(action); return; }
    const command = formatGitCommand(buildGitArgs(action, { hasHead: !status.noCommits }));
    setPending({ request: { ...spec, command }, action });
  }, [status, busy, execute]);

  const confirmPending = () => {
    if (!pending) return;
    const { action } = pending;
    setPending(null);
    void execute(action);
  };

  const syncAction = (kind: 'push' | 'pull') => {
    if (!status) return;
    if (!status.hasRemote) { log('hint', NO_REMOTE_HINT); return; }
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
          合併進行中{conflicts > 0 ? `：${conflicts} 個檔案有衝突` : ''}。請解決衝突後把檔案「標記為已解決」再提交（可交給 Claude Code）；要放棄合併，請在終端機執行 git merge --abort。
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
        {tab === 'history' && <HistoryTab commits={commits} onShow={(hash) => { void openCommit(hash); }} />}
      </div>
      {logPane}
      {dialogs}
    </div>
  );
}
