// 公開頁：即時桌況、賽程與成績
import { derive, sideText, EVENT_FULL, fmtTime } from './model.js';
import { getState, subscribe } from './store.js';
import { esc, $, chip, board, header, names, liveLine, STATUS_TEXT } from './ui.js';
import { bracketSvg } from './tree.js';

let tab = 'live', curEv = null, q = '', zoom = 1;
let D = null;
const TABS = [['live', '即時桌況'], ['sched', '賽程與成績']];

function render() {
  const s = getState();
  D = derive(s);
  $('#top').innerHTML = header(s, '即時賽況', []);
  $('#tabs').innerHTML = TABS.map(([k, t]) => `<button class="${tab === k ? 'on' : ''}" data-tab="${k}">${t}</button>`).join('');
  if (!curEv || !D.events.some(e => e.name === curEv)) curEv = D.events[0] ? D.events[0].name : null;
  $('#main').className = tab === 'live' && !q.trim() ? 'wide' : 'wide';
  const keep = document.activeElement && document.activeElement.id === 'q';
  $('#main').innerHTML = !D.events.length ? '<div class="panel"><p class="muted">賽程尚未公布。</p></div>'
    : `<input id="q" class="search" type="text" placeholder="輸入學校、隊名或姓名，查詢相關場次" value="${esc(q)}">
      <div style="height:12px"></div>${q.trim() ? viewSearch() : tab === 'live' ? viewLive(s) : viewSched()}`;
  if (keep) { const el = $('#q'); el.focus(); el.setSelectionRange(q.length, q.length); }
}

const title = m => `${EVENT_FULL[m.ev]} ${m.no} ${m.round}`;
function bigCard(m) {
  const line = liveLine(m);
  return `<div class="card"><div class="hd">${m.tables.length ? `<span class="tno">第 ${m.tables.join('、')} 桌</span>` : ''}<span>${esc(title(m))}</span><span class="spacer"></span>${m.status !== 'playing' ? chip(m) : ''}</div>
    <div class="duel"><div class="n r">${esc(sideText(m.A, m.team))}</div><div class="s">${m.score[0]} : ${m.score[1]}</div><div class="n">${esc(sideText(m.B, m.team))}</div></div>
    ${line ? `<div class="ptline">${m.team ? line : `各局比分　${esc(line)}`}</div>` : ''}</div>`;
}
function row(m) {
  const sc = m.status === 'wait' || m.status === 'ready' ? '' : `${m.score[0]}:${m.score[1]}`;
  return `<tr><td class="nowrap">${esc(m.no)}</td><td>${names(m)}</td><td class="nowrap"><b>${sc}</b></td>
    <td class="nowrap small">${m.status === 'playing' ? `第 ${m.tables.join('、')} 桌` : m.status === 'done' ? '' : STATUS_TEXT[m.status]}</td></tr>`;
}

function viewLive(s) {
  return `${s.notice ? `<div class="call">${esc(s.notice)}</div>` : ''}${board(s, D)}`;
}

function viewSched() {
  const e = D.events.find(x => x.name === curEv);
  const groups = e.team ? e.groups.map(g => {
    const res = (a, b) => { const m = g.matches.find(x => (x.A.name === a && x.B.name === b) || (x.A.name === b && x.B.name === a)); if (!m || m.status === 'wait' || m.status === 'ready') return m ? `(${m.label})` : ''; const mine = m.A.name === a; return `${m.score[mine ? 0 : 1]}:${m.score[mine ? 1 : 0]}`; };
    const st = t => g.table.rows.find(r => r.team === t);
    const tag = t => (g.rank.c === t ? ' <span class="chip ready">冠</span>' : g.rank.r === t ? ' <span class="chip reported">亞</span>' : '');
    return `<table class="grp"><thead><tr><th>${g.letter} 組</th>${g.teams.map((_, i) => `<th>${i + 1}</th>`).join('')}<th>勝</th><th>敗</th></tr></thead><tbody>
      ${g.teams.map((t, i) => `<tr><td class="nm">${i + 1}　${esc(t)}${tag(t)}</td>${g.teams.map((u, j) => `<td>${i === j ? '' : res(t, u)}</td>`).join('')}<td>${st(t).w}</td><td>${st(t).l}</td></tr>`).join('')}</tbody></table>`;
  }).join('') : '';
  const ko = e.team ? e.matches.filter(m => m.stage === 'F') : e.matches;
  const t = bracketSvg(ko, e.team);
  const tree = t.svg ? `<div class="panel"><div class="row"><h2 style="margin:0">${e.team ? '決賽' : '籤表'}</h2><span class="spacer"></span>
      <button class="btn ghost sm" data-zoom="-1">縮小</button><button class="btn ghost sm" data-zoom="1">放大</button></div>
    <div class="treebox" style="margin-top:10px">${t.svg.replace(/width="[\d.]+" height="[\d.]+"/, `width="${Math.round(t.width * zoom)}" height="${Math.round(t.height * zoom)}"`)}</div></div>` : '';
  return `<div class="pills" style="margin-bottom:12px">${D.events.map(x => `<button class="${x.name === curEv ? 'on' : ''}" data-ev="${x.name}">${x.name}</button>`).join('')}</div>
    ${groups ? `<div class="panel"><h2>預賽分組</h2>${groups}</div>` : ''}${tree}`;
}

function viewSearch() {
  const key = q.trim();
  const hit = m => [m.A, m.B].some(x => x && ((x.name || '').includes(key) || (x.school || '').includes(key))) ||
    (m.team && m.rec.lineup && m.rec.start && m.lineupOk.a && m.lineupOk.b && JSON.stringify(m.rec.lineup).includes(key));
  const list = [...D.byId.values()].filter(hit);
  const live = list.filter(m => m.status === 'playing');
  const rest = list.filter(m => m.status !== 'playing');
  return `<div class="panel"><h2>「${esc(key)}」的場次（${list.length}）</h2>${live.map(bigCard).join('')}
    ${rest.length ? `<table class="list"><tbody>${rest.map(m => `<tr><td class="nowrap"><b>${m.ev}</b> ${esc(m.no)}<div class="small muted">${esc(m.round)}</div></td><td>${names(m)}</td><td class="nowrap"><b>${m.status === 'done' || m.status === 'reported' ? `${m.score[0]}:${m.score[1]}` : ''}</b></td><td class="small nowrap">${STATUS_TEXT[m.status]}${m.rec.start ? `<br>${fmtTime(m.rec.start)}` : ''}</td></tr>`).join('')}</tbody></table>` : ''}
    ${list.length ? '' : '<p class="muted small">查無相關場次。</p>'}</div>`;
}

document.addEventListener('click', ev => {
  const t = ev.target.closest('button'); if (!t) return;
  if (t.dataset.tab) { tab = t.dataset.tab; q = ''; render(); }
  else if (t.dataset.ev) { curEv = t.dataset.ev; render(); }
  else if (t.dataset.zoom) { zoom = Math.min(1.6, Math.max(0.4, zoom + 0.2 * Number(t.dataset.zoom))); render(); }
});
document.addEventListener('input', ev => { if (ev.target.id === 'q') { q = ev.target.value; render(); } });
subscribe(render);
setInterval(render, 30000);
render();
