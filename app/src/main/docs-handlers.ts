import type { DocEntry } from '../shared/types';
import { isDocRelPath } from '../shared/docs-path';
import { listDocs, readDoc, writeDoc } from './docs';

export interface DocsHandlers {
  'docs:list': (path: string) => Promise<DocEntry[]>;
  'docs:read': (path: string, rel: string) => Promise<string>;
  'docs:write': (path: string, rel: string, content: string) => Promise<void>;
}

function assertDocRel(v: unknown): string {
  if (!isDocRelPath(v)) throw new Error('invalid doc path');
  return v;
}

/** guard = assertInsideRoot(cfg.root, path)；每個 handler 的第一個參數都先過它。 */
export function createDocsHandlers(guard: (p: string) => string): DocsHandlers {
  return {
    'docs:list': async (path) => listDocs(guard(path)),
    'docs:read': async (path, rel) => readDoc(guard(path), assertDocRel(rel)),
    'docs:write': async (path, rel, content) => {
      const dir = guard(path);
      const r = assertDocRel(rel);
      if (typeof content !== 'string') throw new Error('invalid content');
      writeDoc(dir, r, content);
    },
  };
}
