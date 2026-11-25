// 三個頁面共用的畫面元件
import { sideText, EVENT_FULL, fmtTime } from './model.js';

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const $ = (sel, el = document) => el.querySelector(sel);
export const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];

const ICONS = {
  board: '<rect x="1.8" y="3" width="12.4" height="9" rx="1" fill="none"/><path d="M8 3v9M4 6h1.6v3H4zM10.4 6H12v3h-1.6zM5 12.5v1.5M11 12.5v1.5" fill="none"/>',
  bell: '<path d="M4 11.5V7a4 4 0 0 1 8 0v4.5l1 1H3z" fill="none"/><path d="M6.8 13.8a1.3 1.3 0 0 0 2.4 0" fill="none"/>',
  whistle: '<circle cx="5.5" cy="10" r="3.5" fill="none"/><path d="M8.5 7.6 14 5.5V9l-5 .5M5.5 10h.01" fill="none"/><path d="M3 3.5l1.5 1.5M6 2.5v1.8" fill="none"/>',
  shuffle: '<path d="M2 4.5h2.5c3 0 4 7 7 7H14M2 11.5h2.5c1.2 0 2-1.1 2.7-2.3M9.3 6.8C10 5.6 10.8 4.5 12 4.5h2M12.5 3l1.5 1.5L12.5 6M12.5 10l1.5 1.5-1.5 1.5" fill="none"/>',
  gear: '<path d="M6.9 1.8h2.2l.3 1.7 1.3.6 1.4-1 1.6 1.6-1 1.4.6 1.3 1.7.3v2.2l-1.7.3-.6 1.3 1 1.4-1.6 1.6-1.4-1-1.3.6-.3 1.7H6.9l-.3-1.7-1.3-.6-1.4 1-1.6-1.6 1-1.4-.6-1.3-1.7-.3V6.9l1.7-.3.6-1.3-1-1.4 1.6-1.6 1.4 1 1.3-.6z" fill="none"/><circle cx="8" cy="8" r="2" fill="none"/>',
  clipboard: '<rect x="3" y="3" width="10" height="11" rx="1" fill="none"/><path d="M6 2h4v2H6zM5.5 7.5h5M5.5 10h5" fill="none"/>',
  bracket: '<path d="M2 3.5h4v4H2M2 12.5h4v-5M6 5.5h4v5H6M10 8h4" fill="none"/>',
  clock: '<circle cx="8" cy="8" r="6" fill="none"/><path d="M8 4.5V8l2.5 1.5" fill="none"/>',
  plus: '<path d="M8 3v10M3 8h10" fill="none"/>',
  medal: '<circle cx="8" cy="10" r="3.8" fill="none"/><path d="M5.6 7 3.5 1.8h3L8 5.2M10.4 7l2.1-5.2h-3L8 5.2" fill="none"/>',
  trophy: '<path d="M5 2.5h6v3.5a3 3 0 0 1-6 0zM5 3.5H2.8v1a2.2 2.2 0 0 0 2.4 2.2M11 3.5h2.2v1a2.2 2.2 0 0 1-2.4 2.2M8 9v3M5.5 13.5h5" fill="none"/>',
  tables: '<rect x="2" y="2.5" width="5" height="4.5" rx="0.8" fill="none"/><rect x="9" y="2.5" width="5" height="4.5" rx="0.8" fill="none"/><rect x="2" y="9" width="5" height="4.5" rx="0.8" fill="none"/><rect x="9" y="9" width="5" height="4.5" rx="0.8" fill="none"/>',
  search: '<circle cx="7" cy="7" r="4.5" fill="none"/><path d="M10.4 10.4L14 14" fill="none"/>',
  zoomIn: '<circle cx="7" cy="7" r="4.5" fill="none"/><path d="M10.4 10.4L14 14M5 7h4M7 5v4" fill="none"/>',
  zoomOut: '<circle cx="7" cy="7" r="4.5" fill="none"/><path d="M10.4 10.4L14 14M5 7h4" fill="none"/>',
  speaker: '<path d="M3 6.5v3h2.5L9 12.5v-9L5.5 6.5z"/><path d="M11 5.5a3.5 3.5 0 0 1 0 5M12.5 3.5a6 6 0 0 1 0 9" fill="none"/>',
  check: '<path d="M3 8.5l3.2 3.2L13 4.8" fill="none"/>',
  lock: '<rect x="3.5" y="7" width="9" height="6.5" rx="1"/><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" fill="none"/>',
  edit: '<path d="M3 13l.6-3L10.8 2.8l2.4 2.4L6 12.4z" fill="none"/>',
  alert: '<path d="M8 2.2l6 10.8H2z" fill="none"/><path d="M8 6.5v3M8 11.3v.2" fill="none"/>',
  upload: '<path d="M8 10.5V2.5M4.8 5.7L8 2.5l3.2 3.2M2.5 10.5v2.3c0 .4.3.7.7.7h9.6c.4 0 .7-.3.7-.7v-2.3" fill="none"/>',
  print: '<path d="M4 6V2h8v4M4 12H2.5A1 1 0 0 1 1.5 11V7a1 1 0 0 1 1-1h11a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H12M4 10h8v4H4z" fill="none"/>',
  download: '<path d="M8 2.5v8M4.8 7.3L8 10.5l3.2-3.2M2.5 10.5v2.3c0 .4.3.7.7.7h9.6c.4 0 .7-.3.7-.7v-2.3" fill="none"/>',
  copy: '<rect x="5.5" y="5.5" width="7.5" height="7.5" rx="1" fill="none"/><path d="M10.5 5.5v-2a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v5.5a1 1 0 0 0 1 1h1.5" fill="none"/>',
  chevdown: '<path d="M4 6l4 4 4-4" fill="none"/>',
  chevup: '<path d="M4 10l4-4 4 4" fill="none"/>',
  close: '<path d="M4 4l8 8M12 4l-8 8" fill="none"/>',
  list: '<path d="M5.5 4.5h8M5.5 8h8M5.5 11.5h8M2.5 4.5h.5M2.5 8h.5M2.5 11.5h.5" fill="none"/>',
  score: '<rect x="2.5" y="3.5" width="11" height="9" rx="1" fill="none"/><path d="M8 3.5v9" fill="none"/>',
};
export const icon = n => `<svg class="icon" viewBox="0 0 16 16" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none">${ICONS[n]}</svg>`;

