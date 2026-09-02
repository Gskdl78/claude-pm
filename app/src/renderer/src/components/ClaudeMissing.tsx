export function ClaudeMissing() {
  return (
    <div className="center">
      <h2>找不到 Claude Code</h2>
      <p>請先安裝 Claude Code 並確認 <code>claude</code> 在 PATH 中，然後重新啟動本程式。</p>
      <pre>npm install -g @anthropic-ai/claude-code</pre>
      <p className="muted">或參考 https://docs.anthropic.com/claude-code</p>
    </div>
  );
}
