// 三個頁面共用的畫面元件
import { sideText, EVENT_FULL, fmtTime } from './model.js';

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const $ = (sel, el = document) => el.querySelector(sel);
export const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];

const ICONS = {
  speaker: '<path d="M3 6.5v3h2.5L9 12.5v-9L5.5 6.5z"/><path d="M11 5.5a3.5 3.5 0 0 1 0 5M12.5 3.5a6 6 0 0 1 0 9" fill="none"/>',
  check: '<path d="M3 8.5l3.2 3.2L13 4.8" fill="none"/>',
  lock: '<rect x="3.5" y="7" width="9" height="6.5" rx="1"/><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" fill="none"/>',
  edit: '<path d="M3 13l.6-3L10.8 2.8l2.4 2.4L6 12.4z" fill="none"/>',
  alert: '<path d="M8 2.2l6 10.8H2z" fill="none"/><path d="M8 6.5v3M8 11.3v.2" fill="none"/>',
  upload: '<path d="M8 11V3M5 5.8l3-3 3 3M3 13h10" fill="none"/>',
  download: '<path d="M8 3v8M5 8.2l3 3 3-3M3 13h10" fill="none"/>',
  copy: '<rect x="5.5" y="5.5" width="7.5" height="7.5" rx="1" fill="none"/><path d="M10.5 5.5v-2a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v5.5a1 1 0 0 0 1 1h1.5" fill="none"/>',
  close: '<path d="M4 4l8 8M12 4l-8 8" fill="none"/>',
  list: '<path d="M5.5 4.5h8M5.5 8h8M5.5 11.5h8M2.5 4.5h.5M2.5 8h.5M2.5 11.5h.5" fill="none"/>',
  score: '<rect x="2.5" y="3.5" width="11" height="9" rx="1" fill="none"/><path d="M8 3.5v9" fill="none"/>',
};
export const icon = n => `<svg class="icon" viewBox="0 0 16 16" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none">${ICONS[n]}</svg>`;

let toastTimer;
export function toast(msg) {
  let el = $('#toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; el.className = 'toast'; document.body.appendChild(el); }
  el.textContent = msg; el.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, 2600);
}

export const STATUS_TEXT = { wait: '等待中', ready: '可開賽', playing: '進行中', reported: '待確認', done: '已確認' };
export const chip = m => `<span class="chip ${m.status}">${STATUS_TEXT[m.status]}</span>`;
export const mins = ts => (ts ? Math.max(0, Math.round((Date.now() - ts) / 60000)) : 0);
export const names = m => `${esc(sideText(m.A, m.team))} <span class="vs">對</span> ${esc(sideText(m.B, m.team))}`;
export const shortEv = m => `${m.ev}${m.no}`;

/** 進行中那一點（或個人賽）的目前局數與比分文字 */
export function liveLine(m, pointIdx) {
  const cur = games => {
    const g = (games || []).filter(x => x && (x[0] !== '' && x[0] != null));
    return g.map(x => `${x[0]}:${x[1]}`).join('　');
  };
  if (!m.team) return cur(m.rec.g);
  const lu = m.rec.lineup || {};
  const one = i => {
    const p = (m.rec.pts || [])[i] || {};
    const r = m.result.pts[i];
    const a = lineName(lu.a, i), b = lineName(lu.b, i);
    return `第${'一二三四五'[i]}點　${a || ''} ${r.a}:${r.b} ${b || ''}${p.table ? `（第 ${p.table} 桌）` : ''}`;
  };
  if (pointIdx != null) return one(pointIdx);
  return m.result.pts.map((r, i) => (r.a + r.b > 0 || ((m.rec.pts || [])[i] || {}).table ? one(i) : '')).filter(Boolean).join('<br>');
}
export function lineName(l, i) {
  if (!l) return '';
  const v = l[i];
  return Array.isArray(v) ? v.filter(Boolean).join('／') : (v || '');
}

/**
 * 球桌地圖：大會台在下方，左排為前半桌號、右排為後半桌號，1 號桌靠近大會台。
 * opt.tag: 'button' 可點；opt.alerts: Set(桌號) 標紅
 */
