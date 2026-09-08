# rikaido 正解查詢頁 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 做一個公開靜態網頁，貼上 rikaido quiz 網址就能看到題目與正解，並可選擇直接送出一筆成績。

**Architecture:** 無建置、無框架、無後端。`core.js` 以 UMD-lite 同時給 Node CLI 與瀏覽器使用，放語系表、分數攤分、payload 組裝與 Firestore 讀寫。`index.html` 是唯一頁面，題庫以 `<script src>` 直接載 rikaido 官方檔（CORS 管不到 script 標籤）。

**Tech Stack:** 原生 JavaScript、Node 18+（內建 `fetch`）、Firestore REST API、GitHub Pages。

**Spec:** `docs/superpowers/specs/2026-09-08-rikaido-web-design.md`

## Global Constraints

- 不得引入任何第三方套件，`package.json` 也不需要。Node 18+ 內建 `fetch`。
- Firestore base path 固定為 `projects/rikaido-9qu1/databases/(default)/documents`，REST base 為 `https://firestore.googleapis.com/v1/` + 該 path。
- 四個語系 collection：`quizzes`(ja)、`quizzes_tw`、`quizzes_en`、`quizzes_ko`；對應題庫檔 `https://rikaido.me/js/questions.js`、`questions-tw.js`、`questions-en.js`、`questions-ko.js`。
- 題庫一律用 `<script src>`（瀏覽器）或 `new Function`（Node）載入，**不可用 `fetch` 抓 rikaido.me**，會被 CORS 擋。
- result doc id 為 20 字元 `A-Za-z0-9`，與 Firestore auto-id 同格式。
- 所有面向使用者的文字用繁體中文。
- 測試一律 `node --test` 不用，改用 `node test.js` 加 `assert`，不引入測試框架。

---

### Task 1: core.js 純函式與測試

**Files:**
- Create: `core.js`
- Create: `test.js`
- Modify: `cheat.js`（改為 `require('./core.js')`，移除重複的 `toQuizId`/`autoId`/`spread`）

**Interfaces:**
- Produces:
  - `LOCALES`: `Array<{ code: string, collection: string, questionsUrl: string, quizUrlPath: string }>`
  - `toQuizId(input: string) => string`
  - `autoId() => string`（20 字元）
  - `spread(score: number, cap: Record<string, number>) => Record<string, number>`
  - `capOf(qids: number[], set: Array<{g: string}>) => Record<string, number>`
  - `buildWrite(opts: { collection, quizId, name, score, g, answers }) => object`（Firestore write 物件）

- [ ] **Step 1: 建立 git repo（若尚未有）**

```bash
git init
printf 'node_modules/\n*.stackdump\n' > .gitignore
git add -A && git commit -m "chore: 既有 CLI 與設計文件"
```

若不打算用 git，跳過本步驟與後續所有 commit 步驟。

- [ ] **Step 2: 寫失敗的測試**

建立 `test.js`：

