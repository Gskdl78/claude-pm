import type { GhCheck, GitResult } from '../shared/types';
import { buildGhArgs, formatGhCommand } from '../shared/gh-actions';
import { gitResultText } from '../shared/git-errors';
import { capture, gitEnv } from './git-run';

const MAX_DETAIL = 2000;

// 與 git 同一組環境變數，再關掉 gh 的互動提示、更新通知與色碼。
function ghEnv(): NodeJS.ProcessEnv {
  return { ...gitEnv(), GH_PROMPT_DISABLED: '1', GH_NO_UPDATE_NOTIFIER: '1', NO_COLOR: '1' };
}

/** 執行 gh；永不 reject。exe 只供測試替換（用 git 假扮 gh），handler 一律用預設值；command 永遠以 gh 顯示。 */
export function runGh(dir: string, args: string[], exe = 'gh'): Promise<GitResult> {
  return capture(exe, args, dir, ghEnv(), formatGhCommand(args));
}

/** 精靈第一步：有沒有 gh、有沒有登入。找不到程式時 capture 回 code 127，stderr 含 ENOENT。 */
export async function checkGh(dir: string, exe = 'gh'): Promise<GhCheck> {
  const v = await runGh(dir, buildGhArgs({ kind: 'version' }), exe);
  if (!v.ok) return { installed: false, version: null, authed: false, detail: gitResultText(v).slice(0, MAX_DETAIL) };
  const a = await runGh(dir, buildGhArgs({ kind: 'authStatus' }), exe);
  return {
    installed: true,
    version: v.stdout.split('\n')[0]?.trim() || null,
    authed: a.ok,
    detail: gitResultText(a).slice(0, MAX_DETAIL),
  };
}

export function createRepo(dir: string, name: string, isPrivate: boolean, exe = 'gh'): Promise<GitResult> {
  return runGh(dir, buildGhArgs({ kind: 'repoCreate', name, isPrivate }), exe);
}
