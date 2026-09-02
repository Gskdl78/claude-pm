// 純函式狀態庫：無外部依賴，種入專案後可直接用 node 執行。
import {
  readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync, renameSync,
} from 'node:fs';
import { join, dirname, resolve } from 'node:path';

export const STAGES = ['env', 'design', 'tech', 'build', 'verify'];
export const TYPES = ['web', 'cli', 'library', 'other'];
export const STATUSES = ['pending', 'in_progress', 'done', 'blocked'];

export function initialState(name) {
  const stages = {};
  for (const s of STAGES) stages[s] = { status: 'pending' };
  return { version: 1, name, type: 'other', stage: 'env', stages, issues: [] };
}

export function statePath(projectDir) {
  return join(projectDir, '.pm', 'state.json');
}

export function validate(s) {
  if (!s || typeof s !== 'object') throw new Error('state must be an object');
  if (s.version !== 1) throw new Error(`unsupported state version: ${s.version}`);
  if (typeof s.name !== 'string' || !s.name) throw new Error('name must be a non-empty string');
  if (!TYPES.includes(s.type)) throw new Error(`type must be one of ${TYPES.join('|')}, got ${s.type}`);
  if (![...STAGES, 'done'].includes(s.stage)) throw new Error(`stage must be one of ${[...STAGES, 'done'].join('|')}, got ${s.stage}`);
  if (!s.stages || typeof s.stages !== 'object') throw new Error('stages must be an object');
  for (const st of STAGES) {
    const info = s.stages[st];
    if (!info || !STATUSES.includes(info.status)) {
      throw new Error(`stages.${st}.status must be one of ${STATUSES.join('|')}`);
    }
  }
  if (!Array.isArray(s.issues)) throw new Error('issues must be an array');
}

export function readState(projectDir) {
  const p = statePath(projectDir);
  if (!existsSync(p)) throw new Error(`state not found: ${p}`);
  let raw;
  try {
    raw = JSON.parse(readFileSync(p, 'utf8'));
  } catch (e) {
    throw new Error(`state corrupt: ${p}: ${e.message}`);
  }
  try {
    validate(raw);
  } catch (e) {
    throw new Error(`state corrupt: ${p}: ${e.message}`);
  }
  return raw;
}

export function writeState(projectDir, state) {
  validate(state);
  const p = statePath(projectDir);
  mkdirSync(dirname(p), { recursive: true });
  const tmp = p + '.tmp';
  writeFileSync(tmp, JSON.stringify(state, null, 2) + '\n');
  renameSync(tmp, p);
}

function assertStage(stage) {
  if (!STAGES.includes(stage)) throw new Error(`unknown stage: ${stage}`);
}

export function prevStage(stage) {
  assertStage(stage);
  const i = STAGES.indexOf(stage);
  return i > 0 ? STAGES[i - 1] : null;
}

export function nextStage(stage) {
  assertStage(stage);
  const i = STAGES.indexOf(stage);
  return i < STAGES.length - 1 ? STAGES[i + 1] : 'done';
}

export function startStage(state, stage, now = new Date()) {
  assertStage(stage);
  const prev = prevStage(stage);
  if (prev && state.stages[prev].status !== 'done') {
    throw new Error(`cannot start ${stage}: ${prev} is ${state.stages[prev].status}`);
  }
  state.stages[stage] = { ...state.stages[stage], status: 'in_progress', startedAt: now.toISOString() };
  delete state.stages[stage].reason;
  state.stage = stage;
  return state;
}

export function finishStage(state, stage, { commit, now = new Date() } = {}) {
  assertStage(stage);
  const cur = state.stages[stage].status;
  if (cur !== 'in_progress') throw new Error(`cannot finish ${stage}: status is ${cur}`);
  state.stages[stage] = {
    ...state.stages[stage],
    status: 'done',
    at: now.toISOString(),
    ...(commit ? { commit } : {}),
  };
  state.stage = nextStage(stage);
  return state;
}

export function blockStage(state, stage, reason) {
  assertStage(stage);
  state.stages[stage] = { ...state.stages[stage], status: 'blocked', reason: reason || '' };
  return state;
}

export function addDoc(state, stage, path) {
  assertStage(stage);
  const docs = state.stages[stage].docs ?? [];
  if (!docs.includes(path)) docs.push(path);
  state.stages[stage].docs = docs;
  return state;
}

