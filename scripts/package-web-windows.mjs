import { cp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Run pnpm build first. Use an explicit allowlist; never copy the developer .env.local.
const root = fileURLToPath(new URL('../', import.meta.url));
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..*/, '').replace('T', '-');
const output = path.join(root, 'web-dist-windows', `Anduo-Web-Windows-${stamp}`);
const localSource = path.join(root, 'desktop-resources/offline-pack');
const manifest = JSON.parse(await readFile(path.join(localSource, 'manifest.json'), 'utf8'));
if (!manifest.basemaps?.street || manifest.basemaps.street.maximumLevel !== 12)
  throw new Error('缺少已验证的本地街道资源');
const checksums = await readFile(path.join(localSource, 'SHA256SUMS'), 'utf8');
let verified = 0;
for (const line of checksums.trim().split('\n')) {
  const [, hash, relative] = line.match(/^([a-f0-9]{64})\s+(.+)$/) || [];
  if (!relative?.startsWith('basemaps/street/')) continue;
  if (relative.split('/').includes('..')) throw new Error('无效资源路径');
  const body = await readFile(path.join(localSource, relative));
  if (createHash('sha256').update(body).digest('hex') !== hash) throw new Error(`资源校验失败：${relative}`);
  verified++;
}
if (!verified) throw new Error('本地瓦片校验清单为空');
console.log(`Verified ${verified} local street tiles`);
await mkdir(path.join(output, 'scripts'), { recursive: true });
await mkdir(path.join(output, 'server'), { recursive: true });
await cp(path.join(root, 'web-dist'), path.join(output, 'web-dist'), { recursive: true });
const localTarget = path.join(output, 'web-dist/local-map');
await mkdir(localTarget, { recursive: true });
for (const item of ['basemaps', 'licenses', 'manifest.json', 'SHA256SUMS'])
  await cp(path.join(localSource, item), path.join(localTarget, item), {
    recursive: true,
    filter: source => !path.basename(source).startsWith('.'),
  });
for (const file of ['scripts/serve-web.mjs', 'server/routing.mjs', 'server/amap-proxy.mjs'])
  await cp(path.join(root, file), path.join(output, file));
await writeFile(path.join(output, 'start.cmd'), [
  '@echo off', 'cd /d "%~dp0"',
  'where node >nul 2>nul',
  'if errorlevel 1 (',
  '  echo Please install Node.js 24 LTS from https://nodejs.org/',
  '  pause', '  exit /b 1', ')',
  'node --env-file-if-exists=.env scripts/serve-web.mjs', 'pause', '',
].join('\r\n'));
await writeFile(path.join(output, '.env.example'), [
  '# Copy this file to .env and set your own server-side credentials.',
  '# Never share the configured .env file.',
  'AMAP_WEB_KEY=', 'AMAP_SECURITY_JSCODE=', 'WEB_PORT=8080', '',
].join('\r\n'));
await writeFile(path.join(output, 'README-Windows.txt'), `安多沙盘 Web Windows 使用说明

构建时间（UTC）：${new Date().toISOString()}
包含打包时的工作区代码（包括尚未提交的修改），不是 Electron 安装包。

1. 安装 Node.js 22.12 或更高版本，推荐 Node.js 24 LTS：https://nodejs.org/
2. 完整解压到本地文件夹，不要在压缩包内直接启动。
3. 双击 start.cmd，保持命令窗口打开。
4. 在新版 Edge 或 Chrome 中访问 http://127.0.0.1:8080/ ，启用硬件加速。
5. 关闭服务：在命令窗口按 Ctrl+C。无需 pnpm、npm install 或 Python。

混合地图：
- 默认街道优先使用随包本地 OSM 简化资源，无须联网读取街道瓦片。
- 覆盖经度 88.5–93.8、纬度 31.2–36.5，仅 0–12 级，无中文地图文字。
- 不是全国街道数据，也不包含精细街道样式、离线卫星和三维高程。
- 图层面板保留在线 OSM 街道及 OpenTopoMap 地形地貌入口。
- 在线 OSM 可能因使用政策拒绝访问，不保证在线可用；本程序不绕过服务封锁。
- 地形地貌为二维制图，仍需联网，不是三维高程数据。
- 本地资源仅作底图，不是路由引擎；路线仍需配置高德并联网。
- 瓦片已按 SHA256SUMS 校验；署名与 ODbL 许可位于 web-dist/local-map/licenses。

高德 API：
- 包含高德驾车路线调用代码、本地安全代理和高德 JS API 实验页。
- 将 .env.example 复制为 .env，用记事本配置 AMAP_WEB_KEY（Web 服务 Key）。
- 高德 JS API 实验还需要 AMAP_SECURITY_JSCODE（JS API 安全密钥）。
- 服务端 AMAP_WEB_KEY 和 AMAP_SECURITY_JSCODE 不包含在此分发包内；开发机的 .env.local 不会复制。
- 前端 VITE_AMAP_JS_KEY 在构建时生效，属于公开浏览器 Key，不能在此包的 .env 中修改。
- 修改 .env 后关闭并重新启动 start.cmd。
- 主界面高德三维底图入口当前暂停开放，不是正式交付功能。
- 实验页：http://127.0.0.1:8080/amap-terrain-lab.html ，真实高程效果尚未完成验收。
- 请在高德控制台检查 Key 类型、域名/IP 白名单、配额和授权。
- 未配置高德凭据时仍可使用其余基础沙盘功能。

运行限制与数据：
- 本服务只允许本机访问，不要直接对公网开放；共享部署需另配认证和限流。
- 在线影像、地形、OSM 和模型下载需要网络，不是全离线地图包。
- Windows 本机无须安装项目依赖，但此包未内置 Node.js 运行时。
- 不要双击 web-dist/index.html，必须通过上述 HTTP 地址访问。
- 已有标注、工作区和私人部署数据不会自动包含在构建包中；请导出完整备份，再到新电脑恢复。
- 浏览器存储按地址、端口和浏览器隔离。请固定使用同一地址，并定期导出备份。
- 若端口被占用，可在 .env 设置 WEB_PORT=8081，并访问对应地址。
- 已在构建机器验证构建和本地运行；仍需在 Windows 真机验收显卡与网络兼容性。
`);
console.log(output);