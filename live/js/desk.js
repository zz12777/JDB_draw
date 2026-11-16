// 大會台
import { derive, isTeam, POINTS, callText, recallText, absences, fmtTime, parseTables, sideText, gameInvalid, EVENT_ORDER, EVENT_FULL, emptyState, podium, ANN_ORDER, ANN_NAME, dayLabel } from './model.js';
import { getState, subscribe, update, updateMatch, replaceState, auth, onAuth, LOCAL } from './store.js';
import { esc, $, $$, icon, toast, chip, deskBoard, header, names, shortEv, lineName } from './ui.js';
import { parseTimetable, slotOf } from './timetable.js';
import { demoState } from './demo.js';
import { readWorkbookValues } from '../../js/reader.js';
import { parseFinalBracket } from '../../js/finalparse.js';
import { readRosterDocx } from './roster.js';
import { bracketSvg } from './tree.js';
import { normalizeTeamName, unitFromTeam } from '../../js/schools.js';

let tab = 'ctrl';
let curEv = null;
let modal = null; // { kind: 'score' | 'lineup', mid }
let draft = {}; // 排點視窗內尚未儲存的內容：{ a: [...], b: [...] }，關閉視窗才清掉
let D = null;

const TABS = [['ctrl', '賽程控制'], ['tables', '球桌'], ['draw', '決賽抽籤'], ['refs', '裁判'], ['ann', '成績公告'], ['setup', '資料設定']];
let refTab = 'avail';
let rosterMiss = [], rosterGuess = [];

function render() {
  const s = getState();
  D = derive(s);
  $('#top').innerHTML = header(s, '大會台', [['公開頁', 'index.html'], ['裁判紀錄區', 'ref.html']], { nav: 'desk', account: auth.cloud && auth.user ? `<a href="#" data-signout>登出 ${esc(auth.user)}</a>` : '' });
  if (auth.cloud && !auth.isAdmin) { $('#tabs').innerHTML = ''; $('#main').innerHTML = viewLogin(); return; }
  $('#tabs').innerHTML = TABS.map(([k, t]) => `<button class="${tab === k ? 'on' : ''}" data-tab="${k}">${t}</button>`).join('');
  if (!D.events.length && tab !== 'setup') tab = 'setup';
  if (!curEv || !D.events.some(e => e.name === curEv)) curEv = D.events[0] ? D.events[0].name : null;
  $('#main').innerHTML = tab === 'ctrl' ? viewCtrl(s) : tab === 'tables' ? viewTables(s) : tab === 'draw' ? viewDraw(s) : tab === 'refs' ? viewRefs(s) : tab === 'ann' ? viewAnn(s) : viewSetup(s);
}

function viewLogin() {
  if (!auth.ready) return `<div class="panel"><p class="muted">${auth.error ? esc(auth.error) : '連線中。'}</p></div>`;
  return `<div class="panel" style="max-width:480px;margin:40px auto;text-align:center"><h2>大會台登入</h2>
    ${auth.user ? `<p class="small" style="color:var(--red)">${esc(auth.user)} 沒有大會台權限。</p><button class="btn ghost" data-signout>改用其他帳號</button>` : '<button class="btn" data-signin>以 Google 帳號登入</button>'}
    ${auth.error ? `<p class="small" style="color:var(--red)">${esc(auth.error)}</p>` : ''}</div>`;
}

