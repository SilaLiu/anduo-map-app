#!/usr/bin/env python3
import argparse
import json
import ssl
import sys
import time
import urllib.request
from pathlib import Path

BASE_URL = 'https://geojson.cn/api/china'
META_URL = f'{BASE_URL}/_meta.json'
ROOT = Path(__file__).resolve().parent.parent
OUTPUT_DIR = ROOT / 'data' / 'admin-geojson'
NATIONAL_DIR = OUTPUT_DIR / 'national'
PROVINCE_DIR = OUTPUT_DIR / 'province'
CITY_DIR = OUTPUT_DIR / 'city'
COUNTY_DIR = OUTPUT_DIR / 'county'
TOWN_DIR = OUTPUT_DIR / 'town'
MERGED_DIR = OUTPUT_DIR / 'merged'
README_PATH = OUTPUT_DIR / 'README.md'
META_PATH = OUTPUT_DIR / 'meta.json'
INDEX_PATH = OUTPUT_DIR / 'index.json'

DIRECT_CITIES = {'110000', '120000', '310000', '500000'}

parser = argparse.ArgumentParser(description='下载中国行政区边界 GeoJSON 数据')
parser.add_argument('--no-verify-ssl', action='store_true', help='禁用 SSL 证书验证（仅用于测试环境，不推荐）')
parser.add_argument('--max-level', type=int, default=4, choices=[1, 2, 3, 4], help='最大下载层级：1全国 2省 3市 4县/乡镇')
parser.add_argument('--only-province', type=str, default='', help='仅下载指定省份，如 540000 或 西藏')
parser.add_argument('--delay', type=float, default=0.15, help='请求间隔秒数')
args = parser.parse_args()

SSL_CONTEXT = ssl.create_default_context()
if args.no_verify_ssl:
    SSL_CONTEXT.check_hostname = False
    SSL_CONTEXT.verify_mode = ssl.CERT_NONE


def fetch_json(url: str):
    req = urllib.request.Request(url, headers={'User-Agent': 'anduo-map-app/1.0'})
    with urllib.request.urlopen(req, context=SSL_CONTEXT, timeout=30) as resp:
        return json.load(resp)


def download_feature_collection(path: str):
    url = f'{BASE_URL}/{path}.json'
    data = fetch_json(url)
    if not isinstance(data, dict) or data.get('type') != 'FeatureCollection':
        raise RuntimeError(f'Unexpected response for {url}: {data!r}')
    return data


