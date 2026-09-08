// node build.js → 由 template.html + i18n.json 產出四個語系頁、sitemap.xml、robots.txt
// 產物都 commit 進 repo，GitHub Pages 直接 serve，沒有 CI。
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');   // 產物寫到 repo 根，Pages 從那裡 serve
const BASE = 'https://sandycc228.github.io/rikaido-me-cheat/';   // 綁自訂網域改這裡
const X_DEFAULT = 'ja';   // 沒有匹配語言時看日文（根目錄），與 rikaido 本站一致

const OG_LOCALE = { ja: 'ja_JP', en: 'en_US', ko: 'ko_KR', 'zh-TW': 'zh_TW' };

const i18n = JSON.parse(fs.readFileSync(path.join(__dirname, 'i18n.json'), 'utf8'));
const template = fs.readFileSync(path.join(__dirname, 'template.html'), 'utf8');
const langs = Object.keys(i18n);

const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const urlOf = lang => BASE + i18n[lang].dir;

for (const lang of langs) {
  const L = i18n[lang];

  // hreflang：四個語系互指，外加 x-default
  const alternates = [
    ...langs.map(l => `<link rel="alternate" hreflang="${l}" href="${urlOf(l)}">`),
    `<link rel="alternate" hreflang="x-default" href="${urlOf(X_DEFAULT)}">`,
  ].join('\n');

  // 語言切換：目前語系顯示為純文字，其餘是連結（也讓爬蟲走得到其他語言頁）
  const langnav = langs.map(l => l === lang
    ? `<span>${esc(i18n[l].label)}</span>`
    : `<a href="${urlOf(l)}" hreflang="${l}">${esc(i18n[l].label)}</a>`).join('\n    ');

  const html = template
    .replace(/\{\{lang\}\}/g, lang)
    .replace(/\{\{title\}\}/g, esc(L.title))
    .replace(/\{\{desc\}\}/g, esc(L.desc))
    .replace(/\{\{intro\}\}/g, esc(L.intro))
    // 文案裡的網址轉成連結，指向本尊比只寫「非官方」更清楚
    .replace(/\{\{disclaimer\}\}/g, esc(L.disclaimer).replace('rikaido.me',
      '<a href="https://rikaido.me/" target="_blank" rel="noopener">rikaido.me</a>'))
    .replace(/\{\{placeholder\}\}/g, esc(L.ui.placeholder))
    .replace(/\{\{search\}\}/g, esc(L.ui.search))
    .replace(/\{\{canonical\}\}/g, urlOf(lang))
    .replace(/\{\{ogLocale\}\}/g, OG_LOCALE[lang])
    .replace(/\{\{alternates\}\}/g, alternates)
    .replace(/\{\{langnav\}\}/g, langnav)
    .replace(/\{\{ui\}\}/g, JSON.stringify(L.ui))
    .replace(/\{\{root\}\}/g, L.dir ? '../' : '');   // 子目錄要往上一層拿 core.js / app.js

  const left = html.match(/\{\{\w+\}\}/g);
  if (left) throw new Error(`${lang}：還有未替換的佔位符 ${[...new Set(left)].join(', ')}`);

  const out = path.join(ROOT, L.dir, 'index.html');
  if (L.dir) fs.mkdirSync(path.join(ROOT, L.dir), { recursive: true });
  fs.writeFileSync(out, html);
  console.log('寫入', path.relative(ROOT, out));
}

fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
  ...langs.map(lang => [
    '  <url>',
    `    <loc>${urlOf(lang)}</loc>`,
    ...langs.map(l => `    <xhtml:link rel="alternate" hreflang="${l}" href="${urlOf(l)}"/>`),
    `    <xhtml:link rel="alternate" hreflang="x-default" href="${urlOf(X_DEFAULT)}"/>`,
    '  </url>',
  ].join('\n')),
  '</urlset>',
  '',
].join('\n'));
console.log('寫入 sitemap.xml');

fs.writeFileSync(path.join(ROOT, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${BASE}sitemap.xml\n`);
console.log('寫入 robots.txt');
