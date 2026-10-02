#!/usr/bin/env python3
"""
下载中国行政区划边界（省/市/县），数据源：阿里云 DataV Atlas。
乡镇级边界 DataV 不提供，如需乡镇数据可结合 OSM Overpass 补充。

用法：
  python3 scripts/download-china-admin-datav.py
  python3 scripts/download-china-admin-datav.py --max-level 3 --only-province 540000
"""
import argparse
import json
import ssl
import sys
import time
import urllib.request
from pathlib import Path

BASE_URL = 'https://geo.datav.aliyun.com/areas_v3/bound'
ROOT = Path(__file__).resolve().parent.parent
OUTPUT_DIR = ROOT / 'data' / 'admin-geojson'
NATIONAL_DIR = OUTPUT_DIR / 'national'
PROVINCE_DIR = OUTPUT_DIR / 'province'
CITY_DIR = OUTPUT_DIR / 'city'
COUNTY_DIR = OUTPUT_DIR / 'county'
MERGED_DIR = OUTPUT_DIR / 'merged'
README_PATH = OUTPUT_DIR / 'README.md'
INDEX_PATH = OUTPUT_DIR / 'index.json'

DIRECT_CITIES = {'110000', '120000', '310000', '500000'}

parser = argparse.ArgumentParser(description='下载中国行政区边界 GeoJSON 数据（阿里云 DataV Atlas）')
parser.add_argument('--no-verify-ssl', action='store_true', help='禁用 SSL 证书验证')
parser.add_argument('--max-level', type=int, default=4, choices=[1, 2, 3, 4], help='最大下载层级：1全国 2省 3市 4县')
parser.add_argument('--only-province', type=str, default='', help='仅下载指定省份，如 540000 或 西藏')
parser.add_argument('--delay', type=float, default=0.3, help='请求间隔秒数')
args = parser.parse_args()

SSL_CONTEXT = ssl.create_default_context()
if args.no_verify_ssl:
    SSL_CONTEXT.check_hostname = False
    SSL_CONTEXT.verify_mode = ssl.CERT_NONE


def fetch_json(url: str):
    req = urllib.request.Request(url, headers={'User-Agent': 'anduo-map-app/1.0'})
    with urllib.request.urlopen(req, context=SSL_CONTEXT, timeout=30) as resp:
        return json.load(resp)


def download_boundary(adcode: str, retries=2):
    """下载单个行政区边界；带 _full 会包含下级边界。"""
    url = f'{BASE_URL}/{adcode}_full.json'
    last_err = None
    for attempt in range(retries + 1):
        try:
            data = fetch_json(url)
            if not isinstance(data, dict) or data.get('type') != 'FeatureCollection':
                raise RuntimeError(f'Unexpected response for {url}: {data!r}')
            return data
        except urllib.error.HTTPError as e:
            if e.code == 404:
                raise
            last_err = e
            if attempt < retries:
                wait = 1.5 * (attempt + 1)
                print(f'  Retry {adcode} in {wait}s: {e}', file=sys.stderr)
                time.sleep(wait)
        except Exception as e:
            last_err = e
            if attempt < retries:
                wait = 1.5 * (attempt + 1)
                print(f'  Retry {adcode} in {wait}s: {e}', file=sys.stderr)
                time.sleep(wait)
    raise last_err


def download_single(adcode: str, retries=2):
    """下载单个行政区自身边界。"""
    url = f'{BASE_URL}/{adcode}.json'
    last_err = None
    for attempt in range(retries + 1):
        try:
            data = fetch_json(url)
            if not isinstance(data, dict):
                raise RuntimeError(f'Unexpected response for {url}: {data!r}')
            if data.get('type') in ('Polygon', 'MultiPolygon'):
                return {'type': 'FeatureCollection', 'features': [{'type': 'Feature', 'properties': {}, 'geometry': data}]}
            if data.get('type') == 'FeatureCollection':
                return data
            raise RuntimeError(f'Unexpected geometry type for {url}: {data.get("type")}')
        except urllib.error.HTTPError as e:
            if e.code == 404:
                raise
            last_err = e
            if attempt < retries:
                wait = 1.5 * (attempt + 1)
                print(f'  Retry single {adcode} in {wait}s: {e}', file=sys.stderr)
                time.sleep(wait)
        except Exception as e:
            last_err = e
            if attempt < retries:
                wait = 1.5 * (attempt + 1)
                print(f'  Retry single {adcode} in {wait}s: {e}', file=sys.stderr)
                time.sleep(wait)
    raise last_err


