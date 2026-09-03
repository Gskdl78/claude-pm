import { Marked } from 'marked';
import DOMPurify from 'dompurify';

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// GFM；不產生 heading id（避免 DOM id 碰撞）。mermaid fence 交給 MarkdownView 後處理；
// 任務清單只畫成靜態符號，可勾選的清單另由 ChecklistView 負責。
const md = new Marked({
  gfm: true,
  breaks: false,
  renderer: {
    code({ text, lang }) {
      const l = (lang ?? '').trim().split(/\s+/)[0]!.toLowerCase();
      if (l === 'mermaid') return `<pre class="mermaid">${escapeHtml(text)}</pre>\n`;
      const cls = l ? ` class="lang-${escapeHtml(l)}"` : '';
      return `<pre><code${cls}>${escapeHtml(text)}</code></pre>\n`;
    },
    checkbox({ checked }) {
      return `<span class="task-mark">${checked ? '☑' : '☐'}</span> `;
    },
  },
});

const FORBID_TAGS = ['style', 'iframe', 'form', 'input', 'button', 'textarea', 'select', 'object', 'embed'];

/** Markdown → 已 sanitize 的 HTML 字串。只允許 DOMPurify html profile 的標籤與屬性。 */
export function renderMarkdown(src: string): string {
  const html = md.parse(src, { async: false }) as string;
  return DOMPurify.sanitize(html, { USE_PROFILES: { html: true }, FORBID_TAGS });
}
