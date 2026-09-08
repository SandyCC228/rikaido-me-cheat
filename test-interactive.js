// 餵假鍵盤輸入給 cheat.js 的問答模式（一行一行慢慢寫，模擬真人打字）
const { spawn } = require('child_process');
const lines = process.argv.slice(2);
const p = spawn('node', ['cheat.js', '--dry'], { stdio: ['pipe', 'inherit', 'inherit'] });
(async () => {
  for (const l of lines) {
    await new Promise(r => setTimeout(r, 400));
    p.stdin.write(l + '\n');
  }
  await new Promise(r => setTimeout(r, 800));
  p.stdin.end();
})();