def write_json(path: Path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')


def normalize_feature(feat, level_name):
    """统一 properties 字段，方便前端识别。"""
    p = feat.get('properties', {})
    return {
        'type': 'Feature',
        'properties': {
            'adcode': p.get('adcode') or p.get('code') or p.get('filename', '').split('/')[-1] or '',
            'name': p.get('name') or '',
            'fullname': p.get('fullname') or p.get('name') or '',
            'level': level_name,
            'province': p.get('province') or '',
            'city': p.get('city') or '',
            'county': p.get('county') or '',
            'town': p.get('town') or '',
            'village': p.get('village') or '',
            'parent': p.get('parent') or {},
            'source': 'geojson.cn',
        },
        'geometry': feat.get('geometry'),
    }


def download_recursive(node, parent_level='national', parent_path='', downloaded=None, failures=None):
    if downloaded is None:
        downloaded = []
    if failures is None:
        failures = []

    filename = node.get('filename')
    name = node.get('name', filename)
    if not filename:
        return

    level_map = {
        'national': ('national', 1, NATIONAL_DIR),
        'national-province': ('province', 2, PROVINCE_DIR),
        'province-city': ('city', 3, CITY_DIR),
        'city-county': ('county', 4, COUNTY_DIR),
        'county-town': ('town', 5, TOWN_DIR),
    }

    # 确定当前节点的层级
    if parent_level == 'national':
        current_key = 'national-province'
        current_dir = PROVINCE_DIR
        current_level = 'province'
        depth = 2
    elif parent_level == 'province':
        current_key = 'province-city'
        current_dir = CITY_DIR
        current_level = 'city'
        depth = 3
    elif parent_level == 'city':
        current_key = 'city-county'
        current_dir = COUNTY_DIR
        current_level = 'county'
        depth = 4
    elif parent_level == 'county':
        current_key = 'county-town'
        current_dir = TOWN_DIR
        current_level = 'town'
        depth = 5
    else:
        return

    if depth > args.max_level:
        return

    # 直辖市跳过市级，直接当 city/county 下载
    is_direct_city = False
    if current_level == 'province' and filename in DIRECT_CITIES:
        is_direct_city = True

    # 构建保存路径
    code = filename.split('/')[-1] if '/' in filename else filename
    if current_level == 'province':
        out_path = current_dir / f'{code}.json'
    else:
        parts = filename.split('/')
        out_dir = current_dir / '/'.join(parts[:-1]) if len(parts) > 1 else current_dir
        out_path = out_dir / f'{code}.json'

    try:
        data = download_feature_collection(filename)
        normalized = {
            'type': 'FeatureCollection',
            'features': [normalize_feature(f, current_level) for f in data.get('features', [])],
        }
        write_json(out_path, normalized)
        downloaded.append({
            'level': current_level,
            'code': code,
            'name': name,
            'path': str(out_path.relative_to(ROOT)),
            'features': len(normalized['features']),
        })
        print(f'Downloaded {current_level} {name} ({filename}) -> {out_path}')
    except Exception as exc:
        failures.append({'level': current_level, 'path': filename, 'name': name, 'error': str(exc)})
        print(f'Failed {current_level} {name} ({filename}): {exc}', file=sys.stderr)
        return
    finally:
        time.sleep(args.delay)

    children = node.get('children', [])
    if is_direct_city:
        # 直辖市的下一级应该是区县，但接口上仍放在 province/直辖市代码.json 里。
        # 这里我们先不深钻，直接返回；区县需后续从 province 文件拆分或单独接口尝试。
        return

    next_level = current_level
    for child in children:
        download_recursive(child, parent_level=next_level, parent_path=filename,
                           downloaded=downloaded, failures=failures)


def merge_all_levels():
    """把所有下载的层级合并成一个 all_levels.json，方便前端一次性加载。"""
    all_features = []

    def collect_features(directory, level):
        if not directory.exists():
            return
        for path in directory.rglob('*.json'):
            if path.name.endswith('_merged.json'):
                continue
            try:
                data = json.loads(path.read_text(encoding='utf-8'))
                for f in data.get('features', []):
                    p = f.get('properties', {})
                    if not p.get('level'):
                        p['level'] = level
                    # 统一字段
                    if level == 'province' and not p.get('province'):
                        p['province'] = p.get('name') or p.get('fullname') or ''
                    all_features.append(f)
            except Exception as e:
                print(f'Warning: failed to read {path}: {e}', file=sys.stderr)

    collect_features(PROVINCE_DIR, 'province')
    collect_features(CITY_DIR, 'city')
    collect_features(COUNTY_DIR, 'county')
    collect_features(TOWN_DIR, 'town')

    merged = {'type': 'FeatureCollection', 'features': all_features}
    MERGED_DIR.mkdir(parents=True, exist_ok=True)
    merged_path = MERGED_DIR / 'china_all_levels.json'
    write_json(merged_path, merged)
    print(f'Merged {len(all_features)} features into {merged_path}')
    return merged_path


def build_readme(downloaded_count, failure_count):
    return f'''# 中国行政区边界数据下载结果

数据来源：`geojson.cn`

本目录由脚本 `scripts/download-china-admin-geojson.py` 生成。

## 当前已下载层级
- 全国省级边界：`national/100000.json`
- 各省下辖市级边界：`province/<省代码>.json`
- 各市下辖县级边界：`city/<省代码>/<市代码>.json`
- 各县下辖乡镇边界：`county/<省代码>/<市代码>/<县代码>.json`

## 合并文件
- 全国统一边界：`merged/china_all_levels.json`

## 本次下载结果
- 成功文件数：{downloaded_count}
- 失败文件数：{failure_count}
- 输出目录：`data/admin-geojson/`
'''


def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    NATIONAL_DIR.mkdir(parents=True, exist_ok=True)
    PROVINCE_DIR.mkdir(parents=True, exist_ok=True)
    if args.max_level >= 3:
        CITY_DIR.mkdir(parents=True, exist_ok=True)
    if args.max_level >= 4:
        COUNTY_DIR.mkdir(parents=True, exist_ok=True)
        TOWN_DIR.mkdir(parents=True, exist_ok=True)

    print(f'Fetching metadata: {META_URL}')
    meta = fetch_json(META_URL)
    write_json(META_PATH, meta)

    files = meta.get('files', [])
    if not files:
        raise RuntimeError('Metadata has no files tree')

    root = files[0]
    provinces = root.get('children', [])
    if not provinces:
        raise RuntimeError('Metadata root has no province children')

    downloaded = []
    failures = []

    # National level
    try:
        national = download_feature_collection('100000')
        national_path = NATIONAL_DIR / '100000.json'
        write_json(national_path, national)
        downloaded.append({
            'level': 'national',
            'code': '100000',
            'name': '中华人民共和国',
            'path': str(national_path.relative_to(ROOT)),
            'features': len(national.get('features', [])),
        })
        print(f'Downloaded national -> {national_path}')
    except Exception as exc:
        failures.append({'level': 'national', 'path': '100000', 'error': str(exc)})
        print(f'Failed national 100000: {exc}', file=sys.stderr)

    # 过滤指定省份
    target_provinces = provinces
    if args.only_province:
        target_provinces = [p for p in provinces
                            if args.only_province in (p.get('filename', ''), p.get('name', ''))]
        print(f'Filtered to {len(target_provinces)} province(s) matching {args.only_province}')

    for province in target_provinces:
        download_recursive(province, parent_level='national', downloaded=downloaded, failures=failures)

    # Merge
    merged_path = None
    if args.max_level >= 2:
        try:
            merged_path = merge_all_levels()
        except Exception as exc:
            print(f'Failed merge: {exc}', file=sys.stderr)
            failures.append({'level': 'merge', 'path': str(MERGED_DIR), 'error': str(exc)})

    index = {
        'source': 'https://geojson.cn/data/atlas/china',
        'generated_by': 'scripts/download-china-admin-geojson.py',
        'max_level': args.max_level,
        'only_province': args.only_province,
        'downloaded_count': len(downloaded),
        'failure_count': len(failures),
        'downloaded': downloaded,
        'failures': failures,
        'merged': str(merged_path.relative_to(ROOT)) if merged_path else None,
    }
    write_json(INDEX_PATH, index)
    README_PATH.write_text(build_readme(len(downloaded), len(failures)), encoding='utf-8')

    print('\nDone.')
    print(f'Success: {len(downloaded)} files')
    print(f'Failures: {len(failures)} files')
    print(f'Index: {INDEX_PATH}')


if __name__ == '__main__':
    main()