let toastTimer;
export function toast(msg, ms = 2600) {
  let el = $('#toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; el.className = 'toast'; document.body.appendChild(el); }
  el.textContent = msg; el.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, ms);
}

export const STATUS_TEXT = { wait: '等待中', ready: '可開賽', playing: '進行中', reported: '已打完', done: '已完賽' };
export const chip = m => `<span class="chip ${m.status}">${STATUS_TEXT[m.status]}</span>`;
export const mins = ts => (ts ? Math.max(0, Math.round((Date.now() - ts) / 60000)) : 0);
export const names = m => `${esc(sideText(m.A, m.team))} <span class="vs">vs</span> ${esc(sideText(m.B, m.team))}`;
export const shortEv = m => `${m.ev}${m.no}`;

/** 進行中那一點（或個人賽）的目前局數與比分文字 */
export function liveLine(m, pointIdx) {
  const cur = games => {
    const g = (games || []).filter(x => x && (x[0] !== '' && x[0] != null));
    return g.map(x => `${esc(x[0])}:${esc(x[1])}`).join('　');
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
/**
 * 球桌排成三排：1–8、9–16、17–24（每排由下往上，靠大會台的是 1、9、17）。
 * 桌數不是 24 時，平均分成三排。
 */
export const TABLE_COLS = 3;
export const perCol = n => Math.ceil(n / TABLE_COLS);
function tableCols(n, cell) {
  const per = perCol(n);
  return Array.from({ length: TABLE_COLS }, (_, c) => { const from = c * per + 1, to = Math.min(n, from + per - 1); return `<div class="col">${Array.from({ length: Math.max(0, to - from + 1) }, (_, i) => cell(from + i)).join('')}</div>`; }).join('');
}
export function tableMap(state, d, opt = {}) {
  const n = state.tables || 24;
  const cell = t => {
    const x = d.tables.get(t);
    const tag = opt.tag || 'div';
    if (!x) return `<${tag} class="tcell" data-table="${t}"><span class="t">${t}</span><span class="muted">空桌</span><span></span></${tag}>`;
    const m = x.m;
    const al = opt.alerts && opt.alerts.has(m.id);
    return `<${tag} class="tcell busy ${al ? 'alert' : ''}" data-table="${t}" data-mid="${esc(m.id)}">
      <span class="t">${t}</span>
      <span class="who"><span class="ev">${esc(shortEv(m))}</span>${x.point != null ? `<span class="pt"> 第${'一二三四五'[x.point]}點</span>` : ''}<span class="nms"><br>${names(m)}${opt.refs ? `<br><span class="muted">裁判 ${esc(refOf(m, t)) || '未登記'}</span>` : ''}</span></span>
      <span class="mins"><span class="big">${m.score[0]}:${m.score[1]}</span><span class="tm"><br>${m.status === 'reported' ? '已打完' : fmtTime(m.rec.start)}</span></span></${tag}>`;
  };
  return `<div class="map ${opt.refs ? 'tall' : ''}">${tableCols(n, cell)}<div class="deskbar">大會台</div></div>`;
}

/**
 * 大張的球桌看板：位置同球桌地圖，每桌顯示項目場次、對戰雙方與比分、目前進行的點或各局比分。
 * opt.tag: 'button' 可點；opt.desk: 顯示裁判與已進行時間；opt.alerts: Set(場次 id) 標紅
 */
// 看板上的一方：校名與姓名分開，手機上校名放小字一行
const bsName = (x, team) => (team || !(x && x.school) ? `<span class="nm">${esc(sideText(x, team))}</span>` : `<span class="nm"><span class="sch">${esc(x.school)} </span><span class="pn">${esc(x.name || '')}</span></span>`);
export function board(state, d, opt = {}) {
  const n = state.tables || 24;
  const tag = opt.tag || 'div';
  const cell = t => {
    const x = d.tables.get(t);
    if (!x) return `<${tag} class="bcell ${opt.match ? 'dim' : ''}" data-table="${t}"><div class="bt"><span class="bn">${t}</span></div><div class="bempty">空桌</div></${tag}>`;
    const m = x.m;
    let line = '';
    if (m.team) {
      if (x.point != null) {
        const r = m.result.pts[x.point], lu = m.rec.lineup || {};
        line = `第${'一二三四五'[x.point]}點　${esc(lineName(lu.a, x.point))} ${r.a}:${r.b} ${esc(lineName(lu.b, x.point))}`;
      }
    } else {
      line = (m.rec.g || []).filter(g => g && g[0] !== '' && g[0] != null && g[1] !== '' && g[1] != null).map(g => `${esc(g[0])}:${esc(g[1])}`).join('　');
    }
    const extra = opt.desk ? `<span class="bx">${m.status === 'reported' ? '已打完' : `${fmtTime(m.rec.start)} 開賽`}　裁判 ${esc(refOf(m, t)) || '未登記'}</span>` : (m.status === 'reported' ? '<span class="bx">已打完</span>' : '');
    return `<${tag} class="bcell busy ${opt.alerts && opt.alerts.has(m.id) ? 'alert' : ''} ${opt.match && !opt.match(m, x.point) ? 'dim' : ''}" data-table="${t}" data-mid="${esc(m.id)}">
      <div class="bt"><span class="bn">${t}</span><span class="be">${esc(shortEv(m))}</span>${extra}</div>
      <div class="bs">${bsName(m.A, m.team)}<b>${m.score[0]}</b></div>
      <div class="bs">${bsName(m.B, m.team)}<b>${m.score[1]}</b></div>
      <div class="bduel"><span class="nm r">${esc(sideText(m.A, m.team))}</span><b>${m.score[0]} : ${m.score[1]}</b><span class="nm">${esc(sideText(m.B, m.team))}</span></div>
      <div class="bp">${line}</div></${tag}>`;
  };
  return `<div class="board">${tableCols(n, cell)}<div class="deskbar">大會台</div></div>`;
}

/**
 * 大會台用的球桌看板。寬螢幕：大會台在左，三列由上而下是 1–8、9–16、17–24；
 * 窄螢幕：同球桌地圖（大會台在下、三排）。細節點桌子看。
 */
export function deskBoard(state, d, opt = {}) {
  const n = state.tables || 24, per = perCol(n);
  // 個人賽：校名一行、姓名一行；團體賽：隊名一行
  const side = x => `<span class="wn">${x && x.school ? `<span class="sch">${esc(x.school)}</span>` : ''}<span class="nm">${String((x && x.name) || '').split(/[\/／]/).map(esc).join('<br>')}</span></span>`;
  const cell = t => {
    const r = Math.ceil(t / per), c = t - (r - 1) * per;
    const pos = `style="--r:${r};--c:${c}"`;
    const x = d.tables.get(t);
    if (!x) return `<button class="wcell" ${pos} data-table="${t}"><span class="bn">${t}</span><span class="bempty">空桌</span></button>`;
    const m = x.m;
    return `<button class="wcell busy ${opt.alerts && opt.alerts.has(t) ? 'alert' : ''} ${m.status === 'reported' ? 'rep' : ''} ${x.idle ? 'idle' : ''}" ${pos} data-table="${t}" data-mid="${esc(m.id)}">
      <span class="bn">${t}</span><span class="be">${esc(shortEv(m))}</span>${x.point != null ? `<span class="bpt">第${'一二三四五'[x.point]}點</span>` : ''}
      ${side(m.A)}${side(m.B)}<span class="wsc">${m.score[0]} : ${m.score[1]}</span>
      <span class="wx">${m.status === 'reported' ? '已打完' : x.idle ? '這桌的點已打完，可派其他場' : `${fmtTime(m.rec.start)} 開賽`}<br>裁判 ${esc(refOf(m, t)) || '未登記'}</span></button>`;
  };
  return `<div class="wboard" style="--half:${per}"><div class="wdesk">大會台</div>${Array.from({ length: n }, (_, i) => cell(i + 1)).join('')}</div>`;
}

/**
 * 團體賽預賽循環表：比照完成籤表，左下半寫場次，對角一條斜線，右上半寫比數（列的隊伍在前）。
 * shown(m)：要不要顯示比數；opt.mark(m)：額外加在格子上的 class
 */
export function groupTables(e, shown, opt = {}) {
  const N = Math.max(...e.groups.map(g => g.teams.length));
  return e.groups.map(g => {
    const find = (a, b) => g.matches.find(x => (x.A.name === a && x.B.name === b) || (x.A.name === b && x.B.name === a));
    const mk = m => (opt.mark ? ` ${opt.mark(m)}` : '');
    const cell = (a, b, i, j) => {
      const m = find(a, b);
      if (!m) return '<td></td>';
      if (i > j) return `<td class="lk no${mk(m)}" data-mid="${esc(m.id)}">${esc(m.no)}</td>`;
      if (!shown(m)) return `<td class="${mk(m).trim()}"></td>`;
      const mine = m.A.name === a;
      return `<td class="lk sc${mk(m)}" data-mid="${esc(m.id)}">${m.score[mine ? 0 : 1]}:${m.score[mine ? 1 : 0]}</td>`;
    };
    const st = t => g.table.rows.find(r => r.team === t);
    const tag = t => (g.rank.c === t ? '<span class="chip ready rk">冠</span>' : g.rank.r === t ? '<span class="chip reported rk">亞</span>' : '');
    const pad = n => '<td></td>'.repeat(n);
    const nmw = Math.max(4, ...g.teams.map(t => [...String(t)].reduce((n, c) => n + (c.charCodeAt(0) > 255 ? 1 : 0.55), 0))) + 2.6 + (g.rank.c || g.rank.r ? 1.6 : 0);
    return `<div class="grpw"><table class="grp" style="--nmw:${nmw.toFixed(1)}em;--nc:${N}"><thead><tr><th class="hd">${g.letter} 組</th>${Array.from({ length: N }, (_, i) => `<th>${g.teams[i] ? `${i + 1}<span class="tn"> ${esc(g.teams[i])}</span>` : ''}</th>`).join('')}<th class="wl">勝</th><th class="wl">敗</th></tr></thead><tbody>
      ${g.teams.map((t, i) => `<tr><td class="nm"><span class="ix">${i + 1}</span>${tag(t)}${esc(t)}</td>${g.teams.map((u, j) => (i === j ? '<td class="diag"></td>' : cell(t, u, i, j))).join('')}${pad(N - g.teams.length)}<td>${st(t).w}</td><td>${st(t).l}</td></tr>`).join('')}</tbody></table></div>`;
  }).join('');
}

/**
 * 廣播列表（大會台與即時賽程共用）：最新的在最上面，項目用顏色標籤，桌次放大。
 * calls：[{ ts, mid, tables, text }]；D：derive 的結果
 */
export function callList(calls, D, opt = {}) {
  const list = (calls || []).slice().reverse().map(c => ({ c, m: D.byId.get(c.mid) }))
    .filter(x => !opt.filter || opt.filter(x)).slice(0, opt.max || 8);
  return list.map(({ c, m }, i) => {
    const tb = (c.tables && c.tables.length ? c.tables : m ? m.tables : []) || [];
    // 第一行：時間、項目、場次、桌次；第二行：對戰雙方（手機與電腦同一種排法）
    return `<div class="bci ${i ? '' : 'new'}"><div class="bch"><span class="bct">${fmtTime(c.ts)}</span>${m ? `<span class="evtag ev-${esc(m.ev)}">${esc(m.ev)}</span><span class="bcm">${esc(m.no)}</span>` : ''}
      <span class="bctb">${tb.length ? `第 <b>${tb.join('、')}</b> 桌` : ''}</span>${opt.undo ? `<button class="btn ghost sm" data-uncall="${c.ts}" title="收回這則廣播">收回</button>` : ''}</div>
      <div class="bcv">${m ? `<span class="bcs">${esc(sideText(m.A, m.team))}</span><span class="vs">vs</span><span class="bcs">${esc(sideText(m.B, m.team))}</span>` : esc(c.text)}</div></div>`;
  }).join('');
}

/** 某場在某桌的裁判姓名 */
export function refOf(m, t) {
  const r = m.rec;
  if (r.refs && r.refs[t]) return r.refs[t];
  const p = (r.pts || []).find(x => x && Number(x.table) === Number(t) && x.ref);
  return p ? p.ref : (r.ref || '');
}

/**
 * 管理頁面共用的「切換系統」：首頁、抽籤系統、大會台，目前所在的那個加底線。
 * root：從本頁到網站根目錄的相對路徑
 */
export function sysNav(cur, root) {
  const items = [['home', '首頁', ''], ['draw', '抽籤系統', 'draw/'], ['desk', '大會台', 'live/desk.html']];
  return `<nav class="top-nav" aria-label="切換系統">${items.map(([k, t, p]) => `<a class="${k === cur ? 'on' : ''}" href="${root}${p}">${t}</a>`).join('')}</nav>`;
}
/** 標題列。opt.nav：要顯示切換系統時填目前系統；links：本頁專用連結；opt.account：登出按鈕 */
export function header(state, role, links = [], opt = {}) {
  const group = list => (list.length ? `<div class="top-group">${list.join('')}</div>` : '');
  return `<img src="img/logo.png" alt="" data-brand><div><h1>${esc(state.title || '交大盃')}</h1><div class="sub">${esc(state.edition || '')}${role ? `　${role}` : ''}</div></div>
    <span class="spacer"></span><div class="top-actions">${opt.nav ? sysNav(opt.nav, '../') : ''}${group(links.map(l => `<a href="${l[1]}${location.search}">${l[0]}</a>`))}${group(opt.account ? [opt.account] : [])}</div>`;
}
export { EVENT_FULL };

/** 裁判交接紀錄：第 5 桌 10:02 王小明 → 10:30 李大華 */
export function refLogHtml(rec, fmt) {
  const log = (rec && rec.reflog) || [];
  if (!log.length) return '';
  const by = new Map();
  log.forEach(x => { if (!by.has(x.t)) by.set(x.t, []); by.get(x.t).push(x); });
  return [...by.entries()].sort((a, b) => a[0] - b[0]).map(([t, l]) => `<div class="reflog">第 ${esc(t)} 桌裁判：${l.map(x => `<span>${fmt(x.ts)} ${esc(x.n)}</span>`).join(' → ')}</div>`).join('');
}
