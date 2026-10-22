import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parsePoint, planRoute } from '../server/routing.mjs';
import { proxyAMap } from '../server/amap-proxy.mjs';

const root = fileURLToPath(new URL('../web-dist/', import.meta.url));
const mime = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.geojson': 'application/geo+json', '.wasm': 'application/wasm',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.gif': 'image/gif', '.webp': 'image/webp',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.xml': 'application/xml',
};

const server = createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  const json = (status, body) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(body));
  };
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname.startsWith('/_AMapService/')) return await proxyAMap(req, res);
    if (!['GET', 'HEAD'].includes(req.method)) return json(405, { error: '仅支持 GET / HEAD' });
    if (url.pathname === '/api/amap/status')
      return json(process.env.AMAP_SECURITY_JSCODE ? 200 : 503, { configured: !!process.env.AMAP_SECURITY_JSCODE });
    if (url.pathname === '/api/route') {
      let start, end;
      try {
        start = parsePoint(url.searchParams.get('origin'));
        end = parsePoint(url.searchParams.get('destination'));
      } catch (error) { return json(400, { error: error.message }); }
      if (!process.env.AMAP_WEB_KEY) return json(503, { error: '请在本地 .env 中配置 AMAP_WEB_KEY，然后重启服务' });
      try { return json(200, await planRoute(start, end, process.env.AMAP_WEB_KEY)); }
      catch { return json(502, { error: '高德路线请求失败，请检查网络、Key 和配额' }); }
    }
    const pathname = decodeURIComponent(url.pathname);
    if (pathname.includes('\\') || pathname.includes('\0')) return json(400, { error: '无效路径' });
    const file = path.resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
    const relative = path.relative(root, file);
    if (relative.startsWith('..') || path.isAbsolute(relative) || relative.split(path.sep).some(p => p.startsWith('.')))
      return json(403, { error: '禁止访问' });
    if (!(await stat(file)).isFile()) return json(404, { error: '文件不存在' });
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch { json(404, { error: '文件不存在或路径无效' }); }
});
server.on('error', error => { console.error(`启动失败：${error.message}`); process.exitCode = 1; });
server.listen(Number(process.env.WEB_PORT || 8080), '127.0.0.1', () => {
  console.log(`安多沙盘 Web：http://127.0.0.1:${server.address().port}/`);
  console.log('仅本机访问。保持窗口打开，按 Ctrl+C 停止。');
  console.log(process.env.AMAP_WEB_KEY
    ? '高德路线 Key 已配置（可用性仍取决于网络、权限和配额）。'
    : '高德路线未配置：请将 .env.example 复制为 .env，填写 AMAP_WEB_KEY 后重启。');
});