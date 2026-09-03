import { describe, it, expect } from 'vitest';
import { buildGhArgs, describePublish, formatGhCommand } from './gh-actions';

describe('buildGhArgs / formatGhCommand', () => {
  it('produces only the three allow-listed gh commands', () => {
    expect(buildGhArgs({ kind: 'version' })).toEqual(['--version']);
    expect(buildGhArgs({ kind: 'authStatus' })).toEqual(['auth', 'status']);
    expect(buildGhArgs({ kind: 'repoCreate', name: 'claude-pm', isPrivate: true }))
      .toEqual(['repo', 'create', 'claude-pm', '--private', '--source=.', '--remote=origin', '--push']);
    expect(buildGhArgs({ kind: 'repoCreate', name: 'x', isPrivate: false })[3]).toBe('--public');
    expect(formatGhCommand(buildGhArgs({ kind: 'repoCreate', name: 'x', isPrivate: true }))).toBe('gh repo create x --private --source=. --remote=origin --push');
  });
});

describe('describePublish', () => {
  it('describes both publish routes with the exact commands', () => {
    expect(describePublish({ mode: 'create', name: 'x', isPrivate: true })).toEqual({
      title: '發佈到 GitHub', danger: false,
      description: '在 GitHub 建立私人倉庫「x」，設為遠端 origin，並把目前內容推送上去。',
      command: 'gh repo create x --private --source=. --remote=origin --push',
    });
    expect(describePublish({ mode: 'create', name: 'x', isPrivate: false }).description).toContain('公開倉庫');
    expect(describePublish({ mode: 'url', url: 'git@github.com:o/r.git' })).toEqual({
      title: '發佈到 GitHub', danger: false,
      description: '將這個專案連到 git@github.com:o/r.git（遠端名稱 origin），並把目前分支推送上去。',
      command: 'git remote add origin git@github.com:o/r.git\ngit push -u origin HEAD',
    });
  });
});
