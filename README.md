# MemorAIze — AI 課堂筆記助手

## 新增功能說明

### 1. `localforage` 本機資料保存

本版本已將主要資料保存流程改為使用 `localforage`，取代單純依賴 `localStorage` 的方式。

優點如下：

- 資料持久化更穩定，適合後續擴充。
- 可作為本機快取，讓 App 維持 local-first 使用體驗。
- 即使未登入，筆記仍可先保存在本機。

目前筆記資料會先寫入本機，再依登入狀態決定是否同步到雲端。

### 2. Google 登入雲端同步

本版本新增 Google 登入，登入後會啟用 Firebase Auth + Firestore 筆記同步。

同步特性如下：

- 每位使用者的資料獨立保存於自己的 Firestore 路徑。
- 筆記以使用者 UID 對應到雲端資料。
- 本機資料與雲端資料會做合併同步。
- 未登入時仍可本機使用；登入後會開始同步目前筆記。

目前雲端同步的主要範圍是 notes 資料。

## 開發環境設定

### 1. 安裝套件

在專案根目錄執行：

```bash
npm install
```

### 2. 建立 `.env`

本專案建議後續統一使用 `.env` 作為環境變數檔，請在專案根目錄建立或維護 `.env`。

請至少放入以下 Firebase 設定：

```env 
VITE_FIREBASE_API_KEY=你的 Firebase API Key
VITE_FIREBASE_AUTH_DOMAIN=你的 Firebase Auth Domain
VITE_FIREBASE_PROJECT_ID=你的 Firebase Project ID
VITE_FIREBASE_STORAGE_BUCKET=你的 Firebase Storage Bucket
VITE_FIREBASE_MESSAGING_SENDER_ID=你的 Firebase Messaging Sender ID
VITE_FIREBASE_APP_ID=你的 Firebase App ID
```

```env
GEMINI_API_KEY=你的 Gemini API Key
```

若你目前仍沿用舊版設定，也可暫時保留 `VITE_GEMINI_API_KEY` 作為相容欄位；但後續新版本建議以 `GEMINI_API_KEY` 為主。

### 3. Firebase Console 設定

請確認 Firebase 專案已完成以下設定：

- 開啟 Authentication
- 啟用 Google Sign-In Provider
- 建立 Firestore Database
- Firestore Rules 允許使用者只能存取自己的筆記資料

## 開發啟動方式

### 情境 A：只測試前端 + Google 登入 + Firestore 同步

使用 Vite 即可：

```bash
npm run dev
```

這個模式適合測試：

- `localforage` 本機保存
- Google 登入 / 登出
- Firestore 雲端同步
- 多視窗同步驗證

### 情境 B：要連同 `/api/gemini` 一起測試

如果你要測 AI 摘要、AI 生成或任何會打到 `/api/gemini` 的功能，請改用：

```bash
npx vercel dev
```

原因是 `api/gemini.js` 屬於 serverless route，`npm run dev` 不會啟動這條 API。

如果本機尚未安裝 Vercel CLI，可先執行：

```bash
npm install -g vercel
```

如果工作區內仍有舊的 `.env.local`，建議移除，避免與 `.env` 內容不一致。

## 測試流程

### A. 測試 `localforage` 本機保存

1. 啟動專案。
2. 不登入帳號，直接新增或修改筆記。
3. 重新整理頁面。
4. 確認剛剛的筆記內容仍然存在。

預期結果：未登入時，筆記仍可透過 `localforage` 保留在本機。

### B. 測試 Google 登入

1. 點擊登入按鈕。
2. 選擇 Google 帳號完成登入。
3. 回到 App 後確認畫面顯示已登入狀態。

預期結果：登入成功後，前端會取得目前使用者資訊，並準備進行筆記同步。

### C. 測試 Firestore 雲端同步

1. 保持登入狀態下新增一則筆記。
2. 到 Firebase Console 的 Firestore 查看資料。
3. 確認資料寫入在對應使用者的 notes 路徑下。

預期結果：新筆記會同步到 Firestore，且資料只屬於目前登入使用者。

### D. 測試跨視窗同步

1. 開兩個瀏覽器分頁或兩個視窗。
2. 以同一個 Google 帳號登入。
3. 在其中一個視窗新增或修改筆記。
4. 觀察另一個視窗是否同步到更新內容。

預期結果：另一個視窗應能看到最新筆記內容，代表本機與雲端同步流程正常。

### E. 測試登出後行為

1. 在登入狀態下先確認同步正常。
2. 執行登出。
3. 再新增或修改筆記。
4. 重新整理頁面檢查本機資料是否仍存在。

預期結果：登出後不再進行該帳號的雲端同步，但本機仍可繼續使用與保存筆記。


若需要結束所有本機 Node 開發程序：

```bash
taskkill /F /IM node.exe
```
