"""Build a regional OSM vector source and simple, explicitly non-satellite XYZ map.

Use a dedicated Python environment with osmium and Pillow. No tile service is used.
Coordinates outside the region are retained for crossing ways; this is a bbox
selection, not a polygon clip or a validated navigation graph.
"""
import argparse
import collections
import hashlib
import json
import math
from pathlib import Path


def tile_xy(lon, lat, zoom):
    scale = 2 ** zoom
    lat = max(-85.05112878, min(85.05112878, lat))
    return ((lon + 180) / 360 * scale,
            (1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * scale)


def intersects_bounds(coordinates, bounds):
    west, south, east, north = bounds
    return bool(coordinates) and not (
        max(p[0] for p in coordinates) < west or min(p[0] for p in coordinates) > east
        or max(p[1] for p in coordinates) < south or min(p[1] for p in coordinates) > north)


def category(tags):
    if tags.get('building') and tags['building'] != 'no':
        return 'buildings'
    if tags.get('highway'):
        return 'roads'
    if tags.get('waterway') or tags.get('natural') == 'water' or tags.get('landuse') == 'reservoir':
        return 'water'
    if tags.get('landuse') == 'farmland':
        return 'farmland'
    if tags.get('natural') in ('wood', 'scrub', 'grassland') or tags.get('landuse') in ('forest', 'grass', 'meadow'):
        return 'vegetation'
    return None


def write_json(file, value):
    file.parent.mkdir(parents=True, exist_ok=True)
    file.write_text(json.dumps(value, ensure_ascii=False, separators=(',', ':')), encoding='utf8')


def extract(pbf, output, bounds):
    import osmium
    factory = osmium.geom.GeoJSONFactory()
    groups = {key: [] for key in ('roads', 'buildings', 'water', 'farmland', 'vegetation', 'places')}
    road_ways = []
    nodes = {}
    skipped = collections.Counter()
    areas = []
    processor = osmium.FileProcessor(str(pbf)).with_locations().with_areas()
    for obj in processor:
        tags = dict(obj.tags)
        kind = category(tags)
        if obj.is_node():
            if not tags.get('place') or not obj.location.valid():
                continue
            coords = [obj.location.lon, obj.location.lat]
            if intersects_bounds([coords], bounds):
                groups['places'].append({'type': 'Feature', 'properties': {**tags, 'osm_id': f'n{obj.id}'},
                                         'geometry': {'type': 'Point', 'coordinates': coords}})
        elif obj.is_way() and kind:
            try:
                coords = [[n.lon, n.lat] for n in obj.nodes]
            except osmium.InvalidLocationError:
                skipped['missing_way_locations'] += 1
                continue
            if len(coords) < 2 or not intersects_bounds(coords, bounds):
                continue
            # Polygon land cover/buildings are handled once via assembled Areas.
            if kind != 'roads' and obj.is_closed() and tags.get('area') != 'no':
                continue
            feature = {'type': 'Feature', 'properties': {**tags, 'osm_id': f'w{obj.id}'},
                       'geometry': {'type': 'LineString', 'coordinates': coords}}
            groups[kind].append(feature)
            if kind == 'roads':
                ids = [n.ref for n in obj.nodes]
                nodes.update({str(node_id): coord for node_id, coord in zip(ids, coords)})
                road_ways.append({'id': obj.id, 'nodes': ids, 'tags': tags})
        elif obj.is_area() and kind and kind != 'roads':
            try:
                geometry = json.loads(factory.create_multipolygon(obj))
            except (RuntimeError, ValueError):
                skipped['invalid_area'] += 1
                continue
            flat = [p for poly in geometry['coordinates'] for ring in poly for p in ring]
            if intersects_bounds(flat, bounds):
                groups[kind].append({'type': 'Feature', 'properties': {**tags, 'osm_id': f'a{obj.id}'},
                                     'geometry': geometry})
        elif obj.is_relation() and tags.get('type') == 'restriction':
            areas.append({'id': obj.id, 'tags': tags,
                          'members': [{'type': m.type, 'ref': m.ref, 'role': m.role} for m in obj.members]})
    for key, features in groups.items():
        write_json(output / 'features' / f'{key}.geojson', {'type': 'FeatureCollection', 'features': features})
    relevant = {way['id'] for way in road_ways}
    restrictions = [r for r in areas if any(m['type'] == 'w' and m['ref'] in relevant for m in r['members'])]
    write_json(output / 'routing' / 'osm-road-source.json', {
        'version': 1, 'bounds': bounds, 'nodes': nodes, 'ways': road_ways, 'restrictions': restrictions,
        'status': 'Source only: not yet a validated navigable graph',
    })
    report = {'bounds': bounds, 'counts': {key: len(value) for key, value in groups.items()},
              'roadNodes': len(nodes), 'roadWays': len(road_ways), 'turnRestrictions': len(restrictions),
              'skipped': dict(skipped)}
    write_json(output / 'osm-extraction-report.json', report)
    print(json.dumps(report, ensure_ascii=False), flush=True)
    return groups


def tile_ranges(bounds, zoom):
    west, south, east, north = bounds
    left, top = tile_xy(west, north, zoom)
    right, bottom = tile_xy(east, south, zoom)
    last = 2 ** zoom - 1
    return range(max(0, int(left)), min(last, int(right)) + 1), range(max(0, int(top)), min(last, int(bottom)) + 1)


def render(groups, output, bounds, maximum):
    from PIL import Image, ImageDraw
    styles = {'water': '#92c8df', 'farmland': '#e6dfb6', 'vegetation': '#c3d8ad',
              'buildings': '#c4b9aa', 'roads': '#ffffff'}
    count = 0
    for zoom in range(maximum + 1):
        xs, ys = tile_ranges(bounds, zoom)
        buckets = collections.defaultdict(list)
        for key in styles:
            for feature in groups[key]:
                geometry = feature['geometry']
                if geometry['type'] == 'LineString':
                    shapes = [('line', geometry['coordinates'])]
                elif geometry['type'] == 'MultiPolygon':
                    shapes = [('polygon', polygon) for polygon in geometry['coordinates']]
                else:
                    continue
                for kind, coords in shapes:
                    rings = [coords] if kind == 'line' else coords
                    projected = [[tile_xy(*p, zoom) for p in ring] for ring in rings]
                    flat = [p for ring in projected for p in ring]
                    x0, x1 = max(xs.start, math.floor(min(p[0] for p in flat))), min(xs.stop - 1, math.floor(max(p[0] for p in flat)))
                    y0, y1 = max(ys.start, math.floor(min(p[1] for p in flat))), min(ys.stop - 1, math.floor(max(p[1] for p in flat)))
                    for x in range(x0, x1 + 1):
                        for y in range(y0, y1 + 1):
                            buckets[x, y].append((key, kind, projected, feature['properties']))
        for x in xs:
            for y in ys:
                image = Image.new('RGB', (256, 256), '#f0ede3')
                draw = ImageDraw.Draw(image)
                for key, kind, rings, tags in buckets[x, y]:
                    points = [[((px - x) * 256, (py - y) * 256) for px, py in ring] for ring in rings]
                    if kind == 'polygon':
                        # A mask keeps polygon holes transparent, not painted as land cover.
                        mask = Image.new('L', image.size)
                        painter = ImageDraw.Draw(mask)
                        painter.polygon(points[0], fill=255)
                        for hole in points[1:]:
                            painter.polygon(hole, fill=0)
                        image.paste(styles[key], mask=mask)
                    else:
                        major = tags.get('highway') in ('motorway', 'trunk', 'primary', 'secondary')
                        width = 3 if major else 1
                        if key == 'roads':
                            draw.line(points[0], fill='#c3b4a1', width=width + 2)
                        draw.line(points[0], fill=styles[key], width=width)
                tile = output / 'basemaps/street' / str(zoom) / str(x) / f'{y}.png'
                tile.parent.mkdir(parents=True, exist_ok=True)
                image.save(tile)
                count += 1
        print(f'XYZ zoom {zoom}: complete ({count} tiles total)', flush=True)
    return count


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--pbf', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--bounds', type=float, nargs=4, default=[90.2, 31.9, 93.3, 34.0])
    parser.add_argument('--max-zoom', type=int, default=12)
    args = parser.parse_args()
    west, south, east, north = args.bounds
    if not (-180 <= west < east <= 180 and -85 <= south < north <= 85 and 0 <= args.max_zoom <= 15):
        parser.error('Invalid bounds or maximum zoom (0–15)')
    if (args.output / 'manifest.json').exists():
        parser.error('Output already contains a manifest; use a new output directory')
    groups = extract(args.pbf, args.output, args.bounds)
    count = render(groups, args.output, args.bounds, args.max_zoom)
    write_json(args.output / 'manifest.json', {
        'version': 1, 'name': '安多县 OSM 基础街道包（简化样式）', 'bounds': args.bounds,
        'basemaps': {'street': {'url': 'basemaps/street/{z}/{x}/{y}.png',
                               'maximumLevel': args.max_zoom, 'sample': [0, 0, 0],
                               'credit': '© OpenStreetMap contributors, data processed by Geofabrik; ODbL 1.0'}},
    })
    with (args.output / 'SHA256SUMS').open('w') as checksums:
        for file in sorted(args.output.rglob('*')):
            if file.is_file() and file.name != 'SHA256SUMS' and not file.name.startswith('._'):
                checksums.write(f'{hashlib.sha256(file.read_bytes()).hexdigest()}  {file.relative_to(args.output).as_posix()}\n')
    print(f'Completed {count} real OSM-derived tiles. No imagery/terrain/navigation engine included.', flush=True)


if __name__ == '__main__':
    main()