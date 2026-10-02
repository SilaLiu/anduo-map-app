# 安多县三维沙盘

安多县卫星地图与三维地理沙盘，基于 **CesiumJS + Vue 3 + TypeScript + Vite**。通过浏览器使用，已取消 Electron 运行入口和 Windows 打包脚本。

作者：**Teddy**  
邮箱：**qingyiliu0@gmail.com**

## 启动

需要 Node.js **22.12+**（推荐 Node.js 24 LTS）与 pnpm。

```bash
pnpm install
pnpm dev
```

打开终端输出的本地地址，默认 `http://127.0.0.1:5173/`。端口占用时 Vite 自动选择下一个端口。

也可使用 `./start.sh` 或 `./start.ps1` 启动网页开发服务；Python 仅用于可选的数据采集，不影响网页运行。

## 运行环境

### 电脑配置

- 操作系统：Windows 10/11 64 位、macOS 13+ 或主流 Linux 桌面系统。
- 浏览器：最新版 Chrome 或 Edge，需开启 WebGL / WebGL2 与硬件加速。
- 最低配置：4 核 CPU、8 GB 内存、支持 WebGL2 的集成显卡、SSD，适合浏览和少量标注。
- 推荐配置：6 核及以上 CPU、16 GB 及以上内存、独立显卡或 Apple Silicon、SSD，适合长时间标注、较多图层和影像分割。
- 磁盘空间：源码、依赖和构建产物建议预留 5 GB 以上；若保留原始地图数据或备份文件，需要额外空间。

### 显示屏与外设

- 最低分辨率：1366 × 768。
- 推荐分辨率：1920 × 1080 或更高；做边界、建筑和道路标注时，建议使用 24 英寸及以上显示器。
- 手机和平板可以查看与简单操作，批量标注建议使用电脑端。
- 推荐使用带滚轮鼠标，便于地图缩放、视角调整和点位选择。
- 浏览器缩放建议保持 100% 到 125%；高分屏可按系统显示比例调整。

### 开发与部署环境

- 开发/构建：Node.js 22.12+（推荐 Node.js 24 LTS）与 pnpm 10。
- Python：仅用于可选地图数据采集和边界脚本；普通网页运行不需要 Python。
- 生产运行：构建后的 `web-dist/` 只需要静态 HTTP(S) 服务和现代浏览器，不需要 Electron 或 Windows 安装包。
- 网络：在线卫星影像、高程、OSM 查询和首次 ONNX 模型下载需要网络；完全离线使用需要自建影像、高程和模型资源服务。

## 当前功能

- Cesium 三维地球、二维视图切换、卫星影像、OSM 街道底图、可配置天地图。
- 安多县县界和乡镇边界、7 类沙盘图层、地名标签、名称或经纬度搜索与定位。
- 点、道路、建筑/区域绘制；撤销顶点、取消、完成；标注属性编辑与删除。
- 道路等级、车道数、路面类型；建筑类型、楼层数与按楼层挤出显示（每层 3 米的示意高度，不是测量高度）。
- 行政区自动归属，兼容 Polygon / MultiPolygon 及内环；推算边界归属标记为待核实。
- 任务清单独立滚动、分类展开、状态筛选、定位、补标、任务报告导出。
- GeoJSON 导入导出，支持旧版桌面标注/边界 JSON 数组；保留任务关联与扩展属性。
- 安多县行政边界库搜索、按文件加载、县界与全部 13 个乡镇边界加载。
- 点击已有地物自动定位并弹出名称、行政归属、备注、来源和建筑信息。
- IndexedDB 自动保存、完整工作区 JSON 备份与恢复。
- OSM 地物查询、颜色分割、实验性 ONNX 语义分割；范围圈选、结果预览与选择性导入。
- 桌面与手机布局；鼠标右键可添加点，绘制时 Enter 完成、Esc 取消、Ctrl/Cmd+Z 撤销顶点。

## 地形和地图数据源

没有高程数据时，默认显示 **WGS84 椭球地表上的卫星影像**，不会生成虚构山体。可创建 `.env.local`，参考 `.env.example`：

```dotenv
# 二选一：自建 quantized-mesh 地形服务，或自己的 Cesium ion token
VITE_TERRAIN_URL=https://your-terrain-service.example/terrain/
VITE_CESIUM_ION_TOKEN=

# 可选：自定义 XYZ 瓦片服务及其署名
VITE_IMAGERY_URL=
VITE_IMAGERY_CREDIT=
VITE_TIANDITU_KEY=
```

修改后重启开发服务，生产部署需要重新构建。`VITE_*` 配置会公开在浏览器中，不适合存放服务端秘密。地形/影像服务需要允许跨域请求。

未配置时卫星影像使用 Esri，街道底图使用 OpenStreetMap。程序和内置 GeoJSON 随网页构建输出；在线影像、高程服务、OSM 查询和首次 ONNX 模型下载仍需要网络。完全离线部署还需自建影像、高程和模型资源服务。

