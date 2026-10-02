#!/usr/bin/env python3
"""为安多县沙盘制作需求生成可导入地图应用的 GeoJSON 标注。

数据来源：
- 需求清单：data/sandtable-requirements.json
- 乡镇边界：data/admin-geojson/xizang/anduo/towns/*.json
- 乡镇中心点：data/admin-geojson/xizang/anduo/town_centers.json
- 坐标补全：OpenStreetMap / Overpass API

输出目录：data/sandtable-geojson/
"""
import argparse
import json
import ssl
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

try:
    from difflib import SequenceMatcher
except Exception:
    SequenceMatcher = None

ROOT = Path(__file__).resolve().parent.parent
REQUIREMENTS_PATH = ROOT / 'data' / 'sandtable-requirements.json'
TOWNS_DIR = ROOT / 'data' / 'admin-geojson' / 'xizang' / 'anduo' / 'towns'
TOWN_CENTERS_PATH = ROOT / 'data' / 'admin-geojson' / 'xizang' / 'anduo' / 'town_centers.json'
OUTPUT_DIR = ROOT / 'data' / 'sandtable-geojson'
CACHE_DIR = OUTPUT_DIR / '.cache'

OVERPASS_URL = 'https://overpass-api.de/api/interpreter'
NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search'


def cache_path(key: str):
    return CACHE_DIR / f'{key}.json'


def load_cache(key: str, max_age_days: int = 7):
    if args.fresh:
        return None
    path = cache_path(key)
    if not path.exists():
        return None
    try:
        mtime = path.stat().st_mtime
        age_days = (time.time() - mtime) / 86400
        if age_days > max_age_days:
            return None
        return json.loads(path.read_text(encoding='utf-8'))
    except Exception:
        return None


def save_cache(key: str, data):
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cache_path(key).write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')

parser = argparse.ArgumentParser(description='生成安多县沙盘 GeoJSON 标注')
parser.add_argument('--no-verify-ssl', action='store_true', help='禁用 SSL 证书验证（不推荐）')
parser.add_argument('--skip-osm', action='store_true', help='跳过 OSM 查询，仅生成本地已知数据（towns）')
parser.add_argument('--sleep', type=float, default=1.0, help='Overpass 查询间隔秒数（默认 1）')
parser.add_argument('--only', help='逗号分隔类别（towns,villages,roads,rivers,lakes,mountains,temples），仅重跑这些类别，其余保留现有输出')
parser.add_argument('--fresh', action='store_true', help='忽略本地缓存，强制重新查询')
args = parser.parse_args()

SSL_CONTEXT = ssl.create_default_context()
if args.no_verify_ssl:
    SSL_CONTEXT.check_hostname = False
    SSL_CONTEXT.verify_mode = ssl.CERT_NONE
else:
    try:
        import certifi
        SSL_CONTEXT.load_verify_locations(certifi.where())
    except Exception:
        pass


def fetch_json(url: str, data: bytes = None, method: str = 'GET', retries: int = 3, timeout: int = 120):
    last_err = None
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, data=data, headers={
                'User-Agent': 'anduo-map-app/1.0',
                'Content-Type': 'text/plain' if data else '',
            }, method=method)
            with urllib.request.urlopen(req, context=SSL_CONTEXT, timeout=timeout) as resp:
                return json.load(resp)
        except Exception as exc:
            last_err = exc
            print(f'  Retry {attempt + 1}/{retries}: {exc}', file=sys.stderr)
            time.sleep(min(30 * (attempt + 1), 90))
    raise last_err


def overpass_query(query: str):
    body = f'[out:json][timeout:120];\n{query}\nout body;\n>;\nout skel qt;'
    return fetch_json(OVERPASS_URL, data=body.encode('utf-8'), method='POST', retries=3)


def build_lookup(elements):
    """构建 node/way/relation 查找表；ways 同时保存节点列表和 tags。"""
    nodes = {}
    ways = {}
    relations = []
    for e in elements:
        t = e.get('type')
        if t == 'node':
            nodes[e['id']] = (e['lon'], e['lat'])
        elif t == 'way':
            ways[e['id']] = {'nodes': e.get('nodes', []), 'tags': e.get('tags', {})}
        elif t == 'relation':
            relations.append(e)
    return nodes, ways, relations


def way_coords(way_id, nodes, ways):
    nds = ways.get(way_id, {}).get('nodes', [])
    coords = []
    for nid in nds:
        pt = nodes.get(nid)
        if pt:
            coords.append([float(pt[0]), float(pt[1])])
    return coords