```js
const assert = require('assert');
const { LOCALES, toQuizId, autoId, spread, capOf, buildWrite } = require('./core.js');

// toQuizId：四語系網址、純 id、無效字串
assert.strictEqual(toQuizId('https://rikaido.me/tw/?q=dek3wath6y'), 'dek3wath6y');
assert.strictEqual(toQuizId('https://rikaido.me/?q=abc123'), 'abc123');
assert.strictEqual(toQuizId('https://rikaido.me/ko/?q=xyz'), 'xyz');
assert.strictEqual(toQuizId('dek3wath6y'), 'dek3wath6y');
assert.strictEqual(toQuizId('https://rikaido.me/tw/'), 'https://rikaido.me/tw/'); // 沒有 q 就原樣回

// LOCALES：四個語系，collection 與題庫檔對得上
assert.strictEqual(LOCALES.length, 4);
assert.deepStrictEqual(LOCALES.map(l => l.code), ['ja', 'tw', 'en', 'ko']);
assert.strictEqual(LOCALES.find(l => l.code === 'ja').collection, 'quizzes');
assert.strictEqual(LOCALES.find(l => l.code === 'tw').collection, 'quizzes_tw');
assert.ok(LOCALES.find(l => l.code === 'ja').questionsUrl.endsWith('/js/questions.js'));
assert.ok(LOCALES.find(l => l.code === 'ko').questionsUrl.endsWith('/js/questions-ko.js'));

// autoId：20 字元、只有英數、每次不同
assert.match(autoId(), /^[A-Za-z0-9]{20}$/);
assert.notStrictEqual(autoId(), autoId());

// spread：總和等於分數
const cap = { food: 5, love: 5, play: 5, dark: 5, mind: 5, life: 5 };
const sum = o => Object.values(o).reduce((a, b) => a + b, 0);
assert.strictEqual(sum(spread(30, cap)), 30);
assert.strictEqual(sum(spread(23, cap)), 23);
assert.strictEqual(sum(spread(0, cap)), 0);
assert.strictEqual(sum(spread(7, cap)), 7);
assert.deepStrictEqual(spread(30, cap), cap);           // 滿分即各類全對
assert.ok(Object.values(spread(29, cap)).every(v => v <= 5)); // 不得超過各類題數

// spread：各類題數不均時也不超過上限
const uneven = { food: 2, love: 8 };
const g = spread(9, uneven);
assert.strictEqual(sum(g), 9);
assert.ok(g.food <= 2 && g.love <= 8);

// capOf：依題目 index 統計各分類題數
const set = [{ g: 'food' }, { g: 'food' }, { g: 'love' }];
assert.deepStrictEqual(capOf([0, 1, 2], set), { food: 2, love: 1 });

// buildWrite：欄位齊全、路徑正確、t 用 server timestamp
const w = buildWrite({
  collection: 'quizzes_tw', quizId: 'q1', name: '阿宅',
  score: 12, g: { food: 2 }, answers: 'AB',
});
assert.match(w.update.name,
  /^projects\/rikaido-9qu1\/databases\/\(default\)\/documents\/quizzes_tw\/q1\/results\/[A-Za-z0-9]{20}$/);
assert.strictEqual(w.update.fields.n.stringValue, '阿宅');
assert.strictEqual(w.update.fields.s.integerValue, '12');
assert.strictEqual(w.update.fields.r.stringValue, 'AB');
assert.strictEqual(w.update.fields.g.mapValue.fields.food.integerValue, '2');
assert.deepStrictEqual(w.updateTransforms, [{ fieldPath: 't', setToServerValue: 'REQUEST_TIME' }]);
assert.deepStrictEqual(w.currentDocument, { exists: false });

console.log('✓ core.js 全部通過');
```

- [ ] **Step 3: 執行測試，確認失敗**

Run: `node test.js`
Expected: FAIL，`Cannot find module './core.js'`

- [ ] **Step 4: 寫 core.js**

```js
// 共用邏輯：CLI（require）與網頁（<script src>）都用這一份
const DB = 'projects/rikaido-9qu1/databases/(default)/documents';
const FS = 'https://firestore.googleapis.com/v1/' + DB;

const LOCALES = [
  { code: 'ja', collection: 'quizzes',    questionsUrl: 'https://rikaido.me/js/questions.js',    quizUrlPath: '/' },
  { code: 'tw', collection: 'quizzes_tw', questionsUrl: 'https://rikaido.me/js/questions-tw.js', quizUrlPath: '/tw/' },
  { code: 'en', collection: 'quizzes_en', questionsUrl: 'https://rikaido.me/js/questions-en.js', quizUrlPath: '/en/' },
  { code: 'ko', collection: 'quizzes_ko', questionsUrl: 'https://rikaido.me/js/questions-ko.js', quizUrlPath: '/ko/' },
];

// 允許直接貼網址 https://rikaido.me/tw/?q=xxx，非網址就當 id
const toQuizId = s => { try { return new URL(s).searchParams.get('q') || s; } catch { return s; } };

const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
// Firestore auto-id 是 20 字元 A-Za-z0-9，照抄格式免得一眼看出是灌的
const autoId = () => Array.from({ length: 20 }, () => CHARS[Math.floor(Math.random() * CHARS.length)]).join('');

// 依題目 index 統計各分類題數
function capOf(qids, set) {
  const cap = {};
  qids.forEach(q => { cap[set[q].g] = (cap[set[q].g] || 0) + 1; });
  return cap;
}

// 把分數攤到各分類，受該類題數上限；總和必為 score
function spread(score, cap) {
  const g = {};
  let left = score;
  const keys = Object.keys(cap);
  keys.forEach((k, i) => {
    g[k] = Math.min(cap[k], Math.round(left / (keys.length - i)));
    left -= g[k];
  });
  return g;
}

function buildWrite({ collection, quizId, name, score, g, answers }) {
  return {
    update: {
      name: `${DB}/${collection}/${quizId}/results/${autoId()}`,
      fields: {
        n: { stringValue: name },
        s: { integerValue: String(score) },
        g: { mapValue: { fields: Object.fromEntries(
          Object.entries(g).map(([k, v]) => [k, { integerValue: String(v) }])) } },
        r: { stringValue: answers },   // 作答字串，網站不驗，照抄正解
      },
    },
    updateTransforms: [{ fieldPath: 't', setToServerValue: 'REQUEST_TIME' }],
    currentDocument: { exists: false },
  };
}

const API = { DB, FS, LOCALES, toQuizId, autoId, capOf, spread, buildWrite };
typeof module !== 'undefined' ? module.exports = API : window.CHEAT_CORE = API;
```

