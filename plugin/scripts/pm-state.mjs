#!/usr/bin/env node
// CLI：node .pm/pm-state.mjs <cmd> [...args]   （在專案根目錄執行）
import { basename, dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import * as lib from './pm-state-lib.mjs';

const USAGE = `usage: pm-state <command>
  init [name]                         建立初始 state
  get                                 讀取 state
  set-type <web|cli|library|other>
  start <stage>
  done <stage> [--commit <sha>]
  block <stage> --reason <text>
  add-doc <stage> <path>
  add-issue --stage <s> --symptom <t> [--task <T>] [--cause <c>] [--fix <f>] [--commit <sha>]
  update-issue <id> [--cause <c>] [--fix <f>] [--commit <sha>]
  history [rootDir]                   彙整同層其他專案的 issue
  rebuild [name]                      依檔案與 git log 重建 state
stages: ${lib.STAGES.join(' ')}`;

function parseArgs(args) {
  const o = { _: [] };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith('--')) {
      o[a.slice(2)] = args[i + 1] ?? '';
      i++;
    } else {
      o._.push(a);
    }
  }
  return o;
}

function gitSubjects(cwd) {
  if (!existsSync(resolve(cwd, '.git'))) return [];
  try {
    return execFileSync('git', ['log', '--format=%h %s'], { cwd, encoding: 'utf8' })
      .split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

function safeName(cwd) {
  try { return lib.readState(cwd).name; } catch { return basename(cwd); }
}

export function main(argv, cwd = process.cwd()) {
  const [cmd, ...rest] = argv;
  const f = parseArgs(rest);
  const out = (x) => process.stdout.write(JSON.stringify(x, null, 2) + '\n');
  const save = (s) => { lib.writeState(cwd, s); return s; };

  switch (cmd) {
    case 'init': {
      if (existsSync(lib.statePath(cwd))) throw new Error(`state already exists: ${lib.statePath(cwd)}`);
      out(save(lib.initialState(f._[0] || basename(cwd))));
      return 0;
    }
    case 'get': out(lib.readState(cwd)); return 0;
    case 'set-type': {
      const s = lib.readState(cwd);
      s.type = f._[0];
      out(save(s));
      return 0;
    }
    case 'start': out(save(lib.startStage(lib.readState(cwd), f._[0]))); return 0;
    case 'done': out(save(lib.finishStage(lib.readState(cwd), f._[0], { commit: f.commit }))); return 0;
    case 'block': out(save(lib.blockStage(lib.readState(cwd), f._[0], f.reason))); return 0;
    case 'add-doc': out(save(lib.addDoc(lib.readState(cwd), f._[0], f._[1]))); return 0;
    case 'add-issue': {
      const { state, issue } = lib.addIssue(lib.readState(cwd), {
        stage: f.stage, task: f.task, symptom: f.symptom, cause: f.cause, fix: f.fix, commit: f.commit,
      });
      save(state);
      out({ id: issue.id, issue });
      return 0;
    }
    case 'update-issue': {
      const s = lib.updateIssue(lib.readState(cwd), f._[0], { cause: f.cause, fix: f.fix, commit: f.commit });
      save(s);
      out(s.issues.find((i) => i.id === Number(f._[0])));
      return 0;
    }
    case 'history': {
      const root = f._[0] ? resolve(cwd, f._[0]) : dirname(resolve(cwd));
      out(lib.summarizeHistory(lib.collectHistory(root, { exclude: cwd })));
      return 0;
    }
    case 'rebuild': {
      const name = f._[0] || safeName(cwd);
      const s = lib.rebuildState(name, {
        exists: (rel) => existsSync(resolve(cwd, rel)),
        commits: gitSubjects(cwd),
      });
      out(save(s));
      return 0;
    }
    default:
      process.stderr.write(USAGE + '\n');
      return 2;
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (e) {
    process.stderr.write(`pm-state: ${e.message}\n`);
    process.exitCode = 1;
  }
}
