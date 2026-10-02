# 安多县行政区边界数据

数据来源：
- `540000_西藏自治区.json`：`DataV Atlas`（实测，高精度）
- `540600_那曲市.json`、`540624_安多县.json`：`DataV Atlas`（实测，高精度）
- `towns/*.json`：`OpenStreetMap`（通过 Overpass API，社区维护，中等精度）
- `anduo_all_levels.json`：上述数据的合并文件

本目录由脚本 `scripts/download-anduo-town-boundaries.py` 生成。

> ℹ️ **精度说明**：乡镇级边界来自 OpenStreetMap 社区绘制，比 Voronoi 推算更贴近实际地貌，但仍不是官方测绘数据。在需要精确空间分析（如确权、测量、执法）时，请与官方资料核对。

## 文件说明

- `540000_西藏自治区.json`：省级边界
- `540600_那曲市.json`：地市级边界（内含那曲市下各县区）
- `540624_安多县.json`：县级边界
- `towns/*.json`：各乡镇边界（admin_level=8，OSM 社区维护）
- `town_centers.json`：乡镇中心点（旧 Voronoi 方案遗留，仅供参考）
- `anduo_all_levels.json`：省 / 市 / 县 / 乡镇 合并文件，可直接导入应用
- `index.json`：本次生成元数据

## 当前下载结果

- 成功文件数：17
- 失败文件数：0
- 乡镇边界来源：OpenStreetMap（13 个乡镇）

## 使用方式

1. 启动应用后点击侧栏「📚 加载本地边界库」。
2. 选择 `anduo_all_levels.json` 导入（推荐，已去重）。
3. 或在「🗺️ 导入边界」中手动选择单个 `.json` 文件。

> 注意：加载全部本地边界时，应用会跳过 `*_all_levels.json` 合并文件，避免与单文件重复计数。