// ---------------- 賽程控制 ----------------
function viewCtrl(s) {
  const e = D.events.find(x => x.name === curEv);
  const all = [...D.byId.values()];
  const readyN = ev => ev.matches.filter(m => m.status === 'ready').length;
  const absent = all.filter(m => m.status === 'playing').flatMap(m => absences(m).map(ab => ({ m, ab })));
  const reported = all.filter(m => m.status === 'reported');
  const ready = all.filter(m => m.status === 'ready').sort((x, y) => EVENT_ORDER.indexOf(x.ev) - EVENT_ORDER.indexOf(y.ev) || stageOrder(x) - stageOrder(y) || x.num - y.num);
  const calls = (s.calls || []).slice(-4).reverse();
  return `<div class="desk"><div>
    <div class="panel">
      <div class="row"><div class="pills">${D.events.map(x => `<button class="${x.name === curEv ? 'on' : ''}" data-ev="${x.name}">${x.name}</button>`).join('')}</div></div>
      <div class="legend">
        <span><span class="dot on"></span>前一輪已完賽</span>
        ${e.team ? `<span><input type="checkbox" checked disabled>已發點單</span><span>${icon('list')}已收點單</span>` : ''}
        
      </div>
      <div class="rounds">${e.rounds.map(r => `<div class="round"><h3><span>${esc(r.label)}${roundTime(s, r)}</span><span class="muted small">${r.matches.filter(m => m.status === 'done').length}/${r.matches.length}</span></h3>
        ${r.matches.map(card).join('')}</div>`).join('')}</div>
    </div></div>
    <div class="side">
      ${absent.length ? `<div class="panel"><h2>未到回報</h2>${absent.map(({ m, ab }) => {
        const tb = ab.table || m.tables.join('、');
        return `<div class="alertbox"><div class="small ameta">第 ${tb} 桌　${fmtTime(ab.ts)} 回報　裁判 ${esc(ab.by || '')}</div>
          <div>${esc(recallText(m, ab))}</div>
          <div class="row" style="margin-top:4px">${ab.called ? `<span class="small" style="color:var(--green)">${fmtTime(ab.called)} 已廣播</span>` : ''}<span class="spacer"></span>
            <button class="btn ghost sm" data-called="${esc(m.id)}|${ab.key}">${icon('speaker')}${ab.called ? '再次廣播' : '已廣播'}</button>
            <button class="btn ghost sm" data-clear-absent="${esc(m.id)}|${ab.key}">${icon('check')}已到場</button></div></div>`;
      }).join('')}</div>` : ''}
      <div class="panel"><h2>廣播稿</h2>${calls.length ? calls.map((c, i) => `<div class="call ${i ? 'old' : ''}"><div class="tm">${fmtTime(c.ts)}</div>${esc(c.text)}</div>`).join('') : '<p class="small muted">輸入桌次後，廣播稿會顯示在這裡。</p>'}</div>
      <div class="panel"><h2>待確認成績（${reported.length}）</h2>${reported.length ? reported.map(m => `<div class="row small" style="margin-bottom:4px"><b>${esc(shortEv(m))}</b><span>${names(m)}　${m.score[0]}:${m.score[1]}</span><span class="spacer"></span><button class="btn sm" data-score="${esc(m.id)}">核對</button></div>`).join('') : '<p class="small muted">目前沒有待確認的成績。</p>'}</div>
    </div></div>`;
}
function viewTables(s) {
  const alerts = new Set();
  D.byId.forEach(m => { if (m.status === 'playing') absences(m).forEach(ab => String(ab.table || m.tables.join(',')).split(/[^0-9]+/).filter(Boolean).forEach(t => alerts.add(Number(t)))); });
  return `<div class="panel"><div class="legend" style="margin-top:0"><span><span class="lg busy"></span>進行中</span><span><span class="lg rep"></span>已打完，待大會確認</span><span><span class="lg alert"></span>有未到回報</span><span><span class="lg"></span>空桌</span></div>${deskBoard(s, D, { alerts })}</div>`;
}
/** 這一輪在時間表上的時段 */
function roundTime(s, r) {
  const sl = r.matches.map(m => slotOf(s.sched, m)).filter(Boolean);
  if (!sl.length) return '';
  const a = sl.reduce((x, y) => (`${y.d}${y.s}` < `${x.d}${x.s}` ? y : x)), b = sl.reduce((x, y) => (`${y.d}${y.e}` > `${x.d}${x.e}` ? y : x));
  return ` <span class="rt">${esc(dayLabel(getState(), a.d, a.day))} ${a.s}-${b.e}</span>`;
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
    <div class="hd"><span class="no">${esc(m.no)}</span>${m.group ? `<span class="muted">${m.group} 組</span>` : ''}${chip(m)}<span class="spacer"></span>
      ${m.rec.start ? `<span class="muted">${fmtTime(m.rec.start)} 開賽</span>` : planned(m)}</div>
    ${sideRow('a', m.A)}${sideRow('b', m.B)}
    <div class="ft">桌次 <input class="tb" type="text" inputmode="numeric" value="${m.tables.join('、')}" data-tb="${esc(m.id)}" ${locked || !m.known ? 'disabled' : ''} placeholder="${m.team ? '可填多桌' : ''}">
      <span class="spacer"></span>
      ${m.team ? `<button class="btn ghost sm" data-lineup="${esc(m.id)}" ${m.known ? '' : 'disabled'}>${icon('list')}排點</button>` : ''}
      <button class="btn ghost sm" data-score="${esc(m.id)}" ${m.known ? '' : 'disabled'}>${icon(locked ? 'lock' : 'score')}成績</button></div>
  </div>`;
}

function planned(m) {
  const x = slotOf(getState().sched, m);
  return x ? `<span class="muted">表定 ${x.s}</span>` : '';
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
    const l = draft[k] || (m.rec.lineup && m.rec.lineup[k]) || [];
    const inp = (i, j, v) => (roster.length
      ? `<select data-lu="${k}|${i}|${j}" style="width:${j == null ? 100 : 48}%"><option value=""></option>${roster.map(n => `<option ${n === v ? 'selected' : ''}>${esc(n)}</option>`).join('')}${v && !roster.includes(v) ? `<option selected>${esc(v)}</option>` : ''}<option value="__other">其他（手動輸入）</option></select>`
      : `<input type="text" data-lu="${k}|${i}|${j}" value="${esc(v || '')}" style="width:${j == null ? 100 : 48}%">`);
    return `<div style="flex:1;min-width:260px"><h3>${esc(S.name)} ${m.lineupOk[k] ? '<span class="chip playing">已收點單</span>' : '<span class="chip">尚未輸入</span>'}</h3>
      ${POINTS.map((p, i) => `<div class="row" style="margin-bottom:6px;flex-wrap:nowrap"><span class="nowrap small muted" style="width:76px">第${'一二三四五'[i]}點 ${p.dbl ? '雙' : '單'}</span>
        <span style="flex:1;display:flex;gap:4px">${p.dbl ? inp(i, 0, (l[i] || [])[0]) + inp(i, 1, (l[i] || [])[1]) : inp(i, null, l[i])}</span></div>`).join('')}
      <div class="small" data-lu-warn="${k}" style="color:var(--red);min-height:20px"></div>
      <div class="row"><button class="btn sm" data-lu-save="${k}">${icon('check')}儲存排點</button><button class="btn ghost sm" data-lu-clear="${k}">清除</button>
        ${roster.length ? '' : '<span class="small muted">尚未匯入此隊名單，請直接輸入姓名</span>'}</div></div>`;
  };
  return `<div class="modal"><div class="row"><h2>${EVENT_FULL[m.ev]} ${esc(m.no)}　排點</h2><span class="spacer"></span><button class="btn ghost sm" data-close aria-label="關閉" title="關閉">${icon('close')}</button></div>
    <div class="row" style="align-items:flex-start;gap:24px">${col('a', m.A)}${col('b', m.B)}</div></div>`;
}
const val = el => (el.value === '__other' ? '' : el.value.trim());
function readLineup(k) {
  return POINTS.map((p, i) => p.dbl
    ? [0, 1].map(j => val($(`[data-lu="${k}|${i}|${j}"]`)))
    : val($(`[data-lu="${k}|${i}|null"]`)));
}
/** 標出重複的選手（紅底）並顯示提示 */
function markLineup(k) {
  const els = $$(`[data-lu^="${k}|"]`);
  const vals = els.map(el => (el.value === '__other' ? '' : el.value.trim()));
  els.forEach((el, i) => el.classList.toggle('bad', !!vals[i] && vals.filter(v => v === vals[i]).length > 1));
  const warn = $(`[data-lu-warn="${k}"]`);
  if (warn) warn.textContent = lineupWarn(readLineup(k));
}
function lineupWarn(l) {
  const flat = l.flat().filter(Boolean);
  const dup = flat.filter((n, i) => flat.indexOf(n) !== i);
  const out = [];
  if (dup.length) out.push(`${[...new Set(dup)].join('、')} 重複排點`);
  return out.join('；');
}

// ---------------- 成績 ----------------
function scoreModal(m) {
  const locked = m.status === 'done';
  const dis = locked ? 'disabled' : '';
  const lu = m.rec.lineup || {};
  const gin = (pi, gi, side, v) => `<input class="g" type="text" inputmode="numeric" maxlength="2" data-g="${pi}|${gi}|${side}" value="${v ?? ''}" ${dis}>`;
  const block = (pi, games, title, an, bn, meta, solo) => `<div class="pt ${solo ? 'solo' : ''}"><h4>${title}</h4>
    <div class="pn"><span>${String(an || '').split(/[\/／]/).map(esc).join('<br>')}</span><span>${String(bn || '').split(/[\/／]/).map(esc).join('<br>')}</span></div>
    ${[0, 1, 2, 3, 4].map(gi => `<div class="gr">${gin(pi, gi, 0, (games[gi] || [])[0])}<span class="vs">:</span>${gin(pi, gi, 1, (games[gi] || [])[1])}</div>`).join('')}
    <div class="res" data-res="${pi}"></div><div class="meta">${meta}</div></div>`;
  let body;
  if (m.team) {
    const pts = m.rec.pts || [];
    body = POINTS.map((p, i) => {
      const x = pts[i] || {};
      const meta = `桌次 <select data-ptable="${i}" ${dis}><option value=""></option>${m.tables.map(t => `<option ${Number(x.table) === t ? 'selected' : ''}>${t}</option>`).join('')}</select>${x.ref ? `<span>裁判 ${esc(x.ref)}</span>` : ''}`;
      return block(i, x.g || [], `第${'一二三四五'[i]}點 ${p.dbl ? '雙打' : '單打'}`, lineName(lu.a, i), lineName(lu.b, i), meta);
    }).join('');
  } else {
    body = block('x', m.rec.g || [], '各局比分', sideText(m.A), sideText(m.B), m.rec.ref ? `裁判 ${esc(m.rec.ref)}` : '', true);
  }
  return `<div class="modal"><div class="row"><h2>${EVENT_FULL[m.ev]} ${esc(m.no)}　成績</h2>${chip(m)}<span class="spacer"></span><button class="btn ghost sm" data-close aria-label="關閉" title="關閉">${icon('close')}</button></div>
    <div class="duel"><div class="n r">${esc(sideText(m.A, m.team))}</div><div class="total" id="sc-total"></div><div class="n">${esc(sideText(m.B, m.team))}</div></div>
    <div class="pts">${body}</div>
    <p class="small" id="sc-note" style="color:var(--red);min-height:18px"></p>
    <div class="row">
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
  if (note) note.textContent = m.rec.wo ? '已登記棄權。' : m.result.needFirst3 ? '預賽須打完前三點，目前前三點尚未全部完成。' : '';
  const btn = $('#sc-confirm');
  if (btn) btn.disabled = !m.winner;
}

