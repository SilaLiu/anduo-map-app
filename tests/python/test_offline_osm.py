import math
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / 'scripts'))
from importlib import util

spec = util.spec_from_file_location('offline_osm', Path(__file__).resolve().parents[2] / 'scripts/build-offline-osm.py')
module = util.module_from_spec(spec)
spec.loader.exec_module(module)


class OfflineOsmTests(unittest.TestCase):
    def test_xyz_coordinates_and_parent_tiles(self):
        self.assertEqual(module.tile_xy(0, 0, 0), (0.5, 0.5))
        self.assertEqual(module.tile_xy(0, 0, 1), (1, 1))
        for zoom in range(13):
            xs, ys = module.tile_ranges([90.2, 31.9, 93.3, 34], zoom)
            x, y = module.tile_xy(91.5, 32.5, zoom)
            self.assertIn(math.floor(x), xs)
            self.assertIn(math.floor(y), ys)

    def test_crossing_way_is_retained_without_interior_vertex(self):
        self.assertTrue(module.intersects_bounds([[89, 32], [95, 32]], [90, 31, 94, 34]))
        self.assertFalse(module.intersects_bounds([[85, 32], [86, 33]], [90, 31, 94, 34]))

    def test_osm_target_categories(self):
        self.assertEqual(module.category({'highway': 'primary'}), 'roads')
        self.assertEqual(module.category({'building': 'yes'}), 'buildings')
        self.assertIsNone(module.category({'building': 'no'}))
        self.assertEqual(module.category({'natural': 'water'}), 'water')


if __name__ == '__main__':
    unittest.main()