# rikaido 正解查詢

查 [rikaido.me](https://rikaido.me) 上某份 quiz 的題目與正解，也可以直接送一筆成績進它的排行榜。

正解是從 Firestore 的 quiz 文件直接讀出來的（`a` 欄位，每題一個 `A`／`B`），題目文字則對照
rikaido 官方的題庫檔。兩者都是公開讀取，不需要登入。

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
