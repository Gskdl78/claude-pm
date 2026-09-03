import type { GitResult } from './types';

const PUSH_REJECTED = '推送被拒：遠端有你還沒拉下來的新提交。請先按「拉取」，再重新推送。';
const AUTH = '認證失敗：無法登入 GitHub。請確認你已安裝並登入 Git Credential Manager，或檢查帳號權限。';
const NO_REMOTE_REPO = '找不到遠端倉庫：請確認網址正確、倉庫存在且你有權限存取。';
const NETWORK = '連不上 GitHub：請檢查網路連線後再試。';
const NOTHING_TO_COMMIT = '沒有可提交的內容：請先把變更加入暫存區。';

const NOT_A_COMMIT = '找不到這個提交：請確認 hash 或 HEAD~n 正確（歷史頁只列最近 30 筆）。';
const GH_FORBIDDEN = 'GitHub 拒絕這個操作（權限不足）：請確認 gh 登入的帳號有權在該帳號 / 組織建立倉庫。';
const GH_NOT_INSTALLED = '找不到 GitHub CLI（gh）：請先在終端機執行 winget install GitHub.cli，再執行 gh auth login 登入。';

/** 依序比對（先命中先贏，不分大小寫）。來源：git-panel errors.py，再補上批次一、二會遇到的情境。 */
export const GIT_ERROR_PATTERNS: ReadonlyArray<readonly [string, string]> = [
  ['[rejected]', PUSH_REJECTED],
  ['non-fast-forward', PUSH_REJECTED],
  // 這三條都夾帶 CONFLICT 字樣，必須排在通用的 CONFLICT 之前
  ['could not revert', '還原時發生衝突：請手動解決「變更」頁列出的衝突檔案後提交；要放棄還原，請在終端機執行 git revert --abort。'],
  ['stash entry is kept', '取回收藏時發生衝突：請解決「變更」頁列出的衝突檔案後提交（或丟棄變更）；這筆收藏仍保留在清單中。'],
  ['git rebase --continue', '變基時發生衝突：請解決衝突檔案後在終端機執行 git rebase --continue；要放棄，請執行 git rebase --abort。'],
  ['CONFLICT', '發生合併衝突：兩邊改了同一個地方。衝突檔案已列在「變更」頁，可交給 Claude Code 或手動解決後再提交；要放棄這次合併，請按衝突橫幅上的「中止合併」。'],
  ['Please tell me who you are', '尚未設定 git 使用者名稱與信箱：請在終端機執行 git config --global user.name "你的名字" 與 git config --global user.email "你的信箱"，再重新提交。'],
  ['Authentication failed', AUTH],
  ['could not read Username', AUTH],
  ['Permission denied (publickey)', AUTH],
  ['No configured push destination', '尚未設定推送目的地：請按「推送」開啟「發佈到 GitHub」精靈，或在終端機執行 git remote add origin <網址>。'],
  ['remote origin already exists', '已經設定過遠端 origin：這個專案已連到某個倉庫，請直接按「推送」；要換倉庫請在終端機執行 git remote set-url origin <網址>。'],
  ['does not appear to be a git repository', NO_REMOTE_REPO],
  ['Repository not found', NO_REMOTE_REPO],
  ['Could not resolve to a Repository', NO_REMOTE_REPO],
  ['not something we can merge', '找不到要合併的分支：請確認分支名稱正確。'],
  ['cannot pull with rebase', '有未提交的變更擋住了拉取：請先「提交」，或到「進階」頁「收藏」變更後再試。'],
  ['Please commit your changes or stash', '有未提交的變更擋住了這個操作：請先「提交」，或到「進階」頁「收藏」變更後再試。'],
  ['You have not concluded your merge', '合併尚未完成：請先解決衝突並提交，或按衝突橫幅上的「中止合併」。'],
  ['There is no merge to abort', '目前沒有進行中的合併：若正在變基或還原，請在終端機執行 git rebase --abort 或 git revert --abort。'],
  ['There is no tracking information', '目前分支尚未連結遠端分支：請先按「推送」建立追蹤關係，之後才能拉取。'],
  ["couldn't find remote ref", '遠端沒有這個分支：遠端倉庫上還沒有對應的分支可以拉取。'],
  ['index.lock', '另一個 git 程序正在執行（可能是終端機裡的 Claude Code）：請稍後再試；確定沒有其他程序時可刪除 .git/index.lock。'],
  ['Name already exists', 'GitHub 上已有同名倉庫：請換一個倉庫名稱，或改用「貼現有倉庫網址」連到既有的倉庫。'],
  ['a branch named', '分支已存在：請換一個名稱，或直接切換到該分支。'],
  ["' already exists", '標籤已存在：請換一個名稱，或先刪除舊標籤。'],
  ["' not found.", '找不到這個標籤：清單可能已過期，請重新開啟「進階」頁後再試。'],
  ['is not a stash reference', '找不到這筆收藏：清單可能已過期，請重新開啟「進階」頁後再試。'],
  ['invalid reference', '找不到這個分支：請確認名稱正確。'],
  ['unknown revision', NOT_A_COMMIT],
  ['bad revision', NOT_A_COMMIT],
  ['do not have the initial commit yet', '還沒有任何提交：收藏、重設與標籤都需要至少一個提交，請先提交一次。'],
  ['No local changes to save', '沒有可收藏的變更：工作目錄是乾淨的。'],
  ['nothing to commit', NOTHING_TO_COMMIT],
  ['no changes added to commit', NOTHING_TO_COMMIT],
  ['spawn gh ENOENT', GH_NOT_INSTALLED],
  ['gh auth login', '尚未登入 GitHub CLI：請在終端機執行 gh auth login，用瀏覽器完成登入後再試一次。'],
  ['Bad credentials', 'GitHub CLI 的登入已失效：請在終端機重新執行 gh auth login。'],
  ['HTTP 401', 'GitHub CLI 的登入已失效：請在終端機重新執行 gh auth login。'],
  ['Resource not accessible', GH_FORBIDDEN],
  ['HTTP 403', GH_FORBIDDEN],
  ['Could not resolve hostname', NETWORK],
  ['error connecting to', NETWORK],
  ['unable to access', NETWORK],
];

export function gitResultText(r: GitResult): string {
  return `${r.stdout}\n${r.stderr}`.trim();
}

export function explainGitError(text: string): string | null {
  const lower = text.toLowerCase();
  for (const [pattern, message] of GIT_ERROR_PATTERNS) {
    if (lower.includes(pattern.toLowerCase())) return message;
  }
  return null;
}

/** 推送被拒（遠端有本地沒有的提交）：面板據此顯示「先擷取 / 拉取（變基）」提示列，不提供強制推送。 */
export function isPushRejected(text: string): boolean {
  const lower = text.toLowerCase();
  return lower.includes('[rejected]') || lower.includes('non-fast-forward');
}
