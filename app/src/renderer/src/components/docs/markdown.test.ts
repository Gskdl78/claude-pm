import { describe, it, expect } from 'vitest';
import { renderMarkdown } from './markdown';

describe('renderMarkdown', () => {
  it('renders headings, lists, tables and code', () => {
    const html = renderMarkdown('# T\n\n- a\n- b\n\n| x | y |\n|---|---|\n| 1 | 2 |\n\n```ts\nconst a = 1 < 2;\n```\n');
    expect(html).toContain('<h1>T</h1>');
    expect(html).toContain('<li>a</li>');
    expect(html).toContain('<table>');
    expect(html).toContain('<pre><code class="lang-ts">const a = 1 &lt; 2;');
  });
  it('turns mermaid fences into pre.mermaid with escaped source', () => {
    const html = renderMarkdown('```mermaid\ngraph TD; A-->B\n```\n');
    expect(html).toContain('<pre class="mermaid">graph TD; A--&gt;B</pre>');
    expect(html).not.toContain('<code');
  });
  it('strips scripts, event handlers, javascript: links and inputs', () => {
    const html = renderMarkdown('<script>alert(1)</script><img src=x onerror="alert(1)"><a href="javascript:alert(1)">x</a><input type="checkbox"><iframe src="https://x"></iframe>\n\ntext');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('onerror');
    expect(html).not.toContain('javascript:');
    expect(html).not.toContain('<input');
    expect(html).not.toContain('<iframe');
    expect(html).toContain('text');
  });
  it('keeps http links and relative links', () => {
    const html = renderMarkdown('[a](https://x.y) [b](../tech/tasks.md)');
    expect(html).toContain('href="https://x.y"');
    expect(html).toContain('href="../tech/tasks.md"');
  });
  it('renders task list items as static marks, not inputs', () => {
    const html = renderMarkdown('- [ ] todo\n- [x] done\n');
    expect(html).toContain('<span class="task-mark">☐</span> todo');
    expect(html).toContain('<span class="task-mark">☑</span> done');
    expect(html).not.toContain('<input');
  });
});
