// 套用管理員上傳的新版視覺：所有 img[data-brand] 換成新圖，分頁圖示也一併更換。
// 沒有上傳時維持各頁原本的圖。
import { FIREBASE } from './config.js';

const KEY = 'jdb-brand';
let cur = null;
function apply(b) {
  cur = b && b.logo ? b : null;
  if (!cur) return;
  document.querySelectorAll('img[data-brand]').forEach(img => { if (img.getAttribute('src') !== cur.logo) img.setAttribute('src', cur.logo); });
  document.querySelectorAll('link[rel="icon"], link[rel="apple-touch-icon"]').forEach(l => {
    const v = l.rel === 'icon' ? (cur.icon || cur.logo) : cur.logo;
    if (l.getAttribute('href') !== v) l.setAttribute('href', v);
  });
}
try { apply(JSON.parse(localStorage.getItem(KEY) || 'null')); } catch (e) { /* 沒有暫存 */ }
fetch(`${FIREBASE.databaseURL}/branding.json`).then(r => (r.ok ? r.json() : null)).then(b => {
  try { if (b && b.logo) localStorage.setItem(KEY, JSON.stringify(b)); else localStorage.removeItem(KEY); } catch (e) { /* 無法暫存 */ }
  if (b && b.logo) apply(b); else if (cur) location.reload();
}).catch(() => {});
// 各頁標題列會重畫，新出現的圖片也要換
new MutationObserver(() => { if (cur) apply(cur); }).observe(document.documentElement, { childList: true, subtree: true });
export function refreshBrand(b) { try { if (b) localStorage.setItem(KEY, JSON.stringify(b)); else localStorage.removeItem(KEY); } catch (e) { /* 無法暫存 */ } apply(b); }
