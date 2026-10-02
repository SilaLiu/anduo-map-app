#!/usr/bin/env python3
"""生成安多县沙盘制作物料清单与统计报表。

输入：
- data/sandtable-requirements.json
- data/sandtable-geojson/*.geojson
- data/sandtable-geojson/missing.json

输出：
- data/sandtable-geojson/report.json
- data/sandtable-geojson/report.csv
"""
import csv
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
REQUIREMENTS_PATH = ROOT / 'data' / 'sandtable-requirements.json'
GEOJSON_DIR = ROOT / 'data' / 'sandtable-geojson'
REPORT_JSON_PATH = GEOJSON_DIR / 'report.json'
REPORT_CSV_PATH = GEOJSON_DIR / 'report.csv'


def load_json(path):
    return json.loads(path.read_text(encoding='utf-8'))


def haversine_km(p1, p2):
    """计算两点间球面距离（千米）。"""
    lon1, lat1 = math.radians(p1[0]), math.radians(p1[1])
    lon2, lat2 = math.radians(p2[0]), math.radians(p2[1])
    dlon = lon2 - lon1
    dlat = lat2 - lat1
    a = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    c = 2 * math.asin(math.sqrt(a))
    return 6371 * c


def line_length_km(coords):
    """估算 LineString 总长度（千米）。"""
    length = 0
    for i in range(len(coords) - 1):
        length += haversine_km(coords[i], coords[i + 1])
    return length


def polygon_perimeter_km(coords):
    """估算 Polygon 外环周长（千米）。"""
    ring = coords[0] if coords else []
    if len(ring) < 2:
        return 0
    perimeter = 0
    for i in range(len(ring) - 1):
        perimeter += haversine_km(ring[i], ring[i + 1])
    return perimeter


