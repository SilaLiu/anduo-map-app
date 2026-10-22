# 离线资源接入（第一阶段）

当前阶段提供 Electron 本地资源包入口、基础清单与样例瓦片校验、地图/地形加载及公网请求阻断。**不代表全功能离线版已经完成。**离线路由、地物查询、颜色与 AI 提取及离线语音适配尚未完成；资源数据需另行合法准备。

## 使用

Windows 基础离线安装包已内置 `anduo-osm-county-v1` 简化街道资源，首次启动自动启用离线模式。
桌面程序启动即全屏，隐藏 Windows 标题栏和常驻菜单栏。F11 切换全屏；
Windows 可按 Alt 显示菜单，通过“窗口”菜单退出全屏或退出程序，也可用 Alt+F4 退出。
网页内“沙盘全屏”与桌面窗口全屏是不同功能。
离线模式下即使电脑联网，也不自动请求或更新地图。内置资源为固定快照；
手动退出离线模式只允许加载在线资源，不会自动下载或更新离线包。
资源安装于 Electron 的 `resources/offline-pack`，不需要 Windows 存在 Mac 的外置盘路径。
若用户已有自选资源设置，则继续尊重该设置；无设置时启用内置包。
明确退出离线模式后会记住选择，不会下次启动又自动启用内置包。
卫星或地形底图未提供时回退到街道底图；这不代表已提供真实影像和三维高程。
本版本仍不含离线路由及完整离线提取，不是全功能离线版。

构建前需要将已校验的真实资源复制到项目的 `desktop-resources/offline-pack`。
此目录不纳入 Git，`electron-builder.yml` 通过 `extraResources` 打包，并排除 macOS `._` 文件。
`scripts/smoke-bundled-offline.mjs` 用独立测试用户目录验证内置包首次启动、瓦片读取和网络阻断。

1. 准备资源目录及下述 `manifest.json`。
2. Electron 顶部菜单“离线资源 → 选择离线资源包目录…”。通过基础校验后自动重新加载并记住路径。
3. 在原有底图选择器中选择资源包实际提供的底图；未提供的底图会明确报错，不联网回退。
4. 开启真实地形时，只有资源包包含兼容地形数据才能显示起伏。
5. “查看离线资源状态”可以检查模式和路径；退出离线模式需要确认，随后才允许公网请求。

已选包在下次启动失效时，保持阻断公网，不会自动切回在线。可重新选择有效包或明确退出离线模式。离线设置独立保存在 Electron 用户数据目录 `offline-settings.json`，工作区 JSON 不包含地图包或此路径。

## 资源清单 v1

以下是格式示例，不是可下载的真实地图包；范围仅为示例，生产包应根据真实数据覆盖范围填写。

```json
{
  "version": 1,
  "name": "安多县离线资源包",
  "bounds": [90, 30, 94, 35],
  "basemaps": {
    "street": {
      "url": "basemaps/street/{z}/{x}/{y}.png",
      "maximumLevel": 15,
      "sample": [0, 0, 0],
      "credit": "© OpenStreetMap contributors"
    }
  },
  "terrain": { "path": "terrain" }
}
```

- `bounds` 为 WGS84 西、南、东、北，当前支持不跨日期变更线、纬度位于 ±85° 内的区域。
- 底图可选键：`street`、`satellite`、`topographic`、`tianditu`，至少提供一种。每种实际数据都须具备离线使用及分发授权。
- 底图为 Web Mercator XYZ 栅格瓦片，不支持把 PBF、MBTiles 或矢量 PBF 瓦片直接放入。必须按资源目录展开为图片。
- `sample` 为实际存在的一个 `[z,x,y]` 瓦片，用来校验路径可读性；不能证明所有瓦片完整或图片内容正确。区域包应填写真实存在的样例。
- Cesium 从低层级开始加载，需准备覆盖范围内从 0 级到最高级的必要父级瓦片，不能只有最高级瓦片。
- `terrain` 可以省略；如提供，需要目录内的 `layer.json` 和完整 quantized-mesh 地形瓦片。目前限定不依赖外部父图层或扩展，瓦片使用未 gzip 压缩的文件；预压缩包需先解压并验证。元数据里的路径必须是相对路径。
- 所有数据路径必须位于资源包内。禁止外部 URL、绝对路径、目录穿越和指向包外的符号链接。
- 应保留资源来源、制作日期及许可说明文件。禁止批量抓取 OSM 官方公共瓦片制作离线包。

## 当前限制与后续验收

### 本机资源准备（2026-10-22）

原始资源存放于 `/Volumes/chassis/anduo-offline/source`：Geofabrik 西藏 OSM PBF
（已与 `tibet-261020.osm.pbf.md5` 比对一致）、Mapzen/AWS Terrain Tiles HGT 高程源数据。
相关来源署名和 ODbL 文档保存在 `source/license`。HGT 是高程原始数据，不能直接作为 Cesium 地形包。

`scripts/build-offline-osm.py` 使用独立环境中的 `osmium` 和 `Pillow`，不访问在线瓦片服务。
生成目标为 `/Volumes/chassis/anduo-offline/packs/anduo-osm-county-v1`，范围为
`[88.5, 31.2, 93.8, 36.5]`（完整项目县界及缓冲区域），0–12 级简化街道图。
脚本只在全部生成完成后写入 `manifest.json`，未生成清单表示资源包尚未完成。

```bash
/Users/liuqingyi/Developer/anduo-map-app/.offline-venv/bin/python \
  /Users/liuqingyi/Developer/anduo-map-app/scripts/build-offline-osm.py \
  --pbf /Volumes/chassis/anduo-offline/source/osm/tibet-latest.osm.pbf \
  --output /Volumes/chassis/anduo-offline/packs/anduo-osm-county-v1 \
  --bounds 88.5 31.2 93.8 36.5 --max-zoom 12
```

已存在清单时脚本拒绝覆盖，请指定新的输出目录。转换依赖版本记录于外置盘
`tools/requirements-conversion.lock`；独立环境 `.offline-venv` 不纳入版本控制。

该包使用真实 OSM 数据，但只是简化地图，不包含影像、中文地图文字或三维地形。
地名点单独保存在 `features/places.geojson`，尚未自动接入应用。
地物选择按包围盒相交，保留跨界要素，不是精确县界裁切。
`routing/osm-road-source.json` 保留道路节点 ID、标签及关联转向限制，
**不是可直接导航的路由引擎或已验证路网**。缺失标签和 OSM 数据覆盖不足需另行验证。
当前前端尚未读取这些新生成的地物及路网文件。

运行日志位于外置盘 `build-osm-county.log` 和 `download-dem-expanded.log`。
不要把仍在运行的下载或切片任务当作已完成资源；检查完成标记、SHA-256 和瓦片覆盖后才能使用。

- 资源通过基础校验后会阻止 Electron 会话中的 HTTP/HTTPS/WebSocket 请求。路线接口明确拒绝调用高德；提取入口暂时明确拒绝网络查询，等待本地引擎接入。
- 当前不含真实地图数据、路网索引和 AI 模型；不能把测试用图片当作真实地图。
- 校验还不是全量文件校验，不包含 SHA-256 清单、瓦片覆盖检查和所有模型依赖检查。
- 本机持久化、标注、部署及备份仍沿用现有逻辑。路线、提取、播报全部适配后，需在 Windows 全新用户目录、禁用网络的环境验收。
- 下一阶段：准备合法地图/影像/DEM 数据并生成资源包；接入本地路由及空间查询；本地化 AI 模型与中文语音；进行 Windows 真机完整断网验收。