- [ ] **Step 5: 執行測試，確認通過**

Run: `node test.js`
Expected: `✓ core.js 全部通過`

- [ ] **Step 6: cheat.js 改用 core.js**

刪掉 `cheat.js` 中的 `DB`、`FS`、`toQuizId`、`CHARS`、`autoId`、`spread` 定義（原第 10-17、50-61 行），改為頂部引入：

```js
const { DB, FS, toQuizId, autoId, spread, capOf, buildWrite } = require('./core.js');
```

`submit()` 內原本手寫的 `cap` 統計與 `write()` 改用 core 的版本：

```js
  const cap = capOf(qids, qs);
  const g = spread(score, cap);
  const writes = Array.from({ length: count },
    () => buildWrite({ collection: 'quizzes_tw', quizId, name: nameArg, score, g, answers }));
```

`spread` 原本內含的 `console.assert` 移除（測試已覆蓋）。

- [ ] **Step 7: 驗證 CLI 未壞**

Run: `node cheat.js dek3wath6y`
Expected: 印出該 quiz 的排行榜列表

Run: `node cheat.js batch.txt --dry`
Expected: 三行摘要與對應 payload，doc id 皆為 20 字元英數

- [ ] **Step 8: Commit**

```bash
git add core.js test.js cheat.js
git commit -m "refactor: 抽出 core.js 給 CLI 與網頁共用，補測試"
```

---

### Task 2: 語系自動偵測

**Files:**
- Modify: `core.js`（新增 `fetchQuiz`）
- Modify: `test.js`（新增連線 smoke test）
- Modify: `cheat.js`（`fetchQuiz` 改用 core 的版本，四語系通用）

**Interfaces:**
- Consumes: Task 1 的 `LOCALES`、`DB`、`FS`
- Produces: `fetchQuiz(quizId: string) => Promise<{ locale, collection, questionsUrl, owner, answers, qids }>`
  - 找不到時 throw `Error('找不到 quiz ' + quizId)`

- [ ] **Step 1: 寫失敗的測試**

在 `test.js` 末尾（`console.log` 之前）加入：

```js
// fetchQuiz：一次 batchGet 四個 collection，認出語系
(async () => {
  const { fetchQuiz } = require('./core.js');
  const q = await fetchQuiz('dek3wath6y');
  assert.strictEqual(q.locale, 'tw');
  assert.strictEqual(q.collection, 'quizzes_tw');
  assert.strictEqual(q.qids.length, q.answers.length);
  assert.match(q.answers, /^[AB]+$/);
  assert.ok(q.owner.length > 0);

  await assert.rejects(() => fetchQuiz('這個一定不存在'), /找不到 quiz/);
  console.log('✓ fetchQuiz 連線測試通過');
})();
```

- [ ] **Step 2: 執行測試，確認失敗**

Run: `node test.js`
Expected: FAIL，`fetchQuiz is not a function`

- [ ] **Step 3: 在 core.js 實作 fetchQuiz**

加在 `buildWrite` 之後、`API` 之前：

```js
// 一次查四個語系的 collection，哪個 found 就是哪個語系
async function fetchQuiz(quizId) {
  const res = await fetch(`${FS}:batchGet`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ documents: LOCALES.map(l => `${DB}/${l.collection}/${quizId}`) }),
  });
  const found = (await res.json()).find(r => r.found);
  if (!found) throw new Error('找不到 quiz ' + quizId);

  const collection = found.found.name.split('/documents/')[1].split('/')[0];
  const locale = LOCALES.find(l => l.collection === collection);
  const f = found.found.fields;
  return {
    locale: locale.code,
    collection,
    questionsUrl: locale.questionsUrl,
    owner: f.n.stringValue,
    answers: f.a.stringValue,                                  // 正解 "AABAA..."
    qids: f.q.arrayValue.values.map(v => +v.integerValue),      // 題目 index
    v: f.v ? +f.v.integerValue : 1,                             // 題庫版本
  };
}
```

