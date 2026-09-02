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
