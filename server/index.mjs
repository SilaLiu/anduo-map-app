import { createServer } from 'node:http';
import { parsePoint, planRoute } from './routing.mjs';
import { proxyAMap } from './amap-proxy.mjs';

// Keep this service on loopback. Production ingress must provide authentication/rate limiting.
createServer(async (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  const send = (code, body) => {
    res.writeHead(code);
    res.end(JSON.stringify(body));
  };
  const url = new URL(req.url || '/', 'http://localhost');
  if (url.pathname.startsWith('/_AMapService/')) return proxyAMap(req, res);
  if (url.pathname === '/api/amap/status' && req.method === 'GET')
    return send(process.env.AMAP_SECURITY_JSCODE ? 200 : 503, {
      configured: !!process.env.AMAP_SECURITY_JSCODE,
    });
  if (url.pathname !== '/api/route' || req.method !== 'GET')
    return send(404, { error: '接口不存在' });
  let start, end;
  try {
    start = parsePoint(url.searchParams.get('origin'));
    end = parsePoint(url.searchParams.get('destination'));
  } catch (e) {
    return send(400, { error: e.message });
  }
  if (!process.env.AMAP_WEB_KEY)
    return send(503, {
      error: '服务器尚未配置 AMAP_WEB_KEY，请配置高德 Web 服务 Key 并重启路线服务',
    });
  try {
    send(200, await planRoute(start, end, process.env.AMAP_WEB_KEY));
  } catch (e) {
    send(502, {
      error:
        e.name === 'TimeoutError'
          ? '高德服务请求超时，请稍后重试'
          : e.message === 'fetch failed'
            ? '服务器无法连接高德，请检查服务器网络'
            : e.message,
    });
  }
}).listen(Number(process.env.ROUTING_PORT || 8787), '127.0.0.1', () =>
  console.log('路线代理已启动（仅监听本机）'),
);
