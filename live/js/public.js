// 公開頁：即時桌況、賽程與成績
import { derive, sideText, EVENT_FULL, EVENT_ORDER, fmtTime, POINTS, gameWinner, ANN_ORDER, ANN_NAME, dayLabel } from './model.js';
import { slotOf } from './timetable.js';
import { toCn } from '../../js/util.js';
import { getState, subscribe, auth, onAuth, loadHistory } from './store.js';
import { esc, $, chip, board, header, names, lineName, icon, STATUS_TEXT, groupTables, callList } from './ui.js';
import { bracketSvg } from './tree.js';
import { timetableHtml } from './ttview.js';

// 項目順序跟大會台一樣
const PILL_ORDER = ['男單', '女單', '男雙', '女雙', '男團', '女團', '社團'];
const byPill = list => list.slice().sort((a, b) => PILL_ORDER.indexOf(a.name) - PILL_ORDER.indexOf(b.name));
import { mergeHistory } from './history.js';
import { BOOK, bookHtml } from './book.js';

let tab = 'sched', curEv = null, hy = null, q = '', zoom = 1, detail = null, composing = false;
let D = null;
const TABS = [['sched', '賽程'], ['time', '時間表'], ['live', '即時桌況/廣播'], ['ann', '成績公告'], ['book', '秩序冊']];
const TAB_ICON = { book: 'book', sched: 'bracket', time: 'clock', ann: 'trophy', live: 'tables', hist: 'medal' };

function render() {
  const s = getState();
  // 決賽籤號要等大會台按「確定並公開」才顯示
  D = derive({ ...s, events: (s.events || []).map(e => (e.finalPub ? e : { ...e, finalPos: {} })) });
  $('#top').innerHTML = header(s, '即時賽程', [['線上點單', 'lineup.html']]);
  if (tab === 'time' && !s.sched) tab = 'sched';
  $('#tabs').innerHTML = TABS.filter(([k]) => k !== 'time' || s.sched).map(([k, t]) => `<button class="${tab === k ? 'on' : ''}" data-tab="${k}">${icon(TAB_ICON[k])}<span>${t}</span></button>`).join('');
  if (!curEv || !D.events.some(e => e.name === curEv)) curEv = D.events[0] ? byPill(D.events)[0].name : null;
  // 搜尋框只建立一次，之後只更新下方內容（重畫輸入框會打斷注音等輸入法）
  if (!$('#q')) $('#main').innerHTML = `<label class="sbox">${icon('search')}<input id="q" class="search" type="search" placeholder="學校、隊名或姓名"></label><div style="height:12px"></div><div id="content"></div>`;
  if ($('#q').value !== q && !composing) $('#q').value = q;
  // 搜尋只在賽程、成績公告、即時桌況出現，各自只找當頁的內容
  $('.sbox').style.display = tab === 'time' || tab === 'book' ? 'none' : '';
  // 秩序冊：整頁顯示每一頁的圖片，資料更新時不重畫
  $('#main').classList.toggle('bookmode', tab === 'book');
  if (tab === 'book') { if (!$('.bkpages')) { $('#content').innerHTML = bookHtml(false); watchBook(); } drawDetail(); return; }
  $('#q').placeholder = '學校、隊名或姓名';
  const key = tab === 'time' ? '' : q.trim();
  $('#content').innerHTML = tab === 'ann' ? viewAnn(s, key) : !D.events.length ? `<div class="panel"><p class="muted">${auth.loaded ? '賽程尚未公布。' : '讀取中。'}</p></div>`
    : tab === 'live' ? viewLive(s, key) : tab === 'time' ? viewTime(s) : key ? viewSearch(s, key) : viewSched();
  drawDetail();
}

/** 秩序冊：捲動時更新目前頁碼 */
function watchBook() {
  const cur = $('#bkcur');
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting && cur) cur.textContent = `${e.target.dataset.pg} / ${BOOK.pages}`; }), { rootMargin: '-45% 0px -45% 0px' });
  document.querySelectorAll('.bkpages img').forEach(x => io.observe(x));
}
document.addEventListener('click', ev => {
  const b = ev.target.closest('[data-bkmenu],[data-bkgo]');
  const nav = $('.bknav');
  if (!b) { if (nav && !nav.hidden && !ev.target.closest('.bknav')) { nav.hidden = true; $('[data-bkmenu]').setAttribute('aria-expanded', 'false'); } return; }
  if ('bkmenu' in b.dataset) { nav.hidden = !nav.hidden; b.setAttribute('aria-expanded', String(!nav.hidden)); return; }
  const pg = document.getElementById(`bk${b.dataset.bkgo}`);
  nav.hidden = true; $('[data-bkmenu]').setAttribute('aria-expanded', 'false');
  if (pg) window.scrollTo({ top: pg.getBoundingClientRect().top + window.scrollY - $('.bkbar').offsetHeight - 4 });
});

