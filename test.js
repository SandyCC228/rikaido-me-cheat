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

// localeOrder：網址裡的語系排第一，其餘按 tw→ja→en→ko 遞補；
// 依序查才不會對其他語系發出必然 403 的請求（瀏覽器 console 會印紅字）
const { localeOrder } = require('./core.js');
const codes = input => localeOrder(input).map(l => l.code);
assert.deepStrictEqual(codes('https://rikaido.me/tw/?q=x'), ['tw', 'ja', 'en', 'ko']);
assert.deepStrictEqual(codes('https://rikaido.me/?q=x'), ['ja', 'tw', 'en', 'ko']);
assert.deepStrictEqual(codes('https://rikaido.me/en/?q=x'), ['en', 'tw', 'ja', 'ko']);
assert.deepStrictEqual(codes('https://rikaido.me/ko/?q=x'), ['ko', 'tw', 'ja', 'en']);
assert.deepStrictEqual(codes('dek3wath6y'), ['tw', 'ja', 'en', 'ko']);   // 純 id：繁中優先
assert.strictEqual(localeOrder('x').length, 4);                          // 永遠涵蓋四個語系

// 瀏覽器模式：<script src="core.js"> 與頁面的 inline script 共用同一個全域作用域，
// core.js 若在頂層宣告名字，頁面再宣告同名變數就是 SyntaxError（已實際發生過：
// "Identifier 'fetchQuiz' has already been declared"）。這裡照那個情境跑兩段 script。
{
  const vm = require('vm');
  const PAGE = 'const { fetchQuiz, toQuizId, capOf, spread, buildWrite, FS, LOCALES } = window.CHEAT_CORE;';

  const ctx = vm.createContext({ window: {}, fetch: () => {}, URL });
  vm.runInContext(require('fs').readFileSync('./core.js', 'utf8'), ctx);
  assert.ok(ctx.window.CHEAT_CORE, 'core.js 應把 API 掛在 window.CHEAT_CORE');
  assert.strictEqual(typeof ctx.window.CHEAT_CORE.fetchQuiz, 'function');
  vm.runInContext(PAGE, ctx);   // 不該拋

  // 反證：沒包 IIFE 的版本必須被同一個檢查抓出來，否則上面那行是恆真斷言
  const leakyCtx = vm.createContext({ window: {} });
  vm.runInContext('const fetchQuiz = 1; window.CHEAT_CORE = { fetchQuiz };', leakyCtx);
  assert.throws(() => vm.runInContext(PAGE, leakyCtx), /already been declared/,
    '全域衝突檢查失效了');
}

console.log('✓ core.js 全部通過');

// fetchQuiz：一次 batchGet 四個 collection，認出語系
(async () => {
  const { fetchQuiz } = require('./core.js');
  const q = await fetchQuiz('dek3wath6y');
  assert.strictEqual(q.locale, 'tw');
  assert.strictEqual(q.collection, 'quizzes_tw');
  assert.strictEqual(q.id, 'dek3wath6y');
  assert.strictEqual(q.qids.length, q.answers.length);
  assert.match(q.answers, /^[AB]+$/);
  assert.ok(q.owner.length > 0);
  assert.ok(q.questionsUrl.endsWith('/js/questions-tw.js'));

  await assert.rejects(() => fetchQuiz('這個一定不存在'), /找不到 quiz/);
  console.log('✓ fetchQuiz 連線測試通過');
})();
