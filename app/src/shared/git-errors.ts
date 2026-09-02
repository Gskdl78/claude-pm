import type { GitResult } from './types';

const PUSH_REJECTED = '推送被拒：遠端有你還沒拉下來的新提交。請先按「拉取」，再重新推送。';
const AUTH = '認證失敗：無法登入 GitHub。請確認你已安裝並登入 Git Credential Manager，或檢查帳號權限。';
const NO_REMOTE_REPO = '找不到遠端倉庫：請確認網址正確、倉庫存在且你有權限存取。';
const NETWORK = '連不上 GitHub：請檢查網路連線後再試。';
const NOTHING_TO_COMMIT = '沒有可提交的內容：請先把變更加入暫存區。';

/** 依序比對（先命中先贏，不分大小寫）。來源：git-panel errors.py，再補上批次一會遇到的情境。 */
export const GIT_ERROR_PATTERNS: ReadonlyArray<readonly [string, string]> = [
  ['[rejected]', PUSH_REJECTED],
  ['non-fast-forward', PUSH_REJECTED],
  ['CONFLICT', '發生合併衝突：兩邊改了同一個地方。衝突檔案已列在「變更」頁，可交給 Claude Code 或手動解決後再提交；要放棄這次合併，請在終端機執行 git merge --abort。'],
  ['Please tell me who you are', '尚未設定 git 使用者名稱與信箱：請在終端機執行 git config --global user.name "你的名字" 與 git config --global user.email "你的信箱"，再重新提交。'],
  ['Authentication failed', AUTH],
  ['could not read Username', AUTH],
  ['Permission denied (publickey)', AUTH],
  ['No configured push destination', '尚未設定遠端倉庫：這個專案還沒連到 GitHub。請在終端機執行 git remote add origin <網址> 後再推送（「發佈到 GitHub」精靈將於下一批次提供）。'],
  ['does not appear to be a git repository', NO_REMOTE_REPO],
  ['Repository not found', NO_REMOTE_REPO],
  ['not something we can merge', '找不到要合併的分支：請確認分支名稱正確。'],
  ['Please commit your changes or stash', '有未提交的變更擋住了這個操作：請先「提交」，或把變更丟棄後再試。'],
  ['You have not concluded your merge', '合併尚未完成：請先解決衝突並提交，或在終端機執行 git merge --abort 中止合併。'],
  ['There is no tracking information', '目前分支尚未連結遠端分支：請先按「推送」建立追蹤關係，之後才能拉取。'],
  ["couldn't find remote ref", '遠端沒有這個分支：遠端倉庫上還沒有對應的分支可以拉取。'],
  ['index.lock', '另一個 git 程序正在執行（可能是終端機裡的 Claude Code）：請稍後再試；確定沒有其他程序時可刪除 .git/index.lock。'],
  ['Name already exists', 'GitHub 上已有同名倉庫：請換一個倉庫名稱，或改用「貼現有倉庫網址」連到既有的倉庫。'],
  ['a branch named', '分支已存在：請換一個名稱，或直接切換到該分支。'],
  ['invalid reference', '找不到這個分支：請確認名稱正確。'],
  ['nothing to commit', NOTHING_TO_COMMIT],
  ['no changes added to commit', NOTHING_TO_COMMIT],
  ['gh auth login', '尚未登入 GitHub CLI：請在終端機執行 gh auth login，用瀏覽器完成登入後再試一次。'],
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
