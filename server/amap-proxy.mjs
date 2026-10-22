// Fixed upstreams only: never forward arbitrary hosts or expose the security code.
export function amapTarget(rawUrl, securityCode) {
  const incoming = new URL(rawUrl, 'http://localhost');
  const prefix = '/_AMapService/';
  if (!incoming.pathname.startsWith(prefix)) throw new Error('无效代理路径');
  const path = incoming.pathname.slice(prefix.length);
  if (!path || !/^[a-zA-Z0-9_-]+(?:\/[a-zA-Z0-9_-]+)*$/.test(path)) throw new Error('无效代理路径');
  const target = new URL(
    `/${path}`,
    path === 'v4/map/styles' ? 'https://webapi.amap.com' : 'https://restapi.amap.com',
  );
  target.search = incoming.search;
  target.searchParams.set('jscode', securityCode);
  return target;
}

export async function proxyAMap(req, res) {
  const sendError = (status, error) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error }));
  };
  if (req.method !== 'GET') return sendError(405, '仅支持 GET');
  const code = process.env.AMAP_SECURITY_JSCODE;
  if (!code) return sendError(503, '尚未配置 AMAP_SECURITY_JSCODE，请配置并重启代理');
  let target;
  try {
    target = amapTarget(req.url, code);
  } catch {
    return sendError(400, '无效代理路径');
  }
  try {
    const upstream = await fetch(target, { signal: AbortSignal.timeout(15000), redirect: 'error' });
    const body = await upstream.text();
    // Do not leak the security code even if an upstream error echoes the request.
    if (body.includes(code) || body.includes(encodeURIComponent(code)))
      return sendError(502, '高德代理返回异常，请检查控制台配置');
    res.writeHead(upstream.status, {
      'Content-Type': upstream.headers.get('content-type') || 'application/json',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(body);
  } catch {
    sendError(502, '高德代理连接失败，请检查网络或稍后重试');
  }
}
