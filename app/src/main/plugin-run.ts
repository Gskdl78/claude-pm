import { execFile } from 'node:child_process';

/** 用目前的執行檔以 Node 模式跑一支 .mjs 腳本，回傳 stdout。 */
export function runNodeScript(script: string, args: string[], cwd?: string): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    execFile(
      process.execPath,
      [script, ...args],
      { cwd, env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, windowsHide: true, maxBuffer: 4 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err) reject(new Error((stderr || '').trim() || err.message));
        else resolvePromise(stdout);
      },
    );
  });
}
