import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import type { AppConfig } from '../shared/types';

const MAX_RECENT = 10;

export function configPath(home: string = homedir()): string {
  return join(home, '.claude-pm', 'config.json');
}

export function defaultConfig(): AppConfig {
  const preferred = 'C:\\Projects';
  const root = process.platform === 'win32' && existsSync(preferred) ? preferred : join(homedir(), 'Projects');
  return { root, lastProject: null, recent: [] };
}

export function loadConfig(file: string = configPath()): AppConfig {
  const base = defaultConfig();
  if (!existsSync(file)) return base;
  try {
    const raw = JSON.parse(readFileSync(file, 'utf8')) as Partial<AppConfig>;
    return {
      root: typeof raw.root === 'string' && raw.root ? raw.root : base.root,
      lastProject: typeof raw.lastProject === 'string' ? raw.lastProject : null,
      recent: Array.isArray(raw.recent) ? raw.recent.filter((r): r is string => typeof r === 'string') : [],
    };
  } catch {
    return base;
  }
}

export function saveConfig(cfg: AppConfig, file: string = configPath()): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(cfg, null, 2) + '\n');
}

export function rememberProject(cfg: AppConfig, path: string): AppConfig {
  const recent = [path, ...cfg.recent.filter((p) => p !== path)].slice(0, MAX_RECENT);
  return { ...cfg, lastProject: path, recent };
}
