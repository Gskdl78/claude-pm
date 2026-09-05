import { homedir } from 'node:os';
import { join } from 'node:path';
import type { SkillActionResult, SkillFetchResult, SkillInstall, SkillScope } from '../shared/types';
import { scanSkills } from './skill-scan';
import { cacheRootFor, fetchSkillSource } from './skill-fetch';
import {
  adoptSkill, assertSkillName, findCollisions, installTrial, listInstalled, promoteSkill, removeSkill,
} from './skill-install';

export interface SkillHandlers {
  'skills:fetch': (source: string, projectPath: string | null) => Promise<SkillFetchResult>;
  'skills:list': (path: string) => Promise<SkillInstall[]>;
  'skills:install': (cacheId: string, name: string, path: string, renameTo: string | null) => Promise<SkillInstall[]>;
  'skills:remove': (path: string, name: string, scope: SkillScope) => Promise<SkillInstall[]>;
  'skills:adopt': (path: string, name: string) => Promise<SkillActionResult>;
  'skills:promote': (path: string, name: string) => Promise<SkillActionResult>;
}

function assertScope(v: unknown): SkillScope {
  if (v !== 'project' && v !== 'global') throw new Error('invalid scope');
  return v;
}

/** 已 fetch 過的 cacheId 才拿得到掃描根目錄；renderer 傳來的 id 不可信。 */
function rootOf(cacheId: unknown): string {
  if (typeof cacheId !== 'string') throw new Error('unknown source');
  const root = cacheRootFor(cacheId);
  if (!root) throw new Error('unknown source');
  return root;
}

/**
 * guard = assertInsideRoot(cfg.root, path)；每個帶專案路徑的 handler 都先過它。
 * home 由主程序決定（測試才注入），不接受 renderer 傳入——否則就能寫到任意路徑。
 */
export function createSkillHandlers(guard: (p: string) => string, home: string = homedir()): SkillHandlers {
  return {
    'skills:fetch': async (source, projectPath) => {
      if (typeof source !== 'string') throw new Error('invalid skill source');
      const { cacheId, root } = await fetchSkillSource(source, home);
      const reports = scanSkills(root);
      // 重名比對需要專案路徑；沒有開專案時只比得到全域與 plugin cache
      const dir = projectPath === null || projectPath === undefined ? null : guard(projectPath);
      for (const r of reports) r.collisions = findCollisions(r.name, dir, home);
      return { cacheId, reports };
    },
    'skills:list': async (path) => listInstalled(guard(path), home),
    'skills:install': async (cacheId, name, path, renameTo) => {
      const root = rootOf(cacheId);
      const n = assertSkillName(name);
      const target = renameTo === null || renameTo === undefined ? null : assertSkillName(renameTo);
      const dir = guard(path);
      const report = scanSkills(root).find((r) => r.name === n);
      if (!report) throw new Error('no skill found');
      installTrial(report.rel ? join(root, report.rel) : root, dir, n, target);
      return listInstalled(dir, home);
    },
    'skills:remove': async (path, name, scope) => {
      const n = assertSkillName(name);
      const s = assertScope(scope);
      const dir = guard(path);
      removeSkill(dir, n, s, home);
      return listInstalled(dir, home);
    },
    'skills:adopt': async (path, name) => {
      const n = assertSkillName(name);
      const dir = guard(path);
      const result = await adoptSkill(dir, n);
      return { installs: listInstalled(dir, home), result };
    },
    'skills:promote': async (path, name) => {
      const n = assertSkillName(name);
      const dir = guard(path);
      const result = await promoteSkill(dir, n, home);
      return { installs: listInstalled(dir, home), result };
    },
  };
}
