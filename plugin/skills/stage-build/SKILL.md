---
name: stage-build
description: 階段 4 產品實現。依 docs/tech/tasks.md 逐任務派 subagent 用 TDD 實作（預設 opus）、派 fable 審核、退回修正並記錄 issue、每任務一個 commit，全部完成後標記 build 完成。
---

# 階段 4：產品實現

## 前置檢查
1. 執行 `node .pm/pm-state.mjs get`。
   - `stages.tech.status` 不是 `done`：請使用者先執行 `/stage-tech`，停止。
   - `stages.build.status` 是 `done`：告知已完成，建議 `/stage-verify`，停止。
   - `stages.build.status` 是 `blocked`：說明 `reason`，詢問使用者如何處理，同意後才繼續。
2. 若 `stages.build.status` 是 `pending`，執行 `node .pm/pm-state.mjs start build`。
3. 讀 CLAUDE.md（模型政策、建置與測試指令）、`docs/tech/architecture.md`、`docs/tech/tasks.md`。
4. 若 `docs/build/log.md` 不存在，建立並寫入 `# Build Log`。
5. 取專案絕對路徑：`pwd`。

## 任務迴圈
依 tasks.md 順序，跳過「狀態: done」的任務。對每個任務 T<n>：

1. 在 tasks.md 把該任務「狀態: pending」改為「狀態: in_progress」。
2. **實作**：用 Agent 工具派 subagent。model 預設 `opus`；任務標題或說明含「重構」「認證」「權限」「加密」「遷移」或以「[security]」開頭時用 `fable`。Prompt：
   ```
   你在專案 <絕對路徑> 工作。先讀 CLAUDE.md 與 docs/tech/architecture.md，然後只實作下列任務：

   <貼上 tasks.md 中該任務全文>

   規則：
   - 用 TDD：先寫失敗測試、執行一次確認失敗、再寫最小實作、再執行到通過。
   - 只改與此任務相關的檔案；不要 commit。
   - 遵守 architecture.md 的模組邊界與資料庫連線規範。
   - 完成後回報：改了哪些檔案、跑了什麼測試指令、輸出摘要、任何未解決的問題。
   ```
3. **審核**：派 model `fable` 的 subagent。Prompt：
   ```
   你是審核者，專案在 <絕對路徑>。任務需求：

   <任務全文>

   實作者回報：

   <回報全文>

   請執行：`git status`、`git diff` 檢視全部變更；執行 CLAUDE.md 的測試指令；對照「驗收」逐條檢查；檢查是否違反 docs/tech/architecture.md 的模組邊界、資料庫連線規範，以及 docs/tech/security-review.md 的清單；檢查測試是否真的驗證行為而非只是通過。
   回覆第一行必須是 `VERDICT: PASS` 或 `VERDICT: FAIL`。之後條列具體問題：檔案:行號、為什麼錯、該怎麼改。PASS 時也列出可接受的小建議。
   ```
4. **若 FAIL**：
   a. 記錄：`node .pm/pm-state.mjs add-issue --stage build --task T<n> --symptom "<審核第一個問題的摘要>" --cause "<審核指出的根因>" --fix "<審核建議的修法>"`，記下回傳的 id。
   b. 在 `docs/build/log.md` 追加：
      ```
      ## T<n> 退回 #<第幾次>（issue <id>）
      - 症狀：…
      - 根因：…
      - 修法：…
      ```
   c. 派實作 subagent（同 model）修正，prompt 為步驟 2 的內容再加上「審核者指出以下問題，請逐項修正並回報：<審核全文>」。
   d. 回到步驟 3。
   e. 同一任務退回達 3 次仍 FAIL：執行 `node .pm/pm-state.mjs block build --reason "T<n> 審核 3 次未過"`，tasks.md 該任務改「狀態: blocked」，用 AskUserQuestion 詢問使用者（放寬驗收 / 拆任務 / 手動處理），然後停止。
5. **若 PASS**：
   a. tasks.md 該任務改「狀態: done」。
   b. Commit，前綴規則：新功能 `feat:`、修錯 `fix:`、只有測試 `test:`、[security] 任務 `fix(security):`。若此任務有退回紀錄，第二段加 `Fixes: <症狀>`：
      ```bash
      git add -A
      git commit -m "<prefix> T<n> <標題>" -m "Fixes: <症狀>"
      git rev-parse --short HEAD
      ```
   c. 有退回紀錄的 issue 補上 commit：`node .pm/pm-state.mjs update-issue <id> --commit <sha>`。
   d. `docs/build/log.md` 追加 `## T<n> 完成 — <sha>` 與一行審核摘要。
6. 進入下一個任務。

## 收尾
1. 全部任務 done 後執行 CLAUDE.md 的完整測試指令，貼出結果摘要。
2. 若 log.md 或 tasks.md 有未 commit 的變更：`git add -A && git commit -m "docs(build): 更新建置紀錄"`。
3. `git rev-parse --short HEAD`，執行 `node .pm/pm-state.mjs done build --commit <sha>`。
4. 回報：任務數、退回總次數、issue 數，提示「下一步請執行 `/stage-verify`」。

## 規則
- 主 session 不自己寫程式碼，一律派 subagent。
- 每個任務結束都必須有自己的 commit，不可合併多個任務。
- 被中斷後重新執行本 skill 時，從 tasks.md 第一個非 done 的任務繼續；若該任務是 in_progress，先跑 `git status` 看有無殘留變更，交給審核 subagent 判斷可否沿用。
