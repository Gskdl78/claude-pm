# claude-pm

給 [Claude Code](https://docs.anthropic.com/en/docs/claude-code) 用的五階段開發流程，加上一個把它包起來的 Windows 桌面程式。

一個專案照 **環境搭建 → 產品設計 → 技術設計 → 產品實現 → 人工驗證** 五個階段推進，每個階段有對應的 skill、明確的產出文件與驗收條件，狀態存在專案自己的 `.pm/state.json`。桌面程式則把「開哪個專案、現在第幾階段、terminal、文件、git、跨專案問題回顧」收在同一個視窗裡。

> 個人專案，介面與文件都是繁體中文。目前只在 Windows 11 上開發與測試過。

## 這是為了解決什麼

用 Claude Code 做比較大的東西時，常見的狀況是：一開始就跳進去寫程式，需求邊寫邊改；出過的錯下一個專案再出一次；開了好幾個專案之後忘記每個做到哪。

claude-pm 的作法是把流程本身寫成 skill：前一階段沒完成不准進下一階段，每個階段結束一定 commit，實作與審核由不同的 subagent 做，審核退回會被記成 issue（症狀 / 根因 / 修法 / commit），之後新專案的 `CLAUDE.md` 會自動帶上重複出現的根因當注意事項。

## 兩個部分

| 目錄 | 是什麼 |
| --- | --- |
| [`plugin/`](plugin/) | `pm-workflow`：五個階段 skill、`/pm-status`、把流程種進專案的 scaffold 腳本 |
| [`app/`](app/) | Electron 桌面程式：專案清單、內嵌 Claude Code 終端機、階段面板、文件預覽、git 面板、跨專案洞察、skill 試用 |

plugin 可以單獨用（在終端機裡跑），app 則是把 plugin 包進去一起打包。

## 需求

- Node.js 20 以上（開發時用 24）
- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) 已安裝並登入，`claude` 在 PATH 裡
- git
- 桌面程式目前只產 Windows 的安裝檔與免安裝版

原生模組 `node-pty` 用的是 N-API prebuild，**不需要** Visual Studio Build Tools。

## 開始

### 只用 plugin

把流程種進一個資料夾：

```bash
git clone https://github.com/Gskdl78/claude-pm.git
cd claude-pm
npm install
node plugin/scripts/scaffold.mjs C:/Projects/my-app
```

會建立 `.claude/skills/`、`.pm/`、`CLAUDE.md`、`.gitignore` 並做第一個 commit。之後在 `C:/Projects/my-app` 啟動 Claude Code，依序執行：

| 指令 | 階段 | 產出 |
| --- | --- | --- |
| `/stage-env` | 環境搭建 | CLAUDE.md、.gitignore、最小骨架 |
| `/stage-design` | 產品設計 | `docs/product/prd.md`、demo |
| `/stage-tech` | 技術設計 | `docs/tech/architecture.md`、`security-review.md`、`tasks.md` |
| `/stage-build` | 產品實現 | 程式碼、`docs/build/log.md` |
| `/stage-verify` | 人工驗證 | `docs/verify/checklist.md` |

`node .pm/pm-state.mjs get` 看目前狀態。細節見 [`plugin/README.md`](plugin/README.md)。

### 用桌面程式

```bash
cd app
npm install
npm run dev          # 開發模式
npm run dist         # 產出 dist/ 的安裝檔與免安裝 exe
```

第一次開啟會用 `%USERPROFILE%\.claude-pm\config.json` 裡的根目錄列出專案；在側欄的 ⚙ 可以改。細節與每個面板的說明見 [`app/README.md`](app/README.md)。

## 桌面程式有什麼

- **專案清單**：建立空專案、從 git 網址複製、對既有資料夾補上流程
- **內嵌終端機**：每個專案一個 Claude Code session（同時最多 4 個），切換專案不會中斷對話
- **階段面板**：目前階段一鍵「開始 / 繼續 / 重跑」，卡住時顯示原因
- **等待輸入通知**：Claude Code 停下來問問題時側欄標記，視窗在背景就閃工作列並發通知
- **文件分頁**：Markdown 與 Mermaid 直接渲染，驗證清單可以打勾並自動 commit
- **git 面板**：變更 / 分支 / 歷史 / 進階四頁、逐 hunk 暫存、依階段帶 commit 前綴、發佈到 GitHub 精靈。每個會改變狀態的動作都先顯示將執行的確切 git 指令
- **洞察**：所有專案的 issue 依根因分組，可以把重複的根因釘成新專案的注意事項
- **Skill 試用**：貼一個 GitHub 網址把別人寫的 skill 抓下來，先看靜態掃描報告、讓 Claude Code 分析，再決定要不要試用；滿意就採用進專案，好用再升成全域

## 開發

```bash
npm test                 # plugin 的測試
cd app && npm test       # 主程序與 renderer 的測試
cd app && npm run typecheck
cd app && npm run test:e2e   # Playwright 開真的 Electron 視窗
```

主要的設計取捨：

- **所有 git 與檔案操作都在 Electron 主程序**，用 `execFile('git', argv)` 執行，argv 逐項驗證，路徑一律確認在專案根目錄之內。renderer 碰不到 `node:*`。
- **watcher 用輪詢不用 `fs.watch`**：Windows 上 `fs.watch` 不夠可靠。ref 目錄要列內容而不是看目錄 mtime——實測在 Windows 上，於目錄內新增檔案有約 2/3 的機率完全不會更新該目錄的 mtime。
- **不會為了「試跑」而執行外來 skill 附帶的任何 script**；掃描報告是風險提示，不是安全保證。

## 授權

尚未決定授權條款。在加上 LICENSE 之前，預設保留所有權利。
