// Small DOM + formatting helpers shared by every view.
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

export function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
export function uid(n = 20) {
  const a = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const b = crypto.getRandomValues(new Uint8Array(n));
  return Array.from(b, x => a[x % a.length]).join('');
}
export function groupCode() {
  const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const b = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(b, x => a[x % a.length]).join('');
}
export const todayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export function dayOfYear(d = new Date()) {
  const start = new Date(d.getFullYear(), 0, 0);
  return Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()) - start) / 86400000); // round: DST-safe
}
export function daysBetween(aKey, bKey) {
  const [y1, m1, d1] = aKey.split('-').map(Number), [y2, m2, d2] = bKey.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
}
export function fmtDate(ms, opts = {}) {
  if (!ms) return '';
  const d = new Date(ms);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }), ...opts });
}
export function fmtLongDate(d = new Date()) {
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
}
export function fmtTime(sec) {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}
export function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}
export function seededShuffle(arr, seed) {
  const a = arr.slice();
  let s = seed >>> 0 || 1;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
export function hashStr(s) { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }

export async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, '0')).join('');
}

// ---------- toast ----------
let toastTimer;
export function toast(msg, ms = 2600) {
  let t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}

// ---------- bottom sheet / modal ----------
const sheetStack = [];
export function openSheet(html, { onMount, full = false, label = 'Dialog' } = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'sheet-wrap';
  wrap.innerHTML = `<div class="sheet-backdrop" data-close></div>
    <div class="sheet ${full ? 'sheet-full' : ''}" role="dialog" aria-modal="true" aria-label="${esc(label)}">
      <button class="sheet-x" data-close aria-label="Close">${icon('x')}</button>
      <div class="sheet-body">${html}</div></div>`;
  document.body.appendChild(wrap);
  document.body.classList.add('no-scroll');
  requestAnimationFrame(() => wrap.classList.add('open'));
  const api = {
    el: wrap.querySelector('.sheet-body'),
    close() {
      wrap.classList.remove('open');
      const i = sheetStack.indexOf(api); if (i >= 0) sheetStack.splice(i, 1);
      setTimeout(() => wrap.remove(), 220);
      if (!sheetStack.length) document.body.classList.remove('no-scroll');
      api.onClose && api.onClose();
    },
    set(html2) { api.el.innerHTML = html2; }
  };
  wrap.addEventListener('click', e => { if (e.target.closest('[data-close]')) api.close(); });
  sheetStack.push(api);
  onMount && onMount(api);
  return api;
}
export function closeAllSheets() { [...sheetStack].forEach(s => s.close()); }

export function confirmSheet(title, body, okLabel = 'Yes', danger = false) {
  return new Promise(res => {
    let done = false;
    const s = openSheet(`<h2 class="sheet-title">${esc(title)}</h2><p class="lead">${esc(body)}</p>
      <div class="btn-row"><button class="btn btn-ghost" data-no>Cancel</button><button class="btn ${danger ? 'btn-danger' : 'btn-gold'}" data-ok>${esc(okLabel)}</button></div>`);
    s.onClose = () => { if (!done) res(false); };
    s.el.querySelector('[data-ok]').onclick = () => { done = true; res(true); s.close(); };
    s.el.querySelector('[data-no]').onclick = () => { done = true; res(false); s.close(); };
  });
}

