// 四個語系頁共用。各頁在 HTML 裡內嵌 window.I18N（該語系的 UI 字串）。
(() => {
  const { fetchQuiz, capOf, spread, buildWrite, FS, LOCALES } = window.CHEAT_CORE;
  const T = window.I18N;
  const t = (key, vars) => (T[key] || key).replace(/\{(\w+)\}/g, (_, k) => vars?.[k] ?? '');

  const $ = id => document.getElementById(id);
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  };

  // 題庫只能用 script 標籤載（fetch 會被 CORS 擋）；失敗回 null 走降級
  const loaded = new Map();
  function loadQuestions(url, v) {
    if (!loaded.has(url)) loaded.set(url, new Promise(res => {
      const s = document.createElement('script');
      s.src = url;
      s.onload = () => {
        const Q = window.RIKAIDO_QUESTIONS;
        const set = Q?.sets?.[v] || Q?.sets?.[1];
        res(set ? { set, genres: Q.genres || {} } : null);
      };
      s.onerror = () => res(null);
      document.head.appendChild(s);
    }));
    return loaded.get(url);
  }

  // 查過的 quiz 記在本機，下次點輸入框就有建議。
  // 不靠瀏覽器的表單歷史：表單被 preventDefault，多數瀏覽器不會記錄。
  const KEY = 'rikaido-recent';
  const readRecent = () => { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; } };
  function fillRecent(ids) {
    $('recent').innerHTML = '';
    ids.forEach(v => $('recent').append(Object.assign(document.createElement('option'), { value: v })));
  }
  function remember(id) {
    const ids = [id, ...readRecent().filter(x => x !== id)].slice(0, 10);
    try { localStorage.setItem(KEY, JSON.stringify(ids)); } catch { /* 無痕模式等等 */ }
    fillRecent(ids);
  }
  fillRecent(readRecent());

  $('ask').onsubmit = async e => {
    e.preventDefault();
    $('result').innerHTML = '';
    $('status').textContent = t('searching');
    try {
      const quiz = await fetchQuiz($('input').value.trim());   // 傳原始輸入，網址裡有語系線索
      const qs = await loadQuestions(quiz.questionsUrl, quiz.v);
      $('status').textContent = '';
      remember(quiz.id);
      render(quiz, qs);
    } catch (err) {
      $('status').textContent = err.code === 'NOT_FOUND' ? t('notFound') : err.message;
    }
  };

  function render(quiz, qs) {
    $('result').append(el('h2', null, t('owner', { owner: quiz.owner, n: quiz.qids.length })));
    if (!qs) $('result').append(el('p', 'fallback', t('fallback')));

    // 題庫載不到就不給送出：g 的 key 必須是題庫的分類名，網站的雷達圖照那些 key 取值，
    // 算不出分類就不該寫進去。
    if (qs) renderSubmit(quiz, qs.set);

    const ol = document.createElement('ol');
    quiz.qids.forEach((qid, i) => {
      const li = document.createElement('li');
      const correct = quiz.answers[i];               // 'A' 或 'B'
      const q = qs && qs.set[qid];

      const head = el('div', 'qhead');
      head.append(el('span', 'num', String(i + 1).padStart(2, '0')));
      if (q) {
        const genre = qs.genres[q.g];
        if (genre) head.append(el('span', 'genre', genre.emoji || ''));
        head.append(el('span', 'qtext', q.q));
      } else {
        head.append(el('span', 'qtext', t('answerIs', { ab: correct })));   // 降級：題庫載不到
      }
      li.append(head);

      if (q) {
        const opts = el('div', 'opts');
        opts.append(el('div', 'opt' + (correct === 'A' ? ' ok' : ''), q.a));
        opts.append(el('div', 'opt' + (correct === 'B' ? ' ok' : ''), q.b));
        li.append(opts);
      }
      ol.append(li);
    });
    $('result').append(ol);
  }

  function renderSubmit(quiz, set) {
    const total = quiz.qids.length;
    const box = document.createElement('details');
    box.innerHTML = `
      <summary></summary>
      <p class="note"></p>
      <div class="fields">
        <label><span></span> <input id="sname" required autocomplete="off"></label>
        <label><span></span> <input id="sscore" type="number" min="0" max="${total}" value="${total}"></label>
      </div>
      <button id="sbtn"></button>
      <p id="smsg"></p>`;
    box.querySelector('summary').textContent = t('sendSummary');
    box.querySelector('.note').textContent = t('sendNote');
    const [nameLabel, scoreLabel] = box.querySelectorAll('label span');
    nameLabel.textContent = t('name');
    scoreLabel.textContent = t('score');
    $('result').append(box);
    $('sbtn').textContent = t('send');

    $('sbtn').onclick = async () => {
      const name = $('sname').value.trim();
      const score = Number($('sscore').value);
      if (!name) return ($('smsg').textContent = t('needName'));
      if (!Number.isInteger(score) || score < 0 || score > total) {
        return ($('smsg').textContent = t('badScore', { max: total }));
      }
      const g = spread(score, capOf(quiz.qids, set));

      $('sbtn').disabled = true;
      $('smsg').textContent = t('sending');
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
        const link = el('a', null, t('sentLink'));
        link.href = `https://rikaido.me${path}?q=${quiz.id}`;
        link.target = '_blank';
        link.rel = 'noopener';
        $('smsg').textContent = t('sent');
        $('smsg').append(link);
      } catch (err) {
        $('smsg').textContent = t('sendFail') + err.message;
      } finally {
        $('sbtn').disabled = false;   // 送出中才擋重複點擊，結束就放開
      }
    };
  }
})();
