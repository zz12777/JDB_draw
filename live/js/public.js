// 公開頁：即時桌況、賽程與成績
import { derive, sideText, EVENT_FULL, EVENT_ORDER, fmtTime, POINTS, gameWinner, ANN_ORDER, ANN_NAME, dayLabel } from './model.js';
import { slotOf } from './timetable.js';
import { toCn } from '../../js/util.js';
import { getState, subscribe, auth, onAuth, loadHistory } from './store.js';
import { esc, $, chip, board, header, names, lineName, icon, STATUS_TEXT } from './ui.js';
import { bracketSvg } from './tree.js';
import { mergeHistory, entryFromState } from './history.js';

let tab = 'sched', curEv = null, hy = null, q = '', zoom = 1, detail = null, composing = false;
let D = null;
const TABS = [['sched', '賽程'], ['time', '時間表'], ['ann', '成績公告'], ['live', '即時桌況'], ['hist', '歷屆名次']];
const TAB_ICON = { sched: 'bracket', time: 'clock', ann: 'trophy', live: 'tables', hist: 'medal' };

function render() {
  const s = getState();
  // 決賽籤號要等大會台按「確定並公開」才顯示
  D = derive({ ...s, events: (s.events || []).map(e => (e.finalPub ? e : { ...e, finalPos: {} })) });
  $('#top').innerHTML = header(s, '即時賽程', []);
  if (tab === 'time' && !s.sched) tab = 'sched';
  $('#tabs').innerHTML = TABS.filter(([k]) => k !== 'time' || s.sched).map(([k, t]) => `<button class="${tab === k ? 'on' : ''}" data-tab="${k}">${icon(TAB_ICON[k])}<span>${t}</span></button>`).join('');
  if (!curEv || !D.events.some(e => e.name === curEv)) curEv = D.events[0] ? D.events[0].name : null;
  // 搜尋框只建立一次，之後只更新下方內容（重畫輸入框會打斷注音等輸入法）
  if (!$('#q')) $('#main').innerHTML = `<label class="sbox">${icon('search')}<input id="q" class="search" type="search" placeholder="學校、隊名或姓名"></label><div style="height:12px"></div><div id="content"></div>`;
  if ($('#q').value !== q && !composing) $('#q').value = q;
  // 搜尋只在賽程、成績公告、即時桌況出現，各自只找當頁的內容
  $('.sbox').style.display = tab === 'time' ? 'none' : '';
  $('#q').placeholder = '學校、隊名或姓名';
  const key = tab === 'time' ? '' : q.trim();
  $('#content').innerHTML = tab === 'hist' ? viewHist(s, key) : !D.events.length ? `<div class="panel"><p class="muted">${auth.loaded ? '賽程尚未公布。' : '讀取中。'}</p></div>`
    : tab === 'live' ? viewLive(s, key) : tab === 'time' ? viewTime(s) : tab === 'ann' ? viewAnn(s, key) : key ? viewSearch(s, key) : viewSched();
  drawDetail();
}

function viewLive(s, key) {
  return `${s.notice ? `<div class="call">${esc(s.notice)}</div>` : ''}${board(s, D, key ? { match: m => hit(m, key) } : {})}`;
}