def relation_to_geometry(relation, nodes, ways):
    members = relation.get('members', [])
    outer_rings = []
    inner_rings = []
    current_outer = []

    def close_ring(ring):
        if not ring:
            return ring
        if ring[0] != ring[-1]:
            ring = ring + [ring[0]]
        return ring

    def point_in_ring(point, ring):
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

    for m in members:
        if m.get('type') != 'way':
            continue
        role = m.get('role', '')
        coords = way_coords(m['ref'], nodes, ways)
        if not coords:
            continue
        if role == 'outer':
            if current_outer and current_outer[-1] == coords[0]:
                current_outer.extend(coords[1:])
            elif current_outer:
                outer_rings.append(close_ring(current_outer))
                current_outer = coords
            else:
                current_outer = coords
        elif role == 'inner':
            inner_rings.append(coords)

    if current_outer:
        outer_rings.append(close_ring(current_outer))

    outer_rings = [r for r in outer_rings if len(r) >= 4]
    if not outer_rings:
        return None

    polygons = []
    for outer in outer_rings:
        holes = [close_ring(h) for h in inner_rings if point_in_ring(h[0], outer)]
        polygons.append([outer] + holes)

    if len(polygons) == 1:
        return {'type': 'Polygon', 'coordinates': polygons[0]}
    return {'type': 'MultiPolygon', 'coordinates': polygons}


def point_in_polygon(point, polygon):
    """point: [lon, lat], polygon: [[lon,lat], ...]"""
    x, y = point
    inside = False
    j = len(polygon) - 1
    for i in range(len(polygon)):
        xi, yi = polygon[i]
        xj, yj = polygon[j]
        if ((yi > y) != (yj > y)) and (x < (xj - xi) * (y - yi) / (yj - yi + 1e-12) + xi):
            inside = not inside
        j = i
    return inside


def geometry_contains_point(geometry, point):
    if geometry['type'] == 'Polygon':
        return point_in_polygon(point, geometry['coordinates'][0])
    if geometry['type'] == 'MultiPolygon':
        return any(point_in_polygon(point, poly[0]) for poly in geometry['coordinates'])
    return False


def load_requirements():
    return json.loads(REQUIREMENTS_PATH.read_text(encoding='utf-8'))


def load_town_boundaries():
    boundaries = {}
    for path in sorted(TOWNS_DIR.glob('*.json')):
        data = json.loads(path.read_text(encoding='utf-8'))
        for f in data.get('features', []):
            props = f.get('properties', {})
            name = props.get('name') or props.get('town')
            geom = f.get('geometry')
            if name and geom:
                boundaries[name] = geom
    return boundaries


def load_town_centers():
    return json.loads(TOWN_CENTERS_PATH.read_text(encoding='utf-8'))


COUNTY_BOUNDARY_PATH = ROOT / 'data' / 'admin-geojson' / 'xizang' / 'anduo' / '540624_安多县.json'


def load_county_boundary():
    """加载安多县县界几何，用于 gazetteer 坐标包含校验。失败返回 None。"""
    try:
        data = json.loads(COUNTY_BOUNDARY_PATH.read_text(encoding='utf-8'))
        features = data.get('features', [])
        if features:
            return features[0].get('geometry')
    except Exception as exc:
        print(f'  Failed to load county boundary: {exc}', file=sys.stderr)
    return None


# 需求名 → OSM/Nominatim 备选名（中文别写 + 拼音/英文），逐个重试提高命中率
ALT_NAMES = {
    '唐古拉山垭口': ['唐古拉山口', '唐古拉垭口', 'Tanggula Pass', 'Tangla Pass'],
    '各拉丹东雪山': ['各拉丹冬', '各拉丹冬峰', '格拉丹东', 'Geladaindong', 'Gladaindong'],
    '唐古拉山': ['唐古拉山脉', 'Tanggula Mountains', 'Tanggula Shan'],
    '可可西里山': ['可可西里山脉', 'Hoh Xil', 'Kekexili'],
    '祖尔肯乌拉山': ['祖尔肯乌拉山脉', 'Zhuerken Wula'],
    '岗加巧巴': ['岗加巧巴峰', '冈加巧巴'],
    '托尔久山': ['托尔久', '托尔久峰'],
    '帕曲': ['帕曲河', 'Pa Qu', 'Pagqu'],
    '拉日曲': ['拉日曲河', 'Lari Qu'],
    '雪琼寺': ['雪穷寺', '雪琼贡巴'],
}