export function tableMap(state, d, opt = {}) {
  const n = state.tables || 24, half = Math.ceil(n / 2);
  const cell = t => {
    const x = d.tables.get(t);
    const tag = opt.tag || 'div';
    if (!x) return `<${tag} class="tcell" data-table="${t}"><span class="t">${t}</span><span class="muted">空桌</span><span></span></${tag}>`;
    const m = x.m;
    const al = opt.alerts && opt.alerts.has(m.id);
    return `<${tag} class="tcell busy ${al ? 'alert' : ''}" data-table="${t}" data-mid="${esc(m.id)}">
      <span class="t">${t}</span>
      <span class="who"><span class="ev">${esc(shortEv(m))}</span>${x.point != null ? ` 第${'一二三四五'[x.point]}點` : ''}<br>${names(m)}${opt.refs ? `<br><span class="muted">裁判 ${esc(refOf(m, t)) || '未登記'}</span>` : ''}</span>
      <span class="mins"><span class="big">${m.score[0]}:${m.score[1]}</span><br>${m.status === 'reported' ? '待確認' : fmtTime(m.rec.start)}</span></${tag}>`;
  };
  const col = (from, to) => `<div class="col">${Array.from({ length: to - from + 1 }, (_, i) => cell(from + i)).join('')}</div>`;
  return `<div class="map ${opt.refs ? 'tall' : ''}">${col(1, half)}${col(half + 1, n)}<div class="deskbar">大會台</div></div>`;
}

/**
 * 大張的球桌看板：位置同球桌地圖，每桌顯示項目場次、對戰雙方與比分、目前進行的點或各局比分。
 * opt.tag: 'button' 可點；opt.desk: 顯示裁判與已進行時間；opt.alerts: Set(場次 id) 標紅
 */
export function board(state, d, opt = {}) {
  const n = state.tables || 24, half = Math.ceil(n / 2);
  const tag = opt.tag || 'div';
  const cell = t => {
    const x = d.tables.get(t);
    if (!x) return `<${tag} class="bcell" data-table="${t}"><div class="bt"><span class="bn">${t}</span></div><div class="bempty">空桌</div></${tag}>`;
    const m = x.m;
    let line = '';
    if (m.team) {
      if (x.point != null) {
        const r = m.result.pts[x.point], lu = m.rec.lineup || {};
        line = `第${'一二三四五'[x.point]}點　${esc(lineName(lu.a, x.point))} ${r.a}:${r.b} ${esc(lineName(lu.b, x.point))}`;
      }
    } else {
      line = (m.rec.g || []).filter(g => g && g[0] !== '' && g[0] != null && g[1] !== '' && g[1] != null).map(g => `${g[0]}:${g[1]}`).join('　');
    }
    const extra = opt.desk ? `<span class="bx">${m.status === 'reported' ? '待確認' : `${fmtTime(m.rec.start)} 開賽`}　裁判 ${esc(refOf(m, t)) || '未登記'}</span>` : (m.status === 'reported' ? '<span class="bx">待確認</span>' : '');
    return `<${tag} class="bcell busy ${opt.alerts && opt.alerts.has(m.id) ? 'alert' : ''}" data-table="${t}" data-mid="${esc(m.id)}">
      <div class="bt"><span class="bn">${t}</span><span class="be">${esc(shortEv(m))}</span>${extra}</div>
      <div class="bs"><span class="nm">${esc(sideText(m.A, m.team))}</span><b>${m.score[0]}</b></div>
      <div class="bs"><span class="nm">${esc(sideText(m.B, m.team))}</span><b>${m.score[1]}</b></div>
      <div class="bp">${line}</div></${tag}>`;
  };
  const col = (from, to) => `<div class="col">${Array.from({ length: to - from + 1 }, (_, i) => cell(from + i)).join('')}</div>`;
  return `<div class="board">${col(1, half)}${col(half + 1, n)}<div class="deskbar">大會台</div></div>`;
}

/** 某場在某桌的裁判姓名 */
export function refOf(m, t) {
  const r = m.rec;
  if (r.refs && r.refs[t]) return r.refs[t];
  const p = (r.pts || []).find(x => x && Number(x.table) === Number(t) && x.ref);
  return p ? p.ref : (r.ref || '');
}

export function header(state, role, links) {
  return `<img src="img/logo.png" alt=""><div><h1>${esc(state.title || '交大盃')}</h1><div class="sub">${esc(state.edition || '')}${role ? `　${role}` : ''}</div></div>
    <span class="spacer"></span>${links.map(l => `<a href="${l[1]}">${l[0]}</a>`).join('')}`;
}
export { EVENT_FULL };
