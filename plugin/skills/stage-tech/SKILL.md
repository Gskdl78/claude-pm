---
name: stage-tech
description: 階段 3 技術設計。做架構分析（預期使用人數、架構型式、資料庫選型與連線規範）、完成資安檢查紀錄、拆出任務清單，同步 CLAUDE.md，commit 並標記 tech 完成。
---

# 階段 3：技術設計

## 前置檢查
1. 執行 `node .pm/pm-state.mjs get`。
   - `stages.design.status` 不是 `done`：請使用者先執行 `/stage-design`，停止。
   - `stages.tech.status` 是 `done`：告知已完成，建議 `/stage-build`，停止。
2. 執行 `node .pm/pm-state.mjs start tech`。
3. 讀 `docs/product/prd.md` 與 CLAUDE.md。

## 步驟 A：架構分析問答（AskUserQuestion，一次一題）
1. 預期使用人數與同時上線數：<10 / 10–1,000 / 1,000–100,000 / 更多。
2. 部署方式：本機執行 / 單台伺服器 / 雲端託管 / 桌面安裝 / 其他。
3. 是否需要持久化資料；若需要，資料型態：關聯 / 文件 / 鍵值 / 純檔案。
4. 是否需要帳號登入或多使用者。
5. 有沒有既定的語言、框架、資料庫偏好（CLAUDE.md 若已有技術棧，先以它為預設問使用者是否維持）。
每題後根據答案給出建議並說明理由（例如：<1,000 人、單台伺服器 → 單體 + SQLite/PostgreSQL），讓使用者確認。

## 步驟 B：寫 `docs/tech/architecture.md`
章節固定：
1. 技術棧與版本（語言、框架、資料庫、主要套件，寫具體版本）
2. 架構型式與理由（單體 / 前後端分離 / CLI；對應步驟 A 的規模與部署）
3. 模組切分（每個模組：職責、對外介面、依賴；一個模組一個小節）
4. 資料模型（表或集合、欄位、關聯；無持久化則寫「不適用」）
5. 資料庫連線規範（無資料庫則寫「不適用」）：
   - 連線字串只從環境變數讀取；repo 只放 `.env.example`
   - 使用連線池並寫明上限
   - 正式環境強制 TLS
   - migration 工具與執行流程
   - 憑證輪替方式
6. 錯誤處理與日誌（分層策略、日誌格式、不可記錄的敏感欄位）
7. 測試策略（單元 / 整合 / e2e 各用什麼工具、覆蓋哪些模組）
8. 建置與執行指令
完成後 `node .pm/pm-state.mjs add-doc tech docs/tech/architecture.md`。

## 步驟 C：資安檢查 `docs/tech/security-review.md`
1. 若 `/security-review` skill 可用，執行它並把結果整理進此檔的「自動審查結果」節。
2. 無論如何都要逐項填寫下列清單，每項寫「符合 / 不符合 / 不適用」+ 說明 + 對應措施：
   - 秘密管理：無硬編碼；`.env` 在 `.gitignore`
   - 輸入驗證：所有外部輸入有 schema 驗證
   - 注入防護：參數化查詢或 ORM；shell 指令不拼接使用者輸入
   - 認證與授權：密碼雜湊演算法、session 或 token 策略、權限檢查位置
   - 傳輸安全：TLS
   - 依賴風險：鎖版本、定期 `npm audit` / `pip-audit`
   - 日誌不含敏感資料
   - 錯誤訊息不外洩內部細節
3. 每個「不符合」項目都要在步驟 D 變成一個任務。
完成後 `node .pm/pm-state.mjs add-doc tech docs/tech/security-review.md`。

## 步驟 D：任務拆解 `docs/tech/tasks.md`
檔頭：`# 任務清單`。每個任務格式：
```
## T1: <標題>
- 狀態: pending
- 模組: <對應 architecture.md 的模組>
- 說明: <做什麼>
- 驗收:
  - <可驗證條件 1>
  - <可驗證條件 2>
- 測試: <要寫哪些測試，用什麼指令跑>
- 依賴: <T?，或「無」>
```
規則：
- 依依賴順序排列，編號連續。
- 每個任務可在一次 subagent session 內完成（約 30 分鐘內）；太大就拆。
- T1 永遠是「專案骨架與測試框架可跑」（若 env 階段已建骨架，T1 改為「依技術棧補齊骨架與 lint」）。
- 每個資安「不符合」項目各一個任務，標題以「[security]」開頭。
完成後 `node .pm/pm-state.mjs add-doc tech docs/tech/tasks.md`。

## 步驟 E：同步 CLAUDE.md
把 architecture.md 的技術棧與建置/測試指令寫進 CLAUDE.md 的「技術棧」與「建置與測試指令」節，取代「待技術設計階段決定」。

## 步驟 F：審閱
用 AskUserQuestion 請使用者審閱三份文件：確認 / 要修改（Other 寫內容）。要修改就改完再問。

## 步驟 G：收尾
```bash
git add -A
git commit -m "docs(tech): 技術設計完成"
git rev-parse --short HEAD
```
執行 `node .pm/pm-state.mjs done tech --commit <sha>`。
回報任務數、資安不符合項目數，提示「下一步請執行 `/stage-build`」。

## 禁止
- 不寫功能程式碼。
- 不省略資安清單任何一項。
