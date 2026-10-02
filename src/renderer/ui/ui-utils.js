// ═══════════════════════════════════════════
//  Shared UI utilities
// ═══════════════════════════════════════════

export function esc(t) {
  const d = document.createElement('div');
  d.textContent = t;
  return d.innerHTML;
}

export function debounce(fn, ms) {
  let timer = null;
  return (...args) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}
