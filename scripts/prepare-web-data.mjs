import { readdir, readFile, writeFile, mkdir, rm, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { anduoBoundaries } from '../src/web/domain/anduoBoundary.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
const output = path.resolve(root, '../web-data/data');
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
const items = [];
async function scan(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await scan(full);
      continue;
    }
    if (
      !/\.json$/i.test(entry.name) ||
      (directory.endsWith('/anduo') && !/^(540624_|anduo_all_levels\.json)/.test(entry.name))
    )
      continue;
    try {
      const data = JSON.parse(await readFile(full, 'utf8'));
      if (data.type !== 'FeatureCollection' || !data.features?.length) continue;
      const features = anduoBoundaries(data.features);
      if (!features.length) continue;
      const relative = path.relative(root, full).split(path.sep).join('/');
      const destination = path.join(output, relative);
      await mkdir(path.dirname(destination), { recursive: true });
      await writeFile(destination, JSON.stringify({ ...data, features }) + '\n');
      if (!/_all_levels\.json$/.test(entry.name)) {
        const p = features[0].properties || {};
        items.push({
          path: relative,
          name:
            features.length === 1
              ? p.name || entry.name
              : `${p.name || entry.name} (${features.length})`,
        });
      }
    } catch (error) {
      throw new Error(`Cannot index ${full}: ${error.message}`);
    }
  }
}
await scan(path.join(root, 'admin-geojson/xizang/anduo'));
items.sort((a, b) => a.path.localeCompare(b.path));
const index = JSON.stringify(items, null, 2) + '\n';
await writeFile(path.join(root, 'web-boundary-library.json'), index);
await writeFile(path.join(output, 'web-boundary-library.json'), index);
for (const name of ['sandtable-requirements.json', 'anduo-boundary-repairs.json'])
  await copyFile(path.join(root, name), path.join(output, name));
await mkdir(path.join(output, 'sandtable-geojson'), { recursive: true });
for (const name of await readdir(path.join(root, 'sandtable-geojson'))) {
  if (!/\.geojson$|^missing\.json$/.test(name)) continue;
  await copyFile(
    path.join(root, 'sandtable-geojson', name),
    path.join(output, 'sandtable-geojson', name),
  );
}
console.log(`Prepared Anduo web data: ${items.length} boundary files`);
