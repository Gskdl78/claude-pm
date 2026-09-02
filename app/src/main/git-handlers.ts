import type { GitAction, GitBranches, GitDiffMode, GitResult, GitStatus } from '../shared/types';
import { buildGitArgs } from '../shared/git-actions';
import { assertDiffMode, assertHash, assertRelPath, validateGitAction } from '../shared/git-validate';
import { getBranches, getDiff, getStatus, hasHead, runGit, showCommit } from './git-run';

export interface GitHandlers {
  'git:status': (path: string) => Promise<GitStatus>;
  'git:branches': (path: string) => Promise<GitBranches>;
  'git:diff': (path: string, file: string, mode: GitDiffMode) => Promise<string>;
  'git:show': (path: string, hash: string) => Promise<string>;
  'git:run': (path: string, action: GitAction) => Promise<GitResult>;
}

/** 這些動作的指令取決於 HEAD 是否存在（還沒有任何 commit 時 HEAD 不存在）。 */
const NEEDS_HEAD_CHECK = new Set<GitAction['kind']>(['unstage', 'unstageAll', 'discard']);

/** guard = assertInsideRoot(cfg.root, path)；每個 handler 的第一個參數都先過它。 */
export function createGitHandlers(guard: (p: string) => string): GitHandlers {
  return {
    'git:status': async (path) => getStatus(guard(path)),
    'git:branches': async (path) => getBranches(guard(path)),
    'git:diff': async (path, file, mode) => getDiff(guard(path), assertRelPath(file), assertDiffMode(mode)),
    'git:show': async (path, hash) => showCommit(guard(path), assertHash(hash)),
    'git:run': async (path, action) => {
      const dir = guard(path);
      const a = validateGitAction(action);
      const head = NEEDS_HEAD_CHECK.has(a.kind) ? await hasHead(dir) : true;
      return runGit(dir, buildGitArgs(a, { hasHead: head }));
    },
  };
}
