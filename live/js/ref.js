// 裁判頁：輸入姓名、選球桌、記錄每局比分、回報未到
import { derive, sideText, EVENT_FULL, POINTS, gameInvalid, gameWinner, fmtTime } from './model.js';
import { getState, subscribe, updateMatch, onAuth } from './store.js';
import { esc, $, $$, icon, toast, tableMap, header, lineName } from './ui.js';

const NAME_KEY = 'jdb-ref-name';
let name = localStorage.getItem(NAME_KEY) || '';
let table = null, point = null, swapAsk = false;
let D = null;
// 學校和選手姓名分兩行（雙打名字比較長）
const two = t => { const x = String(t || '').trim(), i = x.indexOf(' '); return i > 0 ? `${esc(x.slice(0, i))}<br>${esc(x.slice(i + 1))}` : esc(x); };

function render() {
  const s = getState();
  D = derive(s);
  $('#top').innerHTML = header(s, '裁判紀錄區', []);
  $('#main').innerHTML = !name ? viewName() : table == null ? viewTables(s) : viewMatch();
  if (name && table != null) refresh();
}

function viewName() {
  return `<div class="panel"><h2>裁判姓名</h2>
    <div class="row"><input id="rn" type="text" placeholder="請輸入全名" style="flex:1;font-size:18px;padding:8px"><button class="btn" data-setname>開始</button></div>
    <p class="small" style="margin:8px 0 0;color:var(--red)">請填寫正確全名</p></div>`;
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
  const head = `<div class="panel"><div class="row"><h2 style="margin:0">第 ${table} 桌</h2><span class="spacer"></span>${back}</div>
    <div class="small muted">${EVENT_FULL[m.ev]} ${esc(m.no)}</div>
    <div class="duel"><div class="n r">${two(an)}</div><div class="s" id="tot"></div><div class="n">${two(bn)}</div></div></div>`;
  // 未到回報：在選擇點的頁面回報整隊；進入某一點後回報該點的選手
  const absentPanel = pi => {
    const hold = pi == null ? m.rec : (((m.rec.pts || [])[pi]) || {});
    const ab = hold.absent || {};
    const who = k => { const S = sideText(k === 'a' ? m.A : m.B, m.team); if (pi == null) return S; const n = lineName(lu[k], pi); return n ? `${S} ${n}` : S; };
    const key = pi == null ? 'm' : pi;
    return `<div class="panel"><h2>${pi == null ? '未到回報' : `第${'一二三四五'[pi]}點 未到回報`}</h2>
      ${ab.a || ab.b ? `<div class="alertbox">已回報：${esc([ab.a ? who('a') : '', ab.b ? who('b') : ''].filter(Boolean).join('、'))} 未到${ab.called ? `　<span class="small">（大會 ${fmtTime(ab.called)} 已廣播）</span>` : ''}</div><button class="btn ghost" data-absent="none|${key}">${icon('check')}已到場，取消回報</button>`
        : `<div class="row"><button class="btn ghost" data-absent="a|${key}">${esc(who('a'))} 未到</button><button class="btn ghost" data-absent="b|${key}">${esc(who('b'))} 未到</button><button class="btn ghost" data-absent="both|${key}">雙方未到</button></div>`}</div>`;
  };
  // 請求其他裁判支援替換：有急事、去廁所、輪到自己比賽
  const sw = (m.rec.swap || {})[table];
  const swapPanel = `<div class="panel"><h2>請求支援</h2>${sw && sw.by === name
    ? `<div class="alertbox">${fmtTime(sw.ts)} 已請求其他裁判支援替換（${esc(sw.why)}）${sw.sent ? `<br><b>大會台 ${fmtTime(sw.sent)} 已派出替換裁判</b>，請在原地等候交接。` : '<br>等待大會台派出替換裁判。'}</div><button class="btn plain" data-swapcancel>取消請求</button>`
    : swapAsk ? `<p class="small muted">選擇原因，大會台會派其他裁判來替換。</p><div class="swapbtns">${['要去廁所', '輪到我比賽', '有急事'].map(w => `<button class="btn ghost" data-swap="${w}">${w}</button>`).join('')}</div><button class="btn plain" data-swapno style="margin-top:8px">取消</button>`
    : `<button class="btn ghost" data-swapask>請求支援</button>`}</div>`;
  if (m.team && point == null) {
    const def = x.point;
    return `${head}<div class="panel"><h2>請選擇要記錄的點</h2>
      ${POINTS.map((p, i) => { const r = m.result.pts[i]; const pt = (m.rec.pts || [])[i] || {};
        return `<button class="tcell ptsel ${r.winner ? 'fin' : def === i ? 'busy' : ''}" style="margin-bottom:6px" data-point="${i}"><span class="t">${i + 1}</span>
          <span class="who">第${'一二三四五'[i]}點${pt.table ? ` <span class="tchip">第 ${pt.table} 桌</span>` : ''}<br>${esc(lineName(lu.a, i))} vs ${esc(lineName(lu.b, i))}</span>
          <span class="mins"><span class="big">${r.a}:${r.b}</span></span></button>`; }).join('')}</div>${absentPanel(null)}${swapPanel}`;
  }
  const games = m.team ? (((m.rec.pts || [])[point] || {}).g || []) : (m.rec.g || []);
  const pa = m.team ? lineName(lu.a, point) : an, pb = m.team ? lineName(lu.b, point) : bn;
  return `${head}<div class="panel">
    <div class="row"><h2 style="margin:0">${m.team ? `第${'一二三四五'[point]}點` : '各局比分'}</h2><span class="spacer"></span>${m.team ? '<button class="btn ghost sm" data-points>選擇其他點</button>' : ''}</div>
    <div class="gamerow small muted" style="margin-top:8px"><span></span><span style="text-align:center">${two(pa)}</span><span style="text-align:center">${two(pb)}</span><span></span></div>
    ${[0, 1, 2, 3, 4].map(gi => `<div class="gamerow"><span class="small">第${'一二三四五'[gi]}局</span>
      <input type="text" inputmode="numeric" maxlength="2" data-g="${gi}|0" value="${(games[gi] || [])[0] ?? ''}">
      <input type="text" inputmode="numeric" maxlength="2" data-g="${gi}|1" value="${(games[gi] || [])[1] ?? ''}"><span data-ok="${gi}"></span></div>`).join('')}
    <p id="msg" class="small"></p>
    <button class="btn yellow" data-done style="width:100%;justify-content:center;padding:10px">${icon('check')}${m.team ? '本點結束' : '本場結束'}</button></div>${absentPanel(m.team ? point : null)}${swapPanel}`;
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
    swapAsk = false;
    if (x && (x.m.rec.refs || {})[table] !== name) updateMatch(x.m.id, r => {
      r.refs = r.refs || {}; r.refs[table] = name;
      // 裁判交接：記下何時換成誰；新裁判接手後，原本的替換請求就結束
      r.reflog = (r.reflog || []).concat({ t: table, n: name, ts: Date.now() }).slice(-40);
      if (r.swap && r.swap[table] && r.swap[table].by !== name) { delete r.swap[table]; if (!Object.keys(r.swap).length) delete r.swap; }
    }); else render(); }
  else if ('swapask' in d) { swapAsk = true; render(); }
  else if ('swapno' in d) { swapAsk = false; render(); }
  else if (d.swap || 'swapcancel' in d) {
    const x = D.tables.get(table); if (!x) return;
    const why = d.swap;
    updateMatch(x.m.id, r => {
      r.swap = r.swap || {};
      if (why) r.swap[table] = { by: name, why, ts: Date.now() };
      else { delete r.swap[table]; }
      if (!Object.keys(r.swap).length) delete r.swap;
    });
    swapAsk = false; render(); toast(why ? '已通知大會台' : '已取消請求');
  }
  else if ('back' in d) { table = null; point = null; render(); }
  else if ('done' in d) {
    // 團體賽按「本點結束」回到這一桌的選點頁面，個人賽按「本場結束」回到球桌列表
    document.activeElement && document.activeElement.blur();
    const x = D.tables.get(table);
    // 比賽已分出勝負：記下完賽，這場離開球桌、晉級者自動帶到下一場
    const over = x && (x.m.team ? x.m.result.done : !!x.m.result.winner);
    if (over) updateMatch(x.m.id, r => { r.fin = Date.now(); delete r.absent; (r.pts || []).forEach(p => { if (p) delete p.absent; }); });
    if (!(x && x.m.team) || over) table = null;
    point = null; render(); toast(over ? '比賽結束，紀錄已儲存' : '紀錄已儲存'); window.scrollTo(0, 0);
  }
  else if ('points' in d) { point = null; render(); }
  else if (d.point) { point = Number(d.point); render(); }
  else if (d.absent) {
    const x = D.tables.get(table); if (!x) return;
    const [kind, key] = d.absent.split('|');
    updateMatch(x.m.id, r => {
      let hold = r;
      if (key !== 'm') { r.pts = r.pts || []; r.pts[key] = r.pts[key] || {}; hold = r.pts[key]; }
      if (kind === 'none') delete hold.absent;
      else hold.absent = { a: kind !== 'b', b: kind !== 'a', ts: Date.now(), by: name, table };
    });
    render(); toast(kind === 'none' ? '已取消回報' : '已回報大會');
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
    let o;
    if (m.team) { r.pts = r.pts || []; o = r.pts[pi] = r.pts[pi] || {}; games = o.g = o.g || []; o.ref = name; if (!o.table) o.table = table; }
    else { o = r; games = r.g = r.g || []; r.ref = name; }
    games[gi] = games[gi] || ['', ''];
    games[gi][side] = v === '' ? '' : Number(v);
    // 記下這局是誰記的（大會台可以查）
    o.gb = o.gb || []; o.gb[gi] = name; for (let i = 0; i < o.gb.length; i++) if (o.gb[i] == null) o.gb[i] = '';
    for (let i = 0; i < games.length; i++) if (!games[i]) games[i] = ['', ''];
  });
});
document.addEventListener('keydown', ev => { if (ev.key === 'Enter' && ev.target.id === 'rn') $('[data-setname]').click(); });

onAuth(a => { if (a.error) toast(a.error); });
subscribe((s, local) => {
  D = derive(s);
  const a = document.activeElement;
  if (a && a.dataset && a.dataset.g) refresh(); else if (!(a && a.id === 'rn')) render();
});
render();