# OSM/Nominatim 全部失败后的兜底坐标（公开资料核对的代表点）。
# 山脉类跨县界，坐标为县境附近代表点；统一 needs_review=True，前端显示"估算·待核对"。
GAZETTEER = {
    ('mountain', '唐古拉山垭口'): {'lon': 91.929, 'lat': 32.859, 'ele': 5231, 'ref': 'G109 青藏公路唐古拉山口'},
    ('mountain', '各拉丹东雪山'): {'lon': 91.006, 'lat': 33.409, 'ele': 6621, 'ref': '长江正源，唐古拉山脉主峰'},
    ('mountain', '唐古拉山'): {'lon': 92.0, 'lat': 33.0, 'ele': None, 'ref': '山脉，取县境内代表点'},
    ('mountain', '可可西里山'): {'lon': 90.6, 'lat': 33.95, 'ele': None, 'ref': '山脉，取县境西北代表点'},
    ('mountain', '祖尔肯乌拉山'): {'lon': 90.75, 'lat': 33.75, 'ele': None, 'ref': '山脉，取县境北部代表点'},
}


def get_alt_names(name, *suffix_variants):
    """需求名 + 常见后缀变体 + ALT_NAMES 备选名。"""
    names = [name]
    names.extend(suffix_variants)
    names.extend(ALT_NAMES.get(name, []))
    return names


def gazetteer_fallback(category, name, county_boundary):
    """gazetteer 兜底：返回 (point, entry) 或 (None, None)。县界外的点保留但打标。"""
    entry = GAZETTEER.get((category, name))
    if not entry:
        return None, None
    point = [entry['lon'], entry['lat']]
    entry = dict(entry)
    entry['outside_county'] = bool(county_boundary) and not geometry_contains_point(county_boundary, point)
    return point, entry


