/** @param {import('geojson').Feature} feature */
export function isAnduoBoundary(feature) {
  const p = feature.properties || {};
  const county = p.admin?.county || p.county;
  return (
    ['Polygon', 'MultiPolygon'].includes(feature.geometry.type) &&
    ((p.level === 'county' && (String(p.adcode) === '540624' || p.name === '安多县')) ||
      (['town', 'village'].includes(p.level) && county === '安多县'))
  );
}

/** @param {import('geojson').Feature[]} features */
export function anduoBoundaries(features) {
  /** @type {Map<string, import('geojson').Feature>} */
  const unique = new Map();
  for (const feature of features.filter(isAnduoBoundary)) {
    const p = feature.properties || {};
    const key = [
      p.level,
      p.adcode || p.id,
      p.admin?.county || p.county,
      p.admin?.town || p.town,
      p.name,
    ].join(':');
    unique.set(key, feature);
  }
  return [...unique.values()];
}
