# 中文景點搜尋與附近美食｜Google 設定步驟

> 此文件為先前付費 API 方案的保留參考。使用者已選擇免金鑰版本，目前 App 不使用此流程；請改讀 [免金鑰操作說明](NO-KEY-MAPS.md)。無須開通 Google Cloud 或啟動代理。

## 現在可以操作什麼

App「新增行程」最上方有中文地點搜尋：輸入「清水」→ 顯示清水寺、清水坂 → 點選 → 自動帶入名稱、示範地址及座標 → 填寫日期／時間 → 儲存。可改選其他地區、重新搜尋或手動輸入地址。

App「美食」右上角「搜尋美食」：先顯示旅行目的地附近的示範餐飲；輸入「拉麵」「咖啡」會篩出相關店家。選取後可查看位置、收藏，再從美食卡片加入行程。點「查詢目前位置附近美食」才會請求前景定位；拒絕後仍可輸入城市查詢。

你尚未建立 Google Cloud 專案，因此目前使用明確標示的手寫示範清單，並非 Google 即時資料。示範位置不是實際地圖；虛構店家的地址與座標也不能用於真實旅行。Google 搜尋程式與本機代理已完成，但真正的結果與地圖預覽仍需依下列步驟啟用並驗證。

## 1. 建立 Google Cloud 專案

