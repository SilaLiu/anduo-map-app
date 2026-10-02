#!/usr/bin/env python3
"""下载安多县及其下属乡镇的行政区边界（来源：OpenStreetMap / Overpass API）。

生成结构：
    data/admin-geojson/xizang/anduo/
        540000_xizang.json          # 西藏自治区
        540600_naqu.json            # 那曲市
        540624_anduo.json           # 安多县
        towns/
            8242618_zharezhen.json  # 扎仁镇
            ...

边界属性会写入 province / county / town 等字段，以便应用自动识别层级。
"""
import argparse
import json
import ssl
import sys
import time
import urllib.request
from pathlib import Path
from osm_geometry import relation_to_geometry

ROOT = Path(__file__).resolve().parent.parent
OUTPUT_DIR = ROOT / 'data' / 'admin-geojson' / 'xizang' / 'anduo'
TOWNS_DIR = OUTPUT_DIR / 'towns'
README_PATH = OUTPUT_DIR / 'README.md'
INDEX_PATH = OUTPUT_DIR / 'index.json'

OVERPASS_URL = 'https://overpass-api.de/api/interpreter'
DATAV_URL = 'https://geo.datav.aliyun.com/areas_v3/bound'

TARGETS = [
    # (adcode_or_id, name, level, source)
    ('540000', '西藏自治区', 'province', 'datav'),
    ('540600', '那曲市', 'county', 'datav'),
    ('540624', '安多县', 'county', 'datav'),
]

SSL_CONTEXT = ssl.create_default_context()


def fetch_json(url: str, data: bytes = None, method: str = 'GET', retries: int = 3):
    last_err = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, data=data, headers={
                'User-Agent': 'anduo-map-app/1.0',
                'Content-Type': 'text/plain' if data else '',
            }, method=method)
            with urllib.request.urlopen(req, context=SSL_CONTEXT, timeout=120) as resp:
                return json.load(resp)
        except Exception as exc:
            last_err = exc
            print(f'  Retry {attempt + 1}/{retries}: {exc}', file=sys.stderr)
            time.sleep(min(30 * (attempt + 1), 90))
    raise last_err


def overpass_query(query: str):
    body = f'[out:json][timeout:120];\n{query}\nout body;\n>;\nout skel qt;'
    return fetch_json(OVERPASS_URL, data=body.encode('utf-8'), method='POST', retries=3)


def datav_url(adcode: str, full: bool = False):
    suffix = '_full' if full else ''
    return f'{DATAV_URL}/{adcode}{suffix}.json'


def fetch_datav(adcode: str, full: bool = False):
    url = datav_url(adcode, full)
    print(f'Fetching DataV: {url}')
    return fetch_json(url, retries=3)


def build_lookup(elements):
    nodes = {}
    ways = {}
    relations = []
    for e in elements:
        t = e.get('type')
        if t == 'node':
            nodes[e['id']] = (e['lon'], e['lat'])
        elif t == 'way':
            ways[e['id']] = e.get('nodes', [])
        elif t == 'relation':
            relations.append(e)
    return nodes, ways, relations


def fetch_boundary(selector, name):
    print(f'Querying Overpass: {name} ...')
    data = overpass_query(selector)
    nodes, ways, relations = build_lookup(data.get('elements', []))
    for rel in relations:
        tags = rel.get('tags', {})
        if tags.get('name:zh') == name or tags.get('name') == name:
            geom = relation_to_geometry(rel, nodes, ways)
            if geom:
                return rel, geom
    # fallback: first administrative relation
    for rel in relations:
        tags = rel.get('tags', {})
        if tags.get('boundary') == 'administrative':
            geom = relation_to_geometry(rel, nodes, ways)
            if geom:
                return rel, geom
    return None, None


