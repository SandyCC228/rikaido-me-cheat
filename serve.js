// 本機預覽：node serve.js → http://localhost:3000/
const http = require('http');
const fs = require('fs');
http.createServer((q, s) => {
  const path = q.url.split('?')[0];                 // 先去掉 query，'/?' 也算首頁
  const f = '.' + (path.endsWith('/') ? path + 'index.html' : path);
  let buf;
  try { buf = fs.readFileSync(f); } catch { s.writeHead(404); return s.end(); }
  s.writeHead(200, { 'content-type': f.endsWith('.js') ? 'application/javascript' : 'text/html;charset=utf-8' });
  s.end(buf);
}).listen(3000, () => console.log('http://localhost:3000/'));
