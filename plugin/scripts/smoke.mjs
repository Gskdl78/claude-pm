#!/usr/bin/env node
// 手動 smoke：scaffold 一個暫存專案並用真實 Claude Code 跑 /stage-env。
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { scaffoldProject } from './scaffold.mjs';
import { readState } from './pm-state-lib.mjs';

const root = resolve(process.argv[2] ?? tmpdir());
const name = `pm-smoke-${Date.now()}`;
const dir = join(root, name);

console.log(`scaffolding ${dir}`);
scaffoldProject({ targetDir: dir, name });

console.log('running claude -p "/stage-env" ...');
const r = spawnSync('claude', ['-p', '/stage-env', '--permission-mode', 'acceptEdits'], {
  cwd: dir, stdio: 'inherit', shell: true,
});
if (r.status !== 0) {
  console.error(`claude exited with ${r.status}`);
  process.exit(1);
}

const state = readState(dir);
const log = spawnSync('git', ['log', '--oneline'], { cwd: dir, encoding: 'utf8' }).stdout;
console.log(JSON.stringify(state, null, 2));
console.log(log);
if (state.stages.env.status !== 'done') {
  console.error('FAIL: env stage is not done');
  process.exit(1);
}
console.log('OK');
