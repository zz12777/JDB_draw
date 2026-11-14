// 公開頁：即時桌況、賽程與成績
import { derive, sideText, EVENT_FULL, fmtTime, POINTS, gameWinner } from './model.js';
import { getState, subscribe } from './store.js';
import { esc, $, chip, board, header, names, lineName, icon, STATUS_TEXT } from './ui.js';
import { bracketSvg } from './tree.js';

let tab = 'sched', curEv = null, q = '', zoom = 1, detail = null, composing = false;
let D = null;
const TABS = [['sched', '賽程與成績'], ['live', '即時桌況']];

function render() {
  const s = getState();
  D = derive(s);
  $('#top').innerHTML = header(s, '即時賽程', []);
  $('#tabs').innerHTML = TABS.map(([k, t]) => `<button class="${tab === k ? 'on' : ''}" data-tab="${k}">${t}</button>`).join('');
  if (!curEv || !D.events.some(e => e.name === curEv)) curEv = D.events[0] ? D.events[0].name : null;
  // 搜尋框只建立一次，之後只更新下方內容（重畫輸入框會打斷注音等輸入法）
  if (!$('#q')) $('#main').innerHTML = '<input id="q" class="search" type="text" placeholder="輸入學校、隊名或姓名，查詢相關場次"><div style="height:12px"></div><div id="content"></div>';
  if ($('#q').value !== q && !composing) $('#q').value = q;
  $('#content').innerHTML = !D.events.length ? '<div class="panel"><p class="muted">賽程尚未公布。</p></div>'
    : q.trim() ? viewSearch() : tab === 'live' ? viewLive(s) : viewSched();
  drawDetail();
}

function viewLive(s) {
  return `${s.notice ? `<div class="call">${esc(s.notice)}</div>` : ''}${board(s, D)}`;
}

const shown = m => m.status !== 'wait' && m.status !== 'ready';
function viewSched() {
  const e = D.events.find(x => x.name === curEv);
  let groups = '';
  if (e.team) {
    const N = Math.max(...e.groups.map(g => g.teams.length));
    groups = e.groups.map(g => {
      const cell = (a, b) => {
        const m = g.matches.find(x => (x.A.name === a && x.B.name === b) || (x.A.name === b && x.B.name === a));
        if (!m) return '<td></td>';
        if (!shown(m)) return `<td class="muted">${esc(m.no)}</td>`;
        const mine = m.A.name === a;
        return `<td class="lk" data-mid="${esc(m.id)}">${m.score[mine ? 0 : 1]}:${m.score[mine ? 1 : 0]}</td>`;
      };
      const st = t => g.table.rows.find(r => r.team === t);
      const tag = t => (g.rank.c === t ? ' <span class="chip ready">冠</span>' : g.rank.r === t ? ' <span class="chip reported">亞</span>' : '');
      const pad = n => '<td></td>'.repeat(n);
      return `<table class="grp"><thead><tr><th class="hd">${g.letter} 組</th>${Array.from({ length: N }, (_, i) => `<th>${g.teams[i] ? `${i + 1} ${esc(g.teams[i])}` : ''}</th>`).join('')}<th class="wl">勝</th><th class="wl">敗</th></tr></thead><tbody>
        ${g.teams.map((t, i) => `<tr><td class="nm">${i + 1}　${esc(t)}${tag(t)}</td>${g.teams.map((u, j) => (i === j ? '<td></td>' : cell(t, u))).join('')}${pad(N - g.teams.length)}<td>${st(t).w}</td><td>${st(t).l}</td></tr>`).join('')}</tbody></table>`;
    }).join('');
  }
  const ko = e.team ? e.matches.filter(m => m.stage === 'F') : e.matches;
  const t = bracketSvg(ko, e.team, { pos: e.team });
  const tree = t.svg ? `<div class="panel"><div class="row"><h2 style="margin:0">${e.team ? '決賽' : '籤表'}</h2><span class="small muted">點選場次可查看比分</span><span class="spacer"></span>
      <button class="btn ghost sm" data-zoom="-1">縮小</button><button class="btn ghost sm" data-zoom="1">放大</button></div>
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
  const games = g => (g || []).filter(x => x && x[0] !== '' && x[0] != null && x[1] !== '' && x[1] != null).map(x => `${x[0]}:${x[1]}`).join('　');
  let body;
  if (m.team) {
    const lu = m.rec.start ? (m.rec.lineup || {}) : {};
    body = `<table class="dt"><thead><tr><th></th><th>${esc(sideText(m.A, true))}</th><th>局數</th><th>${esc(sideText(m.B, true))}</th><th>各局比分</th></tr></thead><tbody>
      ${POINTS.map((p, i) => { const r = m.result.pts[i]; const pt = (m.rec.pts || [])[i] || {};
        return `<tr><td class="nowrap">第${'一二三四五'[i]}點</td><td class="${r.winner === 'a' ? 'w' : ''}">${esc(lineName(lu.a, i))}</td><td class="nowrap">${r.a + r.b || r.winner ? `${r.a}:${r.b}` : ''}</td><td class="${r.winner === 'b' ? 'w' : ''}">${esc(lineName(lu.b, i))}</td><td class="small">${games(pt.g)}</td></tr>`; }).join('')}</tbody></table>`;
  } else {
    const gs = (m.rec.g || []).filter(x => x && x[0] !== '' && x[0] != null);
    body = gs.length ? `<table class="dt"><thead><tr><th></th><th>${esc(sideText(m.A))}</th><th>${esc(sideText(m.B))}</th></tr></thead><tbody>
      ${gs.map((g, i) => { const w = gameWinner(g); return `<tr><td>第${'一二三四五'[i]}局</td><td class="${w === 'a' ? 'w' : ''}">${g[0]}</td><td class="${w === 'b' ? 'w' : ''}">${g[1] ?? ''}</td></tr>`; }).join('')}</tbody></table>` : '';
  }
  if (m.rec.wo) body = `<p class="small muted">${esc(sideText(m.rec.wo === 'a' ? m.B : m.A, m.team))} 棄權</p>`;
  host.hidden = false;
  host.innerHTML = `<div class="modal-bg"><div class="modal" style="width:min(640px,100%)"><div class="row"><h2>${EVENT_FULL[m.ev]} ${esc(m.no)}</h2>${chip(m)}${m.status === 'playing' ? `<span class="tchip">第 ${m.tables.join('、')} 桌</span>` : ''}<span class="spacer"></span><button class="btn ghost sm" data-close>${icon('close')}關閉</button></div>
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
setInterval(render, 30000);
render();