/** 大會台的廣播：只顯示最新一則，按「查看更多」再列出前 4 則 */
let callsOpen = false;
function viewCalls(s, key) {
  const html = callList(s.pcalls, D, { max: callsOpen || key ? 5 : 1, filter: ({ c, m }) => !key || (m ? hit(m, key) : String(c.text).includes(key)) });
  const more = !key && (s.pcalls || []).length > 1;
  return html ? `<div class="panel bc"><h2>廣播</h2>${html}${more ? `<button class="bcmore" data-callsmore>${callsOpen ? '收合' : '查看更多'}</button>` : ''}</div>` : '';
}
function viewLive(s, key) {
  return `${s.notice ? `<div class="call">${esc(s.notice)}</div>` : ''}${viewCalls(s, key)}${board(s, D, key ? { match: m => hit(m, key) } : {})}`;
}

/** 賽程時間表：每天一張表，列是時段、欄是項目 */
const viewTime = s => timetableHtml(s, { flat: true });

/** 成績公告：大會公布前只列出空格 */
/**
 * 成績公告：本屆（大會台公布的名次）與歷屆名次合在一起，上方用年份切換。
 * 本屆沒公布任何項目時，仍顯示空的公告表並註明「成績尚未公布」。
 */
let savedHist = null, histLoading = false;
function pastYears(s) {
  if (savedHist === null && !histLoading) {
    histLoading = true;
    loadHistory().then(h => { savedHist = h; }).catch(() => { savedHist = {}; }).finally(() => { histLoading = false; render(); });
  }
  return mergeHistory(savedHist, null).filter(y => y.edition !== s.edition);
}
function viewAnn(s, key) {
  const mark = v => (key && v && v.includes(key) ? esc(v).split(esc(key)).join(`<mark>${esc(key)}</mark>`) : esc(v || ''));
  const line = (l, v) => `<div class="al"><span class="ak">${l}：</span><span>${mark(v)}</span></div>`;
  const grid = list => `<div class="agrid">${list.map(([ev, r]) => `<div class="ab"><h3>${ANN_NAME[ev]}</h3>${r.map(([l, v]) => line(l, v)).join('')}</div>`).join('')}</div>`;
  // 本屆
  const pub = s.podium || {};
  const rows = ev => { const p = pub[ev] || {}; return [['冠軍', p.c], ['亞軍', p.r], ['季軍', p.s1], ['季軍', p.s2]]; };
  const any = ANN_ORDER.some(ev => rows(ev).some(([, v]) => v));
  const curList = ANN_ORDER.map(ev => [ev, key ? rows(ev).filter(([, v]) => v && v.includes(key)) : rows(ev)]).filter(([, r]) => r.length);
  const current = () => `<div class="panel ann"><h2>${esc(s.annTitle || '成績公告')}</h2>
    ${!any && !key ? '<p class="muted" style="text-align:center;margin:4px 0 12px">成績尚未公布</p>' : ''}${curList.length ? grid(curList) : '<p class="muted small" style="text-align:center">查無相關成績。</p>'}</div>`;
  // 歷屆
  const past = pastYears(s);
  const pastPanel = y => {
    const evs = ANN_ORDER.map(ev => [ev, (y.p[ev] || []).filter(([, v]) => !key || v.includes(key))]).filter(([, r]) => r.length);
    return evs.length ? `<div class="panel ann"><h2>${y.year} ${esc(y.edition)}</h2>${grid(evs)}</div>` : '';
  };
  if (key) {
    const out = (curList.length ? current() : '') + past.map(pastPanel).join('');
    return out || '<div class="panel"><p class="muted small" style="text-align:center">查無相關成績。</p></div>';
  }
  const thisYear = Number(String((s.dates || [])[0] || '').slice(0, 4)) || new Date().getFullYear();
  const sel = past.find(y => y.year === hy);
  return `<div class="pills annyears" style="margin-bottom:12px"><button class="${sel ? '' : 'on'}" data-hy="cur">${thisYear} 本屆</button>${past.map(y => `<button class="${y === sel ? 'on' : ''}" data-hy="${y.year}">${y.year}</button>`).join('')}</div>
    ${sel ? pastPanel(sel) : current()}`;
}

