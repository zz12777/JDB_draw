// 賽程時間表（即時賽程與大會台共用）：每天一張表，列是時段、欄是項目。
// 大會台多傳 D：每格依場次進度上色，同一時段有好幾格時標出叫場順序。
import { EVENT_ORDER, dayLabel, IND_ORDER } from './model.js';
import { toCn } from '../../js/util.js';
import { esc } from './ui.js';

const TEAM = ['男團', '女團', '社團'];
const isInd = ev => IND_ORDER.includes(ev);

/** 這一格包含的場次 */
export function cellMatches(D, x) {
  if (!D || x.draw) return [];
  const e = D.events.find(y => y.name === x.ev);
  if (!e) return [];
  return e.matches.filter(m => !!x.f === (m.stage === 'F') && m.num >= x.from && m.num <= x.to);
}

/** 一格的狀態：done 全部完賽、live 進行中（有場次在打或已經打了一部分）、'' 還沒開始 */
function cellState(D, x, s) {
  if (x.draw) { const e = (s.events || []).find(y => y.name === x.ev); return e && e.finalPub ? 'done' : ''; }
  const ms = cellMatches(D, x);
  if (!ms.length) return '';
  if (ms.every(m => m.status === 'done')) return 'done';
  return ms.some(m => m.status === 'playing' || m.status === 'reported' || m.status === 'done') ? 'live' : '';
}

/**
 * 同一時段開始的幾格，依叫場原則排先後：
 * 個人賽為主（同一輪依男單、女單、男雙、女雙）→ 團體決賽 → 團體預賽；
 * 團體賽之間男團、女團、社團，但抽籤前最後一輪女團先叫。
 */
function orderCells(cells, list, D) {
  const draws = list.filter(x => x.draw).map(x => x.s);
  const key = x => {
    if (isInd(x.ev)) { const ms = cellMatches(D, x); const r = ms.length ? Math.min(...ms.map(m => m.roundIdx)) : 0; return r * 10 + IND_ORDER.indexOf(x.ev); }
    const lastBeforeDraw = !x.f && draws.some(d => x.e <= d && !list.some(y => y.ev === x.ev && !y.f && !y.draw && y.s > x.s && y.e <= d));
    const t = lastBeforeDraw && x.ev === '女團' ? -1 : TEAM.indexOf(x.ev);
    return (x.f ? 1000 : 2000) + t;
  };
  return cells.slice().sort((a, b) => key(a) - key(b));
}

/** 全部格子（不含決賽抽籤）依日期、開始時間、同時段叫場順序排成一列 */
function orderedCells(slots, D) {
  const all = [];
  [...new Set(slots.map(x => x.d))].sort().forEach(d => {
    const list = slots.filter(x => x.d === d);
    [...new Set(list.map(x => x.s))].sort().forEach(a => all.push(...orderCells(list.filter(x => x.s === a && !x.draw), list, D)));
  });
  return all;
}

/**
 * 全部項目的叫場順序（還沒開打、也還沒打完的場次）：
 * 個人賽照輪次表（先依輪次，同一輪依男單、女單、男雙、女雙）；團體賽依時間表的區塊（同時段決賽先、預賽後）。
 * 兩邊依所在區塊的開始時間合併，同一時間個人賽先叫。沒有時間表時，個人賽在前、團體賽依場次接在後面。
 * 回傳連續段落 [{ ev, f, s, list }]，s 是區塊開始時間。
 */
export function callOrder(s, D) {
  const open = m => !m.rec.start && m.status !== 'done' && m.status !== 'reported';
  const cells = orderedCells((s.sched && s.sched.slots) || [], D);
  const at = new Map(), tag = new Map();
  cells.forEach((x, i) => cellMatches(D, x).forEach(m => { if (!at.has(m.id)) { at.set(m.id, i); tag.set(m.id, x.s); } }));
  const NONE = 1e9;
  const pos = m => (at.has(m.id) ? at.get(m.id) : NONE);
  // 同一時間開始的格子視為同一時間（用第一個同時間格子的索引）
  const tkey = m => { const i = pos(m); if (i === NONE) return NONE; const x = cells[i]; return cells.findIndex(y => y.d === x.d && y.s === x.s); };
  const ind = [], team = [];
  D.events.forEach(e => e.matches.forEach(m => { if (open(m)) (e.team ? team : ind).push(m); }));
  ind.sort((a, b) => a.roundIdx - b.roundIdx || IND_ORDER.indexOf(a.ev) - IND_ORDER.indexOf(b.ev) || a.num - b.num);
  team.sort((a, b) => pos(a) - pos(b) || (a.stage === 'F') - (b.stage === 'F') || TEAM.indexOf(a.ev) - TEAM.indexOf(b.ev) || a.roundIdx - b.roundIdx || a.num - b.num);
  const out = [];
  let i = 0, j = 0;
  while (i < ind.length || j < team.length) {
    const useInd = j >= team.length || (i < ind.length && (tkey(ind[i]) === NONE ? tkey(team[j]) === NONE : tkey(ind[i]) <= tkey(team[j])));
    out.push(useInd ? ind[i++] : team[j++]);
  }
  const runs = [];
  out.forEach(m => {
    const f = m.stage === 'F', r = runs[runs.length - 1];
    if (r && r.ev === m.ev && r.f === f) r.list.push(m); else runs.push({ ev: m.ev, f, s: tag.get(m.id) || '', list: [m] });
  });
  return runs;
}

