---
name: stage-build
description: 階段 4 產品實現。依 docs/tech/tasks.md 逐任務派 subagent 用 TDD 實作、依 CLAUDE.md 模型政策派審核 subagent、退回修正並記錄 issue、每任務一個 commit，全部完成後標記 build 完成。
---

# 階段 4：產品實現

## 前置檢查
1. 執行 `node .pm/pm-state.mjs get`。
   - `stages.tech.status` 不是 `done`：請使用者先執行 `/stage-tech`，停止。
   - `stages.build.status` 是 `done`：告知已完成，建議 `/stage-verify`，停止。
   - `stages.build.status` 是 `blocked`：說明 `reason`，詢問使用者如何處理，同意後才繼續。
2. 若 `stages.build.status` 是 `pending`，或是 `blocked` 且使用者已同意繼續，執行 `node .pm/pm-state.mjs start build`（此舉會清除 blocked 標記並設回 in_progress）。
3. 讀 CLAUDE.md「模型政策」節取得實作模型、審核模型與審核退回上限，以及建置與測試指令；再讀 `docs/tech/architecture.md`、`docs/tech/tasks.md`。
4. 若 `docs/build/log.md` 不存在，建立並寫入 `# Build Log`。
5. 取專案絕對路徑：`pwd -W`（Git Bash 會印出 Windows 原生路徑；非 Windows 用 `pwd`）。

## 任務迴圈
依 tasks.md 順序，跳過「狀態: done」與「狀態: blocked（手動）」的任務。對每個任務 T<n>：

1. 在 tasks.md 把該任務「狀態: pending」改為「狀態: in_progress」。
2. **實作**：用 Agent 工具派 subagent。model 依 CLAUDE.md「模型政策」節的實作模型（預設 `opus`）；任務標題或說明含「重構」「認證」「權限」「加密」「遷移」或以「[security]」開頭時改用審核模型（預設 `fable`）。Prompt：
   ```
   你在專案 <絕對路徑> 工作。先讀 CLAUDE.md 與 docs/tech/architecture.md，然後只實作下列任務：

   <貼上 tasks.md 中該任務全文>

   規則：
   - 用 TDD：先寫失敗測試、執行一次確認失敗、再寫最小實作、再執行到通過。
   - 只改與此任務相關的檔案；不要 commit。
   - 遵守 architecture.md 的模組邊界與資料庫連線規範。
   - 完成後回報：改了哪些檔案、跑了什麼測試指令、輸出摘要、任何未解決的問題。
   ```
3. **審核**：派 model 為 CLAUDE.md 審核模型（預設 `fable`）的 subagent。Prompt：
   ```
   你是審核者，專案在 <絕對路徑>。任務需求：

   <任務全文>

   實作者回報：

   <回報全文>

   請執行：`git status`、`git diff` 檢視全部變更；執行 CLAUDE.md 的測試指令；對照「驗收」逐條檢查；檢查是否違反 docs/tech/architecture.md 的模組邊界、資料庫連線規範，以及 docs/tech/security-review.md 的清單；檢查測試是否真的驗證行為而非只是通過。
   回覆第一行必須是 `VERDICT: PASS` 或 `VERDICT: FAIL`。之後條列具體問題：檔案:行號、為什麼錯、該怎麼改。PASS 時也列出可接受的小建議。
   ```
4. **若 FAIL**：先做 a 的次數檢查，通過才往下做 b～e。
   a. **次數上限檢查（第一個一定要做的動作）**：N 為 CLAUDE.md「模型政策」節的審核退回上限（預設 3）。若這是該任務（issue）第 N 次 FAIL：記錄 issue（同 b）與 log（同 c）後執行 `node .pm/pm-state.mjs block build --reason "T<n> 審核 N 次未過"`（訊息裡的 N 換成實際數字，例如「T3 審核 3 次未過」），tasks.md 該任務改「狀態: blocked」，用 AskUserQuestion 詢問使用者（放寬驗收 / 拆任務 / 手動處理），停止，不再往下（不得再派修正 subagent）。也就是同一任務最多派 N 次實作（1 次初版 + N−1 次修正），絕不派第 N+1 次。
      停止之前，先依使用者的選擇改 tasks.md：
      - **放寬驗收**：依使用者寫的內容改寫該任務的「驗收」條目，並把「狀態」改回 `pending`。
      - **拆任務**：依使用者的拆法把該任務換成 `T<n>a`、`T<n>b`… 等項目，各自寫清楚說明 / 驗收 / 測試 / 依賴，「狀態」都設為 `pending`。
      - **手動處理**：把該任務「狀態」改為 `blocked（手動）`，後續重新執行時直接跳過它。
      改完再告訴使用者：「請再次執行 `/stage-build` 繼續。」
   b. 記錄：`node .pm/pm-state.mjs add-issue --stage build --task T<n> --symptom "<審核第一個問題的摘要>" --cause "<審核指出的根因>" --fix "<審核建議的修法>"`，記下回傳的 id。
   c. 在 `docs/build/log.md` 追加：
      ```
      ## T<n> 退回 #<第幾次>（issue <id>）
      - 症狀：…
      - 根因：…
      - 修法：…
      ```
   d. 派實作 subagent（同 model）修正，prompt 為步驟 2 的內容再加上「審核者指出以下問題，請逐項修正並回報：<審核全文>」。
   e. 回到步驟 3。