def fetch_towns_under_anduo():
    """查询安多县内所有 admin_level=8 的乡镇边界。"""
    print('Querying Overpass: towns under 安多县 ...')
    query = '''
    area["name:zh"="安多县"]->.anduo;
    (
      relation(area.anduo)["boundary"="administrative"]["admin_level"="8"];
    );
    out body;
    >;
    out skel qt;
    '''
    data = overpass_query(query)
    nodes, ways, relations = build_lookup(data.get('elements', []))
    towns = []
    for rel in relations:
        tags = rel.get('tags', {})
        geom = relation_to_geometry(rel, nodes, ways)
        if not geom:
            continue
        towns.append({
            'id': str(rel['id']),
            'name': tags.get('name:zh') or tags.get('name') or f"town_{rel['id']}",
            'tags': tags,
            'geometry': geom,
        })
    return towns


def make_feature(code, name, level, geometry, admin):
    return {
        'type': 'Feature',
        'properties': {
            'adcode': code,
            'name': name,
            'level': level,
            **admin,
        },
        'geometry': geometry,
    }


def write_feature_collection(path: Path, features, source_note=''):
    path.parent.mkdir(parents=True, exist_ok=True)
    # 同时把来源写入每个 feature 的 properties，方便下游工具直接识别
    if source_note:
        for f in features:
            props = f.setdefault('properties', {})
            if not props.get('source'):
                props['source'] = source_note
    fc = {
        'type': 'FeatureCollection',
        'features': features,
        'properties': {'source': source_note},
    }
    path.write_text(json.dumps(fc, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'  Wrote {path} ({len(features)} features)')


def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    TOWNS_DIR.mkdir(parents=True, exist_ok=True)

    downloaded = []
    failures = []
    all_features = []

    # 1. Province / prefecture / county from DataV (more accurate than OSM for these levels)
    for code, name, level, source in TARGETS:
        try:
            feat = None
            if source == 'datav':
                # For province full returns cities; use non-full for province itself.
                use_full = (level == 'county' and code == '540600')
                datav_fc = fetch_datav(code, full=use_full)
                features = datav_fc.get('features', [])
                if not features:
                    raise RuntimeError('Empty DataV response')
                if level == 'county' and code == '540600':
                    # 540600_full returns all districts/counties under Naqu; keep them as county-level.
                    for f in features:
                        props = f.get('properties', {})
                        props['province'] = '西藏自治区'
                        props['county'] = props.get('name', '')
                        props['town'] = ''
                        props['village'] = ''
                        props['level'] = 'county'
                    feat = make_feature(code, name, level, None, {})
                    # We will write the multi-feature collection directly.
                    out_path = OUTPUT_DIR / f'{code}_{name}.json'
                    write_feature_collection(out_path, features, source_note='DataV Atlas')
                    downloaded.append({
                        'level': level,
                        'code': code,
                        'name': name,
                        'path': str(out_path.relative_to(ROOT)),
                        'features': len(features),
                    })
                    all_features.extend(features)
                    continue
                else:
                    f = features[0]
                    props = f.get('properties', {})
                    admin = {'province': '', 'county': '', 'town': '', 'village': ''}
                    if level == 'province':
                        admin['province'] = name
                    elif level == 'county':
                        admin['province'] = '西藏自治区'
                        admin['county'] = name
                    feat = make_feature(code, name, level, f.get('geometry'), admin)
            else:
                rel, geom = fetch_boundary(source, name)
                if not geom:
                    raise RuntimeError('No geometry found')
                admin = {'province': '西藏自治区', 'county': name, 'town': '', 'village': ''}
                feat = make_feature(code, name, level, geom, admin)

            if feat:
                safe_name = name.replace('/', '-')
                out_path = OUTPUT_DIR / f'{code}_{safe_name}.json'
                write_feature_collection(out_path, [feat], source_note='DataV Atlas')
                downloaded.append({
                    'level': level,
                    'code': code,
                    'name': name,
                    'path': str(out_path.relative_to(ROOT)),
                    'features': 1,
                })
                all_features.append(feat)
            time.sleep(1)
        except Exception as exc:
            failures.append({'path': f'{code}_{name}', 'error': str(exc)})
            print(f'  Failed {name}: {exc}', file=sys.stderr)

    # 3. Towns from Overpass
    try:
        towns = fetch_towns_under_anduo()
        print(f'Found {len(towns)} towns')
        for t in towns:
            try:
                feat = make_feature(
                    t['id'],
                    t['name'],
                    'town',
                    t['geometry'],
                    admin={
                        'province': '西藏自治区',
                        'county': '安多县',
                        'town': t['name'],
                        'village': '',
                    },
                )
                safe_name = t['name'].replace('/', '-')
                out_path = TOWNS_DIR / f'{t["id"]}_{safe_name}.json'
                write_feature_collection(out_path, [feat], source_note='OpenStreetMap')
                downloaded.append({
                    'level': 'town',
                    'code': t['id'],
                    'name': t['name'],
                    'path': str(out_path.relative_to(ROOT)),
                    'features': 1,
                })
                all_features.append(feat)
            except Exception as exc:
                failures.append({'path': f'town_{t["id"]}', 'error': str(exc)})
                print(f'  Failed town {t["name"]}: {exc}', file=sys.stderr)
    except Exception as exc:
        failures.append({'path': 'towns', 'error': str(exc)})
        print(f'  Failed fetching towns: {exc}', file=sys.stderr)

    # 4. Combined file
    try:
        if all_features:
            combined_path = OUTPUT_DIR / 'anduo_all_levels.json'
            write_feature_collection(combined_path, all_features, source_note='Mixed (DataV + OSM)')
            downloaded.append({
                'level': 'combined',
                'code': 'anduo_all',
                'name': '安多县全层级合并',
                'path': str(combined_path.relative_to(ROOT)),
                'features': len(all_features),
            })
    except Exception as exc:
        failures.append({'path': 'anduo_all_levels.json', 'error': str(exc)})
        print(f'  Failed combined file: {exc}', file=sys.stderr)

    # 4. Write index & README
    index = {
        'source': 'OpenStreetMap / Overpass API',
        'generated_by': 'scripts/download-anduo-town-boundaries.py',
        'downloaded_count': len(downloaded),
        'failure_count': len(failures),
        'downloaded': downloaded,
        'failures': failures,
    }
    INDEX_PATH.write_text(json.dumps(index, ensure_ascii=False, indent=2), encoding='utf-8')

    README_PATH.write_text(f'''# 安多县行政区边界数据

数据来源：
- `540000_西藏自治区.json`：`DataV Atlas`
- `540600_那曲市.json`、`540624_安多县.json`、`towns/*.json`：`OpenStreetMap`（通过 Overpass API）

本目录由脚本 `scripts/download-anduo-town-boundaries.py` 生成。

## 文件说明

- `540000_西藏自治区.json`：省级边界
- `540600_那曲市.json`：地市级边界
- `540624_安多县.json`：县级边界
- `towns/*.json`：各乡镇边界（admin_level=8）
- `anduo_all_levels.json`：省 / 市 / 县 / 乡镇 合并文件，可直接导入应用

## 当前下载结果

- 成功文件数：{len(downloaded)}
- 失败文件数：{len(failures)}

## 使用方式

1. 启动应用后点击侧栏「📚 加载本地边界库」。
2. 选择 `anduo_all_levels.json` 导入。
3. 或在「🗺️ 导入边界」中手动选择单个 `.json` 文件。

> 注意：OSM 边界由社区维护，精度可能不如官方测绘数据，使用时请核对。
''', encoding='utf-8')

    print('\nDone.')
    print(f'Success: {len(downloaded)} files')
    print(f'Failures: {len(failures)} files')
    print(f'Index: {INDEX_PATH}')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='下载安多县及下属乡镇 OSM 边界')
    parser.add_argument('--no-verify-ssl', action='store_true', help='禁用 SSL 证书验证（不推荐）')
    args = parser.parse_args()
    if args.no_verify_ssl:
        SSL_CONTEXT.check_hostname = False
        SSL_CONTEXT.verify_mode = ssl.CERT_NONE
    main()
