import type { PublishChoice } from './types';
import { buildGitArgs, formatCommand, formatGitCommand, type ConfirmSpec } from './git-actions';

export type GhCommand =
  | { kind: 'version' }
  | { kind: 'authStatus' }
  | { kind: 'repoCreate'; name: string; isPrivate: boolean };

/** gh 的 argv 白名單：主程序只會執行這三種；name 已由 assertRepoName 驗證（不以 - 開頭）。 */
export function buildGhArgs(c: GhCommand): string[] {
  switch (c.kind) {
    case 'version': return ['--version'];
    case 'authStatus': return ['auth', 'status'];
    case 'repoCreate': return ['repo', 'create', c.name, c.isPrivate ? '--private' : '--public', '--source=.', '--remote=origin', '--push'];
  }
}

export function formatGhCommand(args: string[]): string {
  return formatCommand('gh', args);
}

export interface PublishSpec extends ConfirmSpec { command: string }

/** 發佈精靈最後一步的確認內容；url 路線是兩個 git 指令，確認框以兩行顯示。 */
export function describePublish(choice: PublishChoice): PublishSpec {
  if (choice.mode === 'create') {
    return {
      title: '發佈到 GitHub',
      danger: false,
      description: `在 GitHub 建立${choice.isPrivate ? '私人' : '公開'}倉庫「${choice.name}」，設為遠端 origin，並把目前內容推送上去。`,
      command: formatGhCommand(buildGhArgs({ kind: 'repoCreate', name: choice.name, isPrivate: choice.isPrivate })),
    };
  }
  const ctx = { hasHead: true };   // addRemote 與 push 都不看 HEAD
  return {
    title: '發佈到 GitHub',
    danger: false,
    description: `將這個專案連到 ${choice.url}（遠端名稱 origin），並把目前分支推送上去。`,
    command: [
      formatGitCommand(buildGitArgs({ kind: 'addRemote', url: choice.url }, ctx)),
      formatGitCommand(buildGitArgs({ kind: 'push' }, ctx)),
    ].join('\n'),
  };
}
