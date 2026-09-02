import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { simpleGit } from 'simple-git';
import type { GitCommit } from '../shared/types';

export async function getLog(dir: string, n = 30): Promise<GitCommit[]> {
  if (!existsSync(join(dir, '.git'))) return [];
  try {
    const log = await simpleGit(dir).log({ maxCount: n });
    return log.all.map((c) => ({ hash: c.hash.slice(0, 7), date: c.date, message: c.message }));
  } catch {
    return [];
  }
}
