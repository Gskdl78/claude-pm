import type { GitAction, GitStatus } from './types';

export interface GitActionContext {
  /** HEAD 是否存在；還沒有任何 commit 時為 false，unstage / discard 要改走別的指令。 */
  hasHead: boolean;
}

export interface ConfirmSpec {
  title: string;
  description: string;
  danger: boolean;
}

/** 動作 → git argv。renderer 用它預覽指令，主程序用同一份執行，保證兩者一致。 */
export function buildGitArgs(a: GitAction, ctx: GitActionContext): string[] {
  switch (a.kind) {
    case 'init': return ['init', '-b', 'main'];
    case 'stage': return ['add', '--', a.file];
    case 'stageAll': return ['add', '-A'];
    case 'unstage': return ctx.hasHead ? ['reset', 'HEAD', '--', a.file] : ['rm', '--cached', '-r', '--', a.file];
    case 'unstageAll': return ctx.hasHead ? ['reset', 'HEAD'] : ['rm', '--cached', '-r', '--', '.'];
    case 'discard':
      if (a.untracked) return ['clean', '-fd', '--', a.file];
      return ctx.hasHead ? ['restore', '--staged', '--worktree', '--', a.file] : ['rm', '-r', '-f', '--', a.file];
    case 'commit': return a.amend ? ['commit', '--amend', '-m', a.message] : ['commit', '-m', a.message];
    case 'switch': return ['switch', a.branch];
    case 'createBranch': return ['switch', '-c', a.branch];
    case 'merge': return ['merge', '--no-edit', a.branch];
    case 'push': return ['push', '-u', 'origin', 'HEAD'];
    case 'pull': return ['pull'];
    case 'fetch': return ['fetch'];
  }
}

function quote(arg: string): string {
  return /[\s"]/.test(arg) ? `"${arg.replace(/"/g, '\\"')}"` : arg;
}

/** 只供顯示：省略固定的 -c 前綴，含空白或雙引號的參數加引號。 */
export function formatGitCommand(args: string[]): string {
  return ['git', ...args.map(quote)].join(' ');
}

/** 回傳 null 表示不需要確認（可逆且不動工作目錄）。 */
export function describeGitAction(a: GitAction, st: GitStatus): ConfirmSpec | null {
  switch (a.kind) {
    case 'stage':
    case 'stageAll':
    case 'unstage':
    case 'unstageAll':
    case 'fetch':
      return null;
    case 'init':
      return { title: '初始化', description: '在這個資料夾建立新的 git 專案（分支名稱 main）。', danger: false };
    case 'discard':
      return a.untracked
        ? { title: '丟棄', description: `刪除尚未加入版本控制的 ${a.file}。這個檔案刪掉後無法從 git 找回。`, danger: true }
        : { title: '丟棄', description: `丟棄 ${a.file} 的所有未提交變更，內容回到最後一次提交的版本。這些變更無法復原。`, danger: true };
    case 'commit': {
      const n = st.files.filter((f) => f.staged).length;
      return a.amend
        ? { title: '修改上一次提交', description: `用目前已暫存的 ${n} 個檔案與新訊息「${a.message}」覆寫最近一次提交。若那次提交已推送到遠端，之後推送會被拒絕。`, danger: true }
        : { title: '提交', description: `將已暫存的 ${n} 個檔案提交到本地紀錄，訊息：「${a.message}」。`, danger: false };
    }
    case 'switch':
      return { title: '切換分支', description: `從 ${st.branch} 切換到 ${a.branch}，工作目錄的檔案會跟著變成該分支的內容。`, danger: false };
    case 'createBranch':
      return { title: '新增分支', description: `以目前的 ${st.branch} 為起點建立新分支 ${a.branch} 並切換過去。`, danger: false };
    case 'merge':
      return { title: '合併', description: `把 ${a.branch} 分支的提交合併進目前的 ${st.branch} 分支。若兩邊改到同一處會產生衝突，需要手動解決。`, danger: false };
    case 'push': {
      const what = st.ahead > 0 ? ` ${st.ahead} 個提交` : '本地提交';
      return { title: '推送', description: `將 ${st.branch} 分支的${what}上傳到遠端（origin）。`, danger: false };
    }
    case 'pull':
      return { title: '拉取', description: '從遠端（origin）下載最新的提交並合併到目前分支。', danger: false };
  }
}
