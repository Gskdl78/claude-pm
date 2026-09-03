import { describe, it, expect } from 'vitest';
import { explainGitError, gitResultText, isPushRejected } from './git-errors';

describe('explainGitError', () => {
  it('maps common failures to plain Traditional Chinese', () => {
    expect(explainGitError('! [rejected] main -> main (fetch first)')).toMatch(/拉取/);
    expect(explainGitError('CONFLICT (content): Merge conflict in a.txt')).toMatch(/衝突/);
    expect(explainGitError("fatal: Authentication failed for 'https://github.com/x'")).toMatch(/認證失敗/);
    expect(explainGitError('*** Please tell me who you are.')).toMatch(/user\.name/);
    expect(explainGitError("fatal: a branch named 'dev' already exists")).toMatch(/分支已存在/);
    expect(explainGitError('Name already exists on this account')).toMatch(/同名倉庫/);
    expect(explainGitError('fatal: invalid reference: nope')).toMatch(/找不到這個分支/);
    expect(explainGitError("fatal: Unable to create 'C:/x/.git/index.lock': File exists.")).toMatch(/另一個 git 程序/);
    expect(explainGitError('There is no tracking information for the current branch.')).toMatch(/尚未連結遠端分支/);
    expect(explainGitError('fatal: unable to access https://github.com/x/: Could not resolve host')).toMatch(/連不上/);
    expect(explainGitError("fatal: 'origin' does not appear to be a git repository")).toMatch(/找不到遠端倉庫/);
    expect(explainGitError('nothing to commit, working tree clean')).toMatch(/沒有可提交的內容/);
  });

  it('is case-insensitive and returns null for unknown output', () => {
    expect(explainGitError('error: merge CONFLICT here')).toMatch(/衝突/);
    expect(explainGitError('some random error')).toBeNull();
    expect(explainGitError('')).toBeNull();
  });

  it('maps batch-2 stash / reset / revert / rebase / remote / gh situations, specific before generic', () => {
    expect(explainGitError('error: could not revert abc1234... x\nCONFLICT (content): Merge conflict in a.txt')).toMatch(/還原時發生衝突/);
    expect(explainGitError('CONFLICT (content): Merge conflict in a.txt\nThe stash entry is kept in case you need it again.')).toMatch(/取回收藏時發生衝突/);
    expect(explainGitError('CONFLICT (content): Merge conflict in a.txt\nhint: Resolve all conflicts manually, mark them as resolved with\nhint: then run "git rebase --continue".')).toMatch(/變基時發生衝突/);
    expect(explainGitError('fatal: There is no merge to abort (MERGE_HEAD missing).')).toMatch(/沒有進行中的合併/);
    expect(explainGitError('fatal: You do not have the initial commit yet')).toMatch(/還沒有任何提交/);
    expect(explainGitError('No local changes to save')).toMatch(/沒有可收藏的變更/);
    expect(explainGitError("error: 'stash@{3}' is not a stash reference")).toMatch(/找不到這筆收藏/);
    expect(explainGitError("fatal: ambiguous argument 'HEAD~9': unknown revision or path not in the working tree.")).toMatch(/找不到這個提交/);
    expect(explainGitError("fatal: bad revision 'zzz'")).toMatch(/找不到這個提交/);
    expect(explainGitError("fatal: tag 'v1' already exists")).toMatch(/標籤已存在/);
    expect(explainGitError("error: tag 'v9' not found.")).toMatch(/找不到這個標籤/);
    expect(explainGitError('error: cannot pull with rebase: You have unstaged changes.\nerror: please commit or stash them.')).toMatch(/擋住了拉取/);
    expect(explainGitError('error: remote origin already exists.')).toMatch(/已經設定過遠端 origin/);
    expect(explainGitError('spawn gh ENOENT')).toMatch(/找不到 GitHub CLI/);
    expect(explainGitError('You are not logged into any GitHub hosts. To log in, run: gh auth login')).toMatch(/尚未登入 GitHub CLI/);
    expect(explainGitError('HTTP 401: Bad credentials (https://api.github.com/graphql)')).toMatch(/登入已失效/);
    expect(explainGitError('GraphQL: Resource not accessible by integration (createRepository)')).toMatch(/權限不足/);
    expect(explainGitError('HTTP 403: Must have admin rights to Repository.')).toMatch(/權限不足/);
    expect(explainGitError('GraphQL: Could not resolve to a Repository with the name')).toMatch(/找不到遠端倉庫/);
    expect(explainGitError('GraphQL: Name already exists on this account (createRepository)')).toMatch(/同名倉庫/);
    expect(explainGitError('Please commit your changes or stash them before you switch branches.')).toMatch(/收藏/);
  });
});

describe('gitResultText', () => {
  it('joins stdout and stderr and trims', () => {
    expect(gitResultText({ ok: false, code: 1, stdout: 'out\n', stderr: '\nerr\n', command: 'git x' })).toBe('out\n\n\nerr');
    expect(gitResultText({ ok: true, code: 0, stdout: '', stderr: '', command: 'git x' })).toBe('');
  });
});

describe('isPushRejected', () => {
  it('recognises both rejection phrasings and nothing else', () => {
    expect(isPushRejected('! [rejected] main -> main (fetch first)')).toBe(true);
    expect(isPushRejected('error: failed to push some refs\nhint: Updates were rejected because the tip is behind (non-fast-forward)')).toBe(true);
    expect(isPushRejected('Everything up-to-date')).toBe(false);
    expect(isPushRejected('')).toBe(false);
  });
});