颜色分割与 ONNX 是辅助识别，结果需人工核实。ONNX 使用动态加载的 Transformers.js 和通用 ADE20K 模型，并非专用遥感模型。单次 OSM 查询范围限制为 25 平方公里；影像分割最多覆盖 16 张瓦片，超出会提示缩小范围。OSM 查询保留与圈选区域相交的完整地物，不裁断原始道路与建筑。

## 旧版数据迁移

旧的 `.exe` 与 `dist/` 产物保留为历史文件，新的网页构建输出到 **`web-dist/`**，不会覆盖这些安装包。

桌面版数据与浏览器存储彼此独立，网页不能直接读取 Electron 的用户数据目录。迁移方式：

1. 在旧应用导出 GeoJSON；或者找到旧版 `annotations.json`、`boundaries.json`。
2. 新网页的「标注 → 导入」读取标注文件，「行政区 → 导入边界」读取边界文件。
3. 在「图层 → 导出完整备份」保存包含全部标注、行政区和任务关联的工作区 JSON。

macOS 的旧数据通常在 `~/Library/Application Support/anduo-map-app/`；Windows 通常在 `%APPDATA%/anduo-map-app/`。实际位置以旧应用的 Electron userData 目录为准。

`sandtableKey` 字段用于关联任务。早期桌面版 IPC 导出可能没有包含这个字段，此类旧导出文件无法自动恢复缺失的关联；直接导入原始 `annotations.json` 可保留已有字段。

浏览器数据按 **域名、协议、端口和浏览器配置文件** 隔离。清除站点数据会删除本机工作区；更换地址或浏览器时使用备份恢复。当前版本没有多人同步或服务端数据库。

安多县 13 个乡镇的 OSM 边界已按线段端点重新拼接，去除了旧脚本产生的错误闭合直线。载入旧工作区或恢复备份时，仅自动修复与已知旧几何完全一致的边界（兼容旧版退化面片清理），保留自定义属性和用户修改过的几何。修复清单保存在 `data/anduo-boundary-repairs.json`。

运行时的行政边界、边界库和网页构建限定为安多县及其下属乡镇，默认包含 1 个县和 13 个乡镇。旧工作区和新导入的边界会排除其他市县；标注按行政归属或是否与安多县/乡镇边界相交判断范围。仓库仅收录安多县数据；本机原始全国数据作为存档保留，不提交、不随网页构建发布。

点击地图上已有的地物可自动定位并显示名称、类型、行政归属、备注、来源及已有的建筑信息。此功能不要求全部标注完成；已有地物数据可直接点击。卫星影像中的建筑若缺少对应的名称、坐标或轮廓数据，需要先补标或导入 GeoJSON。弹窗仅显示实际已有信息。

## 构建与验证

```bash
pnpm typecheck
pnpm test
pnpm test:boundaries
pnpm build
pnpm preview
```

将 `web-dist/` 整个目录部署到静态 HTTP(S) 服务。支持子目录部署，Cesium Workers、Assets、Widgets 与内置数据会一起复制。请通过 HTTP(S) 访问，不要直接双击 `index.html`。

浏览器测试需要本机 Google Chrome，并先启动开发服务：

```bash
pnpm dev
# 另一个终端
pnpm test:e2e
# 或测试其他服务地址
TEST_URL=http://127.0.0.1:4173 pnpm test:e2e
```

测试覆盖数据迁移、GeoJSON 几何、边界拼接与原始线段保留、任务定位、读取失败后的备份恢复、保存失败提示、提取坐标，以及三维画面非空、桌面/手机布局、清单滚动、标注保存与导入导出。在线影像取决于外部服务可用性；自动化 OSM 流程测试使用固定响应，不代表外部服务可用性验证。

## 工程结构

```text
src/web/
  App.vue                   网页工作区与交互编排
  components/               Cesium 场景、任务面板、标注编辑、提取面板
  domain/                   类型化几何处理、行政区匹配、任务状态
  services/                 IndexedDB、文件下载、数据读取、地物提取
  styles.css                响应式界面
src/renderer/extraction/    复用的颜色/ONNX 引擎与独立提取上下文
src/renderer/utils/         复用的几何、颜色与瓦片计算
data/                      原始 GeoJSON、任务需求与安多县边界库索引
web-data/                  自动生成的安多县发布数据
legacy/                    旧 Electron 入口与 HTML 存档，不参与运行
tests/                     单元与浏览器交互测试
web-dist/                  网页生产产物
```

`src/renderer/` 中其他旧版模块暂留作迁移参考，不再作为应用入口，也不打入网页产物。边界库索引由 `scripts/prepare-web-data.mjs` 在启动和构建前自动生成。

Python 数据采集脚本保持可用：`pnpm setup:python`、`pnpm fetch:map-data:anduo`、`pnpm fetch:map-data:china`。地理信息来自现有项目数据、DataV / geojson.cn、OpenStreetMap 及推算数据；来源标签与估算状态保留，不将推算数据视为测绘结果。

## 许可证

MIT。第三方地图、模型及数据遵循各自来源的使用条款与署名要求。