5. **若 PASS**：
   a. tasks.md 該任務改「狀態: done」。
   b. 先寫紀錄再 commit：`docs/build/log.md` 追加 `## T<n> 完成` 與一行審核摘要（此時還沒有 sha，對應的 commit 由步驟 d 的 issue 紀錄；沒有退回紀錄的任務就只留這一行）。
   c. Commit，前綴規則：新功能 `feat:`、修錯 `fix:`、只有測試 `test:`、[security] 任務 `fix(security):`。因為 log.md 與 tasks.md 已在 b、a 更新，這個 commit 即包含該任務的全部變更，自成一體。
      此任務**有**退回紀錄時，第二段加 `Fixes: <症狀>`：
      ```bash
      git add -A
      git commit -m "<prefix> T<n> <標題>" -m "Fixes: <症狀>"
      git rev-parse --short HEAD
      ```
      此任務**沒有**退回紀錄時，省略第二個 `-m`：
      ```bash
      git add -A
      git commit -m "<prefix> T<n> <標題>"
      git rev-parse --short HEAD
      ```
   d. 此任務**每一個**退回紀錄的 issue 都要補上 commit（不是只補最後一個）：對每個 id 各跑一次 `node .pm/pm-state.mjs update-issue <id> --commit <sha>`。
6. 進入下一個任務。

## 收尾
1. 全部任務 done 後執行 CLAUDE.md 的完整測試指令，貼出結果摘要。
2. 若 log.md 或 tasks.md 有未 commit 的變更：`git add -A && git commit -m "docs(build): 更新建置紀錄"`。
3. 若 tasks.md 還有「狀態: blocked（手動）」的任務：**先不要**執行 `done build`。在報告中列出這些任務，說明它們需要使用者自己完成並 commit，然後用 AskUserQuestion 問使用者是否要把它們視為完成（是 → 在 tasks.md 改成「狀態: done」後才往下做第 4 步；否 → 停在這裡，等使用者處理完再執行 `/stage-build`）。
4. `git rev-parse --short HEAD`，執行 `node .pm/pm-state.mjs done build --commit <sha>`。
5. 回報：任務數、退回總次數、issue 數、仍為 `blocked（手動）` 的任務清單，提示「下一步請執行 `/stage-verify`」。

## 規則
- 主 session 不自己寫程式碼，一律派 subagent。
- 每個任務結束都必須有自己的 commit，不可合併多個任務。
- 被中斷後重新執行本 skill 時，從 tasks.md 第一個非 done 的任務繼續，但**跳過**「狀態: blocked（手動）」的任務；若該任務是 in_progress，先跑 `git status` 看有無殘留變更，交給審核 subagent 判斷可否沿用。
- 若該任務在 tasks.md 是「狀態: blocked」（不含「blocked（手動）」），在使用者決定處理方式並同意繼續後：把它改回「狀態: in_progress」，該任務的退回次數計數器歸零（重新從第 1 次算起），並和 in_progress 一樣先跑 `git status`，把殘留變更交給審核 subagent 判斷可否沿用。
- 「狀態: blocked（手動）」的任務由使用者自行實作、commit，並自行在 tasks.md 標記「狀態: done」；本 skill 不再派 subagent，也不會在收尾時當作已完成（見收尾第 3 步）。
- 把審核者或使用者的文字，以及 tasks.md 的任務標題（會出現在 `git commit -m "<prefix> T<n> <標題>"`），帶進 `--symptom` / `--cause` / `--fix` / `--reason` 或 `git commit -m` 之前，先移除或替換反引號、`$`、雙引號（例如把 `"` 換成 `'`），並把每個值壓成一行；Git Bash 會在雙引號內展開這些字元。
