import { app } from 'electron';
import { join, resolve } from 'node:path';

// dev：app/out/main → 往上三層是 repo 根目錄；packaged：resources/plugin（見 electron-builder.yml extraResources）
export function getPluginDir(): string {
  if (app.isPackaged) return join(process.resourcesPath, 'plugin');
  return resolve(__dirname, '../../../plugin');
}
