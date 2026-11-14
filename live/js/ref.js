// 裁判頁：輸入姓名、選球桌、記錄每局比分、回報未到
import { derive, sideText, EVENT_FULL, POINTS, gameInvalid, gameWinner } from './model.js';
import { getState, subscribe, updateMatch } from './store.js';
import { esc, $, $$, icon, toast, tableMap, header, lineName } from './ui.js';

const NAME_KEY = 'jdb-ref-name';
let name = localStorage.getItem(NAME_KEY) || '';
let table = null, point = null;
let D = null;

function render() {
  const s = getState();
  D = derive(s);
  $('#top').innerHTML = header(s, '裁判記分', []);
  $('#main').innerHTML = !name ? viewName() : table == null ? viewTables(s) : viewMatch();
  if (name && table != null) refresh();
}

function viewName() {
  return `<div class="panel"><h2>裁判姓名</h2>
    <div class="row"><input id="rn" type="text" placeholder="請輸入姓名" style="flex:1;font-size:18px;padding:8px"><button class="btn" data-setname>開始</button></div></div>`;
}
function viewTables(s) {
  return `<div class="panel"><div class="row"><h2 style="margin:0">請選擇球桌</h2><span class="spacer"></span><span class="small muted">裁判：${esc(name)}</span><button class="btn ghost sm" data-rename>更改</button></div>
    ${tableMap(s, D, { tag: 'button' })}</div>`;
}
function viewMatch() {
  const x = D.tables.get(table);
  const back = `<button class="btn ghost sm" data-back>返回球桌列表</button>`;
  if (!x) return `<div class="panel"><div class="row"><h2 style="margin:0">第 ${table} 桌</h2><span class="spacer"></span>${back}</div><p class="muted">此桌目前沒有進行中的場次。</p></div>`;
  const m = x.m;
  const lu = m.rec.lineup || {};
  const an = sideText(m.A, m.team), bn = sideText(m.B, m.team);
  const ab = m.rec.absent || {};
  const head = `<div class="panel"><div class="row"><h2 style="margin:0">第 ${table} 桌</h2><span class="spacer"></span>${back}</div>
    <div class="small muted">${EVENT_FULL[m.ev]} ${esc(m.no)}</div>
    <div class="duel"><div class="n r">${esc(an)}</div><div class="s" id="tot"></div><div class="n">${esc(bn)}</div></div></div>`;
  const absent = `<div class="panel"><h2>未到回報</h2>
    ${ab.a || ab.b ? `<div class="alertbox">已回報：${esc([ab.a ? an : '', ab.b ? bn : ''].filter(Boolean).join('、'))} 未到</div><button class="btn ghost" data-absent="none">${icon('check')}已到場，取消回報</button>`
      : `<div class="row"><button class="btn ghost" data-absent="a">${esc(an)} 未到</button><button class="btn ghost" data-absent="b">${esc(bn)} 未到</button><button class="btn ghost" data-absent="both">雙方未到</button></div>`}</div>`;
  if (m.team && point == null) {
    const def = x.point;
    return `${head}<div class="panel"><h2>請選擇要記錄的點</h2>
      ${POINTS.map((p, i) => { const r = m.result.pts[i]; const pt = (m.rec.pts || [])[i] || {};
        return `<button class="tcell ${def === i ? 'busy' : ''}" style="margin-bottom:6px" data-point="${i}"><span class="t">${i + 1}</span>
          <span class="who">第${'一二三四五'[i]}點 ${p.dbl ? '雙打' : '單打'}${pt.table ? `　第 ${pt.table} 桌` : ''}<br>${esc(lineName(lu.a, i))} 對 ${esc(lineName(lu.b, i))}</span>
          <span class="mins"><span class="big">${r.a}:${r.b}</span><br>${r.winner ? '已完成' : ''}</span></button>`; }).join('')}</div>${absent}`;
  }
  const games = m.team ? (((m.rec.pts || [])[point] || {}).g || []) : (m.rec.g || []);
  const pa = m.team ? lineName(lu.a, point) : an, pb = m.team ? lineName(lu.b, point) : bn;
  return `${head}<div class="panel">
    <div class="row"><h2 style="margin:0">${m.team ? `第${'一二三四五'[point]}點 ${POINTS[point].dbl ? '雙打' : '單打'}` : '各局比分'}</h2><span class="spacer"></span>${m.team ? '<button class="btn ghost sm" data-points>選擇其他點</button>' : ''}</div>
    <div class="gamerow small muted" style="margin-top:8px"><span></span><span style="text-align:center">${esc(pa)}</span><span style="text-align:center">${esc(pb)}</span><span></span></div>
    ${[0, 1, 2, 3, 4].map(gi => `<div class="gamerow"><span class="small">第${'一二三四五'[gi]}局</span>
      <input type="text" inputmode="numeric" maxlength="2" data-g="${gi}|0" value="${(games[gi] || [])[0] ?? ''}">
      <input type="text" inputmode="numeric" maxlength="2" data-g="${gi}|1" value="${(games[gi] || [])[1] ?? ''}"><span data-ok="${gi}"></span></div>`).join('')}
    <p id="msg" class="small"></p></div>${absent}`;
}
/** 只更新數字與提示，不重畫輸入框 */
function refresh() {
  const x = D.tables.get(table);
  const tot = $('#tot');
  if (!x) return;
  const m = x.m;
  if (tot) tot.textContent = `${m.score[0]} : ${m.score[1]}`;
  if (m.team && point == null) return;
  const games = m.team ? (((m.rec.pts || [])[point] || {}).g || []) : (m.rec.g || []);
  [0, 1, 2, 3, 4].forEach(gi => {
    const ok = $(`[data-ok="${gi}"]`); if (!ok) return;
    ok.innerHTML = gameWinner(games[gi]) ? icon('check') : '';
    $$(`[data-g^="${gi}|"]`).forEach(inp => inp.classList.toggle('bad', gameInvalid(games[gi])));
  });
  const r = m.team ? m.result.pts[point] : m.result;
  const msg = $('#msg');
  if (msg) msg.innerHTML = r.winner ? `<b>${r.a}:${r.b}，${esc([sideText(r.winner === 'a' ? m.A : m.B, m.team), m.team ? lineName((m.rec.lineup || {})[r.winner], point) : ''].filter(Boolean).join(' '))} 獲勝。</b>`
    : '';
}

