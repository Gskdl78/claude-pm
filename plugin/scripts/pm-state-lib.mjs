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