export function timetableHtml(s, opt = {}) {
  const slots = (s.sched && s.sched.slots) || [];
  const D = opt.D;
  const nums = x => (x.draw ? '<span class="nw">決賽抽籤</span>'
    : `<span class="nw">${x.f ? '決' : ''}(${toCn(x.from)})${x.to !== x.from ? '～' : ''}</span>${x.to !== x.from ? `<wbr><span class="nw">(${toCn(x.to)})</span>` : ''}`);
  let next = null;
  if (D) {
    const all = orderedCells(slots, D);
    // 下一區塊：最後有進度的那一天裡，依時間與叫場順序第一個還沒開始的格子（就算後面已有區塊提前開打）
    const st = all.map(x => cellState(D, x, s));
    const k = st.reduce((a, v, i) => (v ? i : a), -1);
    const day = k >= 0 ? all[k].d : (all[0] || {}).d;
    const ok = (x, n) => st[n] === '' && cellMatches(D, x).length;
    let i = all.findIndex((x, n) => x.d === day && ok(x, n));
    if (i < 0) i = all.findIndex((x, n) => x.d > day && ok(x, n));
    next = i >= 0 ? all[i] : null;
  }
  const time = (a, b) => `<span class="tt3"><span>${a}</span><span class="bar"></span><span>${b}</span></span>`;
  return [...new Set(slots.map(x => x.d))].sort().map(d => {
    const list = slots.filter(x => x.d === d);
    const evs = EVENT_ORDER.filter(ev => list.some(x => x.ev === ev)).sort((a, b) => /團/.test(a) - /團/.test(b));
    const cuts = [...new Set(list.flatMap(x => [x.s, x.e]))].sort();
    const rows = cuts.slice(0, -1).map((t, i) => [t, cuts[i + 1]]).filter(([a, b]) => list.some(x => x.s < b && x.e > a));
    const body = rows.map(([a, b]) => {
      // 這一列開始的格子與叫場順序
      const starting = list.filter(x => x.s === a && !x.draw);
      const order = D && starting.length > 1 ? orderCells(starting, list, D) : [];
      return `<tr><td class="tm">${time(a, b)}</td>${evs.map(ev => {
        const x = list.find(y => y.ev === ev && y.s <= a && y.e > a);
        if (!x) return '<td></td>';
        if (x.s !== a) return '';
        const span = rows.filter(([p, q]) => p >= x.s && q <= x.e).length;
        if (!D) return `<td rowspan="${span}" class="${x.draw ? 'dr' : ''}">${nums(x)}</td>`;
        const st = x === next ? 'next' : cellState(D, x, s), ms = cellMatches(D, x);
        const i = order.indexOf(x);
        const prog = ms.length ? `<span class="ttp">${ms.filter(m => m.status === 'done').length}/${ms.length}</span>` : '';
        return `<td rowspan="${span}" class="${x.draw ? 'dr' : ''} tts-${st || 'none'}"><button class="ttcell" data-goev="${esc(x.ev)}">${i >= 0 ? `<span class="tto" title="同時段第 ${i + 1} 個叫">${i + 1}</span>` : ''}${nums(x)}${prog}</button></td>`;
      }).join('')}</tr>`;
    }).join('');
    const table = `<div class="ttw"><table class="tt ${D ? 'ttdesk' : ''}"><thead><tr><th></th>${evs.map(ev => `<th>${ev}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table></div>`;
    return `<div class="panel${opt.flat ? ' flat' : ''}"><h2>${esc(dayLabel(s, d, list[0].day))}</h2>${table}${opt.after ? opt.after(d) : ''}</div>`;
  }).join('');
}
