# rikaido 正解查詢

查 [rikaido.me](https://rikaido.me) 上某份 quiz 的題目與正解，也可以直接送一筆成績進它的排行榜。

正解是從 Firestore 的 quiz 文件直接讀出來的（`a` 欄位，每題一個 `A`／`B`），題目文字則對照
rikaido 官方的題庫檔。兩者都是公開讀取，不需要登入。

## 網頁版

```
node serve.js        # → http://localhost:8787/
```

貼上 quiz 網址（`https://rikaido.me/tw/?q=xxxxx`）或純 id，會列出每一題與正解選項。
下方收合的區塊可以填暱稱與分數，直接送一筆結果。

部署到 GitHub Pages 只要把 repo 根目錄丟上去，沒有建置步驟——`index.html`、`core.js`
兩個檔案就是全部。

## CLI

```
node cheat.js                  # 問答模式：依序問 quiz、暱稱、分數、次數
node cheat.js <quizId|網址>     # 看排行榜
node cheat.js <清單.txt>        # 批次，每行 quizId,暱稱,分數,次數
node cheat.js <清單.txt> --dry  # 只印 payload，不送出
```

清單格式（分數留空 = 滿分，次數留空 = 1）：

```
dek3wath6y,小明,30,1
dek3wath6y,路人,,5
```

同一行的 n 筆會併成一次 commit（超過 500 筆才分批），同一個 quiz 的題目只抓一次。

## 測試

```
node test.js
```

會打真實網路（讀一份公開 quiz），不會寫入任何資料。

## 四個語系

rikaido 有 ja / tw / en / ko 四套，分屬 `quizzes`、`quizzes_tw`、`quizzes_en`、`quizzes_ko`。
工具依序試各語系，命中就停；網址路徑指定的語系排第一，所以貼網址通常一個請求就找到。

## 幾個實作上的坑

- **題庫不能用 `fetch` 抓**。`rikaido.me` 沒有 CORS header，但 `questions-*.js` 是把物件掛在
  `window` 的普通腳本，用 `<script src>` 載入不受 CORS 管，而且永遠是官方最新版，不需要快照。
- **不能一次 `batchGet` 四個語系**。Firestore 的規則對不存在的文件一律回 403，而一份 quiz
  只屬於一個語系，整批會被拒。
- **也不要並行查四個**。命中的只有一個，其餘三個必然 403，瀏覽器 console 會留紅字。
- **`core.js` 包在 IIFE 裡**。`<script src>` 和頁面的 inline script 共用全域作用域，不包的話
  兩邊宣告同名變數就是 SyntaxError。

## 限制

- 該 collection 沒有寫入權限限制，所以任何人都能對任何 quiz 送出結果，這頁只是把它變方便。
  送出的結果只能由出題者在 rikaido 的管理介面隱藏，本工具不提供刪除。
- 題庫依賴 rikaido 的檔名與全域變數名，對方改版就會失效——屆時網頁會退回只顯示 `A`／`B`，
  並隱藏送出功能（算不出分類就不該寫進去）。