記得加進匯出：`const API = { DB, FS, LOCALES, toQuizId, autoId, capOf, spread, buildWrite, fetchQuiz };`

- [ ] **Step 4: 執行測試，確認通過**

Run: `node test.js`
Expected: `✓ core.js 全部通過` 與 `✓ fetchQuiz 連線測試通過`

- [ ] **Step 5: cheat.js 改用 core 的 fetchQuiz**

刪掉 `cheat.js` 內自己的 `fetchQuiz`（原第 35-48 行）。`questions()` 改成吃語系網址、並改用 quiz 回傳的 `collection`：

```js
const qsCache = new Map();
function questions(url, v) {
  if (!qsCache.has(url)) qsCache.set(url, (async () => {
    const src = await (await fetch(url)).text();
    const w = {};
    new Function('window', src)(w);
    return w.RIKAIDO_QUESTIONS.sets[v] || w.RIKAIDO_QUESTIONS.sets[1];
  })());
  return qsCache.get(url);
}
```

`submit()` 內取題目與寫入改為：

```js
  const { answers, qids, owner, collection, questionsUrl, v } = await quiz(quizId);
  const qs = await questions(questionsUrl, v);
```

`buildWrite` 的 `collection` 由寫死的 `'quizzes_tw'` 改為 quiz 回傳的 `collection`。
`list()` 的 URL 同樣改用偵測到的 collection：先 `const { collection } = await quiz(quizId);`，
再組 `${FS}/${collection}/${quizId}:runQuery`。

- [ ] **Step 6: 驗證四語系**

Run: `node cheat.js dek3wath6y`
Expected: 正常列出排行榜（tw）

Run: `node cheat.js "https://rikaido.me/tw/?q=dek3wath6y"`
Expected: 同上

- [ ] **Step 7: Commit**

```bash
git add core.js test.js cheat.js
git commit -m "feat: 自動偵測 quiz 語系，CLI 支援四語系"
```

---

### Task 3: 網頁查詢與正解顯示

**Files:**
- Create: `index.html`
- Create: `serve.js`（本機預覽用的極簡靜態 server）

**Interfaces:**
- Consumes: Task 2 的 `CHEAT_CORE.fetchQuiz`、`LOCALES`
- Produces: 頁面全域函式 `loadQuestions(url, v) => Promise<Array|null>`（載入失敗回 `null`，供降級用）

- [ ] **Step 1: 建立本機預覽 server**

```js
// node serve.js → http://localhost:8787/
const http = require('http');
const fs = require('fs');
http.createServer((q, s) => {
  const f = '.' + (q.url === '/' ? '/index.html' : q.url.split('?')[0]);
  let buf;
  try { buf = fs.readFileSync(f); } catch { s.writeHead(404); return s.end(); }
  s.writeHead(200, { 'content-type': f.endsWith('.js') ? 'application/javascript' : 'text/html;charset=utf-8' });
  s.end(buf);
}).listen(8787, () => console.log('http://localhost:8787/'));
```

- [ ] **Step 2: 寫 index.html 的骨架與查詢流程**

樣式先用最陽春的，Task 5 才做視覺。

```html
<!doctype html>
<html lang="zh-Hant">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>rikaido 正解查詢</title>
<script src="core.js"></script>
<body>
<h1>rikaido 正解查詢</h1>
<form id="ask">
  <input id="input" placeholder="貼上 quiz 網址或 id" size="40" required>
  <button>查詢</button>
</form>
<p id="status"></p>
<div id="result"></div>

<script>
const { fetchQuiz, toQuizId } = window.CHEAT_CORE;
const $ = id => document.getElementById(id);

// 題庫只能用 script 標籤載（fetch 會被 CORS 擋）；失敗回 null 走降級
const loaded = new Map();
function loadQuestions(url, v) {
  if (!loaded.has(url)) loaded.set(url, new Promise(res => {
    const s = document.createElement('script');
    s.src = url;
    s.onload = () => res(window.RIKAIDO_QUESTIONS?.sets?.[v] || window.RIKAIDO_QUESTIONS?.sets?.[1] || null);
    s.onerror = () => res(null);
    document.head.appendChild(s);
  }));
  return loaded.get(url);
}

$('ask').onsubmit = async e => {
  e.preventDefault();
  $('result').innerHTML = '';
  $('status').textContent = '查詢中…';
  try {
    const quiz = await fetchQuiz(toQuizId($('input').value.trim()));
    const set = await loadQuestions(quiz.questionsUrl, quiz.v);
    $('status').textContent = '';
    render(quiz, set);
  } catch (err) {
    $('status').textContent = err.message;
  }
};

function render(quiz, set) {
  const head = document.createElement('h2');
  head.textContent = `出題者「${quiz.owner}」・${quiz.qids.length} 題`;
  $('result').append(head);

  const ol = document.createElement('ol');
  quiz.qids.forEach((qid, i) => {
    const li = document.createElement('li');
    const correct = quiz.answers[i];               // 'A' 或 'B'
    const q = set && set[qid];
    if (q) {
      li.textContent = q.q + '　→　';
      const b = document.createElement('b');
      b.textContent = correct === 'A' ? q.a : q.b;
      li.append(b);
    } else {
      li.textContent = '正解：' + correct;          // 降級：題庫載不到
    }
    ol.append(li);
  });
  $('result').append(ol);
  if (!set) $('result').prepend(Object.assign(document.createElement('p'),
    { textContent: '題庫載入失敗，只能顯示 A／B。' }));
}
</script>
</body>
</html>
```

