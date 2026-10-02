"""Repair the known legacy Anduo fragments and record exact migration inputs."""
import json
from pathlib import Path
from osm_geometry import boundary_geometry

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / 'data'
MANIFEST = DATA / 'anduo-boundary-repairs.json'


def repair():
    if MANIFEST.exists():
        raise RuntimeError('Repair manifest already exists; refusing to replace migration history')
    repairs = []
    for path in sorted((DATA / 'admin-geojson/xizang/anduo/towns').glob('*.json')):
        collection = json.loads(path.read_text(encoding='utf-8'))
        for feature in collection['features']:
            properties = feature['properties']
            if properties.get('source') != 'OpenStreetMap':
                continue
            original = feature['geometry']
            polygons = original['coordinates'] if original['type'] == 'MultiPolygon' else [original['coordinates']]
            if any(len(polygon) != 1 for polygon in polygons):
                raise ValueError(f'Unexpected interior rings in legacy data: {path}')
            # These known fragments were closed by the faulty assembler. All
            # endpoints must connect exactly; incomplete data aborts the repair.
            geometry = boundary_geometry([polygon[0][:-1] for polygon in polygons])
            repairs.append({'adcode': str(properties['adcode']), 'name': properties['name'],
                            'originalGeometry': original, 'geometry': geometry})
    replacements = {r['adcode']: r for r in repairs}
    changes = []
    for path in (DATA / 'admin-geojson').rglob('*.json'):
        collection = json.loads(path.read_text(encoding='utf-8'))
        if not isinstance(collection, dict) or collection.get('type') != 'FeatureCollection':
            continue
        changed = False
        for feature in collection.get('features', []):
            properties = feature.get('properties') or {}
            match = replacements.get(str(properties.get('adcode', '')))
            if match and feature.get('geometry') == match['originalGeometry']:
                feature['geometry'] = match['geometry']
                properties['geometry_revision'] = 2
                changed = True
        if changed:
            changes.append((path, collection))
    MANIFEST.write_text(json.dumps({'version': 1, 'repairs': repairs}, ensure_ascii=False) + '\n', encoding='utf-8')
    for path, collection in changes:
        path.write_text(json.dumps(collection, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'Repaired {len(repairs)} towns in {len(changes)} files; saved exact migration inputs')


if __name__ == '__main__':
    repair()