def main():
    req = load_json(REQUIREMENTS_PATH)
    categories = {}
    for fname in ['towns', 'villages', 'roads', 'rivers', 'lakes', 'mountains', 'temples']:
        path = GEOJSON_DIR / f'{fname}.geojson'
        if path.exists():
            categories[fname] = load_json(path)
        else:
            categories[fname] = {'features': []}

    missing = {'total': 0, 'items': []}
    missing_path = GEOJSON_DIR / 'missing.json'
    if missing_path.exists():
        missing = load_json(missing_path)

    # 基础统计
    stats = {
        'county_boundary': 1,
        'town_boundaries': len(req.get('towns', [])),
        'towns': len(categories['towns']['features']),
        'villages': len(categories['villages']['features']),
        'roads': len(categories['roads']['features']),
        'rivers': len(categories['rivers']['features']),
        'lakes': len(categories['lakes']['features']),
        'mountains': len(categories['mountains']['features']),
        'temples': len(categories['temples']['features']),
    }

    # 灯带统计：县域边界 + 乡镇边界
    red_light_strips = stats['county_boundary'] + stats['town_boundaries']

    # 亮灯建筑：乡镇政府大楼 + 县政府大楼
    building_with_light = stats['towns']
    county_seat = req.get('county', {}).get('county_seat', {})
    if county_seat.get('building_light'):
        building_with_light += 1

    # 标牌统计
    sign_with_light = stats['towns']  # 乡镇政府标牌+灯
    sign_only = stats['villages'] + stats['mountains'] + stats['temples']
    sign_river_lake = stats['rivers'] + stats['lakes']
    total_signs = sign_with_light + sign_only + sign_river_lake

    # 道路长度
    road_lengths = []
    for f in categories['roads']['features']:
        geom = f.get('geometry', {})
        if geom.get('type') == 'LineString':
            road_lengths.append({
                'name': f['properties'].get('name', ''),
                'length_km': round(line_length_km(geom['coordinates']), 2),
            })
        elif geom.get('type') == 'Polygon':
            road_lengths.append({
                'name': f['properties'].get('name', ''),
                'length_km': round(polygon_perimeter_km(geom['coordinates']), 2),
            })

    # 河流长度、湖泊周长
    river_lengths = []
    for f in categories['rivers']['features']:
        geom = f.get('geometry', {})
        if geom.get('type') == 'LineString':
            river_lengths.append({
                'name': f['properties'].get('name', ''),
                'length_km': round(line_length_km(geom['coordinates']), 2),
            })

    lake_perimeters = []
    for f in categories['lakes']['features']:
        geom = f.get('geometry', {})
        if geom.get('type') in ('Polygon', 'MultiPolygon'):
            lake_perimeters.append({
                'name': f['properties'].get('name', ''),
                'perimeter_km': round(polygon_perimeter_km(geom['coordinates']), 2),
            })

    # 需要人工核对的要素
    needs_review = sum(
        1 for cat in categories.values()
        for f in cat['features']
        if f.get('properties', {}).get('needs_review')
    )

    # 未知名称待补充
    unknown_names = sum(
        1 for item in missing['items']
        if '名称待补充' in item.get('reason', '')
    )

    report = {
        'title': '安多县沙盘制作物料清单',
        'generated_at': str(__import__('datetime').datetime.now().isoformat()),
        'summary': {
            'total_features': sum(stats[k] for k in ['towns', 'villages', 'roads', 'rivers', 'lakes', 'mountains', 'temples']),
            'red_light_strips': red_light_strips,
            'building_with_light': building_with_light,
            'sign_with_light': sign_with_light,
            'sign_only': sign_only,
            'sign_water': sign_river_lake,
            'total_signs': total_signs,
            'needs_review': needs_review,
            'unknown_names': unknown_names,
            'missing_total': missing['total'],
        },
        'counts': stats,
        'roads': {
            'total': stats['roads'],
            'items': road_lengths,
            'total_length_km': round(sum(r['length_km'] for r in road_lengths), 2),
        },
        'rivers': {
            'total': stats['rivers'],
            'items': river_lengths,
            'total_length_km': round(sum(r['length_km'] for r in river_lengths), 2),
        },
        'lakes': {
            'total': stats['lakes'],
            'items': lake_perimeters,
            'total_perimeter_km': round(sum(l['perimeter_km'] for l in lake_perimeters), 2),
        },
        'mountains': [
            {
                'name': f['properties'].get('name', ''),
                'elevation_m': f['properties'].get('elevation_m'),
                'source': f['properties'].get('source', ''),
            }
            for f in categories['mountains']['features']
        ],
        'temples': [
            {
                'name': f['properties'].get('name', ''),
                'source': f['properties'].get('source', ''),
            }
            for f in categories['temples']['features']
        ],
        'missing_summary': missing,
    }

    REPORT_JSON_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'Wrote {REPORT_JSON_PATH}')

    # CSV 输出
    with REPORT_CSV_PATH.open('w', newline='', encoding='utf-8-sig') as f:
        writer = csv.writer(f)
        writer.writerow(['分类', '项目', '数量/长度', '单位', '备注'])
        writer.writerow(['边界灯带', '县域+乡镇边界红色灯带', red_light_strips, '条', '县域1条+乡镇13条'])
        writer.writerow(['亮灯建筑', '县政府/乡镇政府大楼', building_with_light, '座', '含灯+标牌'])
        writer.writerow(['标牌', '亮灯标牌（政府大楼）', sign_with_light, '个', ''])
        writer.writerow(['标牌', '仅标牌（行政村/山峰/寺庙）', sign_only, '个', ''])
        writer.writerow(['标牌', '水系标牌（河流/湖泊）', sign_river_lake, '个', ''])
        writer.writerow(['标牌', '标牌合计', total_signs, '个', ''])
        writer.writerow(['点要素', '乡镇驻地', stats['towns'], '个', ''])
        writer.writerow(['点要素', '行政村', stats['villages'], '个', '其中部分为估算位置'])
        writer.writerow(['点要素', '山峰', stats['mountains'], '个', ''])
        writer.writerow(['点要素', '寺庙', stats['temples'], '个', ''])
        writer.writerow(['线要素', '道路/铁路', stats['roads'], '条', f"总长约 {report['roads']['total_length_km']} km"])
        for r in road_lengths:
            writer.writerow(['线要素', r['name'], r['length_km'], 'km', ''])
        writer.writerow(['线要素', '河流', stats['rivers'], '条', f"总长约 {report['rivers']['total_length_km']} km"])
        for r in river_lengths:
            writer.writerow(['线要素', r['name'], r['length_km'], 'km', ''])
        writer.writerow(['面要素', '湖泊', stats['lakes'], '个', f"周长约 {report['lakes']['total_perimeter_km']} km"])
        for l in lake_perimeters:
            writer.writerow(['面要素', l['name'], l['perimeter_km'], 'km', ''])
        writer.writerow(['质量', '需人工核对', needs_review, '个', 'OSM/Nominatim 未匹配，位置为估算'])
        writer.writerow(['质量', '名称待补充', unknown_names, '个', ''])

    print(f'Wrote {REPORT_CSV_PATH}')
    print('\nReport summary:')
    print(json.dumps(report['summary'], ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
