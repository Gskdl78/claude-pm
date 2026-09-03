# {{name}}

本專案由 claude-pm 管理，依五階段流程開發：env → design → tech → build → verify。

專案類型：{{type}}

## 流程規則
- 每個階段用對應 skill 執行：`/stage-env`、`/stage-design`、`/stage-tech`、`/stage-build`、`/stage-verify`。
- 階段狀態存在 `.pm/state.json`，只能透過 `node .pm/pm-state.mjs <cmd>` 讀寫（見 pm-status skill），不要手動編輯。
- 前一階段未 done 不得開始下一階段。
- 開始任何工作前先執行 `node .pm/pm-state.mjs get` 確認目前階段。
- 使用者若直接要求寫功能程式碼而 build 階段尚未開始，先提醒目前階段並建議跑對應 skill。

## 模型政策
- 實作 subagent：`{{implModel}}`。任務說明含「重構」「認證」「權限」「加密」「遷移」時改用 `{{reviewModel}}`。
- 審核 subagent：一律 `{{reviewModel}}`。
- 審核退回上限 {{maxRetries}} 次；第 {{maxRetries}} 次仍不過標記 blocked 並詢問使用者。

## Git 規則
- 每階段結束必 commit；build 階段每個任務一 commit；修錯必 commit。
- Conventional commits 前綴：`chore(env):` `docs(design):` `docs(tech):` `feat:` `fix:` `test:` `fix(security):` `fix(verify):`。
- 修錯的 commit 訊息第二段要有 `Fixes: <症狀>`。
- 不要 push，除非使用者要求。

## 錯誤紀錄
- 任何審核退回、測試失敗、驗證問題都要用 `node .pm/pm-state.mjs add-issue ...` 記錄，並追加到 `docs/build/log.md`。
- 每筆 issue 含：症狀、根因、修法、commit。

## 技術棧
待技術設計階段決定。

## 建置與測試指令
待技術設計階段決定。

## 文件語言
所有文件用繁體中文；程式碼識別字與 commit 訊息前綴用英文。

## 固定注意事項
{{pinned}}

## 注意事項（來自歷史專案）
{{notes}}
