// 公開頁：即時桌況、賽程與成績
import { derive, sideText, EVENT_FULL, EVENT_ORDER, fmtTime, POINTS, gameWinner, ANN_ORDER, ANN_NAME, dayLabel } from './model.js';
import { toCn } from '../../js/util.js';
import { getState, subscribe, auth, onAuth } from './store.js';
import { esc, $, chip, board, header, names, lineName, icon, STATUS_TEXT } from './ui.js';
import { bracketSvg } from './tree.js';

let tab = 'sched', curEv = null, q = '', zoom = 1, detail = null, composing = false;
let D = null;
const TABS = [['sched', '賽程'], ['time', '時間表'], ['ann', '成績公告'], ['live', '即時桌況']];

function render() {
  const s = getState();
  D = derive(s);
  $('#top').innerHTML = header(s, '即時賽程', []);
  if (tab === 'time' && !s.sched) tab = 'sched';
  $('#tabs').innerHTML = TABS.filter(([k]) => k !== 'time' || s.sched).map(([k, t]) => `<button class="${tab === k ? 'on' : ''}" data-tab="${k}">${t}</button>`).join('');
  if (!curEv || !D.events.some(e => e.name === curEv)) curEv = D.events[0] ? D.events[0].name : null;
  // 搜尋框只建立一次，之後只更新下方內容（重畫輸入框會打斷注音等輸入法）
  if (!$('#q')) $('#main').innerHTML = `<label class="sbox">${icon('search')}<input id="q" class="search" type="search" placeholder="學校、隊名或姓名"></label><div style="height:12px"></div><div id="content"></div>`;
  if ($('#q').value !== q && !composing) $('#q').value = q;
  $('#content').innerHTML = !D.events.length ? `<div class="panel"><p class="muted">${auth.loaded ? '賽程尚未公布。' : '讀取中。'}</p></div>`
    : q.trim() ? viewSearch() : tab === 'live' ? viewLive(s) : tab === 'time' ? viewTime(s) : tab === 'ann' ? viewAnn(s) : viewSched();
  drawDetail();
}

function viewLive(s) {
  return `${s.notice ? `<div class="call">${esc(s.notice)}</div>` : ''}${board(s, D)}`;
}

/** 賽程時間表：每天一張表，列是時段、欄是項目 */
function viewTime(s) {
  const slots = s.sched.slots;
  // 場次只在「～」後面換行，數字本身不拆開
  const nums = x => (x.draw ? '<span class="nw">決賽抽籤</span>'
    : `<span class="nw">${x.f ? '決' : ''}(${toCn(x.from)})${x.to !== x.from ? '～' : ''}</span>${x.to !== x.from ? `<wbr><span class="nw">(${toCn(x.to)})</span>` : ''}`);
  const time = (a, b) => `<span class="t1">${a}</span><span class="t2">${b}</span>`;
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
    // 手機：每個開始時間一列，右側列出這個時間開始的項目與場次
    const starts = [...new Set(list.map(x => x.s))].sort();
    const cards = starts.map(t => {
      const items = list.filter(x => x.s === t).sort((p, q) => evs.indexOf(p.ev) - evs.indexOf(q.ev));
      const end = cuts.find(c => c > t);
      return `<div class="tl"><div class="tm">${time(t, end)}</div><div class="ti">${items.map(x => `<div class="tr ${x.draw ? 'dr' : ''}"><span class="te">${x.ev}</span><span class="tn">${nums(x)}</span>${x.e !== end ? `<span class="tx">至 ${x.e}</span>` : ''}</div>`).join('')}</div></div>`;
    }).join('');
    return `<div class="panel"><h2>${esc(dayLabel(s, d, list[0].day))}</h2>${table}<div class="tls">${cards}</div></div>`;
  }).join('');
}

/** 成績公告：大會公布前只列出空格 */
function viewAnn(s) {
  const pub = s.podium || {};
  const line = (label, v) => `<div class="al"><span class="ak">${label}：</span><span>${esc(v || '')}</span></div>`;
  return `<div class="panel ann"><h2>${esc(s.annTitle || '成績公告')}</h2>
    ${ANN_ORDER.map(ev => { const p = pub[ev] || {};
      return `<div class="ab"><h3>${ANN_NAME[ev]}</h3>${line('冠軍', p.c)}${line('亞軍', p.r)}${line('季軍', p.s1)}${line('季軍', p.s2)}</div>`; }).join('')}</div>`;
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
  return `<div class="pills" style="margin-bottom:12px">${D.events.map(x => `<button class="${x.name === curEv ? 'on' : ''}" data-ev="${x.name}">${x.name}</button>`).join('')}</div>
    ${groups ? `<div class="panel"><h2>預賽</h2>${groups}</div>` : ''}${tree}`;
}

