# pm-workflow

Claude Code 五階段開發流程 plugin：環境搭建 → 產品設計 → 技術設計 → 產品實現 → 人工驗證。

## 種入專案

```bash
node plugin/scripts/scaffold.mjs C:/Projects/my-app
```

用法：`node plugin/scripts/scaffold.mjs <targetDir> [name] [--no-git]`。`[name]` 省略時取 `targetDir` 的資料夾名（英數開頭，僅允許英數 `.` `_` `-`，最長 64，不可為 Windows 保留名稱）；`--no-git` 只種檔案，不做 `git init` 與第一個 commit。

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