/** 賽程時間表：每天一張表，列是時段、欄是項目 */
function viewTime(s) {
  const slots = s.sched.slots;
  // 場次只在「～」後面換行，數字本身不拆開
  const nums = x => (x.draw ? '<span class="nw">決賽抽籤</span>'
    : `<span class="nw">${x.f ? '決' : ''}(${toCn(x.from)})${x.to !== x.from ? '～' : ''}</span>${x.to !== x.from ? `<wbr><span class="nw">(${toCn(x.to)})</span>` : ''}`);
  const time = (a, b) => `<span class="tt3"><span>${a}</span><span class="bar"></span><span>${b}</span></span>`;
  return [...new Set(slots.map(x => x.d))].sort().map(d => {
    const list = slots.filter(x => x.d === d);
    const evs = EVENT_ORDER.filter(ev => list.some(x => x.ev === ev)).sort((a, b) => /團/.test(a) - /團/.test(b));
    // 以所有出現過的時間點切成列；跨多列的時段合併成一格
    const cuts = [...new Set(list.flatMap(x => [x.s, x.e]))].sort();
    const rows = cuts.slice(0, -1).map((t, i) => [t, cuts[i + 1]]).filter(([a, b]) => list.some(x => x.s < b && x.e > a));
    const body = rows.map(([a, b]) => `<tr><td class="tm">${time(a, b)}</td>${evs.map(ev => {
      const x = list.find(y => y.ev === ev && y.s <= a && y.e > a);
      if (!x) return '<td></td>';
      if (x.s !== a) return '';
      const span = rows.filter(([p, q]) => p >= x.s && q <= x.e).length;
      return `<td rowspan="${span}" class="${x.draw ? 'dr' : ''}">${nums(x)}</td>`;
    }).join('')}</tr>`).join('');
    const table = `<div class="ttw"><table class="tt"><thead><tr><th></th>${evs.map(ev => `<th>${ev}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table></div>`;
    return `<div class="panel"><h2>${esc(dayLabel(s, d, list[0].day))}</h2>${table}</div>`;
  }).join('');
}

/** 成績公告：大會公布前只列出空格 */
function viewAnn(s, key) {
  const pub = s.podium || {};
  const mark = v => (key && v && v.includes(key) ? esc(v).split(esc(key)).join(`<mark>${esc(key)}</mark>`) : esc(v || ''));
  const line = (label, v) => `<div class="al"><span class="ak">${label}：</span><span>${mark(v)}</span></div>`;
  const rows = ev => { const p = pub[ev] || {}; return [['冠軍', p.c], ['亞軍', p.r], ['季軍', p.s1], ['季軍', p.s2]]; };
  const list = ANN_ORDER.map(ev => [ev, key ? rows(ev).filter(([, v]) => v && v.includes(key)) : rows(ev)]).filter(([, r]) => r.length);
  return `<div class="panel ann"><h2>${esc(s.annTitle || '成績公告')}</h2>
    ${list.length ? `<div class="agrid">${list.map(([ev, r]) => `<div class="ab"><h3>${ANN_NAME[ev]}</h3>${r.map(([l, v]) => line(l, v)).join('')}</div>`).join('')}</div>` : '<p class="muted small" style="text-align:center">查無相關成績。</p>'}</div>`;
}

/** 歷屆名次：舊資料、資料庫存的各屆，加上今年正在公布的 */
let savedHist = null, histLoading = false;
function histList(s) {
  if (savedHist === null && !histLoading) {
    histLoading = true;
    loadHistory().then(h => { savedHist = h; }).catch(() => { savedHist = {}; }).finally(() => { histLoading = false; render(); });
  }
  return mergeHistory(savedHist, entryFromState(s));
}
function viewHist(s, key) {
  const list = histList(s);
  if (!list.length) return '<div class="panel"><p class="muted">尚無資料。</p></div>';
  const mark = v => (key && v.includes(key) ? esc(v).split(esc(key)).join(`<mark>${esc(key)}</mark>`) : esc(v));
  const line = ([l, v]) => `<div class="al"><span class="ak">${l}：</span><span>${mark(v)}</span></div>`;
  const year = (y, rows) => {
    const evs = ANN_ORDER.map(ev => [ev, (y.p[ev] || []).filter(([, v]) => !key || v.includes(key))]).filter(([, r]) => r.length);
    return evs.length ? `<div class="panel ann"><h2>${y.year} ${esc(y.edition)}</h2><div class="agrid">${evs.map(([ev, r]) => `<div class="ab"><h3>${ANN_NAME[ev]}</h3>${r.map(line).join('')}</div>`).join('')}</div></div>` : '';
  };
  if (key) {
    const out = list.map(y => year(y)).join('');
    return out || '<div class="panel"><p class="muted small" style="text-align:center">查無相關名次。</p></div>';
  }
  // 沒點過年份就顯示最新一屆（資料庫的資料晚一點才到，也會自動換成最新的）
  const cur = list.find(y => y.year === hy) || list[0];
  return `<div class="pills" style="margin-bottom:12px">${list.map(y => `<button class="${y === cur ? 'on' : ''}" data-hy="${y.year}">${y.year}</button>`).join('')}</div>${year(cur)}`;
}

const shown = m => m.status !== 'wait' && m.status !== 'ready';
function viewSched() {
  const e = D.events.find(x => x.name === curEv);
  let groups = '';
  if (e.team) {
    const N = Math.max(...e.groups.map(g => g.teams.length));
    groups = e.groups.map(g => {
// 比照完成籤表：左下半寫場次，對角一條斜線，右上半寫比數（列的隊伍在前）
      const find = (a, b) => g.matches.find(x => (x.A.name === a && x.B.name === b) || (x.A.name === b && x.B.name === a));
      const cell = (a, b, i, j) => {
        const m = find(a, b);
        if (!m) return '<td></td>';
        if (i > j) return `<td class="lk no" data-mid="${esc(m.id)}">${esc(m.no)}</td>`;
        if (!shown(m)) return '<td></td>';
        const mine = m.A.name === a;
        return `<td class="lk sc" data-mid="${esc(m.id)}">${m.score[mine ? 0 : 1]}:${m.score[mine ? 1 : 0]}</td>`;
      };
      const st = t => g.table.rows.find(r => r.team === t);
      const tag = t => (g.rank.c === t ? ' <span class="chip ready">冠</span>' : g.rank.r === t ? ' <span class="chip reported">亞</span>' : '');
      const pad = n => '<td></td>'.repeat(n);
      return `<table class="grp"><thead><tr><th class="hd">${g.letter} 組</th>${Array.from({ length: N }, (_, i) => `<th>${g.teams[i] ? `${i + 1}<span class="tn"> ${esc(g.teams[i])}</span>` : ''}</th>`).join('')}<th class="wl">勝</th><th class="wl">敗</th></tr></thead><tbody>
        ${g.teams.map((t, i) => `<tr><td class="nm"><span class="ix">${i + 1}</span>${esc(t)}${tag(t)}</td>${g.teams.map((u, j) => (i === j ? '<td class="diag"></td>' : cell(t, u, i, j))).join('')}${pad(N - g.teams.length)}<td>${st(t).w}</td><td>${st(t).l}</td></tr>`).join('')}</tbody></table>`;
    }).join('');
  }
  const ko = e.team ? e.matches.filter(m => m.stage === 'F') : e.matches;
  const t = bracketSvg(ko, e.team, { pos: e.team });
  const tree = t.svg ? `<div class="panel"><div class="row"><h2 style="margin:0">${e.team ? '決賽' : '籤表'}</h2><span class="spacer"></span>
      <button class="btn ghost sm" data-zoom="-1" aria-label="縮小" title="縮小">${icon('zoomOut')}</button><button class="btn ghost sm" data-zoom="1" aria-label="放大" title="放大">${icon('zoomIn')}</button></div>
    <div class="treebox" style="margin-top:10px">${t.svg.replace(/width="[\d.]+" height="[\d.]+"/, `width="${Math.round(t.width * zoom)}" height="${Math.round(t.height * zoom)}"`)}</div></div>` : '';
  const pre = groups ? `<div class="panel"><h2>預賽</h2>${groups}</div>` : '';
  // 決賽籤表公開後排到預賽上面
  const pub = e.team && (getState().events || []).some(x => x.name === e.name && x.finalPub);
  return `<div class="pills" style="margin-bottom:12px">${D.events.map(x => `<button class="${x.name === curEv ? 'on' : ''}" data-ev="${x.name}">${x.name}</button>`).join('')}</div>
    ${pub ? tree + pre : pre + tree}`;
}

/** 這一場是否和關鍵字有關：學校、隊名、姓名，團體賽開賽後也找排點 */
function hit(m, key) {
  return [m.A, m.B].some(x => x && ((x.name || '').includes(key) || (x.school || '').includes(key))) ||
    (m.team && m.rec.lineup && (m.rec.start || shown(m)) && JSON.stringify(m.rec.lineup).includes(key));
}
function viewSearch(s, key) {
  const list = [...D.byId.values()].filter(m => hit(m, key));
  const when = m => { const x = slotOf(s.sched, m); return x ? `${esc(dayLabel(s, x.d, x.day))} ${x.s}-${x.e}` : ''; };
  return `<div class="panel"><h2>「${esc(key)}」的場次（${list.length}）</h2>
    ${list.length ? `<table class="list"><tbody>${list.map(m => `<tr class="click" data-mid="${esc(m.id)}"><td class="nowrap"><b>${m.ev}</b>${esc(m.no)}</td><td>${names(m)}</td>
      <td class="nowrap"><b>${shown(m) ? `${m.score[0]}:${m.score[1]}` : ''}</b></td>
      <td class="small nowrap" style="text-align:right">${m.status === 'playing' ? `<span class="tchip">第 ${m.tables.join('、')} 桌</span>` : when(m)}</td></tr>`).join('')}</tbody></table>` : '<p class="muted small">查無相關場次。</p>'}</div>`;
}

/** 單場明細：個人賽各局比分；團體賽各點選手與比分（開賽後才顯示排點） */
function drawDetail() {
  const host = $('#modal');
  const m = detail && D.byId.get(detail);
  if (!m) { host.hidden = true; host.innerHTML = ''; return; }
  const games = g => (g || []).filter(x => x && x[0] !== '' && x[0] != null && x[1] !== '' && x[1] != null).map(x => `${x[0]}-${x[1]}`).join('　');
  const wo = m.rec.wo; // 'a'：A 勝（B 棄權）
  const block = (title, an, bn, r, gs) => `<div class="drow ${r.a + r.b || r.winner || wo ? '' : 'idle'}"><div class="dn r ${r.winner === 'a' ? 'w' : ''}">${an}</div>
    <div class="dc"><div class="small muted">${title}</div><div class="ds">${r.a + r.b || r.winner ? `${r.a} : ${r.b}` : wo ? '' : '<span class="small muted">未進行</span>'}</div></div>
    <div class="dn ${r.winner === 'b' ? 'w' : ''}">${bn}</div><div class="dg">${gs}</div></div>`;
  const stack = v => (Array.isArray(v) ? v.filter(Boolean).map(esc).join('<br>') : esc(v || ''));
  let body;
  if (m.team) {
    // 排點在開賽後（已派桌或已有比分）才公開
    const lu = m.rec.start || shown(m) ? (m.rec.lineup || {}) : {};
    body = `<div class="dlist">${POINTS.map((p, i) => block(`第${'一二三四五'[i]}點`, stack((lu.a || [])[i]), stack((lu.b || [])[i]), m.result.pts[i], games(((m.rec.pts || [])[i] || {}).g))).join('')}</div>`;
  } else {
    // 個人賽：各局由上往下排列，同記分時的樣子
    const gs = wo ? [] : (m.rec.g || []).filter(x => x && x[0] !== '' && x[0] != null && x[1] !== '' && x[1] != null);
    body = gs.length ? `<table class="dgv">${gs.map((g, i) => { const w = gameWinner(g); return `<tr><td class="${w === 'a' ? 'w' : ''}">${g[0]}</td><td class="gl">第${'一二三四五'[i]}局</td><td class="${w === 'b' ? 'w' : ''}">${g[1]}</td></tr>`; }).join('')}</table>` : '';
  }
  const nm = k => { const x = k === 'a' ? m.A : m.B; const lost = wo && wo !== k; return `<span class="${lost ? 'lost' : ''}">${esc(sideText(x, m.team))}</span>${lost ? '<span class="wo-tag">棄權</span>' : ''}`; };
  host.hidden = false;
  host.innerHTML = `<div class="modal-bg"><div class="modal" style="width:min(640px,100%)"><div class="row"><h2>${EVENT_FULL[m.ev]} ${esc(m.no)}</h2>${m.status === 'playing' ? `<span class="tchip">第 ${m.tables.join('、')} 桌</span>` : ''}<span class="spacer"></span><button class="btn ghost sm" data-close aria-label="關閉" title="關閉">${icon('close')}</button></div>
    <div class="duel"><div class="n r">${nm('a')}</div><div class="s">${shown(m) ? `${m.score[0]} : ${m.score[1]}` : 'vs'}</div><div class="n">${nm('b')}</div></div>${shown(m) ? body : ''}</div></div>`;
}

document.addEventListener('click', ev => {
  const b = ev.target.closest('button');
  if (b) {
    if (b.dataset.tab) { tab = b.dataset.tab; q = ''; render(); }
    else if (b.dataset.hy) { hy = Number(b.dataset.hy); render(); }
    else if (b.dataset.ev) { curEv = b.dataset.ev; render(); }
    else if (b.dataset.zoom) { zoom = Math.min(1.6, Math.max(0.4, zoom + 0.2 * Number(b.dataset.zoom))); render(); }
    else if ('close' in b.dataset) { detail = null; drawDetail(); }
    return;
  }
  if (ev.target.classList.contains('modal-bg')) { detail = null; drawDetail(); return; }
  const t = ev.target.closest('[data-mid]');
  if (t) { detail = t.dataset.mid; drawDetail(); }
});
document.addEventListener('compositionstart', ev => { if (ev.target.id === 'q') composing = true; });
document.addEventListener('compositionend', ev => { if (ev.target.id === 'q') { composing = false; q = ev.target.value; render(); } });
document.addEventListener('input', ev => { if (ev.target.id === 'q' && !composing && !ev.isComposing) { q = ev.target.value; render(); } });
document.addEventListener('keydown', ev => { if (ev.key === 'Escape' && detail) { detail = null; drawDetail(); } });
subscribe(render);
onAuth(render);
setInterval(render, 30000);
render();
