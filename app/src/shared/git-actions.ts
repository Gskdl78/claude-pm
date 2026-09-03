import type { GitAction, GitResetMode, GitStatus } from './types';

export interface GitActionContext {
  /** HEAD 是否存在；還沒有任何 commit 時為 false，unstage / discard 要改走別的指令。 */
  hasHead: boolean;
}

export interface ConfirmSpec {
  title: string;
  description: string;
  danger: boolean;
}

/** 重設三種模式的白話說明（移植自 git-panel wizards.py）；hard 是唯一會丟工作的模式。 */
export const RESET_MODES: Record<GitResetMode, string> = {
  soft: '保留所有變更（只把提交紀錄退回，檔案內容不動）',
  mixed: '保留檔案變更，但取消暫存（預設模式）',
  hard: '完全丟棄！檔案內容也會退回，之後的變更全部消失',
};

/** 同步是多步驟（pull --rebase → push），由主程序的 syncRepo 執行；顯示與結果都用這一份字串。 */
export const SYNC_COMMAND = 'git pull --rebase && git push -u origin HEAD';

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
    case 'pullRebase': return ['pull', '--rebase'];
    case 'stash': return a.message === null ? ['stash', 'push', '-u'] : ['stash', 'push', '-u', '-m', a.message];
    case 'stashPop': return ['stash', 'pop', `stash@{${a.index}}`];
    case 'stashDrop': return ['stash', 'drop', `stash@{${a.index}}`];
    case 'reset': return ['reset', `--${a.mode}`, a.target];
    case 'revert': return ['revert', '--no-edit', a.hash];
    case 'tag': return a.hash === null ? ['tag', a.name] : ['tag', a.name, a.hash];
    case 'deleteTag': return ['tag', '-d', a.name];
    case 'abortMerge': return ['merge', '--abort'];
    case 'addRemote': return ['remote', 'add', 'origin', a.url];
    case 'commitPaths': return ['commit', '-m', a.message, '--', ...a.paths];
    case 'applyPatch': return ['apply', '--cached', ...(a.reverse ? ['-R'] : []), '--whitespace=nowarn', '-'];
    // sync 沒有單一 argv：主程序走 syncRepo，顯示用 SYNC_COMMAND。回半條指令只會誤導呼叫者
    case 'sync': throw new Error('sync is executed by syncRepo');
  }
}

function quote(arg: string): string {
  return /[\s"]/.test(arg) ? `"${arg.replace(/"/g, '\\"')}"` : arg;
}

/** 只供顯示：含空白或雙引號的參數加引號。git 版省略固定的 -c 前綴；gh 版由 gh-actions.ts 包裝。 */
export function formatCommand(exe: string, args: string[]): string {
  return [exe, ...args.map(quote)].join(' ');
}

export function formatGitCommand(args: string[]): string {
  return formatCommand('git', args);
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
    case 'pullRebase':
      return { title: '拉取（變基）', description: '從遠端（origin）下載最新的提交，並把你的本地提交接到它們之後（rebase）。若有衝突需要手動解決。', danger: false };
    case 'stash':
      return {
        title: '收藏變更',
        description: `把目前所有未提交的變更（含新檔案）先收起來，讓工作目錄變乾淨；之後可用「取回」拿回來。${a.message === null ? '' : `說明：「${a.message}」。`}`,
        danger: false,
      };
    case 'stashPop':
      return { title: '取回收藏', description: `把收藏 stash@{${a.index}} 的變更放回工作目錄，並從收藏清單移除。若與目前變更衝突，需要手動解決。`, danger: false };
    case 'stashDrop':
      return { title: '丟棄收藏', description: `永久刪除收藏 stash@{${a.index}}，裡面的變更無法從 git 找回。`, danger: true };
    case 'reset':
      return { title: '重設', description: `把目前的 ${st.branch} 退回到 ${a.target}。模式 ${a.mode}：${RESET_MODES[a.mode]}`, danger: a.mode === 'hard' };
    case 'revert':
      return { title: '還原提交', description: `建立一個新提交來抵銷 ${a.hash} 的變更（原本的歷史紀錄會保留）。若與後來的提交衝突，需要手動解決。`, danger: false };
    case 'tag':
      return { title: '建立標籤', description: `${a.hash === null ? '在目前的提交上' : `在提交 ${a.hash} 上`}建立標籤 ${a.name}，方便日後找到這個版本。`, danger: false };
    case 'deleteTag':
      return { title: '刪除標籤', description: `刪除本地標籤 ${a.name}（若已推送到遠端，遠端的標籤不受影響）。`, danger: false };
    case 'abortMerge':
      return { title: '中止合併', description: '放棄這次合併，工作目錄與索引回到合併前的狀態；合併過程中手動改過的衝突檔案會被還原。', danger: false };
    case 'addRemote':
      return { title: '設定遠端', description: `把這個專案連到 ${a.url}（遠端名稱 origin）。`, danger: false };
    case 'applyPatch':
      return null;
    case 'sync':
      return { title: '同步', description: '先從遠端拉取並變基，再推送目前分支；還沒有上游分支時直接推送並建立追蹤。若有衝突需要手動解決。', danger: false };
    case 'commitPaths':
      return { title: '提交檔案', description: `只提交下列檔案的目前內容（不動其他已暫存的變更）：${a.paths.join('、')}。訊息：「${a.message}」。`, danger: false };
  }
}
