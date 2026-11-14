// 資料存取。目前存在這台電腦的瀏覽器（同一台電腦的各分頁會同步）；
// 之後接上雲端資料庫時只換這個檔案，其餘程式不用動。
import { emptyState } from './model.js';

const KEY = 'jdb-live-v1';
const listeners = new Set();
let state = read();

function read() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || 'null');
    return s && s.v === 1 ? s : emptyState();
  } catch (e) { return emptyState(); }
}

export const getState = () => state;
export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emit(local) { listeners.forEach(fn => fn(state, local)); }

/** 修改資料：fn 直接改傳入的 state */
export function update(fn) {
  state = read(); // 先取最新的，避免蓋掉其他分頁的修改
  fn(state);
  state.ts = Date.now();
  localStorage.setItem(KEY, JSON.stringify(state));
  emit(true);
}
/** 修改某一場的紀錄 */
export function updateMatch(id, fn) {
  update(s => { s.m[id] = s.m[id] || {}; fn(s.m[id], s); });
}
export function replaceState(s) {
  state = s; state.ts = Date.now();
  localStorage.setItem(KEY, JSON.stringify(state));
  emit(true);
}
window.addEventListener('storage', e => { if (e.key === KEY) { state = read(); emit(false); } });
