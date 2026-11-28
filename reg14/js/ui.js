// 參賽者系統原型的共用畫面工具
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const P = {
  plus: '<path d="M8 3v10M3 8h10" fill="none"/>',
  minus: '<path d="M3 8h10" fill="none"/>',
  info: '<circle cx="8" cy="8" r="6" fill="none"/><path d="M8 7.2v4" fill="none"/><circle cx="8" cy="4.9" r=".7"/>',
  edit: '<path d="M3 13l1-3.5L11 2.5l2.5 2.5L6.5 12z" fill="none"/>',
  trash: '<path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.7 8.5h5.6l.7-8.5" fill="none"/>',
  check: '<path d="M3 8.5l3.2 3.2L13 4.8" fill="none"/>',
  close: '<path d="M4 4l8 8M12 4l-8 8" fill="none"/>',
  mail: '<rect x="2" y="3.5" width="12" height="9" rx="1.2" fill="none"/><path d="M2.5 4.5L8 9l5.5-4.5" fill="none"/>',
  download: '<path d="M8 2.5v8M4.5 7L8 10.5 11.5 7M3 13h10" fill="none"/>',
  search: '<circle cx="7" cy="7" r="4.5" fill="none"/><path d="M10.4 10.4L14 14" fill="none"/>',
  user: '<circle cx="8" cy="5.5" r="2.8" fill="none"/><path d="M2.8 13.5c.8-2.6 2.8-3.8 5.2-3.8s4.4 1.2 5.2 3.8" fill="none"/>',
  money: '<rect x="1.8" y="4" width="12.4" height="8" rx="1.2" fill="none"/><circle cx="8" cy="8" r="1.8" fill="none"/>',
  car: '<path d="M3 10.5V8l1.5-3.5h7L13 8v2.5zM3 10.5v1.5M13 10.5v1.5" fill="none"/><circle cx="5.5" cy="9.5" r=".7"/><circle cx="10.5" cy="9.5" r=".7"/>',
  chevdown: '<path d="M4 6l4 4 4-4" fill="none"/>',
  chevup: '<path d="M4 10l4-4 4 4" fill="none"/>',
  table: '<rect x="2" y="2.5" width="12" height="11" rx="1" fill="none"/><path d="M2 6h12M2 9.5h12M6 2.5v11" fill="none"/>',
  gear: '<circle cx="8" cy="8" r="2.2" fill="none"/><path d="M8 1.8v2M8 12.2v2M1.8 8h2M12.2 8h2M3.6 3.6l1.4 1.4M11 11l1.4 1.4M3.6 12.4L5 11M11 5l1.4-1.4" fill="none"/>',
  list: '<path d="M5.5 4h8M5.5 8h8M5.5 12h8" fill="none"/><circle cx="2.8" cy="4" r=".8"/><circle cx="2.8" cy="8" r=".8"/><circle cx="2.8" cy="12" r=".8"/>',
  bars: '<path d="M3 13V8M8 13V3M13 13V6" fill="none"/>',
  help: '<circle cx="8" cy="8" r="6" fill="none"/><path d="M6.3 6.2a1.8 1.8 0 1 1 2.4 1.7c-.5.2-.7.6-.7 1.1v.4" fill="none"/><circle cx="8" cy="11.6" r=".7"/>',
  swap: '<path d="M3 5.5h9.5L10 3M13 10.5H3.5L6 13" fill="none"/>',
};
export const icon = k => `<svg class="icon" viewBox="0 0 16 16" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="currentColor" aria-hidden="true">${P[k] || ''}</svg>`;
let tt = null;
export function toast(msg) {
  let el = $('#toast'); if (!el) { el = document.createElement('div'); el.id = 'toast'; document.body.appendChild(el); }
  el.textContent = msg; el.className = 'show'; clearTimeout(tt); tt = setTimeout(() => { el.className = ''; }, 2600);
}
export const header = (s, role, right = '') => `<img src="../live/img/logo.png" alt=""><div><h1>${esc(s.title)}</h1><div class="sub">${esc(s.edition)}　${role}</div></div><span class="spacer"></span>${right}`;
export const demoBar = text => `<div class="demobar">示範模式：資料只存在這個瀏覽器，不會寫進比賽用的資料庫。${text || ''}</div>`;