const shown = m => m.status !== 'wait' && m.status !== 'ready';
function viewSched() {
  const e = D.events.find(x => x.name === curEv);
  const groups = e.team ? groupTables(e, shown) : '';
  const ko = e.team ? e.matches.filter(m => m.stage === 'F') : e.matches;
  const t = bracketSvg(ko, e.team, { pos: true });
  const tree = t.svg ? `<div class="panel flat"><div class="row"><h2 style="margin:0">${e.team ? '決賽' : '籤表'}</h2><span class="spacer"></span>
      <button class="btn ghost sm" data-zoom="-1" aria-label="縮小" title="縮小">${icon('zoomOut')}</button><button class="btn ghost sm" data-zoom="1" aria-label="放大" title="放大">${icon('zoomIn')}</button></div>
    <div class="treebox" style="margin-top:10px">${t.svg.replace(/width="[\d.]+" height="[\d.]+"/, `width="${Math.round(t.width * zoom)}" height="${Math.round(t.height * zoom)}"`)}</div></div>` : '';
  const pre = groups ? `<div class="panel flat"><h2>預賽</h2>${groups}</div>` : '';
  // 決賽籤表公開後排到預賽上面
  const pub = e.team && (getState().events || []).some(x => x.name === e.name && x.finalPub);
  return `<div class="pills" style="margin-bottom:12px">${byPill(D.events).map(x => `<button class="${x.name === curEv ? 'on' : ''}" data-ev="${x.name}">${x.name}</button>`).join('')}</div>
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
  const games = g => (g || []).filter(x => x && x[0] !== '' && x[0] != null && x[1] !== '' && x[1] != null).map(x => `${esc(x[0])}:${esc(x[1])}`).join('　');
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
    body = gs.length ? `<table class="dgv">${gs.map((g, i) => { const w = gameWinner(g); return `<tr><td class="${w === 'a' ? 'w' : ''}">${esc(g[0])}</td><td class="gl">:</td><td class="${w === 'b' ? 'w' : ''}">${esc(g[1])}</td></tr>`; }).join('')}</table>` : '';
  }
  const nm = k => { const x = k === 'a' ? m.A : m.B; const lost = wo && wo !== k; const t = String(sideText(x, m.team) || ''), sp = m.team ? -1 : t.indexOf(' ');
    // 個人賽：校名一行、姓名一行（雙打保留斜線）
    return `<span class="${lost ? 'lost' : ''}">${sp > 0 ? `${esc(t.slice(0, sp))}<br>${esc(t.slice(sp + 1))}` : esc(t)}</span>${lost ? '<span class="wo-tag">棄權</span>' : ''}`; };
  host.hidden = false;
  host.innerHTML = `<div class="modal-bg"><div class="modal" style="width:min(640px,100%)"><div class="row"><h2>${EVENT_FULL[m.ev]} ${esc(m.no)}</h2>${m.status === 'playing' ? `<span class="tchip">第 ${m.tables.join('、')} 桌</span>` : ''}<span class="spacer"></span><button class="btn ghost sm" data-close aria-label="關閉" title="關閉">${icon('close')}</button></div>
    <div class="duel"><div class="n r">${nm('a')}</div><div class="s">${shown(m) ? `${m.score[0]} : ${m.score[1]}` : 'vs'}</div><div class="n">${nm('b')}</div></div>${shown(m) ? body : ''}</div></div>`;
}

document.addEventListener('click', ev => {
  const b = ev.target.closest('button');
  if (b) {
    if (b.dataset.tab) { tab = b.dataset.tab; q = ''; render(); }
    else if (b.dataset.callsmore !== undefined) { callsOpen = !callsOpen; render(); }
    else if (b.dataset.hy) { hy = b.dataset.hy === 'cur' ? null : Number(b.dataset.hy); render(); }
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
