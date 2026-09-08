// 共用邏輯：CLI（require）與網頁（<script src>）都用這一份。
// 整份包在 IIFE 裡：瀏覽器的 <script src> 是共用全域作用域的，不包的話
// 這裡每個頂層宣告都會變成全域變數，跟頁面自己的程式碼撞名。
(() => {
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
  function capOf(qids, questionSet) {
    const cap = {};
    qids.forEach(q => { cap[questionSet[q].g] = (cap[questionSet[q].g] || 0) + 1; });
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

  // 查詢順序：輸入若是網址，路徑指定的語系排第一，其餘按 tw→ja→en→ko 遞補。
  const localeOrder = input => {
    let hint = null;
    try {
      const seg = new URL(input).pathname.split('/')[1];
      hint = LOCALES.find(l => l.code === seg) ? seg : 'ja';   // rikaido.me/ 就是日文版
    } catch { /* 不是網址，沒有線索 */ }
    const rest = ['tw', 'ja', 'en', 'ko'].filter(c => c !== hint);
    return [hint, ...rest].filter(Boolean).map(c => LOCALES.find(l => l.code === c));
  };

  async function quizDoc(locale, quizId) {
    const res = await fetch(`${FS}:batchGet`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ documents: [`${DB}/${locale.collection}/${quizId}`] }),
    });
    if (!res.ok) return null;                       // 403 = 這個語系沒有這份 quiz
    return (await res.json())[0]?.found ?? null;
  }

  // 依序試各語系，中了就停。
  // 不並行、也不把四個路徑塞進同一個 batchGet：Firestore 的規則對不存在的文件回 403，
  // 而 quiz 只屬於一個語系，多發的請求必定失敗，瀏覽器 console 會留下紅字。
  async function fetchQuiz(input) {
    const quizId = toQuizId(input);
    let hit = null;
    for (const locale of localeOrder(input)) {
      const found = await quizDoc(locale, quizId);
      if (found) { hit = { locale, found }; break; }
    }
    if (!hit) throw new Error('找不到 quiz ' + quizId);

    const { locale, found } = hit;
    const f = found.fields;
    return {
      id: quizId,
      locale: locale.code,
      collection: locale.collection,
      questionsUrl: locale.questionsUrl,
      owner: f.n.stringValue,
      answers: f.a.stringValue,                                  // 正解 "AABAA..."
      qids: f.q.arrayValue.values.map(v => +v.integerValue),      // 題目 index
      v: f.v ? +f.v.integerValue : 1,                             // 題庫版本
    };
  }

  const API = { DB, FS, LOCALES, toQuizId, localeOrder, autoId, capOf, spread, buildWrite, fetchQuiz };
  typeof module !== 'undefined' ? module.exports = API : window.CHEAT_CORE = API;
})();
