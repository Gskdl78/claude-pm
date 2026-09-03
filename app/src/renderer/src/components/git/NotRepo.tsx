interface Props {
  busy: boolean;
  onInit: () => void;
}

export function NotRepo({ busy, onInit }: Props) {
  return (
    <div className="not-repo">
      <div className="not-repo-title">這個資料夾還不是 git 專案</div>
      <p className="muted">初始化後就能在這裡暫存、提交與管理分支。</p>
      <div><button type="button" className="primary" disabled={busy} onClick={onInit}>初始化</button></div>
    </div>
  );
}