export function addIssue(state, issue, now = new Date()) {
  if (!STAGES.includes(issue.stage)) throw new Error(`issue.stage must be one of ${STAGES.join('|')}`);
  if (!issue.symptom || !issue.symptom.trim()) throw new Error('issue.symptom is required');
  const last = state.issues.length ? state.issues[state.issues.length - 1].id : 0;
  const entry = {
    id: last + 1,
    stage: issue.stage,
    task: issue.task ?? null,
    symptom: issue.symptom.trim(),
    cause: issue.cause ?? '',
    fix: issue.fix ?? '',
    commit: issue.commit ?? '',
    at: now.toISOString(),
  };
  state.issues.push(entry);
  return { state, issue: entry };
}

export function updateIssue(state, id, patch) {
  const entry = state.issues.find((i) => i.id === Number(id));
  if (!entry) throw new Error(`issue ${id} not found`);
  for (const k of ['cause', 'fix', 'commit']) {
    if (patch[k] !== undefined) entry[k] = patch[k];
  }
  return state;
}

export function collectHistory(rootDir, { exclude } = {}) {
  const out = [];
  if (!existsSync(rootDir)) return out;
  for (const d of readdirSync(rootDir, { withFileTypes: true })) {
    if (!d.isDirectory()) continue;
    const dir = join(rootDir, d.name);
    if (exclude && resolve(dir) === resolve(exclude)) continue;
    const p = statePath(dir);
    if (!existsSync(p)) continue;
    try {
      const s = JSON.parse(readFileSync(p, 'utf8'));
      for (const i of s.issues ?? []) out.push({ project: s.name ?? d.name, ...i });
    } catch {
      // 損毀的 state 直接跳過
    }
  }
  return out;
}

export function summarizeHistory(issues) {
  const groups = new Map();
  for (const i of issues) {
    const label = (i.cause || i.symptom || '').trim();
    if (!label) continue;
    const key = label.toLowerCase();
    const g = groups.get(key) ?? { cause: label, count: 0, projects: [], fixes: [] };
    g.count += 1;
    if (!g.projects.includes(i.project)) g.projects.push(i.project);
    if (i.fix && !g.fixes.includes(i.fix)) g.fixes.push(i.fix);
    groups.set(key, g);
  }
  return [...groups.values()].sort((a, b) => b.count - a.count);
}

// commits: 由新到舊的 subject 字串，可選帶 "hash " 前綴（`git log --format=%h %s`）。
function findCommit(commits, prefix) {
  for (const line of commits) {
    const m = /^([0-9a-f]{7,40})\s+(.*)$/.exec(line);
    const hash = m ? m[1] : '';
    const subject = m ? m[2] : line;
    if (subject.startsWith(prefix)) return { hash, subject };
  }
  return null;
}

const REBUILD_RULES = {
  env: { doc: 'CLAUDE.md', commitPrefix: 'chore(env)' },
  design: { doc: 'docs/product/prd.md', commitPrefix: 'docs(design)' },
  tech: { doc: 'docs/tech/tasks.md', commitPrefix: 'docs(tech)' },
  build: { doc: 'docs/build/log.md', nextDoc: 'docs/verify/checklist.md' },
  verify: { doc: 'docs/verify/checklist.md', neverDone: true },
};

export function rebuildState(name, { exists, commits }) {
  const s = initialState(name);
  let current = null;
  for (const st of STAGES) {
    const rule = REBUILD_RULES[st];
    if (current) { s.stages[st] = { status: 'pending' }; continue; }
    let done = false;
    let commit = '';
    if (rule.neverDone) {
      done = false;
    } else if (rule.commitPrefix) {
      const c = findCommit(commits, rule.commitPrefix);
      done = exists(rule.doc) && !!c;
      commit = c?.hash ?? '';
    } else {
      done = exists(rule.doc) && exists(rule.nextDoc);
    }
    if (done) {
      s.stages[st] = { status: 'done', ...(commit ? { commit } : {}) };
    } else {
      s.stages[st] = { status: exists(rule.doc) ? 'in_progress' : 'pending' };
      current = st;
    }
  }
  s.stage = current ?? 'done';
  return s;
}
