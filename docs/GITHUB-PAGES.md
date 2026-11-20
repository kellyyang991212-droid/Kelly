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

每台裝置與每個瀏覽器各自保存未上傳的本機旅行。GitHub Pages 與本機開發的儲存空間分開。共用旅行支援成員之間的文字聊天，語音屬後續功能。

## 啟用 Web 版共用旅行

1. 建立 Supabase 專案，在 Authentication 的登入方式啟用 **Anonymous Sign-ins**。
2. 在 SQL Editor 依序執行 [共用旅行 migration](../supabase/migrations/20261120000000_shared_trips.sql) 和 [文字聊天 migration](../supabase/migrations/20261120000001_shared_trip_chat.sql)。已啟用共用旅行的專案只需執行文字聊天 migration。
3. Kelly 的 GitHub Pages 工作流程有公開的預設連線設定。要使用另一個專案，可在 GitHub 儲存庫 Settings → Secrets and variables → Actions → Variables 設定 `EXPO_PUBLIC_SUPABASE_URL`（Project URL）。使用新金鑰時設定 `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`（以 `sb_publishable_` 開頭）；使用 Legacy API keys 時設定 `EXPO_PUBLIC_SUPABASE_ANON_KEY`（公開 `anon` 金鑰）。公開金鑰與 URL 會進入 Web bundle。具管理權限的金鑰需留在伺服器端。
4. 執行 GitHub Pages 工作流程。發布前會檢查匿名登入和共用旅行 API 權限。本機開發可將相同的兩個值放入 `.env`，再重新啟動 Expo。
5. 用兩個瀏覽器工作階段驗證：建立自己的旅行 → 邀請旅伴 → 產生邀請連結，讓另一個瀏覽器開啟並接受。雙方應看到同一份行程、收藏和支出。用第三個瀏覽器打開同一連結，確認已使用的邀請無法加入。

邀請 24 小時有效，每個連結限一個新成員加入。建立者可以撤回未使用的邀請。加入的旅伴可以讀取既有行程、收藏、支出與最近 100 則共用訊息。開啟旅行時，畫面會定期同步。共用身分以瀏覽器保存的匿名工作階段識別，清除網站資料後須重新邀請，且原建立者身分需保留原工作階段。

參考：[Expo 網頁部署](https://docs.expo.dev/guides/publishing-websites)、[GitHub Pages 自訂工作流程](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)。
