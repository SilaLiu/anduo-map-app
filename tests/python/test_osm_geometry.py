import json
import sys
import unittest
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts'))
from osm_geometry import assemble_rings, boundary_geometry, relation_to_geometry


def edges(lines):
    return Counter(tuple(sorted((tuple(a), tuple(b))))
                   for line in lines for a, b in zip(line, line[1:]))


class BoundaryGeometryTests(unittest.TestCase):
    def test_unordered_and_reversed_ways_preserve_every_edge(self):
        segments = [[[0, 0], [1, 0]], [[0, 1], [1, 1]],
                    [[0, 0], [0, 1]], [[1, 1], [1, 0]]]
        rings = assemble_rings(segments)
        self.assertEqual(len(rings), 1)
        self.assertEqual(rings[0][0], rings[0][-1])
        self.assertEqual(edges(segments), edges(rings))

    def test_islands_and_split_holes(self):
        outer = [[[0, 0], [4, 0], [4, 4], [0, 4], [0, 0]],
                 [[10, 0], [12, 0], [12, 2], [10, 0]]]
        inner = [[[1, 1], [2, 1], [2, 2]], [[1, 1], [1, 2], [2, 2]]]
        geometry = boundary_geometry(outer, inner)
        self.assertEqual(geometry['type'], 'MultiPolygon')
        self.assertEqual([len(p) for p in geometry['coordinates']], [2, 1])

    def test_incomplete_or_branched_ways_are_not_force_closed(self):
        for segments in ([[[0, 0], [1, 0], [1, 1]]],
                         [[[0, 0], [1, 0]], [[1, 0], [1, 1]], [[1, 0], [2, 0]]]):
            with self.assertRaises(ValueError):
                assemble_rings(segments)

    def test_missing_nodes_and_orphan_holes_are_rejected(self):
        with self.assertRaises(ValueError):
            relation_to_geometry({'members': [{'type': 'way', 'role': 'outer', 'ref': 7}]},
                                 {1: [0, 0]}, {7: [1, 2]})
        with self.assertRaises(ValueError):
            boundary_geometry([[[0, 0], [1, 0], [1, 1], [0, 0]]],
                              [[[2, 2], [3, 2], [3, 3], [2, 2]]])

    def test_all_bundled_repairs_preserve_source_edges(self):
        manifest = json.loads((ROOT / 'data/anduo-boundary-repairs.json').read_text())
        bundled = json.loads((ROOT / 'data/admin-geojson/xizang/anduo/anduo_all_levels.json').read_text())
        features = {str(f['properties'].get('adcode')): f for f in bundled['features']}
        self.assertEqual(len(manifest['repairs']), 13)
        for repair in manifest['repairs']:
            with self.subTest(town=repair['name']):
                old = repair['originalGeometry']
                polygons = old['coordinates'] if old['type'] == 'MultiPolygon' else [old['coordinates']]
                segments = [p[0][:-1] for p in polygons]
                new = repair['geometry']
                polygons = new['coordinates'] if new['type'] == 'MultiPolygon' else [new['coordinates']]
                rings = [r for p in polygons for r in p]
                self.assertEqual(edges(segments), edges(rings))
                self.assertTrue(all(r[0] == r[-1] for r in rings))
                self.assertEqual(features[repair['adcode']]['geometry'], new)


if __name__ == '__main__':
    unittest.main()
