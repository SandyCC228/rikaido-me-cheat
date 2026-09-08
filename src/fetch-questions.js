// node src/fetch-questions.js → 把四個語系的題庫原樣存進 assets/questions/
// 網頁與 CLI 平常載官方版，載不到才用這份快照。
const fs = require('fs');
const path = require('path');
const { LOCALES } = require('../assets/core.js');

const DIR = path.join(__dirname, '..', 'assets', 'questions');

(async () => {
  fs.mkdirSync(DIR, { recursive: true });
  let changed = 0;

  for (const l of LOCALES) {
    const res = await fetch(l.questionsUrl);
    if (!res.ok) throw new Error(`${l.code}: HTTP ${res.status}`);
    const src = await res.text();

    // 確認抓到的真的是題庫，別把錯誤頁面存成快照
    const w = {};
    new Function('window', src)(w);
    const n = w.RIKAIDO_QUESTIONS?.sets?.[1]?.length;
    if (!n) throw new Error(`${l.code}: 內容不是題庫`);

    const file = path.join(DIR, l.code + '.js');
    const old = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
    if (old === src) { console.log(`${l.code}  無變動（${n} 題）`); continue; }

    fs.writeFileSync(file, src);
    changed++;
    console.log(`${l.code}  ${old ? '已更新' : '新增'}（${n} 題，${src.length} bytes）`);
  }

  console.log(changed ? `${changed} 份有變動` : '全部無變動');
})();