1. 用自己的 Google 帳號登入 [Google Cloud Console](https://console.cloud.google.com/)。
2. 建立專案，例如「旅伴手帳」。
3. 依 Google 的要求連結帳單帳戶。這一步由你本人操作；請先確認目前的計價方式與額度。
4. 在「API 和服務 → 程式庫」啟用 **Places API (New)**。
5. 若要在 App 內顯示選取後的 Google 地圖圖片，再啟用 **Maps Static API**。本版為帶標記的靜態地圖預覽；互動縮放與導航由「在 Google Maps 查看位置」開啟。

官方設定：[Places API (New)](https://developers.google.com/maps/documentation/places/web-service/get-api-key)、[Maps Static API](https://developers.google.com/maps/documentation/maps-static/get-api-key)。

## 2. 建立後端專用金鑰

1. 到「Google Maps Platform → 金鑰與憑證」建立 API 金鑰。
2. 限制只能使用 Places API (New)；若共用金鑰提供預覽，再允許 Maps Static API。也可為 Static API 建立另一把金鑰。
3. 後端金鑰應限制為後端對外出口 IP；本機測試時請填開發機實際出口 IP。網路換線或出口 IP 改變後需更新。手機與瀏覽器不直接呼叫 Google，因此這把金鑰不是 Android／iOS SDK 金鑰，也不使用瀏覽器 referrer 限制。
4. 在 Google Cloud 設定可接受的 API 配額與預算通知。**預算通知本身不是硬性停費上限**；另外設定 API 配額，並監看實際用量。

請勿把金鑰貼在聊天、寫進 App 程式、`app.json` 或任何 `EXPO_PUBLIC_*` 變數。

## 3. 在電腦填入設定

在專案根目錄執行：

```powershell
Copy-Item .env.places.example .env.places
Copy-Item .env.example .env
```

用自己的編輯器開啟 `.env.places`，填入後端金鑰：

```dotenv
GOOGLE_MAPS_API_KEY=在這裡填入你的後端金鑰
GOOGLE_MAPS_STATIC_API_KEY=
PLACES_HOST=127.0.0.1
PLACES_PORT=8787
PLACES_ALLOWED_ORIGINS=http://localhost:8081,http://127.0.0.1:8081
```

如使用另一把 Static API 金鑰，填入 `GOOGLE_MAPS_STATIC_API_KEY`；留空時使用第一把金鑰。

在 `.env` 設定前端可以存取的代理網址：

```dotenv
EXPO_PUBLIC_PLACES_API_URL=http://127.0.0.1:8787
```

`.env` 與 `.env.places` 已被 `.gitignore` 排除。`.env.places` 只由 Node 後端讀取；Expo 不應載入或打包此檔案。

## 4. 啟動並確認真正的搜尋

一個終端執行：

```sh
pnpm places:server
```

另一個終端啟動 Expo；如果已在執行，先結束再重啟，確保新的公開設定生效：

```sh
pnpm web
```

在「新增行程」應看到 **Google Places 即時搜尋**。輸入「京都 清水寺」，點選結果，確認名稱／地址／位置。美食分頁可查附近及關鍵字餐飲。

若看到「示範景點／美食搜尋」，代表 App 尚未讀到代理網址；這不是 Google 結果。若已設定代理但後端沒有金鑰，畫面會明確顯示設定錯誤，不會偷偷回傳示範結果。

可開啟 `http://127.0.0.1:8787/health`：`configured` 只表示有設定金鑰，不保證授權、配額、帳單或 API 啟用有效，仍需實際搜尋驗證。

## 5. iPhone／Android 手機測試

手機不能用 `127.0.0.1` 連到你的電腦。僅在可信任的私人 Wi-Fi 測試時：

1. 找出開發電腦的區網 IP，例如 `192.168.1.20`。
2. `.env.places` 的 `PLACES_HOST` 改成 `0.0.0.0`，重新啟動代理。
3. `.env` 改成 `EXPO_PUBLIC_PLACES_API_URL=http://192.168.1.20:8787`，重新啟動 Expo。
4. 若也以電腦區網網址開啟 Web 預覽，將該 Web origin（例如 `http://192.168.1.20:8081`）加入 `PLACES_ALLOWED_ORIGINS`。
5. 依裝置與 development build 設定，可能需要處理本機網路權限與 HTTP 開發例外；正式版本使用 HTTPS。不要為此關閉整個防火牆或系統安全保護。
6. 在同 Wi-Fi 的實體手機測試中文輸入法、Google Maps 開啟／返回，以及定位允許、拒絕和逾時。

此代理沒有帳號驗證，**只用於可信任本機／區網開發，不得直接公開到網際網路或交付親友作正式服務**。沒有背景定位，也不保存目前位置歷史。

## 6. 正式多人版本

下一階段將相同代理邏輯移至受保護的 HTTPS 後端（例如 Supabase Edge Function），加入 Supabase JWT 驗證、trip membership、依使用者限流、共用配額與費用監控，再提供測試安裝版。不能只靠 CORS 保護付費 API。

正式啟用前也需完成使用條款、隱私權政策、Google 來源標示、Places 內容保存規則與資料刪除策略。本機實作不快取搜尋清單或 Google 地圖圖檔，代理回應為 `Cache-Control: no-store`；Google 地址／座標僅在選取表單中暫存，儲存行程保留 Place ID 與使用者確認的行程標題，不把 Google 地址／座標永久寫入本機。美食收藏也只保留 Place ID 與確認的收藏名稱，日後正式版需依資料使用條款完成地點重新整理流程。

參考：[Autocomplete](https://developers.google.com/maps/documentation/places/web-service/place-autocomplete)、[Place Details](https://developers.google.com/maps/documentation/places/web-service/place-details)、[Places 政策與來源標示](https://developers.google.com/maps/documentation/places/web-service/policies)。

## 常見問題

| 畫面／情境 | 處理方式 |
| --- | --- |
| Google 服務尚未授權 | 確認 API 已啟用、金鑰限制、出口 IP 與帳單帳戶 |
| 查詢額度已達限制 | 等待配額恢復，並到 Google Cloud 查看用量；不要無限制重試 |
| 只有搜尋，地圖圖片無法顯示 | 確認 Maps Static API 已啟用與授權；仍可開啟 Google Maps |
| 未知旅行城市查不到附近清單 | 本版內建京都、大阪、東京、台南、台北搜尋中心；輸入城市＋美食或使用目前定位 |
| 拒絕定位 | 仍可輸入城市／店名查詢，不影響行程與收藏 |
| 朋友無法登入或看到旅行 | 帳號與多人雲端共用尚未串接；與 Google 搜尋設定不同 |
