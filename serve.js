// 本機預覽：node serve.js → http://localhost:8787/
const http = require('http');
const fs = require('fs');
http.createServer((q, s) => {
  const f = '.' + (q.url === '/' ? '/index.html' : q.url.split('?')[0]);
  let buf;
  try { buf = fs.readFileSync(f); } catch { s.writeHead(404); return s.end(); }
  s.writeHead(200, { 'content-type': f.endsWith('.js') ? 'application/javascript' : 'text/html;charset=utf-8' });
  s.end(buf);
}).listen(8787, () => console.log('http://localhost:8787/'));
