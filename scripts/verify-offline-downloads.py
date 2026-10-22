"""Verify real files only; ignore macOS AppleDouble sidecars."""
import gzip
import hashlib
import json
from pathlib import Path

base = Path('/Volumes/chassis/anduo-offline')
pack = base / 'packs/anduo-osm-county-v1'
errors = []
lines = (pack / 'SHA256SUMS').read_text().splitlines()
for line in lines:
    digest, name = line.split('  ', 1)
    if hashlib.sha256((pack / name).read_bytes()).hexdigest() != digest:
        errors.append(name)
dem = sorted((base / 'source/dem').glob('N*.hgt.gz'))
for file in dem:
    try:
        with gzip.open(file, 'rb') as stream:
            while stream.read(1024 * 1024):
                pass
    except Exception as error:
        errors.append(f'{file.name}: {error}')
report = {'verifiedPackFiles': len(lines), 'demValidFiles': len(dem), 'errors': errors,
          'demDownloadComplete': 'DEM_EXPANDED_DOWNLOAD_COMPLETE' in (base / 'download-dem-expanded.log').read_text(),
          'packLogicalBytes': sum(p.stat().st_size for p in pack.rglob('*')
                                  if p.is_file() and not p.name.startswith('._'))}
(base / 'verification-report.json').write_text(json.dumps(report, indent=2))
print(json.dumps(report, indent=2), flush=True)
raise SystemExit(bool(errors))