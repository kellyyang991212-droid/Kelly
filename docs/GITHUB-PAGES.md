# GitHub Pages 網頁版

正式預覽網址：https://kellyyang991212-droid.github.io/Kelly/

這是 Expo App 的靜態 Web 版本，手機 Safari／Chrome 與電腦瀏覽器可透過 HTTPS 開啟，不限同一區域網路，不需要開發電腦持續開機。手機可從瀏覽器的分享／選單加入主畫面；目前不是原生安裝包或完整離線 PWA。

## 自動部署

`.github/workflows/pages.yml` 在推送 `main` 時執行，也可從 GitHub Actions 手動執行：

1. 以 Node 24、pnpm 11.25.0 安裝鎖定依賴。
2. 執行型別檢查與測試。
3. 使用 `EXPO_BASE_PATH=/Kelly` 匯出 Expo Web。
4. 驗證 JavaScript 路徑及檔案，建立 `.nojekyll` 與 404 fallback。
5. 上傳 `dist`，部署至 GitHub Pages。

儲存庫 Settings → Pages → Source 設為 **GitHub Actions**。不再從 `main` 原始碼根目錄直接建立 Jekyll 網站。工作流程僅透過 GitHub 產生的權杖執行，不需要自行填入 Google 金鑰或 GitHub token。

## 本機驗證同樣輸出

PowerShell：

```powershell
$env:EXPO_BASE_PATH = '/Kelly'
pnpm export:web
node scripts/prepare-pages.mjs
Remove-Item Env:EXPO_BASE_PATH
```

`app.config.js` 只有在設定 `EXPO_BASE_PATH` 時增加部署子路徑；一般 `pnpm web` 及 iOS／Android 開發不受影響。

## 資料與功能範圍

網站公開的是程式與內建示範資料；開發機的 AsyncStorage、瀏覽器個人紀錄、`.env`、`node_modules` 與 Git 憑證不在部署產物內。

每台裝置與每個瀏覽器仍各自保存本機資料。此 GitHub Pages 網址與先前 `localhost` 的儲存空間不同，第一次開啟會從示範旅行開始。登入、邀請朋友、共同編輯、即時群聊與語音仍待 Supabase／LiveKit 串接。Google Maps 搜尋採免金鑰外開流程。

參考：[Expo 網頁部署](https://docs.expo.dev/guides/publishing-websites)、[GitHub Pages 自訂工作流程](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)。
