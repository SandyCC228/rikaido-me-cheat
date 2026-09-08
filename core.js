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
