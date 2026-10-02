# anduo-map-app

安多县三维地理沙盘，当前入口为 `index.html` → `src/web/main.ts`。

## 当前架构

- CesiumJS 负责三维地理场景、影像、地形和要素拾取。
- Vue 3 + TypeScript 负责工作区、任务、标注、行政区和提取面板。
- Vite 构建静态网页到 `web-dist/`；不再使用 Electron 或 Windows 打包。
- IndexedDB 保存浏览器工作区，GeoJSON / JSON 用于导入导出和迁移。
- Turf 处理几何、行政归属和提取范围，保留 WGS84 坐标与 Polygon 内环。
- `src/renderer/extraction/` 与 `utils/` 中部分独立算法继续复用；其他旧模块和 `legacy/` 仅用于参考。

## 约定

- 标注保存为 GeoJSON Feature；`properties.sandtableKey` 是任务关联键，迁移和导出不可丢失。
- 原始地理数据位于 `data/`。内置边界可能存在退化面片，仅在载入时清理，不改写原文件。
- 推算位置/边界不得标记为测量结果；没有高程源时明确显示椭球地表。
- Cesium 对象不放入 Vue 深层响应式状态。替换图层使用异步版本检查，卸载时销毁 Viewer 与事件。
- 浏览器本地保存失败必须反馈；旧 Electron 用户数据需要用户导入，不能假定已迁移。
- `scripts/prepare-web-data.mjs` 生成静态边界库索引，启动/构建前运行。
- 新功能优先添加到 `src/web/` 的领域模块、服务或组件，不扩展旧桌面 IPC。

## 命令

```bash
pnpm dev
pnpm typecheck
pnpm test
pnpm build
pnpm preview
pnpm test:e2e # 先启动网页服务，需要 Google Chrome
```

Python 数据采集继续通过 `.venv` 运行，使用 `pnpm setup:python` 和 `pnpm fetch:map-data:anduo` 等脚本。完整配置与迁移说明见 `README.md`。
