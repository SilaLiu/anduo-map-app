#!/usr/bin/env python3
"""使用 Scrapling 抓取最新地图/行政区边界数据。

本脚本复用项目已有的数据源，但把 urllib 换成 Scrapling 的 Fetcher，
获得以下好处：
- 浏览器级 TLS/HTTP 指纹伪装，降低被拦截概率
- 内置重试、会话保持、Cookie 管理
- 未来如需抓取 HTML 页面或反爬站点，可直接升级 StealthyFetcher

输出目录结构与现有脚本保持一致：
    data/admin-geojson/
      national/100000.json
      province/<code>.json
      xizang/anduo/
        540000_西藏自治区.json
        540600_那曲市.json
        540624_安多县.json
        towns/<id>_<name>.json
        anduo_all_levels.json
"""
import argparse
import json
import sys
import time
from pathlib import Path

from scrapling.fetchers import FetcherSession

ROOT = Path(__file__).resolve().parent.parent
OUTPUT_DIR = ROOT / 'data' / 'admin-geojson'
NATIONAL_DIR = OUTPUT_DIR / 'national'
PROVINCE_DIR = OUTPUT_DIR / 'province'
ANDUO_DIR = OUTPUT_DIR / 'xizang' / 'anduo'
ANDUO_TOWNS_DIR = ANDUO_DIR / 'towns'

GEOJSON_CN_BASE = 'https://geojson.cn/api/china'
DATAV_BASE = 'https://geo.datav.aliyun.com/areas_v3/bound'
OVERPASS_URL = 'https://overpass-api.de/api/interpreter'

DIRECT_CITIES = {'110000', '120000', '310000', '500000'}

ANDUO_TARGETS = [
    ('540000', '西藏自治区', 'province'),
    ('540600', '那曲市', 'county'),
    ('540624', '安多县', 'county'),
]


def write_json(path: Path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')


def fetch_json(fetcher: FetcherSession, url: str, method: str = 'GET', data: bytes = None,
               retries: int = 3, manual_redirect: bool = False):
    """使用 Scrapling FetcherSession 获取 JSON，带重试；manual_redirect 用于绕过 curl SSRF 保护。"""
    last_err = None
    for attempt in range(retries):
        try:
            if method.upper() == 'POST':
                page = fetcher.post(url, data=data)
            else:
                page = fetcher.get(url, follow_redirects=not manual_redirect)
            # 手动跟随重定向（针对 geojson.cn 等被 curl SSRF 保护的站点）
            if manual_redirect and page.status in (301, 302, 307, 308):
                location = page.headers.get('location')
                if location:
                    return fetch_json(fetcher, location, method='GET', retries=1, manual_redirect=False)
            return page.json()
        except Exception as exc:
            last_err = exc
            wait = min(2 ** attempt, 30)
            print(f'  Retry {attempt + 1}/{retries} after {wait}s: {exc}', file=sys.stderr)
            time.sleep(wait)
    raise last_err


def fetch_geojson_cn_meta(fetcher: FetcherSession):
    url = f'{GEOJSON_CN_BASE}/_meta.json'
    print(f'Fetching {url}')
    return fetch_json(fetcher, url, manual_redirect=True)


def fetch_geojson_cn_boundary(fetcher: FetcherSession, code: str):
    url = f'{GEOJSON_CN_BASE}/{code}.json'
    print(f'Fetching {url}')
    data = fetch_json(fetcher, url, manual_redirect=True)
    if not isinstance(data, dict) or data.get('type') != 'FeatureCollection':
        raise RuntimeError(f'Unexpected response: {data!r}')
    return data


def fetch_datav_boundary(fetcher: FetcherSession, adcode: str, full: bool = False):
    suffix = '_full' if full else ''
    url = f'{DATAV_BASE}/{adcode}{suffix}.json'
    print(f'Fetching {url}')
    return fetch_json(fetcher, url)


def overpass_query(fetcher: FetcherSession, query: str):
    body = f'[out:json][timeout:120];\n{query}\nout body;\n>;\nout skel qt;'.encode('utf-8')
    return fetch_json(fetcher, OVERPASS_URL, method='POST', data=body)


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


def way_coords(way_id, nodes, ways):
    return [[float(lon), float(lat)] for lon, lat in (nodes.get(nid) for nid in ways.get(way_id, [])) if lon and lat]


def point_in_polygon(point, ring):
    x, y = point
    inside = False
    j = len(ring) - 1
    for i in range(len(ring)):
        xi, yi = ring[i]
        xj, yj = ring[j]
        if ((yi > y) != (yj > y)) and (x < (xj - xi) * (y - yi) / (yj - yi + 1e-12) + xi):
            inside = not inside
        j = i
    return inside


def assemble_polygon(rings):
    rings = [r for r in rings if len(r) >= 4]
    if not rings:
        return None
    closed = []
    for r in rings:
        if r[0] != r[-1]:
            r = r + [r[0]]
        closed.append(r)
    if len(closed) == 1:
        return {'type': 'Polygon', 'coordinates': closed}
    return {'type': 'MultiPolygon', 'coordinates': [[r] for r in closed]}


def relation_to_geometry(relation, nodes, ways):
    members = relation.get('members', [])
    outer_rings = []
    inner_rings = []
    current_outer = []

    for m in members:
        if m.get('type') != 'way':
            continue
        role = m.get('role', '')
        coords = way_coords(m['ref'], nodes, ways)
        if not coords:
            continue
        if role == 'outer':
            if current_outer and coords[0] != current_outer[-1]:
                outer_rings.append(current_outer)
                current_outer = coords
            elif current_outer:
                current_outer.extend(coords[1:] if coords[0] == current_outer[-1] else coords)
            else:
                current_outer = coords
        elif role == 'inner':
            inner_rings.append(coords)

    if current_outer:
        outer_rings.append(current_outer)
    if not outer_rings:
        return None

    polygons = []
    for outer in outer_rings:
        outer_closed = outer if outer[0] == outer[-1] else outer + [outer[0]]
        holes = [h for h in inner_rings if point_in_polygon(h[0], outer_closed)]
        polygons.append([outer_closed] + holes)

    if len(polygons) == 1:
        return {'type': 'Polygon', 'coordinates': polygons[0]}
    return {'type': 'MultiPolygon', 'coordinates': [[p[0]] + p[1:] for p in polygons]}


def fetch_anduo_towns(fetcher: FetcherSession):
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
    data = overpass_query(fetcher, query)
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
        'properties': {'adcode': code, 'name': name, 'level': level, **admin},
        'geometry': geometry,
    }