def write_json(path: Path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')


def normalize_feature(feat, level_name, parent_admin=None):
    p = feat.get('properties', {})
    adcode = str(p.get('adcode') or '')
    name = p.get('name') or p.get('fullname') or ''

    admin = {
        'province': '',
        'city': '',
        'county': '',
        'town': '',
        'village': '',
    }
    if parent_admin:
        admin.update(parent_admin)

    if level_name == 'province':
        admin['province'] = name
    elif level_name == 'city':
        admin['city'] = name
    elif level_name == 'county':
        admin['county'] = name

    return {
        'type': 'Feature',
        'properties': {
            'adcode': adcode,
            'name': name,
            'fullname': p.get('fullname') or name,
            'level': level_name,
            **admin,
            'center': p.get('center'),
            'centroid': p.get('centroid'),
            'parent': p.get('parent'),
            'source': 'DataV Atlas',
        },
        'geometry': feat.get('geometry'),
    }


def download_level(adcode, name, level, parent_admin=None, depth=1):
    """递归下载指定 adcode 的边界及其子级。"""
    downloaded = []
    failures = []

    if depth > args.max_level:
        return downloaded, failures

    try:
        data = download_boundary(adcode)
    except urllib.error.HTTPError as e:
        if e.code == 404:
            # 没有下级，下载自身边界
            try:
                data = download_single(adcode)
            except urllib.error.HTTPError as e2:
                if e2.code == 404:
                    # 该层级无公开数据，静默跳过
                    return downloaded, failures
                failures.append({'level': level, 'adcode': adcode, 'name': name, 'error': str(e2)})
                print(f'  Failed {level} {name} ({adcode}): {e2}', file=sys.stderr)
                return downloaded, failures
            except Exception as e2:
                failures.append({'level': level, 'adcode': adcode, 'name': name, 'error': str(e2)})
                print(f'  Failed {level} {name} ({adcode}): {e2}', file=sys.stderr)
                return downloaded, failures
        else:
            failures.append({'level': level, 'adcode': adcode, 'name': name, 'error': str(e)})
            print(f'  Failed {level} {name} ({adcode}): {e}', file=sys.stderr)
            return downloaded, failures
    except Exception as e:
        failures.append({'level': level, 'adcode': adcode, 'name': name, 'error': str(e)})
        print(f'  Failed {level} {name} ({adcode}): {e}', file=sys.stderr)
        return downloaded, failures

    features = data.get('features', [])
    if not features:
        failures.append({'level': level, 'adcode': adcode, 'name': name, 'error': 'empty feature collection'})
        return downloaded, failures

    # 保存按父级分目录
    code = str(adcode)
    if level == 'province':
        out_dir = PROVINCE_DIR
    elif level == 'city':
        out_dir = CITY_DIR / (code[:2] + '000')
    elif level == 'county':
        parent_code = str(features[0].get('properties', {}).get('parent', {}).get('adcode', code[:4] + '00'))
        out_dir = COUNTY_DIR / (parent_code[:2] + '000') / parent_code
    else:
        out_dir = OUTPUT_DIR / level

    out_dir.mkdir(parents=True, exist_ok=True)

    # 这个请求对应的行政区自身就是第一个 feature 吗？不一定，用 parent 或 name 匹配一下
    normalized = [normalize_feature(f, child_level(features, f), parent_admin) for f in features]
    out_path = out_dir / f'{code}.json'
    write_json(out_path, {'type': 'FeatureCollection', 'features': normalized})
    downloaded.append({'level': level, 'adcode': code, 'name': name, 'path': str(out_path.relative_to(ROOT)), 'features': len(features)})
    print(f'Downloaded {level} {name} ({code}) -> {out_path}')
    time.sleep(args.delay)

    if depth >= args.max_level:
        return downloaded, failures

    # 断点续传：如果 county 文件已存在且非空，跳过下载
    if level == 'city' and args.max_level >= 4:
        out_dir = COUNTY_DIR / (code[:2] + '000') / code
        if out_dir.exists():
            existing = list(out_dir.glob('*.json'))
            if len(existing) >= 1:
                # 视为已下载该市的 county，不再递归
                return downloaded, failures

    # 直辖市： province 文件里直接是区县，需要当 county 处理
    # 非直辖市：如果 max_level>=4，province 的 children 是 city，city 的 children 是 county
    if level == 'province':
        next_level = 'county' if code in DIRECT_CITIES else 'city'
    elif level == 'city':
        next_level = 'county'
    else:
        return downloaded, failures

    for f in features:
        p = f.get('properties', {})
        child_adcode = str(p.get('adcode') or '')
        child_name = p.get('name') or ''
        if not child_adcode:
            continue

        child_level_name = next_level
        child_admin = (parent_admin or {}).copy()
        if child_level_name == 'city':
            child_admin['city'] = child_name
        else:
            child_admin['county'] = child_name

        sub_downloaded, sub_failures = download_level(
            child_adcode, child_name, child_level_name,
            parent_admin=child_admin, depth=depth + 1
        )
        downloaded.extend(sub_downloaded)
        failures.extend(sub_failures)

    return downloaded, failures


def child_level(parent_features, feat):
    """根据 feature 的 properties 推断层级。"""
    p = feat.get('properties', {})
    lvl = p.get('level')
    if lvl in ('province', 'city', 'district', 'county'):
        return 'province' if lvl == 'province' else ('city' if lvl == 'city' else 'county')
    # fallback：看 parent 的 adcode
    parent = p.get('parent', {})
    pac = str(parent.get('adcode', ''))
    if pac.endswith('0000'):
        return 'city'
    if pac.endswith('00'):
        return 'county'
    return 'county'


def merge_all_levels():
    """把所有下载的层级合并成一个 china_all_levels.json。"""
    all_features = []
    seen = set()

    def add_feature(feat, level=None):
        if not feat:
            return
        p = feat.get('properties', {})
        if level:
            p['level'] = level
        key = f"{p.get('level')}_{p.get('adcode')}"
        if key in seen:
            return
        seen.add(key)
        all_features.append(feat)

    # 1. 全国省级边界（合并省级文件生成，而不是直接用 national 单个大边界）
    if PROVINCE_DIR.exists():
        for prov_path in sorted(PROVINCE_DIR.glob('*.json')):
            try:
                data = json.loads(prov_path.read_text(encoding='utf-8'))
                feats = data.get('features', [])
                if not feats:
                    continue
                # 推断省份名
                province_name = ''
                for f in feats:
                    name = f.get('properties', {}).get('province') or f.get('properties', {}).get('name')
                    if name and ('省' in name or '自治区' in name or '市' in name or '特别行政区' in name):
                        if len(name) > len(province_name):
                            province_name = name
                if not province_name:
                    province_name = feats[0].get('properties', {}).get('name', '')
                # 合并该省所有下级 polygon 作为省级边界
                polys = []
                for f in feats:
                    geom = f.get('geometry')
                    if not geom:
                        continue
                    if geom['type'] == 'Polygon':
                        polys.append(geom['coordinates'])
                    elif geom['type'] == 'MultiPolygon':
                        polys.extend(geom['coordinates'])
                if polys:
                    add_feature({
                        'type': 'Feature',
                        'properties': {
                            'adcode': prov_path.stem,
                            'name': province_name,
                            'fullname': province_name,
                            'level': 'province',
                            'province': province_name,
                            'city': '',
                            'county': '',
                            'source': 'DataV Atlas',
                        },
                        'geometry': {'type': 'MultiPolygon', 'coordinates': polys},
                    })
                # 保留下级边界
                for f in feats:
                    add_feature(f, f.get('properties', {}).get('level'))
            except Exception as e:
                print(f'Warning: failed to process province {prov_path}: {e}', file=sys.stderr)

    # 2. 市级文件
    if CITY_DIR.exists():
        for city_path in sorted(CITY_DIR.rglob('*.json')):
            try:
                data = json.loads(city_path.read_text(encoding='utf-8'))
                for f in data.get('features', []):
                    add_feature(f, f.get('properties', {}).get('level'))
            except Exception as e:
                print(f'Warning: failed to read {city_path}: {e}', file=sys.stderr)

    # 3. 县级文件
    if COUNTY_DIR.exists():
        for county_path in sorted(COUNTY_DIR.rglob('*.json')):
            try:
                data = json.loads(county_path.read_text(encoding='utf-8'))
                for f in data.get('features', []):
                    add_feature(f, f.get('properties', {}).get('level'))
            except Exception as e:
                print(f'Warning: failed to read {county_path}: {e}', file=sys.stderr)

    merged = {'type': 'FeatureCollection', 'features': all_features}
    MERGED_DIR.mkdir(parents=True, exist_ok=True)
    merged_path = MERGED_DIR / 'china_all_levels.json'
    write_json(merged_path, merged)
    print(f'Merged {len(all_features)} unique features into {merged_path}')
    return merged_path


def build_readme(downloaded_count, failure_count):
    return f'''# 中国行政区边界数据下载结果

数据来源：`阿里云 DataV Atlas`

本目录由脚本 `scripts/download-china-admin-datav.py` 生成。

## 当前已下载层级
- 全国省级边界：`national/100000.json`
- 各省下辖市级边界：`province/<省代码>.json`
- 各市下辖县级边界：`city/<省代码>/<市代码>.json`

## 合并文件
- 全国统一边界：`merged/china_all_levels.json`

## 说明
DataV Atlas 公开接口最多提供到县/区级边界，乡镇级边界需要其他数据源补充。

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
    MERGED_DIR.mkdir(parents=True, exist_ok=True)

    # 下载全国边界（单区域）
    try:
        national = download_single('100000')
        national_path = NATIONAL_DIR / '100000.json'
        write_json(national_path, national)
        print(f'Downloaded national -> {national_path}')
    except Exception as e:
        print(f'Failed national: {e}', file=sys.stderr)
        national_path = None

    # 下载省级及下级
    try:
        province_full = download_boundary('100000')
        provinces = province_full.get('features', [])
    except Exception as e:
        print(f'Failed to fetch province list: {e}', file=sys.stderr)
        return

    # 过滤指定省份
    target_provinces = provinces
    if args.only_province:
        target_provinces = [p for p in provinces
                            if args.only_province in (str(p.get('properties', {}).get('adcode', '')),
                                                      p.get('properties', {}).get('name', ''))]
        print(f'Filtered to {len(target_provinces)} province(s) matching {args.only_province}')

    downloaded = []
    failures = []

    for f in target_provinces:
        p = f.get('properties', {})
        code = str(p.get('adcode') or '')
        name = p.get('name') or ''
        if not code:
            continue
        province_admin = {'province': name}
        d, fails = download_level(code, name, 'province', parent_admin=province_admin, depth=2 if args.max_level >= 2 else 1)
        downloaded.extend(d)
        failures.extend(fails)

    # Merge
    merged_path = None
    try:
        merged_path = merge_all_levels()
    except Exception as exc:
        print(f'Failed merge: {exc}', file=sys.stderr)
        failures.append({'level': 'merge', 'path': str(MERGED_DIR), 'error': str(exc)})

    index = {
        'source': 'https://geo.datav.aliyun.com/areas_v3/bound',
        'generated_by': 'scripts/download-china-admin-datav.py',
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
    if merged_path:
        print(f'Merged: {merged_path}')


if __name__ == '__main__':
    main()
