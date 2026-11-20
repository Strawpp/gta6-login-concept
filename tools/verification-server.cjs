// 仅用于浏览器验收：同一份页面分别模拟 WebP 失效、全部背景失效，不修改正式源码。
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp' };
http.createServer((request, response) => {
  const match = new URL(request.url, 'http://localhost').pathname.match(/^\/(webp-fail|all-fail|monitor)\/(.*)$/);
  if (!match) { response.writeHead(404).end(); return; }
  const [, mode, filename] = match;
  const file = path.resolve(root, filename || 'index.html');
  const relative = path.relative(root, file);
  if (relative.startsWith('..') || path.isAbsolute(relative) || relative.split(path.sep).some(part => part.startsWith('.'))) {
    response.writeHead(403).end(); return;
  }
  const artwork = relative.replaceAll('\\', '/').startsWith('assets/backgrounds/');
  if (artwork && (mode === 'all-fail' || (mode === 'webp-fail' && file.endsWith('.webp')))) { response.writeHead(404).end(); return; }
  fs.readFile(file, (error, data) => {
    if (error) { response.writeHead(404).end(); return; }
    response.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    // 监测脚本只注入验收页，正式页面不加载任何性能采样代码。
    response.end(mode === 'monitor' && file.endsWith('index.html')
      ? data.toString().replace('</body>', '<script src="tools/monitor-playback.js" defer></script></body>') : data);
  });
}).listen(5180, '127.0.0.1', () => console.log('验收服务：http://127.0.0.1:5180/monitor/、/webp-fail/、/all-fail/'));
