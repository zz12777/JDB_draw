// 大會台
import { derive, isTeam, POINTS, callText, recallText, fmtTime, parseTables, sideText, gameInvalid, EVENT_ORDER, EVENT_FULL, emptyState } from './model.js';
import { getState, subscribe, update, updateMatch, replaceState } from './store.js';
import { esc, $, $$, icon, toast, chip, tableMap, header, names, shortEv, lineName, mins } from './ui.js';
import { demoState } from './demo.js';
import { readWorkbookValues, readFormFile } from '../../js/reader.js';
import { parseFinalBracket } from '../../js/finalparse.js';
import { parseResponses, buildEntries, splitNames } from '../../js/parse.js';

let tab = 'ctrl';
let curEv = null;
let modal = null; // { kind: 'score' | 'lineup', mid }
let D = null;

const TABS = [['ctrl', '賽程控制'], ['draw', '決賽抽籤'], ['setup', '資料設定']];

function render() {
  const s = getState();
  D = derive(s);
  $('#top').innerHTML = header(s, '大會台', [['公開頁', 'index.html'], ['裁判頁', 'ref.html']]);
  $('#tabs').innerHTML = TABS.map(([k, t]) => `<button class="${tab === k ? 'on' : ''}" data-tab="${k}">${t}</button>`).join('');
  if (!D.events.length && tab !== 'setup') tab = 'setup';
  if (!curEv || !D.events.some(e => e.name === curEv)) curEv = D.events[0] ? D.events[0].name : null;
  $('#main').innerHTML = tab === 'ctrl' ? viewCtrl(s) : tab === 'draw' ? viewDraw(s) : viewSetup(s);
}

// ---------------- 賽程控制 ----------------
function viewCtrl(s) {
  const e = D.events.find(x => x.name === curEv);
  const all = [...D.byId.values()];
  const readyN = ev => ev.matches.filter(m => m.status === 'ready').length;
  const absent = all.filter(m => m.rec.absent && (m.rec.absent.a || m.rec.absent.b) && m.status === 'playing');
  const reported = all.filter(m => m.status === 'reported');
  const ready = all.filter(m => m.status === 'ready').sort((x, y) => EVENT_ORDER.indexOf(x.ev) - EVENT_ORDER.indexOf(y.ev) || stageOrder(x) - stageOrder(y) || x.num - y.num);
  const calls = (s.calls || []).slice(-4).reverse();
  return `<div class="desk"><div>
    <div class="panel">
      <div class="row"><div class="pills">${D.events.map(x => `<button class="${x.name === curEv ? 'on' : ''}" data-ev="${x.name}">${x.name}${readyN(x) ? `<span class="n">${readyN(x)}</span>` : ''}</button>`).join('')}</div></div>
      <div class="legend">
        <span><span class="dot on"></span>前一輪已完賽</span>
        ${e.team ? `<span><input type="checkbox" checked disabled>已發點單</span><span>${icon('list')}已收點單（已輸入排點）</span>` : ''}
        <span><span class="chip ready">可開賽</span>輸入桌次即開賽並記錄時間</span>
      </div>
      <div class="rounds">${e.rounds.map(r => `<div class="round"><h3><span>${esc(r.label)}</span><span class="muted small">${r.matches.filter(m => m.status === 'done').length}/${r.matches.length}</span></h3>
        ${r.matches.map(card).join('')}</div>`).join('')}</div>
    </div></div>
    <div class="side">
      ${absent.length ? `<div class="panel"><h2>未到回報</h2>${absent.map(m => {
        const who = m.rec.absent.a && m.rec.absent.b ? 'both' : m.rec.absent.a ? 'a' : 'b';
        return `<div class="alertbox"><div class="small">第 ${m.tables.join('、')} 桌　${fmtTime(m.rec.absent.ts)}　裁判 ${esc(m.rec.absent.by || '')}</div>
          <div>${esc(recallText(m, who))}</div>
          <div class="row" style="margin-top:4px"><button class="btn ghost sm" data-copy="${esc(recallText(m, who))}">${icon('copy')}複製</button><button class="btn ghost sm" data-clear-absent="${esc(m.id)}">${icon('check')}已到場</button></div></div>`;
      }).join('')}</div>` : ''}
      <div class="panel"><h2>廣播稿</h2>${calls.length ? calls.map((c, i) => `<div class="call ${i ? 'old' : ''}"><div class="tm">${fmtTime(c.ts)}</div>${esc(c.text)}
        ${i ? '' : `<div><button class="btn ghost sm" data-copy="${esc(c.text)}">${icon('copy')}複製</button></div>`}</div>`).join('') : '<p class="small muted">輸入桌次後，廣播稿會顯示在這裡。</p>'}</div>
      <div class="panel"><h2>球桌</h2>${tableMap(s, D, { tag: 'button', alerts: new Set(absent.map(m => m.id)) })}</div>
      <div class="panel"><h2>待確認成績（${reported.length}）</h2>${reported.length ? reported.map(m => `<div class="row small" style="margin-bottom:4px"><b>${esc(shortEv(m))}</b><span>${names(m)}　${m.score[0]}:${m.score[1]}</span><span class="spacer"></span><button class="btn sm" data-score="${esc(m.id)}">核對</button></div>`).join('') : '<p class="small muted">目前沒有待確認的成績。</p>'}</div>
      <div class="panel"><h2>可開賽（${ready.length}）</h2>${ready.length ? ready.slice(0, 12).map(m => `<div class="row small" style="margin-bottom:4px"><b>${esc(shortEv(m))}</b><span>${names(m)}</span></div>`).join('') + (ready.length > 12 ? `<p class="small muted">另有 ${ready.length - 12} 場</p>` : '') : '<p class="small muted">目前沒有可開賽的場次。</p>'}</div>
    </div></div>`;
}
const stageOrder = m => (m.stage === 'F' ? 1 : 0) * 100 + m.roundIdx;