def write_feature_collection(path: Path, features, source_note=''):
    path.parent.mkdir(parents=True, exist_ok=True)
    fc = {'type': 'FeatureCollection', 'features': features, 'properties': {'source': source_note}}
    path.write_text(json.dumps(fc, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'  Wrote {path} ({len(features)} features)')


def fetch_national_and_provinces(fetcher: FetcherSession):
    NATIONAL_DIR.mkdir(parents=True, exist_ok=True)
    PROVINCE_DIR.mkdir(parents=True, exist_ok=True)

    meta = fetch_geojson_cn_meta(fetcher)
    write_json(OUTPUT_DIR / 'meta.json', meta)

    files = meta.get('files', [])
    if not files:
        raise RuntimeError('Metadata has no files tree')

    provinces = files[0].get('children', [])
    downloaded = []
    failures = []

    try:
        national = fetch_geojson_cn_boundary(fetcher, '100000')
        national_path = NATIONAL_DIR / '100000.json'
        write_json(national_path, national)
        downloaded.append({
            'level': 'national', 'code': '100000', 'name': '中华人民共和国',
            'path': str(national_path.relative_to(ROOT)),
            'features': len(national.get('features', [])),
        })
    except Exception as exc:
        failures.append({'path': '100000', 'error': str(exc)})
        print(f'  Failed national 100000: {exc}', file=sys.stderr)

    for province in provinces:
        code = province.get('filename')
        name = province.get('name', code)
        if not code:
            continue
        try:
            data = fetch_geojson_cn_boundary(fetcher, code)
            out_path = PROVINCE_DIR / f'{code}.json'
            write_json(out_path, data)
            level_note = 'direct-controlled county/district' if code in DIRECT_CITIES else 'city'
            downloaded.append({
                'level': 'province', 'code': code, 'name': name, 'child_level': level_note,
                'path': str(out_path.relative_to(ROOT)),
                'features': len(data.get('features', [])),
            })
        except Exception as exc:
            failures.append({'path': code, 'name': name, 'error': str(exc)})
            print(f'  Failed province {name} ({code}): {exc}', file=sys.stderr)

    return downloaded, failures


def fetch_anduo_boundaries(fetcher: FetcherSession):
    ANDUO_DIR.mkdir(parents=True, exist_ok=True)
    ANDUO_TOWNS_DIR.mkdir(parents=True, exist_ok=True)

    downloaded = []
    failures = []
    all_features = []

    for code, name, level in ANDUO_TARGETS:
        try:
            use_full = (level == 'county' and code == '540600')
            datav_fc = fetch_datav_boundary(fetcher, code, full=use_full)
            features = datav_fc.get('features', [])
            if not features:
                raise RuntimeError('Empty DataV response')

            if level == 'county' and code == '540600':
                for f in features:
                    props = f.get('properties', {})
                    props['province'] = '西藏自治区'
                    props['county'] = props.get('name', '')
                    props['town'] = ''
                    props['village'] = ''
                    props['level'] = 'county'
                out_path = ANDUO_DIR / f'{code}_{name}.json'
                write_feature_collection(out_path, features, source_note='DataV Atlas')
                downloaded.append({
                    'level': level, 'code': code, 'name': name,
                    'path': str(out_path.relative_to(ROOT)),
                    'features': len(features),
                })
                all_features.extend(features)
                continue

            f = features[0]
            admin = {'province': '', 'county': '', 'town': '', 'village': ''}
            if level == 'province':
                admin['province'] = name
            elif level == 'county':
                admin['province'] = '西藏自治区'
                admin['county'] = name

            feat = make_feature(code, name, level, f.get('geometry'), admin)
            safe_name = name.replace('/', '-')
            out_path = ANDUO_DIR / f'{code}_{safe_name}.json'
            write_feature_collection(out_path, [feat], source_note='DataV Atlas')
            downloaded.append({
                'level': level, 'code': code, 'name': name,
                'path': str(out_path.relative_to(ROOT)),
                'features': 1,
            })
            all_features.append(feat)
            time.sleep(0.5)
        except Exception as exc:
            failures.append({'path': f'{code}_{name}', 'error': str(exc)})
            print(f'  Failed {name}: {exc}', file=sys.stderr)

    try:
        towns = fetch_anduo_towns(fetcher)
        print(f'Found {len(towns)} towns')
        for t in towns:
            try:
                feat = make_feature(
                    t['id'], t['name'], 'town', t['geometry'],
                    admin={'province': '西藏自治区', 'county': '安多县', 'town': t['name'], 'village': ''},
                )
                safe_name = t['name'].replace('/', '-')
                out_path = ANDUO_TOWNS_DIR / f'{t["id"]}_{safe_name}.json'
                write_feature_collection(out_path, [feat], source_note='OpenStreetMap')
                downloaded.append({
                    'level': 'town', 'code': t['id'], 'name': t['name'],
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

    if all_features:
        combined_path = ANDUO_DIR / 'anduo_all_levels.json'
        write_feature_collection(combined_path, all_features, source_note='Mixed (DataV + OSM)')
        downloaded.append({
            'level': 'combined', 'code': 'anduo_all', 'name': '安多县全层级合并',
            'path': str(combined_path.relative_to(ROOT)),
            'features': len(all_features),
        })

    return downloaded, failures


def main():
    parser = argparse.ArgumentParser(description='使用 Scrapling 抓取最新地图/行政区边界数据')
    parser.add_argument('--scope', choices=['china', 'anduo', 'all'], default='all',
                        help='抓取范围：china=全国+省，anduo=安多县，all=全部')
    parser.add_argument('--impersonate', default='chrome',
                        help='TLS/HTTP 指纹伪装（如 chrome, firefox, safari）')
    parser.add_argument('--timeout', type=int, default=60,
                        help='单次请求超时（秒）')
    args = parser.parse_args()

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    all_downloaded = []
    all_failures = []

    # 使用 Scrapling FetcherSession，开启浏览器指纹伪装与会话保持
    # 对 API 站点关闭 stealthy_headers，避免带 google.com 来源 referer 被拦截
    with FetcherSession(
        impersonate=args.impersonate,
        timeout=args.timeout,
        stealthy_headers=False,
        headers={'User-Agent': 'anduo-map-app/1.0'},
        retries=3,
    ) as fetcher:
        if args.scope in ('china', 'all'):
            print('\n=== 全国 + 省级边界（geojson.cn）===')
            downloaded, failures = fetch_national_and_provinces(fetcher)
            all_downloaded.extend(downloaded)
            all_failures.extend(failures)

        if args.scope in ('anduo', 'all'):
            print('\n=== 安多县边界（DataV + Overpass）===')
            downloaded, failures = fetch_anduo_boundaries(fetcher)
            all_downloaded.extend(downloaded)
            all_failures.extend(failures)

    index = {
        'source': 'geojson.cn / DataV Atlas / OpenStreetMap via Scrapling',
        'generated_by': 'scripts/fetch_map_data_scrapling.py',
        'scope': args.scope,
        'impersonate': args.impersonate,
        'downloaded_count': len(all_downloaded),
        'failure_count': len(all_failures),
        'downloaded': all_downloaded,
        'failures': all_failures,
    }
    write_json(OUTPUT_DIR / 'index.json', index)

    print('\nDone.')
    print(f'Success: {len(all_downloaded)} files')
    print(f'Failures: {len(all_failures)} files')
    print(f'Index: {OUTPUT_DIR / "index.json"}')

    if all_failures:
        sys.exit(1)


if __name__ == '__main__':
    main()
