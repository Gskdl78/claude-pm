---
name: pm-status
description: 當需要讀取或更新專案階段狀態（.pm/state.json）、記錄 issue、查歷史專案問題或重建狀態時使用。所有 stage-* skill 都依賴這裡的指令。
---

# pm-status：專案狀態工具

狀態檔 `.pm/state.json` 不可手動編輯，一律在專案根目錄用下列指令操作。每個指令成功時印出 JSON；失敗時 stderr 印 `pm-state: <原因>` 且 exit 1。

| 指令 | 用途 |
|---|---|
| `node .pm/pm-state.mjs get` | 讀取整份 state（做任何事之前先跑） |
| `node .pm/pm-state.mjs init [name]` | 建立初始 state（scaffold 已做，通常不用） |
| `node .pm/pm-state.mjs set-type <web\|cli\|library\|other>` | 設定專案類型 |
| `node .pm/pm-state.mjs start <stage>` | 開始階段；前一階段未 done 會失敗 |
| `node .pm/pm-state.mjs done <stage> --commit <sha>` | 完成階段並推進到下一階段 |
| `node .pm/pm-state.mjs block <stage> --reason "<原因>"` | 標記卡住 |
| `node .pm/pm-state.mjs add-doc <stage> <相對路徑>` | 登記階段產出文件 |
| `node .pm/pm-state.mjs add-issue --stage <s> --symptom "<症狀>" [--task T1] [--cause "<根因>"] [--fix "<修法>"] [--commit <sha>]` | 記錄問題，回傳 `{ id, issue }` |
| `node .pm/pm-state.mjs update-issue <id> [--cause "<根因>"] [--fix "<修法>"] [--commit <sha>]` | 補上根因、修法、commit |
| `node .pm/pm-state.mjs history [rootDir]` | 彙整同層其他專案的 issue（依根因分組、次數降冪） |
| `node .pm/pm-state.mjs rebuild [name]` | state 損毀時依檔案與 git log 重建 |

## 階段順序
`env → design → tech → build → verify → done`。`state.stage` 是目前所在階段；`stages.<name>.status` 是 `pending | in_progress | done | blocked`。

## 慣例
- 取 commit sha：`git rev-parse --short HEAD`。
- 每次 `done` 之前一定先 commit，再把 sha 帶入。
- 參數含空白或中文時用雙引號包起來。
