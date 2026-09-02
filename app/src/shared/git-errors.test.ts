import { describe, it, expect } from 'vitest';
import { explainGitError, gitResultText } from './git-errors';

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
});

describe('gitResultText', () => {
  it('joins stdout and stderr and trims', () => {
    expect(gitResultText({ ok: false, code: 1, stdout: 'out\n', stderr: '\nerr\n', command: 'git x' })).toBe('out\n\n\nerr');
    expect(gitResultText({ ok: true, code: 0, stdout: '', stderr: '', command: 'git x' })).toBe('');
  });
});