def write_geojson(path: Path, features, properties=None):
    path.parent.mkdir(parents=True, exist_ok=True)
    fc = {
        'type': 'FeatureCollection',
        'features': features,
    }
    if properties:
        fc['properties'] = properties
    path.write_text(json.dumps(fc, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'  Wrote {path} ({len(features)} features)')


def normalize_name(name):
    if not name:
        return ''
    return str(name).strip().replace(' ', '').replace('　', '')


def name_matches(tags, candidate_names, min_ratio=0.6):
    """检查 OSM tags 是否匹配任一候选名称（支持 name, name:zh, alt_name, loc_name, ref）。
    先尝试子串匹配，再使用编辑比例兜底。"""
    keys = ['name:zh', 'name', 'alt_name', 'loc_name', 'ref']
    osm_names = [normalize_name(tags.get(k)) for k in keys if tags.get(k)]
    for cand in candidate_names:
        cand_norm = normalize_name(cand)
        if not cand_norm:
            continue
        for osm_name in osm_names:
            # 子串匹配
            if cand_norm in osm_name or osm_name in cand_norm:
                return True
            # 模糊匹配（处理“措玛” vs “措玛村”等）
            if SequenceMatcher and len(cand_norm) >= 2 and len(osm_name) >= 2:
                ratio = SequenceMatcher(None, cand_norm, osm_name).ratio()
                if ratio >= min_ratio:
                    return True
    return False


def boundary_bbox(geometry):
    """返回边界 [min_lon, min_lat, max_lon, max_lat]。"""
    if geometry['type'] == 'Polygon':
        coords = geometry['coordinates'][0]
    else:
        coords = []
        for poly in geometry['coordinates']:
            coords.extend(poly[0])
    if not coords:
        return None
    lons = [c[0] for c in coords]
    lats = [c[1] for c in coords]
    return [min(lons), min(lats), max(lons), max(lats)]


def find_point_in_boundary(boundary, seed_point, index, max_attempts=200):
    """在乡镇边界内找一个确定在内部的点。优先用 seed，否则在 bbox 内按网格采样。"""
    if boundary and geometry_contains_point(boundary, seed_point):
        return seed_point
    if not boundary:
        return seed_point
    bbox = boundary_bbox(boundary)
    if not bbox:
        return seed_point
    min_lon, min_lat, max_lon, max_lat = bbox
    width = max_lon - min_lon
    height = max_lat - min_lat
    center = [(min_lon + max_lon) / 2, (min_lat + max_lat) / 2]
    # 螺旋向外采样
    for attempt in range(max_attempts):
        t = attempt / max_attempts
        angle = attempt * 2.39996  # 黄金角
        radius = t * 0.5
        dx = width * 0.5 * radius * (1 if attempt % 2 == 0 else -1)
        dy = height * 0.5 * radius * (1 if attempt % 2 == 1 else -1)
        pt = [center[0] + dx, center[1] + dy]
        if geometry_contains_point(boundary, pt):
            return pt
    return seed_point


def safe_nominatim_search(name: str, context: str = '安多县 西藏'):
    """带速率限制的 Nominatim 查询。"""
    q = urllib.parse.quote(f'{name} {context}')
    url = f'{NOMINATIM_URL}?q={q}&format=json&limit=1&accept-language=zh-CN'
    try:
        data = fetch_json(url, method='GET', retries=2, timeout=30)
        time.sleep(1.0)  # Nominatim 使用政策要求限速
        if data:
            return {
                'lon': float(data[0]['lon']),
                'lat': float(data[0]['lat']),
                'display_name': data[0].get('display_name', ''),
            }
    except Exception as exc:
        print(f'  Nominatim failed for {name}: {exc}', file=sys.stderr)
    return None


def nominatim_search_multi(names):
    """按备选名逐个查询 Nominatim，命中即返回。"""
    for n in names:
        result = safe_nominatim_search(n)
        if result:
            return result
    return None


def query_nodes_in_anduo(filter_tag: str, cache_key: str = None):
    """查询安多县范围内满足 filter_tag 的所有 node，支持缓存。"""
    if cache_key:
        cached = load_cache(cache_key)
        if cached is not None:
            print(f'  Using cached {cache_key}')
            return cached
    query = f'''
    area["name:zh"="安多县"]->.anduo;
    (
      node(area.anduo){filter_tag};
    );
    out body;
    '''
    data = overpass_query(query)
    results = []
    for e in data.get('elements', []):
        if e.get('type') != 'node':
            continue
        results.append({
            'id': e['id'],
            'lon': e['lon'],
            'lat': e['lat'],
            'tags': e.get('tags', {}),
        })
    if cache_key:
        save_cache(cache_key, results)
    return results


def query_ways_relations_in_anduo(filter_tag: str, cache_key: str = None):
    """查询安多县范围内满足 filter_tag 的 way 和 relation，支持缓存。"""
    if cache_key:
        cached = load_cache(cache_key)
        if cached is not None:
            print(f'  Using cached {cache_key}')
            return cached
    query = f'''
    area["name:zh"="安多县"]->.anduo;
    (
      way(area.anduo){filter_tag};
      relation(area.anduo){filter_tag};
    );
    out body;
    >;
    out skel qt;
    '''
    data = overpass_query(query)
    nodes, ways, relations = build_lookup(data.get('elements', []))
    results = []
    for wid, wdata in ways.items():
        coords = way_coords(wid, nodes, ways)
        if len(coords) < 2:
            continue
        tags = wdata.get('tags', {})
        geom_type = 'LineString'
        if coords[0] == coords[-1] and len(coords) >= 4:
            geom_type = 'Polygon'
        results.append({
            'id': wid,
            'type': 'way',
            'tags': tags,
            'geometry': {'type': geom_type, 'coordinates': coords if geom_type == 'LineString' else [coords]},
        })
    for rel in relations:
        geom = relation_to_geometry(rel, nodes, ways)
        if geom:
            results.append({
                'id': rel['id'],
                'type': 'relation',
                'tags': rel.get('tags', {}),
                'geometry': geom,
            })
    if cache_key:
        save_cache(cache_key, results)
    return results


# ═══════════════════════════════════════════════════
#  各要素生成函数
# ═══════════════════════════════════════════════════


def generate_towns(req, town_centers):
    features = []
    county = req.get('county', {})
    for town in req.get('towns', []):
        name = town['name']
        coords = town_centers.get(name)
        if not coords:
            print(f'  Warning: no center for town {name}', file=sys.stderr)
            continue
        features.append({
            'type': 'Feature',
            'geometry': {'type': 'Point', 'coordinates': coords},
            'properties': {
                'name': name,
                'category': 'town',
                'town_type': town.get('type', ''),
                'boundary_light': town.get('boundary_light', ''),
                'building_light': town.get('building_light', False),
                'sign': town.get('sign', False),
                'is_county_seat': town.get('is_county_seat', False) or name == county.get('county_seat', {}).get('town'),
                'note': town.get('remark', ''),
                'province': '西藏自治区',
                'county': '安多县',
                'town': name,
                'village': '',
                'level': 'town',
                'source': 'sandtable-requirements + town_centers.json',
            },
        })
    return features


def generate_villages(req, town_boundaries, town_centers):
    features = []
    missing = []

    # 一次性查询安多县内所有 village/hamlet 节点
    print('Querying OSM for villages/hamlets in 安多县 ...')
    nodes = []
    try:
        nodes = query_nodes_in_anduo('["place"~"village|hamlet"]', cache_key='village_nodes')
        print(f'  Found {len(nodes)} OSM village/hamlet nodes')
    except Exception as exc:
        print(f'  OSM village query failed: {exc}', file=sys.stderr)
        print('  Falling back to Nominatim + boundary placement for all villages.', file=sys.stderr)

    for town in req.get('towns', []):
        town_name = town['name']
        boundary = town_boundaries.get(town_name)
        known = town.get('villages_known', [])
        unknown_count = town.get('villages_unknown', 0)
        seed = town_centers.get(town_name, [91.5, 32.5])
        fallback_count = 0

        for idx, vname in enumerate(known):
            matched = None
            for n in nodes:
                if name_matches(n['tags'], [vname, f'{vname}村']):
                    point = [n['lon'], n['lat']]
                    if boundary and not geometry_contains_point(boundary, point):
                        continue
                    matched = n
                    break

            if matched:
                features.append({
                    'type': 'Feature',
                    'geometry': {'type': 'Point', 'coordinates': [matched['lon'], matched['lat']]},
                    'properties': {
                        'name': vname,
                        'category': 'village',
                        'light': False,
                        'sign': True,
                        'note': '行政村只做标牌不亮灯',
                        'province': '西藏自治区',
                        'county': '安多县',
                        'town': town_name,
                        'village': vname,
                        'level': 'village',
                        'source': 'OpenStreetMap',
                        'osm_id': matched['id'],
                    },
                })
                continue

            # 兜底 1：Nominatim 地理编码
            nmt = safe_nominatim_search(vname)
            if nmt and boundary and geometry_contains_point(boundary, [nmt['lon'], nmt['lat']]):
                features.append({
                    'type': 'Feature',
                    'geometry': {'type': 'Point', 'coordinates': [nmt['lon'], nmt['lat']]},
                    'properties': {
                        'name': vname,
                        'category': 'village',
                        'light': False,
                        'sign': True,
                        'note': '行政村只做标牌不亮灯（Nominatim 估算）',
                        'province': '西藏自治区',
                        'county': '安多县',
                        'town': town_name,
                        'village': vname,
                        'level': 'village',
                        'source': 'Nominatim',
                    },
                })
                continue

            # 兜底 2：在乡镇边界内分配一个占位点
            fallback_count += 1
            point = find_point_in_boundary(boundary, seed, fallback_count)
            features.append({
                'type': 'Feature',
                'geometry': {'type': 'Point', 'coordinates': point},
                'properties': {
                    'name': vname,
                    'category': 'village',
                    'light': False,
                    'sign': True,
                    'note': '行政村只做标牌不亮灯（边界内估算位置，待人工核对）',
                    'province': '西藏自治区',
                    'county': '安多县',
                    'town': town_name,
                    'village': vname,
                    'level': 'village',
                    'source': 'derived',
                    'needs_review': True,
                },
            })
            missing.append({'town': town_name, 'name': vname, 'category': 'village', 'reason': 'OSM/Nominatim 未匹配，已生成边界内占位点'})

        for i in range(unknown_count):
            missing.append({'town': town_name, 'name': f'未知行政村{i+1}', 'category': 'village', 'reason': '名称待补充'})

    return features, missing


def generate_roads(req):
    features = []
    missing = []
    targets = req.get('roads', [])
    if not targets:
        return features, missing

    print('Querying OSM for roads in 安多县 ...')
    items = query_ways_relations_in_anduo('["highway"~"motorway|trunk|primary|secondary|tertiary|residential|track|unclassified"]', cache_key='roads')
    print(f'  Found {len(items)} OSM highway features')

    print('Querying OSM for railway in 安多县 ...')
    railway_items = query_ways_relations_in_anduo('["railway"="rail"]', cache_key='railway')
    print(f'  Found {len(railway_items)} OSM railway features')
    items.extend(railway_items)

    # 为重复 OSM id 去重，避免同一路段被多次匹配
    used_ids = set()

    for road in targets:
        name = road['name']
        candidates = [name]
        is_generic = False

        if '国道109' in name or any(c in name for c in ['G109', '109']):
            candidates.extend(['109', 'G109', '109国道', '青藏公路'])
        if '青藏铁路' in name:
            candidates.extend(['青藏铁路', '青藏线', 'Qinghai-Tibet'])
        if '高速' in name and '待建' in name:
            is_generic = True
        if '主干道' in name and not road.get('routes'):
            is_generic = True
        for code in road.get('routes', []):
            candidates.append(code)
            candidates.append(code.replace('X', '').replace('S', '').replace('C', ''))

        if is_generic:
            missing.append({'name': name, 'category': 'road', 'reason': '描述性类别，需人工在地图上勾画'})
            continue

        # 收集所有匹配项，优先选择最长/最完整的要素
        matches = []
        for item in items:
            if item['id'] in used_ids:
                continue
            if name_matches(item['tags'], candidates):
                matches.append(item)

        # 按几何复杂度排序：LineString 按坐标数，Polygon 按周长近似
        def geom_score(item):
            geom = item['geometry']
            coords = geom.get('coordinates', [])
            if geom['type'] == 'LineString':
                return len(coords)
            if geom['type'] == 'Polygon':
                return len(coords[0]) if coords else 0
            if geom['type'] == 'MultiPolygon':
                return sum(len(poly[0]) for poly in coords)
            return 0

        matches.sort(key=geom_score, reverse=True)
        matched = matches[0] if matches else None
        if matched:
            used_ids.add(matched['id'])

        if matched:
            features.append({
                'type': 'Feature',
                'geometry': matched['geometry'],
                'properties': {
                    'name': name,
                    'category': 'road',
                    'road_type': road.get('category', ''),
                    'light_color': road.get('light_color', ''),
                    'routes': road.get('routes', []),
                    'note': road.get('remark', ''),
                    'source': 'OpenStreetMap',
                    'osm_id': matched['id'],
                },
            })
        else:
            missing.append({'name': name, 'category': 'road', 'reason': 'OSM未匹配'})

    return features, missing


def generate_rivers(req):
    features = []
    missing = []
    targets = req.get('rivers', [])
    if not targets:
        return features, missing

    print('Querying OSM for rivers/streams in 安多县 ...')
    items = query_ways_relations_in_anduo('["waterway"~"river|stream"]', cache_key='rivers_v2')
    print(f'  Found {len(items)} OSM river features')

    for river in targets:
        name = river['name']
        matched = None
        for item in items:
            if name_matches(item['tags'], get_alt_names(name, f'{name}河')):
                matched = item
                break

        if matched:
            features.append({
                'type': 'Feature',
                'geometry': matched['geometry'],
                'properties': {
                    'name': name,
                    'category': 'river',
                    'light': river.get('light', False),
                    'sign': river.get('sign', False),
                    'note': '河流加灯+标牌',
                    'source': 'OpenStreetMap',
                    'osm_id': matched['id'],
                },
            })
        else:
            missing.append({'name': name, 'category': 'river', 'reason': 'OSM未匹配'})

    return features, missing


def generate_lakes(req):
    features = []
    missing = []
    targets = req.get('lakes', [])
    if not targets:
        return features, missing

    print('Querying OSM for lakes in 安多县 ...')
    items = query_ways_relations_in_anduo('["natural"="water"]["water"="lake"]', cache_key='lakes')
    print(f'  Found {len(items)} OSM lake features')

    for lake in targets:
        name = lake['name']
        matched = None
        for item in items:
            if name_matches(item['tags'], [name, f'{name}湖']):
                matched = item
                break

        if matched:
            features.append({
                'type': 'Feature',
                'geometry': matched['geometry'],
                'properties': {
                    'name': name,
                    'category': 'lake',
                    'light': lake.get('light', False),
                    'sign': lake.get('sign', False),
                    'note': '湖泊加灯+标牌',
                    'source': 'OpenStreetMap',
                    'osm_id': matched['id'],
                },
            })
        else:
            missing.append({'name': name, 'category': 'lake', 'reason': 'OSM未匹配'})

    return features, missing


def generate_mountains(req):
    features = []
    missing = []
    targets = req.get('mountains', [])
    if not targets:
        return features, missing

    print('Querying OSM for peaks/saddles/passes in 安多县 ...')
    nodes = query_nodes_in_anduo('["natural"~"peak|saddle|volcano"]', cache_key='peaks_v2')
    nodes += query_nodes_in_anduo('["mountain_pass"="yes"]', cache_key='mountain_passes')
    print(f'  Found {len(nodes)} OSM peak/pass nodes')
    county_boundary = load_county_boundary()

    for m in targets:
        name = m['name']
        candidates = get_alt_names(name, f'{name}峰', f'{name}山', f'{name}垭口')
        matched = None
        for n in nodes:
            if name_matches(n['tags'], candidates):
                matched = n
                break

        if matched:
            props = {
                'name': name,
                'category': 'mountain',
                'elevation_m': matched['tags'].get('ele') or m.get('elevation_m'),
                'sign': True,
                'note': m.get('remark', ''),
                'source': 'OpenStreetMap',
                'osm_id': matched['id'],
            }
            features.append({
                'type': 'Feature',
                'geometry': {'type': 'Point', 'coordinates': [matched['lon'], matched['lat']]},
                'properties': props,
            })
            continue

        # Nominatim 兜底（逐备选名重试）
        nmt = nominatim_search_multi(candidates)
        if nmt:
            features.append({
                'type': 'Feature',
                'geometry': {'type': 'Point', 'coordinates': [nmt['lon'], nmt['lat']]},
                'properties': {
                    'name': name,
                    'category': 'mountain',
                    'elevation_m': m.get('elevation_m'),
                    'sign': True,
                    'note': m.get('remark', '') + '（Nominatim 估算）',
                    'source': 'Nominatim',
                    'needs_review': True,
                },
            })
            continue

        # gazetteer 兜底（公开资料代表点）
        point, entry = gazetteer_fallback('mountain', name, county_boundary)
        if point:
            props = {
                'name': name,
                'category': 'mountain',
                'elevation_m': entry.get('ele') or m.get('elevation_m'),
                'sign': True,
                'note': (m.get('remark', '') + f'（gazetteer 代表点：{entry.get("ref", "")}）').strip(),
                'source': 'gazetteer',
                'needs_review': True,
            }
            if entry.get('outside_county'):
                props['outside_county'] = True
            features.append({
                'type': 'Feature',
                'geometry': {'type': 'Point', 'coordinates': point},
                'properties': props,
            })
        else:
            missing.append({'name': name, 'category': 'mountain', 'reason': 'OSM/Nominatim 未匹配'})

    return features, missing


def generate_temples(req):
    features = []
    missing = []
    targets = req.get('temples', [])
    if not targets:
        return features, missing

    print('Querying OSM for places of worship / monasteries in 安多县 ...')
    nodes = query_nodes_in_anduo('["amenity"="place_of_worship"]', cache_key='temples_v2')
    nodes += query_nodes_in_anduo('["amenity"="monastery"]', cache_key='monasteries')
    nodes += query_nodes_in_anduo('["building"~"temple|monastery"]', cache_key='temple_buildings')
    print(f'  Found {len(nodes)} OSM temple nodes')
    county_boundary = load_county_boundary()

    for temple in targets:
        name = temple['name']
        candidates = get_alt_names(name, f'{name}寺')
        matched = None
        for n in nodes:
            if name_matches(n['tags'], candidates):
                matched = n
                break

        if matched:
            features.append({
                'type': 'Feature',
                'geometry': {'type': 'Point', 'coordinates': [matched['lon'], matched['lat']]},
                'properties': {
                    'name': name,
                    'category': 'temple',
                    'light': temple.get('light', False),
                    'sign': temple.get('sign', False),
                    'building': temple.get('building', False),
                    'note': '按教派区分，不加灯标牌+寺庙房子',
                    'source': 'OpenStreetMap',
                    'osm_id': matched['id'],
                },
            })
            continue

        # Nominatim 兜底（逐备选名重试）
        nmt = nominatim_search_multi(candidates)
        if nmt:
            features.append({
                'type': 'Feature',
                'geometry': {'type': 'Point', 'coordinates': [nmt['lon'], nmt['lat']]},
                'properties': {
                    'name': name,
                    'category': 'temple',
                    'light': temple.get('light', False),
                    'sign': temple.get('sign', False),
                    'building': temple.get('building', False),
                    'note': '按教派区分，不加灯标牌+寺庙房子（Nominatim 估算）',
                    'source': 'Nominatim',
                    'needs_review': True,
                },
            })
            continue

        # gazetteer 兜底
        point, entry = gazetteer_fallback('temple', name, county_boundary)
        if point:
            features.append({
                'type': 'Feature',
                'geometry': {'type': 'Point', 'coordinates': point},
                'properties': {
                    'name': name,
                    'category': 'temple',
                    'light': temple.get('light', False),
                    'sign': temple.get('sign', False),
                    'building': temple.get('building', False),
                    'note': f'按教派区分，不加灯标牌+寺庙房子（gazetteer 代表点：{entry.get("ref", "")}）',
                    'source': 'gazetteer',
                    'needs_review': True,
                },
            })
        else:
            missing.append({'name': name, 'category': 'temple', 'reason': 'OSM/Nominatim 未匹配'})

    return features, missing


CATEGORY_ORDER = ['towns', 'villages', 'roads', 'rivers', 'lakes', 'mountains', 'temples']
# 类别文件名（复数）→ missing.json 中的 category 值（单数）
MISSING_CATEGORY = {
    'villages': 'village', 'roads': 'road', 'rivers': 'river',
    'lakes': 'lake', 'mountains': 'mountain', 'temples': 'temple',
}


def load_existing_outputs(cat):
    """读取现有 geojson 要素与 missing 条目，用于 --only 模式下保留未重跑类别。"""
    features = []
    geojson_path = OUTPUT_DIR / f'{cat}.geojson'
    if geojson_path.exists():
        try:
            features = json.loads(geojson_path.read_text(encoding='utf-8')).get('features', [])
        except Exception as exc:
            print(f'  Failed to read existing {cat}.geojson: {exc}', file=sys.stderr)
    missing = []
    missing_path = OUTPUT_DIR / 'missing.json'
    if missing_path.exists() and cat in MISSING_CATEGORY:
        try:
            items = json.loads(missing_path.read_text(encoding='utf-8')).get('items', [])
            missing = [i for i in items if i.get('category') == MISSING_CATEGORY[cat]]
        except Exception as exc:
            print(f'  Failed to read existing missing.json: {exc}', file=sys.stderr)
    return features, missing


def main():
    print('Loading requirements ...')
    req = load_requirements()
    print('Loading town boundaries ...')
    town_boundaries = load_town_boundaries()
    print(f'  Loaded {len(town_boundaries)} town boundaries')
    print('Loading town centers ...')
    town_centers = load_town_centers()
    print(f'  Loaded {len(town_centers)} town centers')

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    # 类别生成器注册表：返回 (features, missing)
    generators = {
        'towns': lambda: (generate_towns(req, town_centers), []),
        'villages': lambda: generate_villages(req, town_boundaries, town_centers),
        'roads': lambda: generate_roads(req),
        'rivers': lambda: generate_rivers(req),
        'lakes': lambda: generate_lakes(req),
        'mountains': lambda: generate_mountains(req),
        'temples': lambda: generate_temples(req),
    }

    if args.only:
        selected = {c.strip() for c in args.only.split(',') if c.strip()}
        unknown = selected - set(CATEGORY_ORDER)
        if unknown:
            sys.exit(f'未知类别: {", ".join(sorted(unknown))}（可选：{", ".join(CATEGORY_ORDER)}）')
    elif args.skip_osm:
        selected = {'towns'}
        print('--skip-osm specified, only regenerating towns; other categories preserved.')
    else:
        selected = set(CATEGORY_ORDER)

    all_missing = []
    summary = {}
    for cat in CATEGORY_ORDER:
        if cat in selected:
            print(f'\nGenerating {cat}.geojson ...')
            features, missing = generators[cat]()
            write_geojson(OUTPUT_DIR / f'{cat}.geojson', features, properties={'category': MISSING_CATEGORY.get(cat, 'town')})
            if cat != CATEGORY_ORDER[-1]:
                time.sleep(args.sleep)
        else:
            features, missing = load_existing_outputs(cat)
            print(f'\nKeeping existing {cat}.geojson ({len(features)} features, {len(missing)} missing)')
        all_missing.extend(missing)
        summary[cat] = len(features)

    # Missing report（全量重写：重跑类别用新结果，其余从旧文件带入）
    print('\nWriting missing.json ...')
    missing_data = {
        'total': len(all_missing),
        'items': all_missing,
    }
    (OUTPUT_DIR / 'missing.json').write_text(json.dumps(missing_data, ensure_ascii=False, indent=2), encoding='utf-8')
    summary['missing'] = len(all_missing)

    # Summary
    (OUTPUT_DIR / 'summary.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding='utf-8')

    print('\nDone.')
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
