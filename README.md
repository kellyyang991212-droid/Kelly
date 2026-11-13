# 旅伴手帳

供自己與親友旅行使用的繁體中文 React Native＋Expo 可操作原型。一趟旅行＝一個共同空間。

目前景點／美食採用 **免金鑰 Google Maps 外部搜尋＋回 App 手動收藏**，不需要 Google Cloud、帳單或 Places 設定。請見 [免金鑰操作說明](docs/NO-KEY-MAPS.md)。

手機與電腦公開預覽：[旅伴手帳](https://kellyyang991212-droid.github.io/Kelly/)。發布流程與功能範圍見 [GitHub Pages 說明](docs/GITHUB-PAGES.md)。

## 啟動

建議 Node.js 22 LTS 或以上，使用 pnpm。本專案鎖定 Expo SDK 54、React 19.1、React Native 0.81.5，確保套件互相相容。

```sh
pnpm install
pnpm web
```

開啟 http://localhost:8081 。同一套 React Native 畫面可在 Web 預覽，以及以相容的 Expo Go 或 development build 在 iPhone／Android 執行。

```sh
pnpm start
pnpm android
pnpm ios
```

實體手機需與開發機在同一網路；使用 Expo 顯示的 QR code。Expo Go 的 SDK 必須與專案相容；商店版本若不相容，請使用 SDK 54 development build。Windows 無法執行 iOS 模擬器，iOS 原生編譯需 macOS／Xcode 或日後使用 EAS Build。本次尚未製作安裝包、上架或驗證真機。

## 已可操作

- 旅行列表、關鍵字搜尋、示範／自建旅行篩選，建立 1～31 天的新旅行並進入獨立空間。
- 行程：依日期切換、新增時間與備註、依時間排序、標記完成。輸入中文外開 Google Maps 搜尋，回 App 填入名稱／地址／分享連結；儲存後可查看原地圖與規劃路線。
- 美食：外開 Google Maps 查目的地或目前附近餐飲，回 App 保存店家名稱、地址與分享連結；收藏／取消收藏、篩選、去重與加入行程。定位由 Google Maps 處理，本 App 不請求定位權限。
- 記帳：新增整數日圓支出、選付款人與分攤成員、即時計算分攤預覽、查看單筆分攤與全旅程結算建議。
- 相簿：查看 6 張示意照片、放大、上一張／下一張。
- 聊天：新增本機文字訊息。語音只提供未連線介面與模擬靜音；分享只提供範圍預覽。
- AsyncStorage 本機保存旅行與修改，重新整理後保留；照片本身使用外部素材網址，不做離線下載。
- 手機底部五分頁、鍵盤避讓與安全區域；桌面側欄與旅行筆記，方便電腦預覽。

## 建議體驗路徑

1. 首頁打開「京都慢慢走」示範旅行。
2. 切到「美食」，點小麵屋的愛心收藏，再點「加入行程」。
3. 指定 11/20、12:00，確認後回到行程，點「記下這一餐的花費」。
4. 輸入 `4801`，選小安付款、四人分攤。預覽為 1201／1200／1200／1200 日圓，確認儲存。
5. 在「記帳」點該筆明細，再「查看結算」，確認誰應付給誰。
6. 在「相簿」點照片放大、翻頁；試試聊天、語音與分享預覽。
7. 返回首頁建立自己的旅行，新增一筆行程，重新整理驗證保存。

## 原型界線

中文關鍵字會透過 Maps URLs 開啟外部 Google Maps，真實結果、評價與營業時間在 Google Maps 查看。App 不顯示虛構搜尋建議、不自動擷取店家資料；回到 App 後自行保存名稱、地址與分享連結。若 App 被系統終止，未儲存表單仍可能遺失。

技術依據：[Google Maps URLs 官方文件](https://developers.google.com/maps/documentation/urls/get-started)。

畫面明示「示範模式」；初始旅伴、餐廳及既有訊息均為虛構。手寫景點資料只供示範，不能視為實際旅遊資訊。若啟用 Google，來自 Google 的結果會另行標示來源。旅行時間為示範排程。照片來自 Unsplash，僅用作示意，不代表實際行程地點、店家餐點或成員拍攝。照片需要網路；失敗時顯示替代提示。

沒有 Supabase、LiveKit、帳號、多人連線或實際分享連結。沒有發送訊息、錄音、通話或轉帳。上傳按鈕明確提示尚待串接。新增旅行目前只含自己；任意手動新增餐廳、照片上傳、編輯／刪除既有項目及匯率換算留待後續開發。

本機資料使用 `@travel-journal/prototype-v1`，原生端存於 AsyncStorage、Web 存於瀏覽器。這不是加密儲存，不適合在原型放入證件、付款資料或敏感個資。不同裝置與瀏覽器之間不會同步。目前不使用任何 Google 金鑰或搜尋代理。

## 驗證

```sh
pnpm typecheck
pnpm test
pnpm exec expo install --check
pnpm export:web
pnpm exec expo export --platform ios --platform android --output-dir dist-native
```

金額運算以整數進行；此原型只支援 JPY。尾數按成員 ID 固定排序分配，與勾選順序無關。結算是依帳面餘額產生的建議，不聲稱轉帳次數最少，也不會標記已付款。

## 專案結構

- `App.tsx`：共用 UI、操作狀態、表單、本機儲存與手機／桌面配置。
- `src/domain.ts`：資料模型、示範資料、日期、餐廳轉行程、分攤與結算純函式。
- `src/MapPlaceSearch.tsx`：目前共用的免金鑰搜尋／手動保存介面。
- `src/PlaceSearch.tsx`、`src/places.ts`、`server/`：先前 API 方案的保留程式，現在不由 App 引用。
- `docs/NO-KEY-MAPS.md`：目前免金鑰版本操作說明。
- `tests/domain.test.ts`：分帳守恆、尾數、非法輸入、日期與防重複流程。
- `docs/ROADMAP.md`：後續開發順序與驗收條件。
- `docs/QA.md`：本次驗證紀錄與未驗證範圍。

技術參考：[Expo SDK 文件](https://docs.expo.dev/versions/latest/)。後續升級 SDK 時應重新執行相容性檢查與雙平台真機驗證。
