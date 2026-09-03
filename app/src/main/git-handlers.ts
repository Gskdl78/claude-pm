import type { GhCheck, GitAction, GitBranches, GitDiffMode, GitExtras, GitResult, GitStatus } from '../shared/types';
import { buildGitArgs } from '../shared/git-actions';
import { assertDiffMode, assertHash, assertRelPath, assertRepoName, validateGitAction } from '../shared/git-validate';
import { getBranches, getDiff, getExtras, getStatus, hasHead, runGit, showCommit, syncRepo } from './git-run';
import { checkGh, createRepo } from './gh-run';

export interface GitHandlers {
  'git:status': (path: string) => Promise<GitStatus>;
  'git:branches': (path: string) => Promise<GitBranches>;
  'git:diff': (path: string, file: string, mode: GitDiffMode) => Promise<string>;
  'git:show': (path: string, hash: string) => Promise<string>;
  'git:run': (path: string, action: GitAction) => Promise<GitResult>;
  'git:extras': (path: string) => Promise<GitExtras>;
  'gh:check': (path: string) => Promise<GhCheck>;
  'gh:repoCreate': (path: string, name: string, isPrivate: boolean) => Promise<GitResult>;
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
      // 同步是多步驟；逐 hunk 的 patch 走 stdin，不進 argv
      if (a.kind === 'sync') return syncRepo(dir);
      if (a.kind === 'applyPatch') return runGit(dir, buildGitArgs(a, { hasHead: true }), { input: a.patch });
      const head = NEEDS_HEAD_CHECK.has(a.kind) ? await hasHead(dir) : true;
      return runGit(dir, buildGitArgs(a, { hasHead: head }));
    },
    'git:extras': async (path) => getExtras(guard(path)),
    'gh:check': async (path) => checkGh(guard(path)),
    // 預設私人：只有明確傳 false 才公開
    'gh:repoCreate': async (path, name, isPrivate) => createRepo(guard(path), assertRepoName(name), isPrivate !== false),
  };
}
