// 仅用于本地预览的静态服务器；页面本身也支持直接打开 index.html。
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const root = __dirname;
const port = Number(process.env.PORT || 5173);
const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.md': 'text/plain; charset=utf-8'
};

http.createServer((request, response) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  } catch {
    response.writeHead(400).end('请求地址无效');
    return;
  }
  const file = path.resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
  // 限定在当前目录读取，拒绝通过路径回退访问工作区以外的文件。
  const relative = path.relative(root, file);
  if (relative.startsWith('..') || path.isAbsolute(relative) || relative.split(path.sep).some(part => part.startsWith('.'))) {
    response.writeHead(403).end('无法访问此文件');
    return;
  }
  fs.stat(file, (error, info) => {
    if (error || !info.isFile()) {
      response.writeHead(404).end('文件不存在');
      return;
    }
    response.writeHead(200, {
      'Content-Type': mimeTypes[path.extname(file)] || 'application/octet-stream',
      'Content-Length': info.size,
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff'
    });
    const stream = fs.createReadStream(file);
    stream.on('error', () => response.destroy());
    stream.pipe(response);
  });
}).listen(port, '127.0.0.1', () => {
  console.log(`概念登录页已启动：http://127.0.0.1:${port}`);
}).on('error', error => {
  console.error(`预览服务启动失败：${error.message}`);
  process.exitCode = 1;
});
