# claude-pm 桌面程式

## 開發

```bash
cd app
npm install        # 不會自動 rebuild；node-pty 1.1.0 的 N-API prebuild 可直接在 Electron 44 載入
npm run dev        # 開發模式（熱重載）
npm test           # vitest（main + renderer）
npm run typecheck
```

## 打包

```bash
npm run dist       # 產出 dist/claude-pm Setup x.y.z.exe 與 portable exe
```

plugin 目錄會以 extraResources 一起打包到 `resources/plugin`，主程序用 `getPluginDir()` 取得。

## 設定檔

`%USERPROFILE%\.claude-pm\config.json`：
```json
{ "root": "C:\\Projects", "lastProject": "C:\\Projects\\my-app", "recent": [] }
```
改 `root` 可換專案根目錄。

## 終端機快捷鍵

內嵌終端機沿用 Windows Terminal 的複製貼上習慣（選單列預設隱藏，但快捷鍵一律有效）：

| 按鍵 | 行為 |
| --- | --- |
| `Ctrl+Shift+C` / `Ctrl+Insert` | 複製目前選取的文字 |
| `Ctrl+C` | 有選取時複製；沒有選取時照常送出 `^C` 中斷 Claude Code |
| `Ctrl+Shift+V` / `Shift+Insert` / `Ctrl+V` | 把剪貼簿內容貼進 pty（多行原樣送出） |
| 右鍵 | 有選取時複製，沒有選取時貼上 |

滑鼠拖曳選取文字的行為不變。剪貼簿走 renderer 的 `navigator.clipboard`：
Electron 44 的 sandbox renderer 在 `file://` 頁面上已預設授予 `clipboard-read`／`clipboard-write`，
不會跳權限提示，因此不需要額外的 IPC 通道。

應用程式選單（`src/main/menu.ts`）另外註冊了「編輯」（copy／paste／selectAll）與
「檢視」（reload／toggleDevTools／resetZoom／zoomIn／zoomOut）的標準 role，
讓這些加速鍵在 `autoHideMenuBar: true` 的情況下依然存在。終端機自己的按鍵處理會先
`preventDefault()`，所以不會和選單的 role 重複觸發（不會貼上兩次）。

## 環境注意事項

### 原生模組（node-pty）不需要 C++ 工具鏈

專案**沒有**設定 `postinstall` 的 electron-rebuild。node-pty 1.1.0 提供 N-API prebuild，可直接在
Electron 44 底下載入，因此一般開發機不需要安裝 Visual Studio Build Tools。
`electron-builder.yml` 也設定了 `npmRebuild: false`，打包時不會嘗試重建原生模組。

若未來升級 Electron 造成 ABI 不相容，再手動執行：

```bash
npm run rebuild    # electron-rebuild -f -w node-pty（選用）
```

### Windows Application Control 可能擋住 Electron 解壓

在部分受管控的 Windows 機器上，`npm install` 會在下載 Electron 後失敗，症狀是
`extract-zip` 解壓 Electron zip 時被 Windows Application Control 阻擋
（安裝停在 `electron` 的 postinstall，`node_modules/electron/dist` 為空或不存在）。

繞道方式：手動把 Electron 的快取 zip 解壓到 `node_modules/electron/dist`。
快取位於 `%LOCALAPPDATA%\electron\Cache\<version>\electron-v<version>-win32-x64.zip`：

```powershell
Expand-Archive "$env:LOCALAPPDATA\electron\Cache\<version>\electron-v<version>-win32-x64.zip" `
  -DestinationPath ".\node_modules\electron\dist" -Force
```

解壓後 `node_modules/electron/dist/electron.exe` 應該存在，`npm run dev` 即可正常啟動。

### npm 11 會略過 electron-winstaller 的 install script

`npm install` 可能出現 npm 11 跳過 `electron-winstaller` install script 的訊息。
本專案只產出 NSIS 與 portable 目標，不使用 Squirrel.Windows，因此可以忽略。

### 受管控機器上 portable exe 可能被 Application Control 擋下

同一套 Windows Application Control 政策也可能擋掉剛打包出來、未經正式簽章的
`dist\claude-pm 0.1.0.exe`（症狀：`Start-Process` 回報
`An Application Control policy has blocked this file.`）。
此時可改用 `dist\win-unpacked\claude-pm.exe` 驗證打包結果，或在未受管控的機器上測試安裝檔。