function openModal(kind, mid) { modal = { kind, mid }; draft = {}; drawModal(); }
function drawModal() {
  const host = $('#modal');
  if (!modal) { host.innerHTML = ''; host.hidden = true; return; }
  host.hidden = false;
  if (modal.kind === 'wipe') {
    host.innerHTML = `<div class="modal-bg"><div class="modal" style="width:min(420px,100%)"><h2>清除全部資料</h2>
      <p>籤表、名單、排點、成績與裁判紀錄都會刪除，且無法復原。建議先下載備份檔。</p>
      <div class="row" style="justify-content:flex-end;margin-top:14px"><button class="btn ghost" data-close>取消</button><button class="btn danger-solid" data-wipe-ok>確認清除</button></div></div></div>`;
    return;
  }
  const m = D.byId.get(modal.mid);
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
    const cls = k === '冠' ? 'gc' : 'gr';
    return `<td class="${cls} first"><select data-rank="${g.letter}|${rk}"><option value=""></option>${g.teams.map(t => `<option ${cur === t ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>
        ${!cur && sug ? `<div class="small muted">名次試算：${esc(sug.team)}${sug.tie ? '（同勝場，請確認）' : ''}</div>` : ''}</td>
      <td class="${cls}"><select data-roll="${g.letter + k}"><option value=""></option>${['到', '代抽', '未到'].map(x => `<option ${roll === x ? 'selected' : ''}>${x}</option>`).join('')}</select></td>
      <td class="${cls}"><input type="text" inputmode="numeric" style="width:56px" data-fpos="${g.letter + k}" value="${(se.finalPos || {})[g.letter + k] || ''}">
        ${err ? `<div class="small" style="color:var(--red)">${err}</div>` : k === '亞' && hint(g) && !(se.finalPos || {})[g.letter + k] ? `<div class="small muted">應抽${hint(g)}</div>` : ''}</td>`;
  };
  const allDone = e.groups.every(g => g.table.all);
  const finals = e.matches.filter(m => m.stage === 'F' && m.roundIdx === 0);
  return `<div class="panel"><div class="row"><div class="pills">${teams.map(x => `<button class="${x.name === curEv ? 'on' : ''}" data-ev="${x.name}">${x.name}</button>`).join('')}</div>
      <span class="spacer"></span><button class="btn ghost sm" data-fill-rank ${allDone ? '' : ''}>${icon('check')}帶入名次試算</button></div>
    <p class="small muted">名次試算僅比勝場，同勝場請以選單指定。</p>
    <ul class="small" style="margin:6px 0 10px;padding-left:20px"><li>冠軍籤位：${marks.filter(x => x[1] === '冠').map(x => x[0]).join('、')}</li><li>亞軍籤位：${marks.filter(x => x[1] === '亞').map(x => x[0]).join('、')}</li><li>上半區：1 - ${half}、下半區：${half + 1} - ${e.final.size}</li></ul>
    <div style="overflow-x:auto"><table class="list drawt"><thead><tr><th rowspan="2">組別</th><th rowspan="2">預賽戰績</th><th colspan="3" class="gc first gtop">冠軍</th><th colspan="3" class="gr first gtop">亞軍</th></tr>
      <tr><th class="gc first">隊伍</th><th class="gc">點名</th><th class="gc">籤號</th><th class="gr first">隊伍</th><th class="gr">點名</th><th class="gr">籤號</th></tr></thead><tbody>
    ${e.groups.map(g => `<tr><td><b>${g.letter}</b></td><td class="small">${g.table.rows.map(r => `${esc(r.team)} ${r.w} 勝 ${r.l} 敗`).join('<br>')}${g.table.all ? '' : '<div class="muted">預賽尚未全部確認</div>'}</td>${cell(g, '冠')}${cell(g, '亞')}</tr>`).join('')}
    </tbody></table></div></div>
    <div class="panel"><h2>決賽籤表</h2><div class="treebox">${bracketSvg(e.matches.filter(m => m.stage === 'F'), true, { pos: true }).svg}</div></div>
    <div class="panel"><h2>決賽第一輪賽程</h2><table class="list frt"><thead><tr><th>場次</th><th colspan="3">賽程</th></tr></thead><tbody>
      ${e.matches.filter(m => m.stage === 'F').filter(m => m.src.some(x => x.pos != null)).map(m => {
        const side = x => {
          if (!x || x.pos == null) return `<span class="muted">${esc(x && x.pending ? x.pending : '')}</span>`;
          const seed = x.seed || e.final.mark.get(x.pos) || '';
          return `<span class="ftag">${x.pos}</span><span class="ftag soft">${esc(seed)}</span>${x.name ? `<b>${esc(x.name)}</b>` : '<span class="muted">待抽籤</span>'}`;
        };
        return `<tr><td class="nowrap">${esc(m.no)}</td><td class="fs">${side(m.A)}</td><td class="fvs">vs</td><td class="fs">${side(m.B)}</td></tr>`;
      }).join('')}</tbody></table>
</div>`;
}

// ---------------- 裁判 ----------------
/** 每位裁判擔任次數：個人賽一場算一次，團體賽一點算一次 */
function refCounts() {
  const cnt = new Map();
  const add = (n, k) => { if (!n) return; if (!cnt.has(n)) cnt.set(n, new Set()); cnt.get(n).add(k); };
  D.byId.forEach(m => {
    const r = m.rec;
    const per = new Map(); // 姓名 -> 這一場記了幾個單位
    const bump = (n, k) => { if (!n) return; per.set(n, (per.get(n) || new Set()).add(k)); };
    if (m.team) (r.pts || []).forEach((p, i) => { if (p && p.ref) bump(p.ref, 'p' + i); });
    else if (r.ref) bump(r.ref, 'x');
    Object.entries(r.refs || {}).forEach(([t, n]) => { if (!per.has(n)) bump(n, 't' + t); });
    per.forEach((set, n) => set.forEach(k => add(n, m.id + k)));
  });
  return new Map([...cnt.entries()].map(([n, set]) => [n, set.size]));
}
/** 正在比賽與即將出賽的人 */
function busyPeople(s) {
  const now = new Set(), soon = new Set();
  const people = m => {
    if (!m.team) return [m.A, m.B].flatMap(x => String((x && x.name) || '').split(/[\/／]/)).map(x => x.trim()).filter(Boolean);
    const e = s.events.find(x => x.name === m.ev);
    return [m.A, m.B].flatMap(x => (e.rosters && e.rosters[x && x.name]) || []);
  };
  D.byId.forEach(m => {
    if (m.status === 'playing') people(m).forEach(n => now.add(n));
    else if (m.status === 'ready' || (m.status === 'wait' && m.known)) people(m).forEach(n => soon.add(n));
  });
  const onDuty = new Set();
  D.tables.forEach((x, t) => { if (x.m.status === 'playing') { const n = (x.m.rec.refs || {})[t]; if (n) onDuty.add(n); } });
  return { now, soon, onDuty };
}
function viewRefs(s) {
  const cnt = refCounts();
  const staff = s.staff || [];
  const { now, soon, onDuty } = busyPeople(s);
  const sub = `<div class="pills" style="margin-bottom:12px">${[['avail', '可擔任裁判'], ['count', '擔任次數']].map(([k, t]) => `<button class="${refTab === k ? 'on' : ''}" data-reftab="${k}">${t}</button>`).join('')}</div>`;
  if (refTab === 'count') {
    const names = [...new Set([...staff, ...cnt.keys()])].sort((a, b) => (cnt.get(b) || 0) - (cnt.get(a) || 0) || a.localeCompare(b, 'zh-Hant'));
    return `${sub}<div class="panel"><h2>擔任次數</h2><p class="small muted">個人賽一場計一次，團體賽一點計一次。</p>
      ${names.length ? `<table class="list" style="max-width:420px"><thead><tr><th>姓名</th><th>次數</th></tr></thead><tbody>${names.map(n => `<tr><td>${esc(n)}</td><td>${cnt.get(n) || 0}</td></tr>`).join('')}</tbody></table>` : '<p class="muted small">尚無紀錄。</p>'}</div>`;
  }
  const state = n => (onDuty.has(n) ? '執裁中' : now.has(n) ? '比賽中' : soon.has(n) ? '即將出賽' : '');
  const free = staff.filter(n => !state(n)).sort((a, b) => (cnt.get(a) || 0) - (cnt.get(b) || 0));
  const rest = staff.filter(n => state(n));
  return `${sub}<div class="desk"><div class="panel"><h2>可擔任裁判（${free.length}）</h2>
      ${staff.length ? `<table class="list"><thead><tr><th>姓名</th><th>已擔任次數</th></tr></thead><tbody>${free.map(n => `<tr><td>${esc(n)}</td><td>${cnt.get(n) || 0}</td></tr>`).join('')}</tbody></table>
        ${rest.length ? `<h3>暫不可擔任（${rest.length}）</h3><table class="list"><tbody>${rest.map(n => `<tr><td>${esc(n)}</td><td class="muted">${state(n)}</td><td>${cnt.get(n) || 0}</td></tr>`).join('')}</tbody></table>` : ''}` : '<p class="muted small">請先於右側輸入自己人裁判名單。</p>'}</div>
    <div class="panel"><h2>自己人裁判名單</h2><p class="small muted">一行一位。</p>
      <textarea data-staff rows="16" style="width:100%">${esc(staff.join('\n'))}</textarea></div></div>`;
}

// ---------------- 成績公告 ----------------
const ANN_KEYS = [['c', '冠軍'], ['r', '亞軍'], ['s1', '季軍'], ['s2', '季軍']];
function podiumText(e) {
  const p = e && podium(e);
  if (!p) return null;
  const t = x => (x && x.name ? sideText(x, e.team) : '');
  return { c: t(p.c), r: t(p.r), s1: t(p.s[0]), s2: t(p.s[1]) };
}
/**
 * 已公布項目轉成猛將資料庫試算表的列（Tab 分隔，可直接貼上）。
 * 欄位：賽事、年份、組別、項目、名次、學校、隊名、姓名
 */
function strongRows(s) {
  const year = (() => { const d = new Date(`${(s.dates || [])[0] || ''}T00:00:00`); return Number.isNaN(d.getTime()) ? new Date().getFullYear() - 1911 : d.getFullYear() - 1911 - (d.getMonth() < 6 ? 1 : 0); })();
  const name = `交大盃${s.edition || ''}`;
  const rows = [];
  ANN_ORDER.forEach(ev => {
    if (!(s.podium || {})[ev]) return;
    const e = D.events.find(x => x.name === ev), p = e && podium(e);
    if (!p) return;
    const se = s.events.find(x => x.name === ev) || {};
    [[1, p.c], [2, p.r], [3, p.s[0]], [3, p.s[1]]].forEach(([r, x]) => {
      if (!x || !x.name) return;
      if (e.team) rows.push([name, year, ev === '社團' ? '社會' : '大專', ev, r, ev === '社團' ? '' : unitFromTeam(x.name), x.name, ((se.rosters || {})[x.name] || []).join('、')]);
      else rows.push([name, year, '大專', ev, r, x.school || '', '', String(x.name).split(/[\/／]/).join('、')]);
    });
  });
  return rows;
}
function viewAnn(s) {
  const pub = s.podium || {};
  return `<div class="panel"><div class="row"><h2 style="margin:0">成績公告</h2><span class="spacer"></span>
      <label class="small">標題 <input type="text" data-ann-title value="${esc(s.annTitle || '')}" style="width:300px"></label>
      <button class="btn ghost sm" data-strong ${Object.keys(pub).length ? '' : 'disabled'}>${icon('copy')}複製猛將資料庫格式</button></div>
    <table class="list"><thead><tr><th>項目</th>${ANN_KEYS.map(k => `<th>${k[1]}</th>`).join('')}<th></th></tr></thead><tbody>
    ${ANN_ORDER.map(ev => {
      const e = D.events.find(x => x.name === ev);
      const auto = podiumText(e);
      const p = pub[ev];
      const ready = auto && auto.c && auto.r;
      return `<tr><td class="nowrap"><b>${ANN_NAME[ev]}</b></td>${ANN_KEYS.map(([k]) => `<td>${p
        ? `<input type="text" data-ann="${ev}|${k}" value="${esc(p[k] || '')}" style="width:100%;min-width:120px">`
        : `<span class="${auto && auto[k] ? '' : 'muted'}">${esc((auto && auto[k]) || '未產生')}</span>`}</td>`).join('')}
        <td class="nowrap">${p ? `<span class="chip playing">已公布</span> <button class="btn ghost sm" data-unpub="${ev}">取消公布</button>`
          : `<button class="btn sm" data-pub="${ev}" ${ready ? '' : 'disabled'}>公布</button>`}</td></tr>`;
    }).join('')}</tbody></table></div>`;
}

// ---------------- 資料設定 ----------------
function viewSetup(s) {
  const fileOf = ev => (s.events.find(x => x.name === ev) || {}).file || '';
  return `<div class="panel"><h2>賽事</h2><div class="row">
      <label>名稱 <input type="text" data-set="title" value="${esc(s.title)}" style="width:120px"></label>
      <label>屆數 <input type="text" data-set="edition" value="${esc(s.edition)}" style="width:120px"></label>
      <label>球桌數 <input type="number" min="2" max="60" data-set="tables" value="${s.tables}" style="width:80px"></label>
      <label>第一天 <input type="date" data-date="0" value="${esc((s.dates || [])[0] || '')}"></label>
      <label>第二天 <input type="date" data-date="1" value="${esc((s.dates || [])[1] || '')}"></label></div></div>
    <div class="panel"><div class="row"><h2 style="margin:0">匯入最終籤表（Excel 檔）</h2><span class="spacer"></span><label class="btn sm">${icon('upload')}一次選擇多個檔案<input type="file" accept=".xlsx" multiple hidden data-impall></label></div>
      <table class="list"><thead><tr><th>項目</th><th>目前資料</th><th></th></tr></thead><tbody>
      ${EVENT_ORDER.map(ev => { const e = D.events.find(x => x.name === ev); return `<tr><td><b>${ev}</b></td><td class="small">${e ? (e.team ? `${e.groups.length} 組，${e.groups.reduce((a, g) => a + g.teams.length, 0)} 隊` : `${e.matches.length + 1} 籤`) + `，共 ${e.matches.length} 場` + (fileOf(ev) ? `<div class="muted">${esc(fileOf(ev))}</div>` : '') : '<span class="muted">尚未匯入</span>'}</td>
        <td><label class="btn ghost sm">${icon('upload')}選擇檔案<input type="file" accept=".xlsx" hidden data-imp="${ev}"></label></td></tr>`; }).join('')}</tbody></table></div>
    <div class="panel"><h2>匯入參賽名單（Word 檔）</h2>
      <div class="row"><label class="btn ghost sm">${icon('upload')}選擇參賽名單<input type="file" accept=".docx" hidden data-roster></label>
      <span class="small muted">${esc(s.rosterFile || '')}</span></div>
      ${rosterGuess.length ? `<p class="small">籤表隊名與名單寫法不同，已依校名對應，請確認：${esc(rosterGuess.join('、'))}</p>` : ''}
      ${rosterMiss.length ? `<p class="small" style="color:var(--red)">名單中找不到以下隊伍，排點時請直接輸入姓名：${esc(rosterMiss.join('、'))}</p>` : ''}</div>
    <div class="panel"><h2>匯入賽程時間表（Excel 檔）</h2>
      <div class="row"><label class="btn ghost sm">${icon('upload')}選擇賽程時間表<input type="file" accept=".xlsx" hidden data-sched></label>
      <span class="small muted">${s.sched ? esc(s.sched.file || '') : ''}</span></div></div>
    <div class="panel"><h2>備份與還原</h2><div class="row">
      <button class="btn ghost" data-backup>${icon('download')}下載備份檔</button>
      <label class="btn ghost">${icon('upload')}還原備份檔<input type="file" accept=".json" hidden data-restore></label>
      ${LOCAL || !s.events.length ? '<button class="btn ghost" data-demo>載入示範資料</button>' : ''}
      <button class="btn ghost danger" data-wipe>清除全部資料</button></div></div>`;
}

/** 由檔名或工作表名稱判斷項目 */
function detectEvent(text) {
  const t = String(text).replace(/\s+/g, '');
  const rules = [['男團', /男子?團|大專男團/], ['女團', /女子?團|大專女團/], ['社團', /社會?組?團|社會組/],
    ['男單', /男子?單/], ['女單', /女子?單/], ['男雙', /男子?雙/], ['女雙', /女子?雙/]];
  const hit = rules.filter(([, re]) => re.test(t)).map(x => x[0]);
  return hit.length === 1 ? hit[0] : null;
}
function applyBracket(ev, sheets, fileName) {
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
    e.file = fileName || '';
    s.events = s.events.filter(x => x.name !== ev).concat(e);
  });
  return r;
}
async function importBracket(ev, file) {
  try {
    const r = applyBracket(ev, await readWorkbookValues(await file.arrayBuffer()), file.name);
    toast(`${ev} 已匯入：${r.info}${r.warnings.length ? `；${r.warnings.join('；')}` : ''}`);
  } catch (err) { toast(`${ev} 匯入失敗：${err.message}`); }
}
/** 一次匯入多個檔案：先看檔名，看不出來再依工作表名稱分項目 */
async function importAll(files) {
  const ok = [], fail = [];
  for (const f of files) {
    try {
      const sheets = await readWorkbookValues(await f.arrayBuffer());
      const byEv = new Map();
      const whole = detectEvent(f.name);
      if (whole) byEv.set(whole, sheets);
      else sheets.forEach(sh => { const ev = detectEvent(sh.name); if (ev) byEv.set(ev, (byEv.get(ev) || []).concat(sh)); });
      if (!byEv.size) { fail.push(`${f.name}（無法辨識項目）`); continue; }
      for (const [ev, list] of byEv) {
        try { applyBracket(ev, list, f.name); ok.push(ev); } catch (err) { fail.push(`${ev}（${err.message}）`); }
      }
    } catch (err) { fail.push(`${f.name}（${err.message}）`); }
  }
  toast(`${ok.length ? `已匯入：${ok.join('、')}` : ''}${ok.length && fail.length ? '；' : ''}${fail.length ? `未匯入：${fail.join('、')}` : ''}`);
}
async function importRoster(file) {
  let found;
  try { found = await readRosterDocx(file); } catch (err) { toast(`讀取失敗：${err.message}`); return; }
  // 比對時統一校名寫法（國立虎尾科技大學 → 虎尾科大），並忽略空格與括號
  const key = t => normalizeTeamName(String(t)).replace(/[\s()（）]/g, '');
  let hit = 0, total = 0;
  const miss = [], guess = [];
  update(s => s.events.forEach(e => {
    if (e.kind !== 'rr') return;
    const src = new Map(Object.entries(found[e.name] || {}).map(([t, v]) => [key(t), { t, v }]));
    const used = new Set();
    e.rosters = {};
    const left = [];
    e.groups.forEach(g => g.teams.forEach(t => { total++; const x = src.get(key(t)); if (x) { e.rosters[t] = x.v; used.add(key(t)); hit++; } else left.push(t); }));
    // 同一所學校在籤表與名單各只剩一隊對不上時，視為同一隊（例：籤表「中興大學」、名單「中興大學 藍」）
    const rest = [...src.entries()].filter(([k]) => !used.has(k)).map(([, x]) => x);
    left.forEach(t => {
      const u = unitFromTeam(t);
      const same = rest.filter(x => unitFromTeam(x.t) === u), mine = left.filter(o => unitFromTeam(o) === u);
      const g = e.groups.find(x => x.teams.includes(t));
      if (u && same.length === 1 && mine.length === 1) { e.rosters[t] = same[0].v; hit++; guess.push(`${e.name} ${g.letter} 組「${t}」對應名單「${same[0].t}」`); } else miss.push(`${e.name} ${g.letter} 組「${t}」`);
    });
  }));
  update(s => { s.rosterFile = file.name; });
  rosterGuess = guess;
  rosterMiss = miss;
  const n = Object.values(found).reduce((a, x) => a + Object.keys(x).length, 0);
  toast(n ? `名單已匯入：檔案內 ${n} 隊，籤表 ${total} 隊中 ${hit} 隊對應成功` : '檔案內找不到團體賽名單');
  render();
}

// ---------------- 事件 ----------------
document.addEventListener('click', async ev => {
  const t = ev.target.closest('button, [data-table], [data-signout]');
  if (t && 'signout' in t.dataset) ev.preventDefault();
  if (!t) { if (ev.target.classList.contains('modal-bg')) { modal = null; draft = {}; drawModal(); } return; }
  const d = t.dataset;
  if ('signin' in d) { auth.signIn(); return; }
  if ('signout' in d) { auth.signOut(); return; }
  if ('strong' in d) {
    const rows = strongRows(getState());
    try { await navigator.clipboard.writeText(rows.map(r => r.join('\t')).join('\n')); toast(`已複製 ${rows.length} 列，請貼到猛將資料庫試算表最下方`); } catch (e) { toast('無法複製'); }
    return;
  }
  if (d.pub) { const e = D.events.find(x => x.name === d.pub); const v = podiumText(e); update(s => { s.podium = { ...(s.podium || {}), [d.pub]: v }; }); toast(`${ANN_NAME[d.pub]} 已公布`); return; }
  if (d.unpub) { update(s => { const p = { ...(s.podium || {}) }; delete p[d.unpub]; s.podium = p; }); return; }
  if (d.tab) { tab = d.tab; render(); }
  else if (d.reftab) { refTab = d.reftab; render(); }
  else if (d.ev) { curEv = d.ev; render(); }
  else if (d.lineup) openModal('lineup', d.lineup);
  else if (d.score) openModal('score', d.score);
  else if (d.mid && d.table) openModal('score', d.mid);
  else if ('close' in d) { modal = null; draft = {}; drawModal(); }
  else if (d.clearAbsent || d.called) {
    const v = d.clearAbsent || d.called, i = v.lastIndexOf('|'), mid = v.slice(0, i), key = v.slice(i + 1);
    updateMatch(mid, r => {
      const hold = key === 'm' ? r : ((r.pts || [])[Number(key.slice(1))] || {});
      if (!hold.absent) return;
      if (d.called) hold.absent = { ...hold.absent, called: Date.now() }; else delete hold.absent;
    });
  }
  else if ('luBack' in d) {
    const w = t.closest('.lu-free'), sel = w.previousElementSibling, k = sel.dataset.luOff[0];
    sel.dataset.lu = sel.dataset.luOff; delete sel.dataset.luOff; sel.hidden = false; w.remove(); markLineup(k);
  }
  else if (d.luSave) {
    const l = readLineup(d.luSave);
    const w = lineupWarn(l);
    if (w) { markLineup(d.luSave); toast('有選手重複排點，無法儲存'); return; }
    updateMatch(modal.mid, r => { r.lineup = r.lineup || {}; r.lineup[d.luSave] = l; });
    drawModal();
    $(`[data-lu-warn="${d.luSave}"]`).textContent = w;
    toast('排點已儲存');
  } else if (d.luClear) { delete draft[d.luClear]; updateMatch(modal.mid, r => { if (r.lineup) delete r.lineup[d.luClear]; }); drawModal(); }
  else if ('wo' in d) { updateMatch(modal.mid, r => { if (d.wo) r.wo = d.wo; else delete r.wo; }); drawModal(); }
  else if ('confirm' in d) { updateMatch(modal.mid, r => { r.confirmed = true; r.end = Date.now(); r.tables = []; delete r.absent; (r.pts || []).forEach(p => { if (p) delete p.absent; }); }); modal = null; drawModal(); toast('成績已確認並鎖定'); }
  else if ('unconfirm' in d) { updateMatch(modal.mid, r => { r.confirmed = false; }); drawModal(); }
  else if ('fillRank' in d) {
    update(s => { const se = s.events.find(x => x.name === curEv); const e = D.events.find(x => x.name === curEv); se.rank = se.rank || {};
      e.groups.forEach(g => { if (g.table.all && !g.table.rows[0].tie && !g.table.rows[1].tie) se.rank[g.letter] = { c: g.table.rows[0].team, r: g.table.rows[1].team }; }); });
    toast('已帶入無同勝場爭議的組別，其餘請以選單指定');
  } else if ('schedClear' in d) update(s => { delete s.sched; });
  else if ('backup' in d) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(getState())], { type: 'application/json' }));
    a.download = `交大盃當日備份_${fmtTime(Date.now()).replace(':', '')}.json`; a.click();
  } else if ('demo' in d) { if (!getState().events.length || t.dataset.sure) { replaceState(demoState()); tab = 'ctrl'; render(); toast('已載入示範資料'); } else { t.dataset.sure = 1; t.textContent = '再按一次以覆蓋現有資料'; } }
  else if ('wipe' in d) { modal = { kind: 'wipe' }; drawModal(); }
  else if ('wipeOk' in d) { modal = null; drawModal(); replaceState(emptyState()); render(); toast('已清除全部資料'); }
});

document.addEventListener('change', async ev => {
  const t = ev.target, d = t.dataset;
  if (d.lu) {
    const side = d.lu[0];
    if (t.value === '__other') {
      const key = d.lu, w = document.createElement('span');
      w.className = 'lu-free'; w.style.width = t.style.width;
      w.innerHTML = `<input type="text" data-lu="${key}"><button class="btn ghost sm" data-lu-back title="返回選單">選單</button>`;
      delete t.dataset.lu; t.dataset.luOff = key; t.value = ''; t.hidden = true; t.after(w); w.firstChild.focus();
    }
    draft[side] = readLineup(side);
    markLineup(side);
  }
  else if (d.tb) setTables(d.tb, t.value);
  else if (d.slip) { const [mid, k] = [d.slip.slice(0, d.slip.lastIndexOf('|')), d.slip.slice(-1)]; updateMatch(mid, r => { r.slip = r.slip || {}; r.slip[k] = t.checked; }); }
  else if (d.ptable != null) updateMatch(modal.mid, r => { r.pts = r.pts || []; r.pts[d.ptable] = r.pts[d.ptable] || {}; r.pts[d.ptable].table = t.value ? Number(t.value) : null; });
  else if (d.rank) { const [g, k] = d.rank.split('|'); update(s => { const se = s.events.find(x => x.name === curEv); se.rank = se.rank || {}; se.rank[g] = se.rank[g] || {}; se.rank[g][k] = t.value; }); }
  else if (d.roll) update(s => { const se = s.events.find(x => x.name === curEv); se.roll = se.roll || {}; se.roll[d.roll] = t.value; });
  else if (d.fpos) update(s => { const se = s.events.find(x => x.name === curEv); se.finalPos = se.finalPos || {}; se.finalPos[d.fpos] = t.value ? Number(t.value) || '' : ''; });
  else if (d.date) update(s => { s.dates = (s.dates || ['', '']).slice(); s.dates[Number(d.date)] = t.value; });
  else if (d.ann) { const [ev, k] = d.ann.split('|'); update(s => { s.podium = { ...(s.podium || {}) }; s.podium[ev] = { ...s.podium[ev], [k]: t.value.trim() }; }); }
  else if (d.annTitle != null) update(s => { s.annTitle = t.value.trim(); });
  else if (d.set) update(s => { s[d.set] = d.set === 'tables' ? Math.max(2, Number(t.value) || 24) : t.value; });
  else if (d.imp) { if (t.files[0]) await importBracket(d.imp, t.files[0]); }
  else if ('impall' in d) { if (t.files.length) await importAll([...t.files]); }
  else if ('staff' in d) update(s => { s.staff = [...new Set(t.value.split(/[\n,，、\s]+/).map(x => x.trim()).filter(Boolean))]; });
  else if ('sched' in d) {
    if (t.files[0]) try { const slots = parseTimetable(await readWorkbookValues(await t.files[0].arrayBuffer())); const file = t.files[0].name; update(s => { s.sched = { file, slots }; }); toast(`賽程時間表已匯入：${slots.length} 個時段`); } catch (err) { toast(`匯入失敗：${err.message}`); }
  }
  else if ('roster' in d) { if (t.files[0]) await importRoster(t.files[0]); }
  else if ('restore' in d) {
    try { const s = JSON.parse(await t.files[0].text()); if (s.v !== 1) throw new Error('格式不符'); replaceState(s); toast('已還原備份'); } catch (e) { toast(`還原失敗：${e.message}`); }
  }
});

// 比分：邊輸入邊存，不重畫輸入框
document.addEventListener('input', ev => {
  const t = ev.target;
  if (t.dataset.lu && t.tagName === 'INPUT') { draft[t.dataset.lu[0]] = readLineup(t.dataset.lu[0]); return; }
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
  if (ev.key === 'Escape' && modal) { modal = null; draft = {}; drawModal(); }
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
onAuth(a => { if (a.error && (a.isAdmin || !a.cloud)) toast(a.error); render(); });
setInterval(() => { const a = document.activeElement; if (!modal && !(a && /INPUT|SELECT/.test(a.tagName))) render(); }, 30000);
render();