function viewSearch() {
  const key = q.trim();
  const hit = m => [m.A, m.B].some(x => x && ((x.name || '').includes(key) || (x.school || '').includes(key))) ||
    (m.team && m.rec.lineup && m.rec.start && m.lineupOk.a && m.lineupOk.b && JSON.stringify(m.rec.lineup).includes(key));
  const list = [...D.byId.values()].filter(hit);
  return `<div class="panel"><h2>「${esc(key)}」的場次（${list.length}）</h2>
    ${list.length ? `<table class="list"><tbody>${list.map(m => `<tr class="click" data-mid="${esc(m.id)}"><td class="nowrap"><b>${m.ev}</b>${esc(m.no)}</td><td>${names(m)}</td>
      <td class="nowrap"><b>${shown(m) ? `${m.score[0]}:${m.score[1]}` : ''}</b></td>
      <td class="small nowrap">${m.status === 'playing' ? `第 ${m.tables.join('、')} 桌` : m.status === 'done' ? '' : STATUS_TEXT[m.status]}${m.rec.start ? `<br>${fmtTime(m.rec.start)}` : ''}</td></tr>`).join('')}</tbody></table>` : '<p class="muted small">查無相關場次。</p>'}</div>`;
}

/** 單場明細：個人賽各局比分；團體賽各點選手與比分（開賽後才顯示排點） */
function drawDetail() {
  const host = $('#modal');
  const m = detail && D.byId.get(detail);
  if (!m) { host.hidden = true; host.innerHTML = ''; return; }
  const games = g => (g || []).filter(x => x && x[0] !== '' && x[0] != null && x[1] !== '' && x[1] != null).map(x => `${x[0]}-${x[1]}`).join('　');
  const block = (title, an, bn, r, gs) => `<div class="drow ${r.a + r.b || r.winner ? '' : 'idle'}"><div class="dn r ${r.winner === 'a' ? 'w' : ''}">${an}</div>
    <div class="dc"><div class="small muted">${title}</div><div class="ds">${r.a + r.b || r.winner ? `${r.a} : ${r.b}` : '<span class="small muted">未進行</span>'}</div></div>
    <div class="dn ${r.winner === 'b' ? 'w' : ''}">${bn}</div><div class="dg">${gs}</div></div>`;
  const stack = v => (Array.isArray(v) ? v.filter(Boolean).map(esc).join('<br>') : esc(v || ''));
  let body;
  if (m.team) {
    const lu = m.rec.start ? (m.rec.lineup || {}) : {};
    body = `<div class="dlist">${POINTS.map((p, i) => block(`第${'一二三四五'[i]}點`, stack((lu.a || [])[i]), stack((lu.b || [])[i]), m.result.pts[i], games(((m.rec.pts || [])[i] || {}).g))).join('')}</div>`;
  } else {
    body = games(m.rec.g) ? `<div class="dg" style="margin-top:10px;font-size:15px">${games(m.rec.g)}</div>` : '';
  }
  if (m.rec.wo) body = `<p class="small muted">${esc(sideText(m.rec.wo === 'a' ? m.B : m.A, m.team))} 棄權</p>`;
  host.hidden = false;
  host.innerHTML = `<div class="modal-bg"><div class="modal" style="width:min(640px,100%)"><div class="row"><h2>${EVENT_FULL[m.ev]} ${esc(m.no)}</h2>${m.status === 'playing' ? `<span class="tchip">第 ${m.tables.join('、')} 桌</span>` : ''}<span class="spacer"></span><button class="btn ghost sm" data-close aria-label="關閉" title="關閉">${icon('close')}</button></div>
    <div class="duel"><div class="n r">${esc(sideText(m.A, m.team))}</div><div class="s">${shown(m) ? `${m.score[0]} : ${m.score[1]}` : 'vs'}</div><div class="n">${esc(sideText(m.B, m.team))}</div></div>${shown(m) ? body : ''}</div></div>`;
}

document.addEventListener('click', ev => {
  const b = ev.target.closest('button');
  if (b) {
    if (b.dataset.tab) { tab = b.dataset.tab; q = ''; render(); }
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