document.addEventListener('click', ev => {
  const t = ev.target.closest('button'); if (!t) return;
  const d = t.dataset;
  if ('setname' in d) { const v = $('#rn').value.trim(); if (!v) { toast('請輸入姓名'); return; } name = v; localStorage.setItem(NAME_KEY, name); render(); }
  else if ('rename' in d) { name = ''; render(); }
  else if (d.table) { table = Number(d.table); point = null; const x = D.tables.get(table); if (x && x.m.team && x.point != null) point = x.point;
    if (x && (x.m.rec.refs || {})[table] !== name) updateMatch(x.m.id, r => { r.refs = r.refs || {}; r.refs[table] = name; }); else render(); }
  else if ('back' in d) { table = null; point = null; render(); }
  else if ('points' in d) { point = null; render(); }
  else if (d.point) { point = Number(d.point); render(); }
  else if (d.absent) {
    const x = D.tables.get(table); if (!x) return;
    updateMatch(x.m.id, r => { if (d.absent === 'none') delete r.absent; else r.absent = { a: d.absent !== 'b', b: d.absent !== 'a', ts: Date.now(), by: name }; });
    render(); toast(d.absent === 'none' ? '已取消回報' : '已回報大會');
  }
});
document.addEventListener('input', ev => {
  const t = ev.target; if (!t.dataset.g) return;
  const x = D.tables.get(table); if (!x) return;
  const [gi, side] = t.dataset.g.split('|');
  const v = t.value.replace(/\D/g, ''); if (v !== t.value) t.value = v;
  const m = x.m, pi = point;
  updateMatch(m.id, r => {
    let games;
    if (m.team) { r.pts = r.pts || []; r.pts[pi] = r.pts[pi] || {}; games = r.pts[pi].g = r.pts[pi].g || []; r.pts[pi].ref = name; if (!r.pts[pi].table) r.pts[pi].table = table; }
    else { games = r.g = r.g || []; r.ref = name; }
    games[gi] = games[gi] || ['', ''];
    games[gi][side] = v === '' ? '' : Number(v);
    for (let i = 0; i < games.length; i++) if (!games[i]) games[i] = ['', ''];
  });
});
document.addEventListener('keydown', ev => { if (ev.key === 'Enter' && ev.target.id === 'rn') $('[data-setname]').click(); });

subscribe((s, local) => {
  D = derive(s);
  const a = document.activeElement;
  if (a && a.dataset && a.dataset.g) refresh(); else if (!(a && a.id === 'rn')) render();
});
render();
