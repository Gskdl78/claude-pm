import { useEffect, useRef, type MouseEvent } from 'react';
import { resolveDocLink, resolveRelPath } from '../../../../shared/docs-path';

interface Props {
  /** 已經過 renderMarkdown（DOMPurify）的 HTML */
  html: string;
  /** 目前檔案的 repo 相對路徑，供相對連結解析 */
  fromRel: string;
  onNavigate: (rel: string) => void;
  onOpenExternal: (url: string) => void;
  onOpenPath: (rel: string) => void;
}

type Mermaid = (typeof import('mermaid'))['default'];
let mermaidPromise: Promise<Mermaid> | null = null;

/** 只在第一次遇到圖表時載入 mermaid（體積大），之後共用同一個實例。 */
function loadMermaid(): Promise<Mermaid> {
  mermaidPromise ??= import('mermaid').then((m) => {
    m.default.initialize({ startOnLoad: false, securityLevel: 'strict', theme: 'dark' });
    return m.default;
  });
  return mermaidPromise;
}

let renderSeq = 0;

/** 只交給系統開啟可檢視的檔案，避免文件裡的連結啟動 .bat/.exe。 */
export const OPENABLE_EXT_RE = /\.(html?|pdf|png|jpe?g|gif|svg|txt|csv|json|md)$/i;

export function MarkdownView({ html, fromRel, onNavigate, onOpenExternal, onOpenPath }: Props) {
  const root = useRef<HTMLDivElement>(null);

  // html 換了才重畫圖；React 只在 __html 改變時重設 innerHTML，所以我們替換的 SVG 不會被覆蓋回去。
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const blocks = Array.from(el.querySelectorAll<HTMLPreElement>('pre.mermaid'));
    if (blocks.length === 0) return;
    let cancelled = false;
    const seq = (renderSeq += 1);
    void loadMermaid().then(async (mermaid) => {
      for (const [i, block] of blocks.entries()) {
        const code = block.textContent ?? '';
        try {
          const { svg } = await mermaid.render(`mmd-${seq}-${i}`, code);
          if (cancelled) return;
          block.innerHTML = svg;
          block.classList.add('rendered');
        } catch {
          if (cancelled) return;
          block.classList.add('mermaid-error');
          const msg = document.createElement('div');
          msg.className = 'mermaid-error-msg';
          msg.textContent = '圖表語法錯誤';
          block.prepend(msg);
        }
      }
    });
    return () => { cancelled = true; };
  }, [html]);

  const onClick = (e: MouseEvent<HTMLDivElement>) => {
    const a = (e.target as HTMLElement).closest('a[href]');
    if (!a) return;
    const href = a.getAttribute('href') ?? '';
    // 純錨點交給瀏覽器自己捲動，不要攔截。
    if (href.startsWith('#')) return;
    e.preventDefault();
    if (/^(https?|mailto):/i.test(href)) { onOpenExternal(href); return; }
    const doc = resolveDocLink(fromRel, href);
    if (doc) { onNavigate(doc); return; }
    const rel = resolveRelPath(fromRel, href);
    if (rel && OPENABLE_EXT_RE.test(rel)) onOpenPath(rel);
  };

  // 中鍵（或其他輔助鍵）點連結預設會開新視窗，這裡一律擋掉。
  const onAuxClick = (e: MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('a[href]')) e.preventDefault();
  };

  return <div ref={root} className="md-body" onClick={onClick} onAuxClick={onAuxClick} dangerouslySetInnerHTML={{ __html: html }} />;
}