// ---------- icons (inline SVG, stroke = currentColor) ----------
const P = {
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  pray: '<path d="M12 20.5V4.2c0-.9-.7-1.4-1.4-1.1-.5.2-.8.6-.9 1.1L8.4 10.6 5.6 14.4a1.6 1.6 0 0 0 .3 2.2l3.6 3.9"/><path d="M12 20.5V4.2c0-.9.7-1.4 1.4-1.1.5.2.8.6.9 1.1l1.3 6.4 2.8 3.8a1.6 1.6 0 0 1-.3 2.2l-3.6 3.9"/>',
  users: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5"/><circle cx="17" cy="9" r="2.6"/><path d="M15.5 14.6c3 .1 5.5 2 5.5 5"/>',
  book: '<path d="M3 5.5C5.5 4 9 4 12 6c3-2 6.5-2 9-.5V19c-2.5-1.3-6-1.3-9 .7-3-2-6.5-2-9-.7z"/><path d="M12 6v13.7"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7"/>',
  play: '<path d="M7 4.5v15l13-7.5z" fill="currentColor" stroke="none"/>',
  pause: '<rect x="6" y="4.5" width="4" height="15" rx="1" fill="currentColor" stroke="none"/><rect x="14" y="4.5" width="4" height="15" rx="1" fill="currentColor" stroke="none"/>',
  back15: '<path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4v4.5h4.5"/><text x="12" y="15.5" font-size="7" text-anchor="middle" fill="currentColor" stroke="none" font-family="Inter,sans-serif" font-weight="700">15</text>',
  fwd15: '<path d="M20 12a8 8 0 1 1-2.4-5.7"/><path d="M20 4v4.5h-4.5"/><text x="12" y="15.5" font-size="7" text-anchor="middle" fill="currentColor" stroke="none" font-family="Inter,sans-serif" font-weight="700">15</text>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="M4.5 12.5l5 5 10-11"/>',
  chevR: '<path d="M9 5l7 7-7 7"/>',
  flag: '<path d="M6 21V4M6 4.5h11l-2.5 4 2.5 4H6"/>',
  ban: '<circle cx="12" cy="12" r="8.5"/><path d="M6 6l12 12"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8"/>',
  chevL: '<path d="M15 5l-7 7 7 7"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>',
  unlock: '<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 7.6-1.7"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M14 6l4 4"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  heart: '<path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.3a4.3 4.3 0 0 1 7.5 2.5C19.5 15.4 12 20 12 20z"/>',
  star: '<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 16.9l-5.2 2.8 1-5.9L3.5 9.7l5.9-.8z"/>',
  tag: '<path d="M3.5 12.5V4h8.5l8.5 8.5-8.5 8.5z"/><circle cx="8" cy="8.5" r="1.4"/>',
  journal: '<path d="M6 3.5h11a1.5 1.5 0 0 1 1.5 1.5v14.5a1.5 1.5 0 0 1-1.5 1.5H6z"/><path d="M6 3.5v17M10 8h5M10 11.5h5"/>',
  note: '<path d="M5 4h14v11l-5 5H5z"/><path d="M14 20v-5h5"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3.5 2"/>',
  church: '<path d="M12 2.5v4M10 4.5h4"/><path d="M5 21V12l7-5.5 7 5.5v9"/><path d="M10 21v-4.5a2 2 0 0 1 4 0V21"/>',
  cross: '<path d="M12 3v18M6.5 8.5h11"/>',
  flame: '<path d="M12 21c-3.6 0-6-2.4-6-5.6 0-3.6 3-5.4 3.4-9.4 2.4 1.6 3.4 3.4 3.4 5.4 1-.6 1.6-1.8 1.8-3 1.6 1.6 3.4 3.8 3.4 7 0 3.2-2.4 5.6-6 5.6z"/>',
  home: '<path d="M4 11l8-6.5 8 6.5V20h-5v-5.5h-6V20H4z"/>',
  globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.5 2.6 3.5 5.5 3.5 8.5s-1 5.9-3.5 8.5c-2.5-2.6-3.5-5.5-3.5-8.5s1-5.9 3.5-8.5z"/>',
  calendar: '<rect x="4" y="5.5" width="16" height="15" rx="2"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4"/>',
  qr: '<rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><path d="M14 14h2v2h-2zM18 18h2v2h-2zM14 18h2M18 14h2"/>',
  share: '<path d="M12 15V3.5M7.5 8L12 3.5 16.5 8"/><path d="M5 12.5V20h14v-7.5"/>',
  shield: '<path d="M12 3l7.5 3v5.5c0 4.6-3.2 8.2-7.5 9.5-4.3-1.3-7.5-4.9-7.5-9.5V6z"/>',
  fingerprint: '<path d="M7.5 19.5c1-2 1.5-4.5 1.5-7.5a3 3 0 0 1 6 0c0 2.5-.3 5-1 7"/><path d="M5 16c.6-1.4 1-2.7 1-4a6 6 0 0 1 12 0c0 1.5-.1 3-.4 4.4"/><path d="M12 12c0 3.5-.6 6.3-2 8.5"/>',
  volume: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>',
  list: '<path d="M8.5 6.5h11M8.5 12h11M8.5 17.5h11"/><circle cx="4.5" cy="6.5" r="1" fill="currentColor"/><circle cx="4.5" cy="12" r="1" fill="currentColor"/><circle cx="4.5" cy="17.5" r="1" fill="currentColor"/>',
  type: '<path d="M5 6.5V5h14v1.5M12 5v14M9 19h6"/>',
  textsize: '<path d="M3 18l4.5-11L12 18M4.6 14.5h5.8"/><path d="M14 18l3-7.5 3 7.5M15 15.8h4"/>',
  sparkle: '<path d="M12 3.5l1.8 5.2 5.2 1.8-5.2 1.8L12 17.5l-1.8-5.2L5 10.5l5.2-1.8z"/>',
  leaf: '<path d="M5 19c0-8 5-13.5 14.5-14-.5 9.5-6 14.5-14 14.5z"/><path d="M5 19l7-7"/>',
  family: '<circle cx="7.5" cy="7" r="2.5"/><circle cx="16.5" cy="7" r="2.5"/><circle cx="12" cy="13" r="2"/><path d="M3.5 20c0-3.5 1.8-6 4-6.5M20.5 20c0-3.5-1.8-6-4-6.5M9 21c0-2.4 1.3-4 3-4s3 1.6 3 4"/>',
  man: '<circle cx="12" cy="6" r="2.8"/><path d="M8 21v-6.5L6.5 13V10a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v3L16 14.5V21"/>',
  woman: '<circle cx="12" cy="6" r="2.8"/><path d="M9 21v-4.5H6.5l2.8-7a2 2 0 0 1 1.8-1.2h1.8a2 2 0 0 1 1.8 1.2l2.8 7H15V21"/>',
  circle3: '<circle cx="12" cy="6.5" r="2.5"/><circle cx="6" cy="16.5" r="2.5"/><circle cx="18" cy="16.5" r="2.5"/>',
  dots: '<circle cx="6" cy="12" r="1.4" fill="currentColor"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/><circle cx="18" cy="12" r="1.4" fill="currentColor"/>',
  youth: '<path d="M12 3l2.4 4.9 5.3.8-3.9 3.7.9 5.3L12 15.2l-4.7 2.5.9-5.3-3.9-3.7 5.3-.8z"/>',
  speed: '<path d="M4.5 17a8 8 0 1 1 15 0"/><path d="M12 13l4-4"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14.5-4.5M4 13a8 8 0 0 0 14.5 4.5"/><path d="M5 3v4h4M19 21v-4h-4"/>',
  signout: '<path d="M14 4h5v16h-5M10 8l-4 4 4 4M6 12h10"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.8v.4"/>',
  bell: '<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 1.5h-15z"/><path d="M10 20.5a2 2 0 0 0 4 0"/>',
  google: '<path d="M21 12.2c0-.7-.1-1.3-.2-1.9H12v3.6h5c-.2 1.2-.9 2.2-1.9 2.8v2.4h3.1c1.8-1.7 2.8-4.1 2.8-6.9z" fill="#4285F4" stroke="none"/><path d="M12 21.5c2.6 0 4.7-.8 6.2-2.3l-3.1-2.4c-.8.6-1.9.9-3.1.9-2.4 0-4.4-1.6-5.1-3.8H3.7v2.4A9.4 9.4 0 0 0 12 21.5z" fill="#34A853" stroke="none"/><path d="M6.9 13.9a5.6 5.6 0 0 1 0-3.7V7.8H3.7a9.4 9.4 0 0 0 0 8.5z" fill="#FBBC05" stroke="none"/><path d="M12 6.4c1.4 0 2.6.5 3.5 1.4l2.7-2.7A9.4 9.4 0 0 0 3.7 7.8l3.2 2.4C7.6 8 9.6 6.4 12 6.4z" fill="#EA4335" stroke="none"/>',
};
export function icon(name, cls = '') {
  return `<svg class="ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || P.dots}</svg>`;
}
