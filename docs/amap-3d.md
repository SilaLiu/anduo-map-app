# 高德卫星地形模式

> 当前状态：暂停，留待后期迭代。主界面已隐藏入口；以下接入说明仅供后续开发参考，不代表功能已验收。详细实验结论见同目录 `amap-terrain-experiment.md`。

在「图层 → 底图」选择「高德卫星地形 · 3D（Beta · 联网）」。这是独立的高德 JS API 2.1Beta 场景，不是 Cesium 瓦片图层。配置 `viewMode: '3D'`、`terrain: true`，加载 `AMap.TileLayer.Satellite` 卫星影像及可隐藏的 `RoadNet` 路网注记。切换会销毁旧地图，当前版本重新定位安多县，不同步两个引擎的相机。更新后需刷新整个页面，不能在已加载 2.0 的页面内原地升级 SDK。

默认缩放 12、俯仰 65 度；县城附近较平坦，可缩小并移向周边山地查看山体轮廓。行政区面默认不填色，避免遮盖卫星影像。2D 按钮仅改为俯视，仍保留地形配置。勾选的地形状态表示已请求地形，不能证明远端高程已成功加载；实际效果受高德服务权限、覆盖、网络及 WebGL 支持影响。

## 本地启动

在项目根目录 `.env.local` 中配置（勿提交实际凭证）：

```dotenv
VITE_AMAP_JS_KEY=你的Web端JS_API_Key
AMAP_SECURITY_JSCODE=对应的安全密钥
```

分别启动 `pnpm routing`（默认 8787）和 `pnpm dev`。修改环境变量后重启两个服务。路线功能仍独立使用 `AMAP_WEB_KEY`（Web 服务 Key）。高德控制台的域名白名单需与访问域名匹配。

浏览器只收到 JS API Key；安全密钥由 Node 代理注入，不使用 `VITE_` 前缀。客户端通过 `/api/amap/status` 检查配置，SDK 的 `serviceHost` 为同源 `/_AMapService`。

## 部署

`pnpm build` 只生成静态网页，不包含 Node 代理。正式部署需将 `/api/amap/status`、`/_AMapService/` 和原有 `/api/route` 转发到服务端；代理仅监听本机，生产入口须增加认证、限流和 HTTPS。不要公开无保护的代理，否则可能被滥用消耗配额。也可按高德官方文档用 Nginx 替代 Node 安全代理，并提供状态检查接口。

## 支持范围

- 卫星影像＋三维地形、旋转、倾斜、2D 俯视，路网注记开关。
- 已有行政边界、参考图层、标注、预览和高亮的点线面展示；多面和 Polygon 内环保留。
- 要素详情、搜索定位、路线选点/显示和行驶位置展示。
- 原始数据保持 WGS84，仅显示和鼠标事件边界复用现有 GCJ-02 数学近似转换，不代表测绘级精度。
- 暂不支持绘制/提取、兵力部署展示、自定义建筑挤出及 Cesium 高程/地形夸张。点位使用高德默认标记，不保留旗帜及所有专题样式。
- 使用官方文档要求的 `v2.1Beta` 地形；普通 `2.0` 的倾斜街道地图并非卫星地形。不提供地形夸张调节，建筑覆盖以高德实际数据为准。
- 仅支持 HTTP(S) 联网网页版；桌面离线模式不提供高德底图。

官方参考：https://lbs.amap.com/api/javascript-api-v2/guide/map/3d-map
安全代理：https://lbs.amap.com/api/javascript-api-v2/guide/abc/jscode