function card(m) {
  const sideRow = (k, S) => {
    const win = m.winner === k;
    const slip = m.rec.slip && m.rec.slip[k];
    return `<div class="sd ${win ? 'win' : ''}">
      <span class="dot ${m.prevDone[k] ? 'on' : ''}" title="前一輪${m.prevDone[k] ? '已' : '尚未'}完賽"></span>
      ${m.team ? `<label class="slip" title="已發點單"><input type="checkbox" data-slip="${esc(m.id)}|${k}" ${slip ? 'checked' : ''}></label>
        <span title="${m.lineupOk[k] ? '已收點單' : '尚未收點單'}" style="color:${m.lineupOk[k] ? 'var(--blue)' : 'var(--line)'}">${icon('list')}</span>` : ''}
      <span class="nm">${esc(sideText(S, m.team)) || '<span class="muted">待定</span>'}</span>
      <span class="sc">${m.score[0] + m.score[1] > 0 || m.winner ? m.score[k === 'a' ? 0 : 1] : ''}</span></div>`;
  };
  const locked = m.status === 'done';
  return `<div class="mc ${m.status}" data-mid="${esc(m.id)}">
    <div class="hd"><span class="no">${esc(m.stage === 'F' ? m.label : `(${m.label})`)}</span>${m.group ? `<span class="muted">${m.group} 組</span>` : ''}${chip(m)}<span class="spacer"></span>
      ${m.rec.start ? `<span class="muted">${fmtTime(m.rec.start)} 開賽${m.status === 'playing' ? `，${mins(m.rec.start)} 分` : ''}</span>` : ''}</div>
    ${sideRow('a', m.A)}${sideRow('b', m.B)}
    <div class="ft">桌次 <input class="tb" type="text" inputmode="numeric" value="${m.tables.join('、')}" data-tb="${esc(m.id)}" ${locked || !m.known ? 'disabled' : ''} placeholder="${m.team ? '可填多桌' : ''}">
      <span class="spacer"></span>
      ${m.team ? `<button class="btn ghost sm" data-lineup="${esc(m.id)}" ${m.known ? '' : 'disabled'}>${icon('list')}排點</button>` : ''}
      <button class="btn ghost sm" data-score="${esc(m.id)}" ${m.known ? '' : 'disabled'}>${icon(locked ? 'lock' : 'score')}成績</button></div>
  </div>`;
}

