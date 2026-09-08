// 用法: node cheat.js                     問答模式填答案
//       node cheat.js <quizId>            看排行榜
//       node cheat.js <清單.txt> [--dry]  每行: quizId,暱稱,分數,次數
// 分數留空 = 滿分，次數留空 = 1。同一 quizId 的題目只抓一次。
const fs = require('fs');
const readline = require('node:readline/promises');
const args = process.argv.slice(2).filter(a => !a.startsWith('--'));
const DRY = process.argv.includes('--dry');

const { FS, toQuizId, spread, capOf, buildWrite, fetchQuiz } = require('../assets/core.js');

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

const quizCache = new Map();
function quiz(input) {
  const quizId = toQuizId(input);
  // 快取用 id 當 key，但查詢傳原始輸入：網址裡的語系決定先問哪個 collection
  if (!quizCache.has(quizId)) quizCache.set(quizId, fetchQuiz(input));
  return quizCache.get(quizId);
}

async function submit(quizIdOrUrl, nameArg, scoreArg, countArg) {
  const quizId = toQuizId(quizIdOrUrl);
  if (!quizId || !nameArg) throw new Error('要有 quizId 和暱稱');
  const { answers, qids, owner, collection, questionsUrl, v } = await quiz(quizIdOrUrl);
  const qs = await questions(questionsUrl, v);
  const total = qids.length;

  const score = scoreArg === undefined || scoreArg === '' ? total : Number(scoreArg);
  if (!Number.isInteger(score) || score < 0 || score > total) {
    throw new Error(`分數要是 0~${total} 的整數，收到「${scoreArg}」`);
  }
  const count = countArg === undefined || countArg === '' ? 1 : Number(countArg);
  if (!Number.isInteger(count) || count < 1) throw new Error(`次數要是 1 以上的整數，收到「${countArg}」`);

  const cap = capOf(qids, qs);
  const g = spread(score, cap);
  const writes = Array.from({ length: count },
    () => buildWrite({ collection, quizId, name: nameArg, score, g, answers }));
  console.log(`${quizId}（出題者「${owner}」）→ ${nameArg} ${score}/${total} × ${count}`, g);

  // 一次 commit 最多 500 writes
  for (let i = 0; i < writes.length; i += 500) {
    const body = { writes: writes.slice(i, i + 500) };
    if (DRY) { console.log(JSON.stringify(body)); continue; }
    const res = await fetch(`${FS}:commit`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    console.log(' ', res.status, res.ok ? `寫入 ${body.writes.length} 筆` : JSON.stringify(await res.json()).slice(0, 200));
  }
}

async function list(quizIdOrUrl) {
  const quizId = toQuizId(quizIdOrUrl);
  const { collection } = await quiz(quizIdOrUrl);
  const res = await fetch(`${FS}/${collection}/${quizId}:runQuery`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ structuredQuery: {
      from: [{ collectionId: 'results' }],
      orderBy: [{ field: { fieldPath: 's' }, direction: 'DESCENDING' }],
      limit: 1000,
    } }),
  });
  const rows = (await res.json()).filter(r => r.document);
  console.log(`${quizId}：${rows.length} 筆`);
  rows.forEach((r, i) => {
    const f = r.document.fields;
    console.log(`${String(i + 1).padStart(3)}. ${f.s.integerValue.padStart(2)}  ${f.n.stringValue}`,
      ' ', f.t?.timestampValue ?? '', ' ', r.document.name.split('/').pop());
  });
}

// 問答模式：問到暱稱留空為止，最後確認才送
async function interactive() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const input = (await rl.question('quiz id 或網址: ')).trim();
    const { owner, qids } = await quiz(input);   // 先確認題目存在，也拿到題數
    const quizId = toQuizId(input);
    const total = qids.length;
    console.log(`出題者「${owner}」，共 ${total} 題\n`);

    const rows = [];
    while (true) {
      const name = (await rl.question(`暱稱${rows.length ? '（留空結束）' : ''}: `)).trim();
      if (!name) { if (rows.length) break; console.log('  暱稱不能空白'); continue; }

      const score = (await rl.question(`分數 0~${total}（Enter = ${total}）: `)).trim();
      if (score && !(Number.isInteger(+score) && +score >= 0 && +score <= total)) {
        console.log('  分數不對，這筆重來'); continue;
      }
      const count = (await rl.question('次數（Enter = 1）: ')).trim();
      if (count && !(Number.isInteger(+count) && +count >= 1)) {
        console.log('  次數不對，這筆重來'); continue;
      }
      rows.push([quizId, name, score, count]);
      console.log(`  ✓ ${name} ${score || total}/${total} × ${count || 1}\n`);
    }

    console.log(`\n共 ${rows.reduce((n, r) => n + (+r[3] || 1), 0)} 筆結果要寫進 ${quizId}`);
    const ok = (await rl.question('送出？(y/N) ')).trim().toLowerCase();
    if (ok !== 'y') return console.log('取消');
    return rows;
  } catch (e) {
    if (e.code === 'ERR_USE_AFTER_CLOSE') return console.log('\n中斷');   // Ctrl+D
    throw e;
  } finally {
    rl.close();
  }
}

(async () => {
  // 單一參數：是檔案就批次，否則當 quizId 列排行榜；沒參數就問答
  if (args.length === 1 && !fs.existsSync(args[0])) return list(args[0]);
  if (args.length > 1) {
    console.error('用法: node cheat.js            問答模式\n      node cheat.js <quizId>   看排行榜\n      node cheat.js <清單.txt> 批次');
    process.exit(1);
  }

  const rows = args.length
    ? fs.readFileSync(args[0], 'utf8').split(/\r?\n/)
        .map(l => l.trim()).filter(l => l && !l.startsWith('#'))
        .map(l => l.split(',').map(s => s.trim()))
    : await interactive();

  for (const [quizId, name, score, count] of rows ?? []) {
    try {
      await submit(quizId, name, score, count);
    } catch (e) {
      console.error(`✗ ${quizId} / ${name}: ${e.message}`);
    }
  }
})();
