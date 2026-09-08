const assert = require('assert');
const { LOCALES, toQuizId, autoId, spread, capOf, buildWrite } = require('./assets/core.js');

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
const { localeOrder } = require('./assets/core.js');
const codes = input => localeOrder(input).map(l => l.code);
assert.deepStrictEqual(codes('https://rikaido.me/tw/?q=x'), ['tw', 'ja', 'en', 'ko']);
assert.deepStrictEqual(codes('https://rikaido.me/?q=x'), ['ja', 'tw', 'en', 'ko']);
assert.deepStrictEqual(codes('https://rikaido.me/en/?q=x'), ['en', 'tw', 'ja', 'ko']);
assert.deepStrictEqual(codes('https://rikaido.me/ko/?q=x'), ['ko', 'tw', 'ja', 'en']);
assert.deepStrictEqual(codes('dek3wath6y'), ['tw', 'ja', 'en', 'ko']);   // 純 id：繁中優先
assert.strictEqual(localeOrder('x').length, 4);                          // 永遠涵蓋四個語系

// core.js 與頁面的 script 共用全域作用域，頂層宣告撞名就是 SyntaxError。
// 照那個情境跑兩段 script。
{
  const vm = require('vm');
  const PAGE = 'const { fetchQuiz, toQuizId, capOf, spread, buildWrite, FS, LOCALES } = window.CHEAT_CORE;';

  const ctx = vm.createContext({ window: {}, fetch: () => {}, URL });
  vm.runInContext(require('fs').readFileSync('./assets/core.js', 'utf8'), ctx);
  assert.ok(ctx.window.CHEAT_CORE, 'core.js 應把 API 掛在 window.CHEAT_CORE');
  assert.strictEqual(typeof ctx.window.CHEAT_CORE.fetchQuiz, 'function');
  vm.runInContext(PAGE, ctx);   // 不該拋

  // 反證：沒包 IIFE 的版本必須被同一個檢查抓出來，否則上面那行是恆真斷言
  const leakyCtx = vm.createContext({ window: {} });
  vm.runInContext('const fetchQuiz = 1; window.CHEAT_CORE = { fetchQuiz };', leakyCtx);
  assert.throws(() => vm.runInContext(PAGE, leakyCtx), /already been declared/,
    '全域衝突檢查失效了');
}

// build 產物：四個語系頁的 SEO 標籤要齊全且互相一致
{
  const fs = require('fs');
  const i18n = JSON.parse(fs.readFileSync('./src/i18n.json', 'utf8'));
  const langs = Object.keys(i18n);
  const BASE = 'https://sandycc228.github.io/rikaido-me-cheat/';

  assert.deepStrictEqual(langs, ['ja', 'en', 'ko', 'zh-TW']);   // 語言列的排序就是這個順序

  // 每個語系的 UI 字串 key 必須一致，少一個就是某頁會露出 key 名
  const keysOf = l => Object.keys(i18n[l].ui).sort();
  for (const l of langs) assert.deepStrictEqual(keysOf(l), keysOf('ja'), `${l} 的 ui 字串不齊`);

  for (const lang of langs) {
    const file = i18n[lang].dir + 'index.html';
    assert.ok(fs.existsSync(file), `${file} 不存在，先跑 node build.js`);
    const html = fs.readFileSync(file, 'utf8');

    assert.strictEqual(html.match(/\{\{\w+\}\}/g), null, `${file} 還有未替換的佔位符`);
    assert.ok(html.includes(`<html lang="${lang}">`), `${file} 的 html lang 不對`);
    assert.ok(html.includes(`<link rel="canonical" href="${BASE}${i18n[lang].dir}">`), `${file} canonical 不對`);

    // hreflang：四語系 + x-default，五條都要在
    for (const l of langs) {
      assert.ok(html.includes(`hreflang="${l}" href="${BASE}${i18n[l].dir}"`), `${file} 缺 hreflang ${l}`);
    }
    assert.ok(html.includes('hreflang="x-default"'), `${file} 缺 x-default`);

    // 資源路徑：子目錄頁要往上一層
    const root = i18n[lang].dir ? '../' : '';
    assert.ok(html.includes(`<script src="${root}assets/core.js">`), `${file} core.js 路徑不對`);
    assert.ok(html.includes(`<script src="${root}assets/app.js">`), `${file} app.js 路徑不對`);
    assert.ok(html.includes(`href="${root}favicon.webp"`), `${file} favicon 路徑不對`);

    // 免責聲明：每頁都要有，且是該語系的版本
    assert.ok(i18n[lang].disclaimer, `${lang} 缺 disclaimer 文案`);
    const shown = html.match(/class="disclaimer">([\s\S]*?)<\/p>/)[1].replace(/<[^>]+>/g, '');
    assert.strictEqual(shown, i18n[lang].disclaimer, `${file} 頁尾的免責聲明與文案不符`);
    assert.ok(/class="disclaimer">[^<]*<a href="https:\/\/rikaido\.me\/"/.test(html),
      `${file} 免責聲明裡的網址沒有做成連結`);

    // 內嵌的 I18N 就是該語系的字典
    const inline = JSON.parse(html.match(/window\.I18N = (\{.*?\});<\/script>/s)[1]);
    assert.deepStrictEqual(inline, i18n[lang].ui, `${file} 內嵌的 I18N 與 i18n.json 不符`);
  }

  // 題庫快照：四份都在，而且真的是題庫
  for (const code of ['ja', 'en', 'ko', 'tw']) {
    const file = `./assets/questions/${code}.js`;
    assert.ok(fs.existsSync(file), `${file} 不存在，先跑 node src/fetch-questions.js`);
    const w = {};
    new Function('window', fs.readFileSync(file, 'utf8'))(w);
    assert.ok(w.RIKAIDO_QUESTIONS?.sets?.[1]?.length > 0, `${file} 不是題庫`);
  }

  const sitemap = fs.readFileSync('./sitemap.xml', 'utf8');
  for (const lang of langs) assert.ok(sitemap.includes(`<loc>${BASE}${i18n[lang].dir}</loc>`), `sitemap 缺 ${lang}`);
  assert.ok(fs.readFileSync('./robots.txt', 'utf8').includes(`Sitemap: ${BASE}sitemap.xml`), 'robots.txt 缺 sitemap');
}

console.log('✓ core.js 全部通過');

// fetchQuiz：依序查各語系的 collection，認出 quiz 屬於哪一個
(async () => {
  const { fetchQuiz } = require('./assets/core.js');
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