function setTables(mid, text) {
  const s = getState();
  const m = D.byId.get(mid);
  const tables = parseTables(text);
  const bad = tables.find(t => t < 1 || t > (s.tables || 24));
  if (bad != null) { toast(`沒有第 ${bad} 桌`); render(); return; }
  const busy = tables.find(t => D.tables.has(t) && D.tables.get(t).m.id !== mid && D.tables.get(t).m.status === 'playing');
  if (busy != null) { toast(`第 ${busy} 桌正在進行 ${shortEv(D.tables.get(busy).m)}，請先確認`); render(); return; }
  const added = tables.filter(t => !m.tables.includes(t));
  update(st => {
    const rec = st.m[mid] = st.m[mid] || {};
    rec.tables = tables;
    if (tables.length && !rec.start) rec.start = Date.now();
    if (!tables.length && !(rec.g || rec.pts)) delete rec.start;
    if (added.length) {
      st.calls = (st.calls || []).concat({ ts: Date.now(), mid, text: callText(m, tables) }).slice(-40);
    }
  });
  if (added.length && m.status === 'wait') toast('提醒：此場次尚未符合開賽條件（對戰雙方或點單未齊）');
}

// ---------------- 排點 ----------------
function lineupModal(m) {
  const e = getState().events.find(x => x.name === m.ev);
  const col = (k, S) => {
    const roster = (e.rosters && e.rosters[S.name]) || [];
    const l = (m.rec.lineup && m.rec.lineup[k]) || [];
    const inp = (i, j, v) => `<input type="text" list="ros-${k}" data-lu="${k}|${i}|${j}" value="${esc(v || '')}" style="width:${j == null ? 100 : 48}%">`;
    return `<div style="flex:1;min-width:260px"><h3>${esc(S.name)} ${m.lineupOk[k] ? '<span class="chip playing">已收點單</span>' : '<span class="chip">尚未輸入</span>'}</h3>
      <datalist id="ros-${k}">${roster.map(n => `<option value="${esc(n)}">`).join('')}</datalist>
      ${POINTS.map((p, i) => `<div class="row" style="margin-bottom:6px;flex-wrap:nowrap"><span class="nowrap small muted" style="width:76px">第${'一二三四五'[i]}點 ${p.dbl ? '雙' : '單'}</span>
        <span style="flex:1;display:flex;gap:4px">${p.dbl ? inp(i, 0, (l[i] || [])[0]) + inp(i, 1, (l[i] || [])[1]) : inp(i, null, l[i])}</span></div>`).join('')}
      <div class="small" data-lu-warn="${k}" style="color:var(--red);min-height:20px"></div>
      <div class="row"><button class="btn sm" data-lu-save="${k}">${icon('check')}儲存排點</button><button class="btn ghost sm" data-lu-clear="${k}">清除</button>
        ${roster.length ? '' : '<span class="small muted">尚未匯入此隊名單，請直接輸入姓名</span>'}</div></div>`;
  };
  return `<div class="modal"><div class="row"><h2>${EVENT_FULL[m.ev]} ${esc(m.stage === 'F' ? m.label : `(${m.label})`)}　排點</h2><span class="spacer"></span><button class="btn ghost sm" data-close>${icon('close')}關閉</button></div>
    <p class="small muted">依各隊繳交的紙本點單輸入。兩隊都儲存後，此場次即列為可開賽。</p>
    <div class="row" style="align-items:flex-start;gap:24px">${col('a', m.A)}${col('b', m.B)}</div></div>`;
}
function readLineup(k) {
  return POINTS.map((p, i) => p.dbl
    ? [0, 1].map(j => $(`[data-lu="${k}|${i}|${j}"]`).value.trim())
    : $(`[data-lu="${k}|${i}|null"]`).value.trim());
}
function lineupWarn(l) {
  const flat = l.flat().filter(Boolean);
  const dup = flat.filter((n, i) => flat.indexOf(n) !== i);
  const out = [];
  if (dup.length) out.push(`${[...new Set(dup)].join('、')} 重複排點，請確認是否符合規程`);
  if (l[2][0] && l[2][0] === l[2][1]) out.push('雙打兩人不可為同一人');
  return out.join('；');
}

