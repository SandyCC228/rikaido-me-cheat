# rikaido 正解查詢頁 — 設計文件

2026-09-08

## 目標

一個公開的靜態網頁，讓不會用終端機的人貼上 rikaido quiz 網址，就能看到那份 quiz 的
30 題題目與正解；順帶提供「直接幫我送出一筆成績」。

主要用途是**看正解**（使用者自己回真站作答，作答紀錄與時間都是真的），送出是次要捷徑。

## 使用者流程

1. 貼上 `https://rikaido.me/tw/?q=dek3wath6y`（或任何語系網址，或純 quiz id）
2. 頁面顯示：出題者暱稱、題數、30 題的題目文字與正解選項
3. （可選）填暱稱與分數，按送出，寫一筆結果進該 quiz 的排行榜

## 架構

無建置、無框架、無後端。GitHub Pages 直接 serve 根目錄。

```
index.html   UI 與流程
core.js      共用邏輯（CLI 與網頁都用）
cheat.js     既有 CLI，改成 require('./core.js')
test.js      node test.js，assert 測 core.js
```

`core.js` 尾端以 UMD-lite 同時支援兩種載入：

```js
typeof module !== 'undefined' ? module.exports = API : window.CHEAT_CORE = API;
```

分數攤分是全專案唯一有分支的邏輯，共用一份避免 CLI 與網頁行為分岔。

## 資料來源

### Firestore REST（無需金鑰，允許任何 origin）

實測 `access-control-allow-origin` 回填請求端 origin，純前端可直接讀寫。

- 取 quiz：`POST .../documents:batchGet`，body `{"documents":[<path>...]}`
- 寫結果：`POST .../documents:commit`

base：`https://firestore.googleapis.com/v1/projects/rikaido-9qu1/databases/(default)/documents`

### 題庫（`<script src>` 載入，不是 fetch）

實測 `fetch('https://rikaido.me/js/questions-tw.js')` 被 CORS 擋；`<script src>` 正常載入
（該檔無 `Cross-Origin-Resource-Policy`，MIME 為 `application/javascript`，且本來就是設計成
全域腳本，載入後掛在 `window.RIKAIDO_QUESTIONS`）。

因此不做題庫快照、不需要定時同步，題庫永遠與 rikaido 官方一致。

備援：若日後 rikaido 加上 CORP header 或改檔名，改為 repo 內快照 + GitHub Actions
定時抓取，屆時再處理。

## 語系

| quiz 頁網址 | collection    | 題庫檔                |
|-------------|---------------|-----------------------|
| `/?q=`      | `quizzes`     | `/js/questions.js`    |
| `/tw/?q=`   | `quizzes_tw`  | `/js/questions-tw.js` |
| `/en/?q=`   | `quizzes_en`  | `/js/questions-en.js` |
| `/ko/?q=`   | `quizzes_ko`  | `/js/questions-ko.js` |

**依序**試各語系的 collection，命中就停。順序：網址路徑指定的語系排第一
（`rikaido.me/` 即日文），其餘按 `tw → ja → en → ko` 遞補。純 quiz id 也能用，
只是沒有線索，從繁中開始試。

兩個都不能做：

- 四個路徑塞進同一個 `batchGet` → 整批 403。Firestore 的安全規則對**不存在的文件**
  一律回 403（實測 `quizzes_tw/notexist123` 亦然，與語系無關），而一份 quiz 只屬於
  一個語系。
- 四個 collection 並行各查一次 → 命中的只有一個，另外三個必然 403，瀏覽器 console
  會留下三行紅字，無法從 JS 抑制。

依序查則常見情況（貼 tw 網址、或 tw 的 id）只發 1 個請求、0 個錯誤；代價是查其他語系
時多幾次往返。

## 資料格式

### quiz doc（`quizzes_xx/<quizId>`）

| 欄位 | 型別 | 意義 |
|------|------|------|
| `n`  | string | 出題者暱稱 |
| `a`  | string | 正解，每題一個字元 `A` / `B` |
| `q`  | array\<int\> | 題目在題庫 `sets[v]` 的 index |
| `v`  | int | 題庫版本，取 `sets[v]`，預設 1 |

### 題庫 `window.RIKAIDO_QUESTIONS`

- `genres`：分類定義（label / emoji / color）
- `sets[v][index]`：`{ g: 分類, q: 題目, a: A 選項文字, b: B 選項文字 }`

### result doc（寫入 `quizzes_xx/<quizId>/results/<autoId>`）

對照網站原本的 `addDoc(collection(db, 'quizzes_tw', quizId, 'results'), {...})`：

| 欄位 | 值 |
|------|-----|
| `n`  | 暱稱 |
| `s`  | 分數（整數） |
| `g`  | map，各分類答對數，總和等於 `s` |
| `r`  | 作答字串，直接用正解 `a` |
| `t`  | `setToServerValue: REQUEST_TIME` |

doc id 用 20 字元 `A-Za-z0-9`，與 Firestore auto-id 同格式。

## 分數攤分

使用者只填總分，各分類分數由 `spread(score, cap)` 產生：依分類順序平均分配，
每類不超過該類題數，總和必定等於分數。

```js
keys.forEach((k, i) => {
  g[k] = Math.min(cap[k], Math.round(left / (keys.length - i)));
  left -= g[k];
});
```

## UI

單頁兩段，捲動即可，無路由。

**輸入段**：一個大輸入框（貼網址或 id）＋查詢按鈕。載入中顯示狀態。

**正解段**：標頭顯示出題者與題數。30 題逐題列出題號、題目文字、兩個選項，正解那側
高亮。分類用題庫自帶的 emoji 與顏色標示。

**送出段**：折疊在正解下方，預設收合。暱稱、分數（預設滿分）、送出按鈕。旁邊一行
白話提醒這會寫進真實排行榜。送出後顯示成功訊息與回 quiz 頁的連結。

視覺設計於實作時走 ui-ux-pro-max，此處只定結構。

## 錯誤處理

| 情況 | 行為 |
|------|------|
| 四個 collection 都無 `found` | 「找不到這個 quiz，確認網址是否正確」 |
| 題庫 script 載入失敗 | 降級只印「1. A　2. B …」，正解仍正確，頁面不中斷；同時隱藏送出區塊（`g` 的 key 必須是題庫分類名，算不出來就不該寫） |
| `sets[v]` 不存在 | 同上，降級 |
| commit 失敗 | 原樣顯示 Firestore 回的錯誤訊息 |
| 分數超出 0~題數 | 送出鈕停用，輸入框旁提示 |

## 測試

`node test.js`，assert 覆蓋：

- `spread`：總和等於分數、受各類題數上限、0 分、滿分、非整除分數
- 網址解析：四語系網址、純 id、無效字串
- write payload：doc id 格式、欄位齊全、`t` 用 server timestamp

UI 於瀏覽器實際跑一遍驗證，不寫自動化。

## 不做

- 多筆灌榜（多暱稱／多次數）：留在 CLI，公開頁面不提供
- 看別人的作答內容
- 任何後端、帳號、統計

## 已知限制

- Firestore 該 collection 無寫入權限限制，此頁公開後任何人都能對任何 quiz 灌結果。
  文案上提醒，技術上擋不住。
- 題庫依賴 rikaido 的檔名與全域變數名，對方改版即失效（有降級路徑）。
