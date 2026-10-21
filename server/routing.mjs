// GCJ-02 mathematical approximation; inverse iterates to sub-metre numerical residual.
export function toGcj([lng, lat]) {
  const x = lng - 105,
    y = lat - 35,
    pi = Math.PI;
  const wave = (v) => ((20 * Math.sin(6 * v * pi) + 20 * Math.sin(2 * v * pi)) * 2) / 3;
  let a = -100 + 2 * x + 3 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
  a +=
    wave(x) +
    ((20 * Math.sin(y * pi) + 40 * Math.sin((y * pi) / 3)) * 2) / 3 +
    ((160 * Math.sin((y * pi) / 12) + 320 * Math.sin((y * pi) / 30)) * 2) / 3;
  let b = 300 + x + 2 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
  b +=
    wave(x) +
    ((20 * Math.sin(x * pi) + 40 * Math.sin((x * pi) / 3)) * 2) / 3 +
    ((150 * Math.sin((x * pi) / 12) + 300 * Math.sin((x * pi) / 30)) * 2) / 3;
  const rad = (lat * pi) / 180,
    magic = 1 - 0.00669342162296594323 * Math.sin(rad) ** 2;
  return [
    lng + (b * 180) / ((6378245 / Math.sqrt(magic)) * Math.cos(rad) * pi),
    lat +
      (a * 180) / (((6378245 * (1 - 0.00669342162296594323)) / (magic * Math.sqrt(magic))) * pi),
  ];
}
export function toWgs(target) {
  let result = [...target];
  for (let i = 0; i < 5; i++) {
    const value = toGcj(result);
    result = result.map((v, j) => v + target[j] - value[j]);
  }
  return result;
}
export function parsePoint(value) {
  if (!value || !/^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/.test(value)) throw new Error('起终点坐标格式无效');
  const p = value.split(',').map(Number);
  if (!p.every(Number.isFinite) || p[0] < 73 || p[0] > 136 || p[1] < 18 || p[1] > 54)
    throw new Error('请选择中国大陆范围内的起终点');
  return p;
}
export async function planRoute(start, end, key, fetcher = fetch) {
  const format = (p) =>
    toGcj(p)
      .map((v) => v.toFixed(6))
      .join(',');
  const url = new URL('https://restapi.amap.com/v3/direction/driving');
  url.search = new URLSearchParams({
    key,
    origin: format(start),
    destination: format(end),
    extensions: 'base',
    output: 'JSON',
  }).toString();
  const response = await fetcher(url, { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error('高德服务暂时无法连接，请稍后重试');
  const data = await response.json();
  if (data.status !== '1') {
    const messages = {
      10001: '高德 Key 无效或已过期',
      10003: '高德每日调用配额已用完',
      10044: '高德账号每日调用配额已用完',
      10009: 'Key 类型不正确，请使用 Web 服务 Key',
      10005: '请检查高德 Key 的服务器 IP 白名单',
      10007: '请检查高德 Key 的数字签名设置',
      20801: '起点或终点附近没有可规划的道路',
      20802: '道路不连通，无法规划路线',
    };
    throw new Error(
      messages[data.infocode] ||
        `高德路线服务拒绝请求（错误码 ${String(data.infocode).replace(/[^0-9]/g, '')}），请检查控制台权限和配额`,
    );
  }
  const path = data.route?.paths?.[0];
  if (!path) throw new Error('没有找到可行驶路线，请重新选择道路附近的点');
  const coordinates = (path.steps || [])
    .flatMap((step) => (step.polyline || '').split(';').filter(Boolean).map(parsePoint))
    .map(toWgs);
  const distance = Number(path.distance),
    duration = Number(path.duration);
  if (
    coordinates.length < 2 ||
    !Number.isFinite(distance) ||
    distance < 0 ||
    !Number.isFinite(duration) ||
    duration < 0
  )
    throw new Error('高德返回的路线数据不完整');
  return { coordinates, distance, duration };
}