// ---------------- 成績 ----------------
function scoreModal(m) {
  const locked = m.status === 'done';
  const dis = locked ? 'disabled' : '';
  const lu = m.rec.lineup || {};
  const gin = (pi, gi, side, v) => `<input class="g" type="text" inputmode="numeric" maxlength="2" data-g="${pi}|${gi}|${side}" value="${v ?? ''}" ${dis}>`;
  const row = (pi, games, label, an, bn, extra) => `<tr data-row="${pi}"><td class="nowrap">${label}</td><td class="nm">${esc(an)}</td>
    ${[0, 1, 2, 3, 4].map(gi => `<td>${gin(pi, gi, 0, (games[gi] || [])[0])}<span class="vs">:</span>${gin(pi, gi, 1, (games[gi] || [])[1])}</td>`).join('')}
    <td class="res" data-res="${pi}"></td><td class="nm">${esc(bn)}</td>${extra}</tr>`;
  let body;
  if (m.team) {
    const pts = m.rec.pts || [];
    body = POINTS.map((p, i) => {
      const x = pts[i] || {};
      const tsel = `<td><select data-ptable="${i}" ${dis}><option value=""></option>${m.tables.map(t => `<option ${Number(x.table) === t ? 'selected' : ''}>${t}</option>`).join('')}</select></td><td class="small">${esc(x.ref || '')}</td>`;
      return row(i, x.g || [], `第${'一二三四五'[i]}點`, lineName(lu.a, i), lineName(lu.b, i), tsel);
    }).join('');
  } else {
    body = row('x', m.rec.g || [], '比分', sideText(m.A), sideText(m.B), `<td class="small">${esc(m.rec.ref || '')}</td>`);
  }
  return `<div class="modal"><div class="row"><h2>${EVENT_FULL[m.ev]} ${esc(m.stage === 'F' ? m.label : `(${m.label})`)}　成績</h2>${chip(m)}<span class="spacer"></span><button class="btn ghost sm" data-close>${icon('close')}關閉</button></div>
    <div class="duel"><div class="n r">${esc(sideText(m.A, m.team))}</div><div class="total" id="sc-total"></div><div class="n">${esc(sideText(m.B, m.team))}</div></div>
    <table class="sc"><thead><tr><th></th><th>${esc(sideText(m.A, m.team))}</th><th>第一局</th><th>第二局</th><th>第三局</th><th>第四局</th><th>第五局</th><th>局數</th><th>${esc(sideText(m.B, m.team))}</th>${m.team ? '<th>桌次</th>' : ''}<th>裁判</th></tr></thead><tbody>${body}</tbody></table>
    <p class="small muted" id="sc-note"></p>
    <div class="row" style="margin-top:10px">
      <span class="small muted">棄權：</span>
      <button class="btn ghost sm" data-wo="b" ${dis}>${esc(sideText(m.A, m.team))} 棄權</button>
      <button class="btn ghost sm" data-wo="a" ${dis}>${esc(sideText(m.B, m.team))} 棄權</button>
      ${m.rec.wo ? `<button class="btn ghost sm" data-wo="" ${dis}>取消棄權</button>` : ''}
      <span class="spacer"></span>
      ${locked ? `<button class="btn ghost" data-unconfirm>${icon('edit')}取消確認以修改</button>` : `<button class="btn yellow" data-confirm id="sc-confirm">${icon('lock')}確認成績並鎖定</button>`}
    </div></div>`;
}
function refreshScore() {
  if (!modal || modal.kind !== 'score') return;
  const m = D.byId.get(modal.mid);
  if (!m) return;
  $('#sc-total').textContent = `${m.score[0]} : ${m.score[1]}`;
  if (m.team) m.result.pts.forEach((r, i) => { const el = $(`[data-res="${i}"]`); if (el) el.textContent = r.a + r.b ? `${r.a}:${r.b}` : ''; });
  else { const el = $('[data-res="x"]'); if (el) el.textContent = m.score[0] + m.score[1] ? `${m.score[0]}:${m.score[1]}` : ''; }
  $$('input.g').forEach(inp => {
    const [pi, gi] = inp.dataset.g.split('|');
    const games = m.team ? (((m.rec.pts || [])[pi] || {}).g || []) : (m.rec.g || []);
    inp.classList.toggle('bad', gameInvalid(games[gi]));
  });
  const note = $('#sc-note');
  if (note) note.textContent = m.rec.wo ? '已登記棄權。' : m.result.needFirst3 ? '預賽須打完前三點，目前前三點尚未全部完成。' : m.winner ? '' : '每局 11 分、領先 2 分；先取得三局者獲勝' + (m.team ? '，先取得三點的隊伍獲勝。' : '。');
  const btn = $('#sc-confirm');
  if (btn) btn.disabled = !m.winner;
}