- [ ] **Step 3: 瀏覽器驗證正常路徑**

Run: `node serve.js`，瀏覽器開 `http://localhost:8787/`，輸入 `https://rikaido.me/tw/?q=dek3wath6y`
Expected: 標題顯示「出題者「AB」・30 題」，30 行題目，每行結尾粗體是正解選項文字（第 1 題應為「便當主菜？→ …」之類的真實題目）

- [ ] **Step 4: 驗證降級路徑**

在 devtools console 執行 `loaded.set('https://rikaido.me/js/questions-tw.js', Promise.resolve(null))` 後重新查詢，
或暫時把 `s.src` 改成不存在的網址。
Expected: 頁面顯示「題庫載入失敗，只能顯示 A／B。」，下方 30 行為「正解：A/B」，不報錯，
且（Task 4 完成後）不出現送出區塊

- [ ] **Step 5: 驗證找不到的情況**

輸入 `這個一定不存在`
Expected: 狀態列顯示「找不到 quiz 這個一定不存在」

- [ ] **Step 6: Commit**

```bash
git add index.html serve.js
git commit -m "feat: 網頁查詢與正解顯示"
```

---

### Task 4: 網頁送出成績

**Files:**
- Modify: `index.html`

**Interfaces:**
- Consumes: Task 1 的 `capOf`、`spread`、`buildWrite`、`FS`；Task 3 的 `render`

- [ ] **Step 1: 在 render 之後加上送出區塊**

於 `render()` 末尾插入 `if (set) renderSubmit(quiz, set);`。

**題庫載不到時不提供送出**：`g` 的 key 必須是題庫的分類名（`food`/`love`/`play`/`dark`/`mind`/`life`），
網站的雷達圖照這些 key 取值；沒有題庫就算不出分類，硬塞一個 `all` 會寫進網站讀不懂的資料。
降級時只看正解，這也符合「看正解為主」。

新增：

```js
function renderSubmit(quiz, set) {
  const total = quiz.qids.length;
  const box = document.createElement('details');
  box.innerHTML = `
    <summary>懶得點，直接幫我送出一筆</summary>
    <p>這會真的寫進這份 quiz 的排行榜，出題者看得到。</p>
    <label>暱稱 <input id="sname" required></label>
    <label>分數 <input id="sscore" type="number" min="0" max="${total}" value="${total}"></label>
    <button id="sbtn">送出</button>
    <p id="smsg"></p>`;
  $('result').append(box);

  $('sbtn').onclick = async () => {
    const name = $('sname').value.trim();
    const score = Number($('sscore').value);
    if (!name) return ($('smsg').textContent = '要填暱稱');
    if (!Number.isInteger(score) || score < 0 || score > total) {
      return ($('smsg').textContent = `分數要是 0~${total} 的整數`);
    }
    const g = spread(score, capOf(quiz.qids, set));

    $('sbtn').disabled = true;
    $('smsg').textContent = '送出中…';
    try {
      const res = await fetch(`${FS}:commit`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ writes: [buildWrite({
          collection: quiz.collection, quizId: quiz.id, name, score, g, answers: quiz.answers,
        })] }),
      });
      if (!res.ok) throw new Error(JSON.stringify(await res.json()).slice(0, 200));
      const path = LOCALES.find(l => l.code === quiz.locale).quizUrlPath;
      $('smsg').innerHTML = `送出成功。<a href="https://rikaido.me${path}?q=${quiz.id}" target="_blank" rel="noopener">去看排行榜</a>`;
    } catch (err) {
      $('smsg').textContent = '送出失敗：' + err.message;
      $('sbtn').disabled = false;
    }
  };
}
```

