export function flagMarkerImage(color: string) {
  const fill = /^#[0-9a-f]{6}$/i.test(color) ? color : '#e34b62';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="56" viewBox="0 0 48 56"><path d="M8 5H43L33 17L43 29H8Z" fill="${fill}" stroke="#ffffff" stroke-width="2" stroke-linejoin="round"/><path d="M8 4V55" stroke="#ffffff" stroke-width="4"/><path d="M8 4V55" stroke="#263238" stroke-width="2"/></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
