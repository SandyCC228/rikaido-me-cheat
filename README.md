# rikaido 正解查詢

查 [rikaido.me](https://rikaido.me) 上某份 quiz 的題目與正解，也可以直接送一筆成績進它的排行榜。

## 結構

```
index.html  ja/  en/  ko/    產生出來的四個語系頁，不要直接改
favicon.webp  robots.txt  sitemap.xml
assets/     core.js（CLI 與網頁共用）、app.js（網頁）
src/        i18n.json（文案）、template.html（版型）、build.js
cli/        cheat.js 與範例清單
test.js     node test.js
serve.js    本機預覽
```

## CLI

```
node cli/cheat.js                  # 問答模式：依序問 quiz、暱稱、分數、次數
node cli/cheat.js <quizId|網址>     # 看排行榜
node cli/cheat.js <清單.txt>        # 批次，每行 quizId,暱稱,分數,次數
node cli/cheat.js <清單.txt> --dry  # 只印 payload，不送出
```

清單格式見 `cli/batch.example.txt`（分數留空 = 滿分，次數留空 = 1）：

```
dek3wath6y,小明,30,1
dek3wath6y,路人,,5
```

同一行的 n 筆會併成一次 commit（超過 500 筆才分批），同一個 quiz 的題目只抓一次。

## 網頁的文案與頁面

```
node src/build.js
```

文案改 `src/i18n.json`，版型改 `src/template.html`，跑一次就會重出四個 HTML 加
`sitemap.xml`、`robots.txt`。產物 commit 進 repo，GitHub Pages 直接 serve，沒有 CI。

## 測試

```
node test.js
```

會打真實網路（讀一份公開 quiz），不會寫入任何資料。

## 免責聲明

本專案為非官方的第三方工具，與 rikaido.me 及其開發者沒有任何關聯，也未經其認可或授權。
資料取自該站公開的 API 與靜態檔案，僅供個人學習與研究使用。

使用本工具送出的成績會實際寫入對方的資料庫，請自行評估後果，並尊重出題者與其他參與者。
作者不對任何使用行為造成的後果負責。對方隨時可能調整介面或權限，屆時本工具即失效。