頂部解構補上需要的成員：

```js
const { fetchQuiz, toQuizId, capOf, spread, buildWrite, FS, LOCALES } = window.CHEAT_CORE;
```

- [ ] **Step 2: core.js 的 fetchQuiz 回傳 id**

`renderSubmit` 用到 `quiz.id`，在 `core.js` 的 `fetchQuiz` 回傳物件補一個 `id: quizId`，
並在 `test.js` 的連線測試加一行 `assert.strictEqual(q.id, 'dek3wath6y');`。

Run: `node test.js`
Expected: 全部通過

- [ ] **Step 3: 瀏覽器驗證送出**

`node serve.js`，查詢 `dek3wath6y`，展開送出區塊，填暱稱「網頁測試」、分數 7，按送出。
Expected: 顯示「送出成功」與排行榜連結

Run: `node cheat.js dek3wath6y`
Expected: 列表中出現「7　網頁測試」，doc id 為 20 字元英數

- [ ] **Step 4: 驗證分數驗證與失敗處理**

分數填 `99` 按送出。
Expected: 顯示「分數要是 0~30 的整數」，不發出請求（devtools Network 無新的 commit）

- [ ] **Step 5: Commit**

```bash
git add index.html core.js test.js
git commit -m "feat: 網頁送出成績"
```

---

### Task 5: 視覺設計與行動裝置驗收

**Files:**
- Modify: `index.html`

- [ ] **Step 1: 走 ui-ux-pro-max**

呼叫 `ui-ux-pro-max:design`（或 `ui-ux-pro-max:ui-styling`）產出這頁的設計方向與 tokens。
輸入條件：單頁、兩段（查詢／正解＋送出）、繁中為主、手機優先、深淺色都要能看、無框架純 CSS。

- [ ] **Step 2: 套用樣式**

把樣式寫進 `index.html` 的 `<style>`。必須涵蓋：
- 題目清單：題號、題目、正解選項三者層級分明，正解要一眼看得出來
- 分類標示：用題庫 `genres[g]` 自帶的 `emoji` 與 `color`
- 送出區塊：與正解區塊明顯分隔，警語不可被忽略
- 深色模式：`@media (prefers-color-scheme: dark)`
- 手機：360px 寬不橫向捲動

- [ ] **Step 3: 桌機驗收**

`node serve.js`，查詢 `dek3wath6y`，截圖。
Expected: 30 題排列整齊，正解一眼可辨，送出區塊收合

- [ ] **Step 4: 手機尺寸驗收**

devtools 切 360×740。
Expected: 無橫向捲動，題目不溢出，按鈕可點擊區域足夠

- [ ] **Step 5: 深色模式驗收**

devtools 切 `prefers-color-scheme: dark`。
Expected: 文字與背景對比足夠，正解標示仍清楚

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "feat: 視覺設計"
```

---

### Task 6: 上線

**Files:**
- Create: `README.md`

- [ ] **Step 1: 寫 README.md**

內容需包含：這是什麼、網頁怎麼用、CLI 怎麼用（問答／排行榜／批次三種）、
題庫直接載 rikaido 官方檔所以會自動跟著更新、以及「任何人都能對任何 quiz 灌結果」這個限制。

- [ ] **Step 2: 推上 GitHub 並開啟 Pages**

```bash
git add README.md && git commit -m "docs: README"
gh repo create rikaido-cheat --public --source=. --push
gh api -X POST repos/:owner/rikaido-cheat/pages -f source[branch]=main -f source[path]=/
```

- [ ] **Step 3: 線上驗收**

開啟 Pages 網址，查詢 `dek3wath6y`。
Expected: 與本機行為一致（`core.js` 為相對路徑，題庫與 Firestore 皆為跨域，Pages 上同樣可用）

- [ ] **Step 4: Commit**

無檔案變更則略過。

---

## 完成後的清理

`batch.txt` 是測試用的範例清單，`test-interactive.js` 是 CLI 問答模式的假鍵盤輸入工具，兩者都留著。
送測試資料進 `dek3wath6y` 的那些結果（暱稱「測試員」「網頁測試」）由 quiz 出題者自行在 rikaido 的
管理介面隱藏，本專案不提供刪除功能。