function openModal(kind, mid) { modal = { kind, mid }; drawModal(); }
function drawModal() {
  const host = $('#modal');
  if (!modal) { host.innerHTML = ''; host.hidden = true; return; }
  const m = D.byId.get(modal.mid);
  host.hidden = false;
  host.innerHTML = `<div class="modal-bg">${modal.kind === 'score' ? scoreModal(m) : lineupModal(m)}</div>`;
  refreshScore();
}

// ---------------- 決賽抽籤 ----------------
function viewDraw(s) {
  const teams = D.events.filter(e => e.team && e.final);
  if (!teams.length) return '<div class="panel"><p class="muted">尚無團體賽資料。</p></div>';
  if (!teams.some(e => e.name === curEv)) curEv = teams[0].name;
  const e = teams.find(x => x.name === curEv);
  const se = s.events.find(x => x.name === e.name);
  const half = e.final.size / 2;
  const marks = [...e.final.mark.entries()];
  const used = new Map();
  Object.entries(se.finalPos || {}).forEach(([k, p]) => { if (p) used.set(Number(p), (used.get(Number(p)) || []).concat(k)); });
  const check = (g, k) => {
    const key = g.letter + k, p = Number((se.finalPos || {})[key]);
    if (!p) return '';
    if (p < 1 || p > e.final.size) return '超出範圍';
    if (used.get(p).length > 1) return '籤號重複';
    if (e.final.mark.get(p) !== k) return `此為${e.final.mark.get(p)}軍籤位`;
    const other = Number((se.finalPos || {})[g.letter + (k === '冠' ? '亞' : '冠')]);
    if (other && (other <= half) === (p <= half)) return '同組冠亞軍須分在上下半區';
    return '';
  };
  const hint = g => {
    const c = Number((se.finalPos || {})[g.letter + '冠']);
    return c ? (c <= half ? '下半區' : '上半區') : '';
  };
  const cell = (g, k) => {
    const rk = k === '冠' ? 'c' : 'r';
    const sug = g.table.all ? g.table.rows[k === '冠' ? 0 : 1] : null;
    const cur = g.rank[rk] || '';
    const err = check(g, k);
    const roll = (se.roll || {})[g.letter + k] || '';
    return `<td><select data-rank="${g.letter}|${rk}"><option value=""></option>${g.teams.map(t => `<option ${cur === t ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>
        ${!cur && sug ? `<div class="small muted">名次試算：${esc(sug.team)}${sug.tie ? '（同勝場，請確認）' : ''}</div>` : ''}</td>
      <td><select data-roll="${g.letter + k}"><option value=""></option>${['到', '代抽', '未到'].map(x => `<option ${roll === x ? 'selected' : ''}>${x}</option>`).join('')}</select></td>
      <td><input type="text" inputmode="numeric" style="width:56px" data-fpos="${g.letter + k}" value="${(se.finalPos || {})[g.letter + k] || ''}">
        ${err ? `<div class="small" style="color:var(--red)">${err}</div>` : k === '亞' && hint(g) && !(se.finalPos || {})[g.letter + k] ? `<div class="small muted">應抽${hint(g)}</div>` : ''}</td>`;
  };
  const allDone = e.groups.every(g => g.table.all);
  const finals = e.matches.filter(m => m.stage === 'F' && m.roundIdx === 0);
  return `<div class="panel"><div class="row"><div class="pills">${teams.map(x => `<button class="${x.name === curEv ? 'on' : ''}" data-ev="${x.name}">${x.name}</button>`).join('')}</div>
      <span class="spacer"></span><button class="btn ghost sm" data-fill-rank ${allDone ? '' : ''}>${icon('check')}帶入名次試算</button></div>
    <p class="small muted">預賽各組取前二名晉級。名次試算僅比勝場，同勝場時請依競賽規程判定後以選單指定。同組冠亞軍須分在上下半區。</p>
    <p class="small">冠軍籤位：${marks.filter(x => x[1] === '冠').map(x => x[0]).join('、')}　亞軍籤位：${marks.filter(x => x[1] === '亞').map(x => x[0]).join('、')}　上半區為 1 到 ${half} 號</p>
    <div style="overflow-x:auto"><table class="list"><thead><tr><th>組別</th><th>預賽戰績</th><th>冠軍</th><th>點名</th><th>籤號</th><th>亞軍</th><th>點名</th><th>籤號</th></tr></thead><tbody>
    ${e.groups.map(g => `<tr><td><b>${g.letter}</b></td><td class="small">${g.table.rows.map(r => `${esc(r.team)} ${r.w} 勝 ${r.l} 敗`).join('<br>')}${g.table.all ? '' : '<div class="muted">預賽尚未全部確認</div>'}</td>${cell(g, '冠')}${cell(g, '亞')}</tr>`).join('')}
    </tbody></table></div></div>
    <div class="panel"><h2>決賽第一輪對戰</h2><table class="list"><thead><tr><th>場次</th><th>對戰</th></tr></thead><tbody>
      ${e.matches.filter(m => m.stage === 'F').filter(m => m.src.some(x => x.pos != null)).map(m => `<tr><td>${esc(m.label)}</td><td>${names(m)}</td></tr>`).join('')}</tbody></table>
      <p class="small muted">${finals.length ? '' : ''}籤號輸入後，決賽輪次會自動帶入隊名。</p></div>`;
}

// ---------------- 資料設定 ----------------
function viewSetup(s) {
  return `<div class="panel"><h2>賽事</h2><div class="row">
      <label>名稱 <input type="text" data-set="title" value="${esc(s.title)}" style="width:120px"></label>
      <label>屆數 <input type="text" data-set="edition" value="${esc(s.edition)}" style="width:120px"></label>
      <label>球桌數 <input type="number" min="2" max="60" data-set="tables" value="${s.tables}" style="width:80px"></label></div></div>
    <div class="panel"><h2>匯入最終籤表</h2>
      <p class="small muted">上傳各項目的最終籤表 Excel（抽籤系統「下載完成籤表」的檔案，或人工調整後的版本）。重新匯入同一項目會保留已登記的成績與桌次，請確認籤表內容未變動。</p>
      <table class="list"><thead><tr><th>項目</th><th>目前資料</th><th></th></tr></thead><tbody>
      ${EVENT_ORDER.map(ev => { const e = D.events.find(x => x.name === ev); return `<tr><td><b>${ev}</b></td><td class="small">${e ? (e.team ? `${e.groups.length} 組，${e.groups.reduce((a, g) => a + g.teams.length, 0)} 隊` : `${e.matches.length + 1} 籤`) + `，共 ${e.matches.length} 場` : '<span class="muted">尚未匯入</span>'}</td>
        <td><label class="btn ghost sm">${icon('upload')}選擇檔案<input type="file" accept=".xlsx" hidden data-imp="${ev}"></label></td></tr>`; }).join('')}</tbody></table></div>
    <div class="panel"><h2>匯入團體賽名單</h2>
      <p class="small muted">上傳報名表單回應（男子組、女子組、社會組各一份），供排點選單使用。僅讀取隊名與隊員姓名，其他欄位不會儲存。</p>
      <div class="row"><label class="btn ghost sm">${icon('upload')}選擇檔案（可多選）<input type="file" accept=".xlsx,.csv" multiple hidden data-roster></label>
      <span class="small muted">${D.events.filter(e => e.team).map(e => { const se = s.events.find(x => x.name === e.name); const n = Object.keys(se.rosters || {}).length; const total = e.groups.reduce((a, g) => a + g.teams.length, 0); return `${e.name} ${n}/${total} 隊`; }).join('　')}</span></div></div>
    <div class="panel"><h2>備份與還原</h2><div class="row">
      <button class="btn ghost" data-backup>${icon('download')}下載備份檔</button>
      <label class="btn ghost">${icon('upload')}還原備份檔<input type="file" accept=".json" hidden data-restore></label>
      <button class="btn ghost" data-demo>載入示範資料</button>
      <button class="btn ghost danger" data-wipe>清除全部資料</button></div>
      <p class="small muted">目前資料儲存於此瀏覽器。建議比賽期間定時下載備份檔。</p></div>`;
}

async function importBracket(ev, file) {
  try {
    const sheets = await readWorkbookValues(await file.arrayBuffer());
    const r = parseFinalBracket(sheets, ev);
    update(s => {
      const old = s.events.find(x => x.name === ev);
      let e;
      if (r.st.kind === 'ko') {
        e = { name: ev, kind: 'ko', sizes: r.st.sections.map(x => x.size), byPos: Object.fromEntries(r.byPos) };
        if (r.matches) e.custom = r.matches;
      } else {
        e = { name: ev, kind: 'rr', groups: r.st.groups.map(g => ({ letter: g.letter, teams: Array.from({ length: g.size }, (_, j) => r.byPos.get(g.startPos + j).name) })),
          rosters: (old && old.rosters) || {}, rank: (old && old.rank) || {}, finalPos: (old && old.finalPos) || {}, roll: (old && old.roll) || {} };
      }
      s.events = s.events.filter(x => x.name !== ev).concat(e);
    });
    toast(`${ev} 已匯入：${r.info}${r.warnings.length ? `；${r.warnings.join('；')}` : ''}`);
  } catch (err) { toast(`${ev} 匯入失敗：${err.message}`); }
}
async function importRosters(files) {
  const found = {};
  for (const f of files) {
    try {
      const rows = await readFormFile(f);
      const { kind, responses } = parseResponses(rows.rows || rows);
      const { events } = buildEntries(kind, responses);
      Object.entries(events).forEach(([ev, list]) => { if (isTeam(ev)) list.forEach(x => { (found[ev] = found[ev] || {})[x.name] = splitNames(x.members || ''); }); });
    } catch (err) { toast(`${f.name} 讀取失敗：${err.message}`); return; }
  }
  const key = t => String(t).replace(/\s+/g, '');
  let hit = 0, total = 0;
  update(s => s.events.forEach(e => {
    if (e.kind !== 'rr' || !found[e.name]) return;
    const src = new Map(Object.entries(found[e.name]).map(([t, v]) => [key(t), v]));
    e.rosters = e.rosters || {};
    e.groups.forEach(g => g.teams.forEach(t => { total++; if (src.has(key(t))) { e.rosters[t] = src.get(key(t)); hit++; } }));
  }));
  toast(`名單已匯入：${hit}/${total} 隊對應成功${hit < total ? '，其餘隊名與籤表不一致，排點時可直接輸入姓名' : ''}`);
}

// ---------------- 事件 ----------------
document.addEventListener('click', async ev => {
  const t = ev.target.closest('button, [data-table]');
  if (!t) { if (ev.target.classList.contains('modal-bg')) { modal = null; drawModal(); } return; }
  const d = t.dataset;
  if (d.tab) { tab = d.tab; render(); }
  else if (d.ev) { curEv = d.ev; render(); }
  else if (d.lineup) openModal('lineup', d.lineup);
  else if (d.score) openModal('score', d.score);
  else if (d.mid && d.table) openModal('score', d.mid);
  else if ('close' in d) { modal = null; drawModal(); }
  else if (d.copy) { try { await navigator.clipboard.writeText(d.copy); toast('已複製廣播稿'); } catch (e) { toast('無法複製，請手動選取'); } }
  else if (d.clearAbsent) updateMatch(d.clearAbsent, r => { delete r.absent; });
  else if (d.luSave) {
    const l = readLineup(d.luSave);
    const w = lineupWarn(l);
    updateMatch(modal.mid, r => { r.lineup = r.lineup || {}; r.lineup[d.luSave] = l; });
    drawModal();
    $(`[data-lu-warn="${d.luSave}"]`).textContent = w;
    toast('排點已儲存');
  } else if (d.luClear) { updateMatch(modal.mid, r => { if (r.lineup) delete r.lineup[d.luClear]; }); drawModal(); }
  else if ('wo' in d) { updateMatch(modal.mid, r => { if (d.wo) r.wo = d.wo; else delete r.wo; }); drawModal(); }
  else if ('confirm' in d) { updateMatch(modal.mid, r => { r.confirmed = true; r.end = Date.now(); r.tables = []; delete r.absent; }); modal = null; drawModal(); toast('成績已確認並鎖定'); }
  else if ('unconfirm' in d) { updateMatch(modal.mid, r => { r.confirmed = false; }); drawModal(); }
  else if ('fillRank' in d) {
    update(s => { const se = s.events.find(x => x.name === curEv); const e = D.events.find(x => x.name === curEv); se.rank = se.rank || {};
      e.groups.forEach(g => { if (g.table.all && !g.table.rows[0].tie && !g.table.rows[1].tie) se.rank[g.letter] = { c: g.table.rows[0].team, r: g.table.rows[1].team }; }); });
    toast('已帶入無同勝場爭議的組別，其餘請以選單指定');
  } else if ('backup' in d) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(getState())], { type: 'application/json' }));
    a.download = `交大盃當日備份_${fmtTime(Date.now()).replace(':', '')}.json`; a.click();
  } else if ('demo' in d) { if (!getState().events.length || t.dataset.sure) { replaceState(demoState()); tab = 'ctrl'; render(); toast('已載入示範資料'); } else { t.dataset.sure = 1; t.textContent = '再按一次以覆蓋現有資料'; } }
  else if ('wipe' in d) { if (t.dataset.sure) { replaceState(emptyState()); render(); } else { t.dataset.sure = 1; t.textContent = '再按一次確定清除'; } }
});

document.addEventListener('change', async ev => {
  const t = ev.target, d = t.dataset;
  if (d.tb) setTables(d.tb, t.value);
  else if (d.slip) { const [mid, k] = [d.slip.slice(0, d.slip.lastIndexOf('|')), d.slip.slice(-1)]; updateMatch(mid, r => { r.slip = r.slip || {}; r.slip[k] = t.checked; }); }
  else if (d.ptable != null) updateMatch(modal.mid, r => { r.pts = r.pts || []; r.pts[d.ptable] = r.pts[d.ptable] || {}; r.pts[d.ptable].table = t.value ? Number(t.value) : null; });
  else if (d.rank) { const [g, k] = d.rank.split('|'); update(s => { const se = s.events.find(x => x.name === curEv); se.rank = se.rank || {}; se.rank[g] = se.rank[g] || {}; se.rank[g][k] = t.value; }); }
  else if (d.roll) update(s => { const se = s.events.find(x => x.name === curEv); se.roll = se.roll || {}; se.roll[d.roll] = t.value; });
  else if (d.fpos) update(s => { const se = s.events.find(x => x.name === curEv); se.finalPos = se.finalPos || {}; se.finalPos[d.fpos] = t.value ? Number(t.value) || '' : ''; });
  else if (d.set) update(s => { s[d.set] = d.set === 'tables' ? Math.max(2, Number(t.value) || 24) : t.value; });
  else if (d.imp) { if (t.files[0]) await importBracket(d.imp, t.files[0]); }
  else if ('roster' in d) { if (t.files.length) await importRosters([...t.files]); }
  else if ('restore' in d) {
    try { const s = JSON.parse(await t.files[0].text()); if (s.v !== 1) throw new Error('格式不符'); replaceState(s); toast('已還原備份'); } catch (e) { toast(`還原失敗：${e.message}`); }
  }
});

// 比分：邊輸入邊存，不重畫輸入框
document.addEventListener('input', ev => {
  const t = ev.target;
  if (!t.dataset.g || !modal) return;
  const [pi, gi, side] = t.dataset.g.split('|');
  const v = t.value.replace(/\D/g, '');
  if (v !== t.value) t.value = v;
  const m = D.byId.get(modal.mid);
  updateMatch(modal.mid, r => {
    let games;
    if (m.team) { r.pts = r.pts || []; r.pts[pi] = r.pts[pi] || {}; games = r.pts[pi].g = r.pts[pi].g || []; }
    else games = r.g = r.g || [];
    games[gi] = games[gi] || ['', ''];
    games[gi][side] = v === '' ? '' : Number(v);
    for (let i = 0; i < games.length; i++) if (!games[i]) games[i] = ['', ''];
  });
});
document.addEventListener('keydown', ev => {
  if (ev.key === 'Escape' && modal) { modal = null; drawModal(); }
  if (ev.key === 'Enter' && ev.target.dataset && ev.target.dataset.tb) ev.target.blur();
});

subscribe((s, local) => {
  const active = document.activeElement;
  const typing = active && active.tagName === 'INPUT' && active.type === 'text' && !active.closest('#modal');
  D = derive(s);
  if (!typing) render();
  if (modal) {
    const inModal = active && active.closest && active.closest('#modal');
    if (local || inModal) refreshScore(); else drawModal();
  }
});
setInterval(() => { const a = document.activeElement; if (!modal && !(a && /INPUT|SELECT/.test(a.tagName))) render(); }, 30000);
render();
