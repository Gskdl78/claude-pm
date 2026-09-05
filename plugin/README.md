# pm-workflow

Claude Code 五階段開發流程 plugin：環境搭建 → 產品設計 → 技術設計 → 產品實現 → 人工驗證。

## 種入專案

```bash
node plugin/scripts/scaffold.mjs C:/Projects/my-app
```

用法：`node plugin/scripts/scaffold.mjs <targetDir> [name] [--no-git] [--impl-model=<name>] [--review-model=<name>] [--small-model=<name>] [--max-retries=<1-10>] [--pinned-file=<path>]`。`[name]` 省略時取 `targetDir` 的資料夾名（英數開頭，僅允許英數 `.` `_` `-`，最長 64，不可為 Windows 保留名稱）；`--no-git` 只種檔案，不做 `git init` 與第一個 commit。四個模型政策旗標會寫進種入的 `CLAUDE.md`：模型名稱限小寫英數與 `.` `-`，最長 32，`--max-retries` 限 1–10 的整數，不合格就直接報錯；省略時用預設 `opus` / `fable` / `sonnet` / `3`，App 建立或初始化專案時會把「設定」裡的值以這四個旗標傳進來。`--small-model` 是小任務的降級檔位：`/stage-build` 遇到「模組」只有一個、「驗收」條目 ≤ 3 且不含「重構」「認證」「權限」「加密」「遷移」也不是 `[security]` 的任務時，用它派實作 subagent；升級規則優先於降級規則，審核 subagent 一律用審核模型不降級。`--pinned-file=<path>` 指向一份「固定注意事項」檔（每行 `- <根因> → 建議：<修法>`），內容會原樣填進 `CLAUDE.md` 的「固定注意事項」節；檔案不存在或內容空白就填「（無）」。

會建立：`.claude/skills/*`、`.pm/`（狀態檔與工具）、`CLAUDE.md`、`.gitignore`，並 `git init` + 第一個 commit（只提交上述種入的檔案，不會動到你既有的未提交變更）。

這些 skill 都會呼叫 `node .pm/pm-state.mjs`，所以專案必須先用上面的 scaffold 種過才能用——只安裝 plugin 是不夠的。

之後在該資料夾啟動 Claude Code，依序執行：

| 指令 | 階段 | 產出 |
|---|---|---|
| `/stage-env` | 環境搭建 | CLAUDE.md、.gitignore、最小骨架 |
| `/stage-design` | 產品設計 | docs/product/prd.md、docs/product/demo/ |
| `/stage-tech` | 技術設計 | docs/tech/architecture.md、security-review.md、tasks.md |
| `/stage-build` | 產品實現 | 程式碼、docs/build/log.md |
| `/stage-verify` | 人工驗證 | docs/verify/checklist.md |

狀態在 `.pm/state.json`，用 `node .pm/pm-state.mjs get` 查看。

## 開發

```bash
npm install
npm test                        # vitest
node plugin/scripts/smoke.mjs   # 真實呼叫 claude 跑 /stage-env（會花費 token）
```
