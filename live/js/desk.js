// 大會台
import { derive, isTeam, matchTitle, POINTS, callText, recallText, absences, fmtTime, parseTables, sideText, gameInvalid, EVENT_ORDER, EVENT_FULL, emptyState, podium, ANN_ORDER, ANN_NAME, dayLabel, callQueue, queueRuns } from './model.js';
import { getState, subscribe, update, updateMatch, replaceState, auth, onAuth, LOCAL, saveHistory, loadHistory, writePaths, teamKey, mailKey, parseMails, ownerUpdates, setRefCode, matchUpdatedAt } from './store.js';
import { histKey, entryFromState, mergeHistory, HISTORY } from './history.js';
import { esc, $, $$, icon, toast, chip, deskBoard, header, names, shortEv, lineName, groupTables, callList, refLogHtml } from './ui.js';
import { parseTimetable, slotOf } from './timetable.js';
import { demoState } from './demo.js';
import { timetableHtml } from './ttview.js';
import { buildNotices, noticesHtml, KIND_NAME } from './notices.js';
import { checkinSections, missingLineup } from './units.js';
import { readWorkbookValues, readFormFile } from '../../js/reader.js';
import { parseResponses, EVENTS } from '../../js/parse.js';
import { parseFinalBracket } from '../../js/finalparse.js';
import { readRosterDocx } from './roster.js';
import { bracketSvg } from './tree.js';
import { normalizeTeamName, unitFromTeam, looseKey } from '../../js/schools.js';

let tab = 'ctrl';
let curEv = null;
let modal = null; // { kind: 'score' | 'lineup', mid }
let draft = {}; // 排點視窗內尚未儲存的內容：{ a: [...], b: [...] }，關閉視窗才清掉
let D = null;

const TABS = [['ctrl', '賽程控制'], ['rec', '籤表'], ['time', '時間表'], ['notice', '場控提醒'], ['tables', '球桌狀態'], ['refs', '裁判'], ['draw', '決賽抽籤'], ['ann', '成績公告'], ['setup', '資料設定']];
const busyOpen = new Set();
let paperSet = new Set();
let parkOpen = false, staffSetOpen = false;
const roundOpen = new Set();
let legendOpen = false;
const PILL_ORDER = ['男單', '女單', '男雙', '女雙', '男團', '女團', '社團'];
const byPill = list => list.slice().sort((a, b) => PILL_ORDER.indexOf(a.name) - PILL_ORDER.indexOf(b.name));
const TAB_ICON = { ctrl: 'bracket', rec: 'clipboard', time: 'clock', notice: 'bell', tables: 'tables', refs: 'board', draw: 'shuffle', ann: 'trophy', setup: 'gear' };
let refTab = 'avail', staffOpen = null, staffFixed = false;
let rosterMiss = [], rosterGuess = [];

let handSeen = null;
function render() {
  const s = getState();
  D = derive(withOnline(s));
  paperSet = paperTeams(s);
  $('#top').innerHTML = header(s, '大會台', [['即時賽程', './'], ['裁判紀錄區', 'ref.html'], ['簽到處', 'checkin.html']], { nav: 'desk', account: auth.cloud && auth.user ? `<a href="#" data-signout title="${esc(auth.user)}">登出</a>` : '' });
  if (auth.cloud && !auth.isAdmin) { $('#tabs').innerHTML = ''; $('#main').innerHTML = viewLogin(); return; }
  const hands = D ? handovers(s) : [];
  // 新的裁判更換：在任何分頁都跳出提醒
  const newest = hands.length ? hands[0].ts : 0;
  // 每台電腦只跳一次（記在這台電腦），重新整理不會再跳；紅框提醒要按確認才會消失
  if (handSeen == null) { try { handSeen = Number(localStorage.getItem('jdb-hand-seen') || 0); } catch (e) { handSeen = 0; } }
  if (newest > handSeen) { handSeen = newest; try { localStorage.setItem('jdb-hand-seen', String(newest)); } catch (e) { /* 略過 */ } const x = hands[0]; if (Date.now() - x.ts < 30 * 60000) toast(`第 ${x.t} 桌裁判 ${fmtTime(x.ts)} 由 ${x.from} 換成 ${x.to}，請到「裁判」分頁確認`, 8000); }
  const swN = swapList().filter(x => !x.sw.sent).length + hands.length;
  const due = dueNotices(s).length, rep = [...D.byId.values()].filter(m => m.status === 'reported').length;
  const badge = k => (k === 'notice' && due ? `<span class="badge" title="${due} 則提醒待處理">${due}</span>` : k === 'refs' && swN ? `<span class="badge" title="${swN} 則替換請求或裁判更換">${swN}</span>` : '');
  $('#tabs').innerHTML = TABS.map(([k, t]) => `<button class="${tab === k ? 'on' : ''}" data-tab="${k}">${icon(TAB_ICON[k])}${t}${badge(k)}</button>`).join('');
  if (!D.events.length && tab !== 'setup') tab = 'setup';
  if (!curEv || !D.events.some(e => e.name === curEv)) curEv = D.events.length ? byPill(D.events)[0].name : null;
  $('#main').innerHTML = (tab === 'notice' ? noticeBanner(s) : '') + drawReminders(s) + (tab === 'ctrl' ? viewCtrl(s) : tab === 'notice' ? viewNotice(s) : tab === 'rec' ? viewRec(s) : tab === 'time' ? viewTimeDesk(s) : tab === 'tables' ? viewTables(s) : tab === 'draw' ? viewDraw(s) : tab === 'refs' ? viewRefs(s) : tab === 'ann' ? viewAnn(s) : viewSetup(s));
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
  const calls = (s.calls || []).slice(-5).reverse();
  return `<div class="desk"><div>
    <div class="panel">
      <div class="row"><div class="pills">${byPill(D.events).map(x => `<button class="${x.name === curEv ? 'on' : ''}" data-ev="${x.name}">${x.name}</button>`).join('')}</div></div>
      <button class="lgtoggle" data-lgopen aria-expanded="${legendOpen}"><span class="tri">${legendOpen ? '▾' : '▸'}</span>圖例說明</button>
      ${legendOpen ? `<div class="legend">
        <span><span class="chip">等待中</span>對手未定或前一輪未打完</span><span><span class="chip ready">可開賽</span>可以派桌</span><span><span class="chip playing">進行中</span>已派桌</span><span><span class="chip reported">已打完</span>裁判尚未按結束</span><span><span class="chip done">已完賽</span>灰底</span>
        <span><span class="dot on"></span>前一輪已完賽</span>
        ${e.team ? '<span><span class="ltag ok">已送出</span>線上點單</span><span><span class="ltag got">已收</span>紙本已輸入</span><span><span class="ltag paper">紙</span>使用紙本，勾選＝已發點單</span>' : ''}
      </div>` : ''}
      <div class="rounds">${e.rounds.map(r => {
        // 整輪都完賽：收起來，只留標題，需要時再展開
        const allDone = r.matches.length && r.matches.every(m => m.status === 'done');
        const k = `${e.name}|${r.key}`, open = !allDone || roundOpen.has(k);
        return `<div class="round ${open ? '' : 'folded'}"><h3><span>${esc(r.label)}${roundTime(s, r)}</span><span class="muted small">${r.matches.filter(m => m.status === 'done').length}/${r.matches.length}</span></h3>
          ${allDone ? `<button class="btn ghost sm" data-round="${esc(k)}" style="margin-bottom:8px">${open ? '收起已完賽' : '已完賽，展開'}</button>` : ''}
          ${open ? r.matches.map(card).join('') : ''}</div>`;
      }).join('')}</div>
    </div></div>
    <div class="side">
      ${queuePanel(s)}
      ${onlinePanel(s)}
      ${swapPanel()}
      ${absent.length ? `<div class="panel"><h2>未到回報</h2>${absent.map(({ m, ab }) => {
        const tb = ab.table || m.tables.join('、');
        const mins = t => Math.max(0, Math.floor((Date.now() - t) / 60000));
        // 判棄權：個人賽與整隊未到才有；雙打一人沒到算整組未到
        const woBtns = ab.key === 'm' ? ['a', 'b'].filter(k => ab[k]).map(k => `<button class="btn ghost sm danger" data-wojudge="${esc(m.id)}|${k}">判 ${esc(sideText(k === 'a' ? m.A : m.B, m.team))} 棄權</button>`).join('') : '';
        return `<div class="alertbox"><div class="small ameta">第 ${esc(tb)} 桌　${fmtTime(ab.ts)}　裁判 ${esc(ab.by || '')}</div>
          <div>${esc(recallText(m, ab))}</div>
          ${ab.called ? `<div class="small" style="color:var(--green);margin-top:2px">${fmtTime(ab.called)} 已廣播，已過 ${mins(ab.called)} 分鐘</div>` : ''}
          ${woBtns ? `<div class="row" style="margin-top:4px;justify-content:flex-end">${woBtns}</div>` : ''}
          <div class="row" style="margin-top:4px"><span class="spacer"></span>
            <button class="btn ghost sm" data-called="${esc(m.id)}|${ab.key}">${icon('speaker')}${ab.called ? '再次廣播' : '已廣播'}</button>
            <button class="btn ghost sm" data-clear-absent="${esc(m.id)}|${ab.key}">${icon('check')}已到場</button></div></div>`;
      }).join('')}</div>` : ''}
      ${bcPanel(s, calls)}
      ${rarePanel()}
    </div></div>`;
}
function viewTables(s) {
  const alerts = new Set();
  D.byId.forEach(m => { if (m.status === 'playing') absences(m).forEach(ab => String(ab.table || m.tables.join(',')).split(/[^0-9]+/).filter(Boolean).forEach(t => alerts.add(Number(t)))); });
  return `<div class="panel"><div class="legend" style="margin-top:0"><span><span class="lg busy"></span>進行中</span><span><span class="lg rep"></span>已打完，裁判尚未按結束</span><span><span class="lg alert"></span>有未到回報</span><span><span class="lg"></span>空桌</span></div>${deskBoard(s, D, { alerts })}</div>`;
}
/** 這一輪在時間表上的時段 */
function roundTime(s, r) {
  const sl = r.matches.map(m => slotOf(s.sched, m)).filter(Boolean);
  if (!sl.length) return '';
  const a = sl.reduce((x, y) => (`${y.d}${y.s}` < `${x.d}${x.s}` ? y : x)), b = sl.reduce((x, y) => (`${y.d}${y.e}` > `${x.d}${x.e}` ? y : x));
  return ` <span class="rt">${esc(dayLabel(getState(), a.d, a.day))} ${a.s}-${b.e}</span>`;
}
// ---------------- 裁判更換確認 ----------------
// 同一桌的記分裁判換人時提醒大會確認，避免外人猜到密碼接手記分
function handovers(s) {
  const ack = (s.notices || {}).hand || {}, out = [];
  D.byId.forEach(m => {
    let log = m.rec.reflog; if (typeof log === 'string') { try { log = JSON.parse(log); } catch (e) { log = []; } }
    if (!Array.isArray(log) || log.length < 2) return;
    const last = new Map();
    log.slice().sort((a, b) => a.ts - b.ts).forEach(x => {
      const p = last.get(x.t);
      if (p && nm(p.n) !== nm(x.n)) { const key = `${m.id}|${x.t}|${x.ts}`.replace(/[.#$/\[\]]/g, '_'); if (!ack[key]) out.push({ key, m, t: x.t, from: p.n, to: x.n, ts: x.ts }); }
      last.set(x.t, x);
    });
  });
  return out.sort((a, b) => b.ts - a.ts);
}
function handPanel(s) {
  const l = handovers(s);
  if (!l.length) return '';
  return `<div class="panel handp"><h2 style="color:var(--red)">${icon('whistle')}裁判更換確認（${l.length}）</h2>
    <p class="small muted" style="margin:0 0 6px">請確認接手的是大會派去的裁判。不是的話請馬上到該桌確認，並在「裁判資料設定」更換裁判密碼。</p>
    ${l.map(x => `<div class="handrow"><span>第 ${esc(x.t)} 桌　${esc(x.m.ev)} ${esc(x.m.no)}　${fmtTime(x.ts)} 由 <b>${esc(x.from)}</b> 換成 <b>${esc(x.to)}</b></span><button class="btn sm" data-handok="${esc(x.key)}">${icon('check')}確認</button></div>`).join('')}</div>`;
}

// ---------------- 時間表 ----------------
const CALL_RULES = [
  '個人賽與團體賽同時進行，叫場以個人賽為主。',
  '團體決賽與團體預賽（例如大專決賽和社會組預賽）同時進行，以決賽為主，有空桌再拆給預賽。',
  '抽籤前最後一輪，男團、女團都在打時女團先叫，錯開抽籤。',
  '叫團體賽的原則：同一輪中，已交點單、可以打的就先叫。',
  '團賽同一循環的兩場盡量一起叫。',
  '每個時段開始時廣播目前要進行的場次。',
  '進度落後時間表超過 1 小時，可以先請各隊派代表到大會台協調。',
];
function viewTimeDesk(s) {
  if (!(s.sched && s.sched.slots && s.sched.slots.length)) return '<div class="panel"><h2>時間表</h2><p class="muted small">尚未匯入賽程時間表，請到「資料設定」匯入。</p></div>';
  const info = buildNotices(s.sched.slots).filter(x => x.kind === 'info');
  const after = d => { const l = info.filter(x => x.d === d); return l.length ? `<div class="ttrules"><b>這天的叫場原則</b>${l.map(x => `<div><span class="tm">${x.t}</span>${esc(x.text)}</div>`).join('')}</div>` : ''; };
  return `<div class="desk"><div>
    <div class="panel"><div class="legend" style="margin-top:0"><span><span class="lg tdone"></span>已完賽</span><span><span class="lg tlive"></span>進行中</span><span><span class="lg tnext"></span>下一區塊</span><span><span class="tto">1</span>同一時段的叫場順序</span></div></div>
    ${timetableHtml(s, { D, after })}</div>
    <div class="side">${queuePanel(s)}
      <div class="panel"><h2>叫場原則</h2><ul class="small" style="margin:0;padding-left:18px">
        ${CALL_RULES.map(r => `<li>${esc(r)}</li>`).join('')}</ul></div></div></div>`;
}

// ---------------- 個人賽叫場順序 ----------------
const evTag = ev => `<span class="evtag ev-${esc(ev)}">${esc(ev)}</span>`;
const runText = r => `${r.ev} ${r.list[0].no}${r.list.length > 1 ? `–${r.list[r.list.length - 1].no}` : ''}`;
/** 賽程控制右側：接下來要叫的項目與場次 */
// 廣播稿：平常收合；有新廣播時自動展開並只顯示最新一則，其他按「前幾則」再看
let bcOpen = false, bcMore = false, bcSeen = null;
function bcPanel(s, calls) {
  const latest = calls.length ? Math.max(...calls.map(c => c.ts)) : 0;
  if (bcSeen == null) bcSeen = latest;
  else if (latest > bcSeen) { bcSeen = latest; bcOpen = true; bcMore = false; }
  const head = calls.length ? `<div class="row phead" data-bcopen role="button" tabindex="0" aria-expanded="${bcOpen}"><h2 style="margin:0">廣播稿</h2><span class="spacer"></span>${icon(bcOpen ? 'chevup' : 'chevdown')}</div>` : '<h2 style="margin:0">廣播稿</h2>';
  if (!calls.length) return `<div class="panel bc">${head}<p class="small muted">輸入桌次後，廣播稿會顯示在這裡。</p></div>`;
  if (!bcOpen) return `<div class="panel bc">${head}</div>`;
  return `<div class="panel bc">${head}<div style="margin-top:8px">${callList(s.calls, D, { max: bcMore ? 5 : 1, undo: true })}</div>
    ${calls.length > 1 ? `<button class="btn plain sm" data-bcmore>${bcMore ? '只看最新一則' : `前 ${Math.min(4, calls.length - 1)} 則`}</button>` : ''}</div>`;
}
let qOpen = false;
function queuePanel(s) {
  const q = callQueue(D);
  if (!q.length) return '';
  const all = queueRuns(q), runs = all.slice(0, qOpen ? 5 : 2);
  return `<div class="panel"><h2>個人賽叫場順序</h2>
    <table class="list qrun"><tbody>${runs.map((r, i) => { const rd = r.list.filter(m => m.status === 'ready').length; return `<tr class="${i ? '' : 'now'}"><td class="nowrap">${i ? '接著' : '現在'}</td>
      <td><button class="btn plain sm" data-ev="${esc(r.ev)}">${evTag(r.ev)}${esc(runText(r).slice(r.ev.length + 1))}</button></td><td class="small muted nowrap" style="text-align:right">${r.list.length} 場</td></tr>`; }).join('')}</tbody></table>${all.length > 2 ? `<button class="btn plain sm" data-qopen style="margin-top:4px">${icon(qOpen ? 'chevup' : 'chevdown')}${qOpen ? '收合' : `其他 ${Math.min(5, all.length) - 2} 段`}</button>` : ''}</div>`;
}
/** 裁判分頁：接下來 N 場會叫到哪些場次（這些場次的選手列在暫不可擔任） */
function queueNote(s) {
  const N = refBuf(s), q = callQueue(D);
  if (!q.length) return '';
  const runs = queueRuns(q.slice(0, N));
  return `<div class="alertbox info" style="margin-bottom:12px">${N} 場內會叫到的【${runs.map(r => esc(runText(r))).join('、')}】暫不可擔任</div>`;
}
/** 大會判棄權：記下誰判的、這場結束並空出球桌，裁判手機會收到通知 */
function walkover(mid, winner) {
  updateMatch(mid, r => { r.wo = winner; r.woBy = { by: deskName(), ts: Date.now() }; r.fin = Date.now(); r.end = Date.now(); r.tables = []; delete r.absent; (r.pts || []).forEach(p => { if (p) delete p.absent; }); });
}
const deskName = () => (auth.nick ? `大會台(${auth.nick})` : '大會台');
// 裁判打完沒按結束：超過 15 分鐘沒有更新，大會台可以直接完賽
const STALE_MS = 15 * 60000;
const staleReported = m => m.status === 'reported' && matchUpdatedAt(m.id) && Date.now() - matchUpdatedAt(m.id) > STALE_MS;
const hasRec = m => !!(m.rec.start || m.rec.fin || (m.rec.g || []).some(g => g && (g[0] !== '' || g[1] !== '')) || (m.rec.pts || []).some(p => p && (p.g || []).some(g => g && (g[0] !== '' || g[1] !== ''))));
const stageOrder = m => (m.stage === 'F' ? 1 : 0) * 100 + m.roundIdx;

function card(m) {
  const sideRow = (k, S) => {
    const win = m.winner === k;
    const slip = m.rec.slip && m.rec.slip[k];
    const paper = m.team && S && S.name && paperSet.has(`${m.ev}|${S.name}`);
    const on = m.rec.olSrc && m.rec.olSrc[k];
    // 點單狀態：線上已送出（綠）、大會台已收紙本（藍）、線上編輯中（黃）；要用紙本的隊伍標「紙」並勾已發點單
    const st = !m.team ? '' : on ? `<span class="ltag ok" title="線上點單 ${fmtTime(on.ts)} 送出">已送出</span>`
      : m.lineupOk[k] ? '<span class="ltag got" title="大會台已輸入點單">已收</span>'
      : draftLu(getState(), m, k) ? '<span class="ltag edit" title="線上點單編輯中，尚未送出">編輯中</span>' : '';
    return `<div class="sd ${win ? 'win' : ''}">
      <span class="dot ${m.prevDone[k] ? 'on' : ''}" title="前一輪${m.prevDone[k] ? '已' : '尚未'}完賽"></span>
      ${paper ? `<label class="slip" title="使用紙本點單，勾選表示已發點單"><span class="ltag paper">紙</span><input type="checkbox" data-slip="${esc(m.id)}|${k}" ${slip ? 'checked' : ''}></label>` : ''}
      <span class="nm">${esc(sideText(S, m.team)) || '<span class="muted">待定</span>'}</span>${st}
      <span class="sc">${m.score[0] + m.score[1] > 0 || m.winner ? m.score[k === 'a' ? 0 : 1] : ''}</span></div>`;
  };
  const locked = m.status === 'done';
  return `<div class="mc ${m.status}" data-mid="${esc(m.id)}">
    <div class="hd"><span class="no">${esc(m.no)}</span>${m.group ? `<span class="muted">${m.group} 組</span>` : ''}${chip(m)}<span class="spacer"></span>
      ${m.status === 'done' || m.status === 'reported' ? '' : m.status === 'playing' && m.rec.start ? `<span class="muted">${fmtTime(m.rec.start)} 開賽</span>` : planned(m)}</div>
    ${sideRow('a', m.A)}${sideRow('b', m.B)}
    ${staleReported(m) ? `<div class="stale"><span>已打完超過 15 分鐘，裁判還沒按結束</span><button class="btn sm yellow" data-finish="${esc(m.id)}">${icon('check')}完賽</button></div>` : ''}
    ${!m.tables.length && m.known && m.status !== 'done' ? (busy => (busy.length ? `<div class="busytag"><button class="busybtn" data-busyopen="${esc(m.id)}" aria-expanded="${busyOpen.has(m.id)}">${icon('alert')}提醒 ${busy.length}</button>${busyOpen.has(m.id) ? `<ul>${busy.map(b => `<li>${esc(b.text)}</li>`).join('')}</ul>` : ''}</div>` : ''))(busyOf(m)) : ''}
    <div class="ft">桌次 <input class="tb" type="text" inputmode="numeric" value="${m.tables.join('、')}" data-tb="${esc(m.id)}" ${locked || !m.known ? 'disabled' : ''} placeholder="${m.team ? '可填多桌' : ''}">
      <span class="spacer"></span>
      ${m.team ? `<button class="btn ghost sm" data-lineup="${esc(m.id)}" ${m.known ? '' : 'disabled'}>${icon('list')}排點</button>` : ''}
      <button class="btn ghost sm" data-score="${esc(m.id)}" ${m.known || hasRec(m) ? '' : 'disabled'}>${icon('score')}成績</button></div>
  </div>`;
}

function planned(m) {
  const x = slotOf(getState().sched, m);
  return x ? `<span class="muted">表定 ${x.s}</span>` : '';
}

// ---------------- 生僻字讀音 ----------------
// 只存「字 → 同音字」，名單從目前的籤表即時找出來（不把姓名寫進程式碼）
const RARE = { 貽: '宜', 亘: '宣', 晟: '成', 恂: '旬', 璿: '旋', 驊: '華', 潁: '影', 粘: '黏', 閎: '宏', 榞: '元', 宬: '成', 琮: '從', 岦: '立', 崴: '威', 昜: '陽', 旻: '民', 䧮: '憲', 浤: '宏', 丰: '風', 浡: '勃', 巽: '訊',
  伃: '于', 雰: '芬', 彣: '文', 苡: '以', 霈: '配', 歆: '欣', 錞: '純', 楹: '迎', 媗: '宣', 緁: '捷', 玗: '于', 倢: '捷', 珈: '家', 熏: '勳', 媞: '提', 淯: '育', 堻: '堅', 紓: '書', 芓: '子', 姸: '研', 扈: '戶', 蒨: '欠', 琬: '晚', 玠: '介', 葳: '威', 崨: '捷', 瀞: '靜' };
let rareOpen = false;
// 裁判分組定義：放在裁判分頁最下方，預設收合
let refDefOpen = false;
function refDefPanel() {
  const head = `<div class="row phead" data-refdef role="button" tabindex="0" aria-expanded="${refDefOpen}"><h2 style="margin:0">裁判分組定義</h2><span class="spacer"></span>${icon(refDefOpen ? 'chevup' : 'chevdown')}</div>`;
  if (!refDefOpen) return `<div class="panel">${head}</div>`;
  return `<div class="panel refdef">${head}
    <h3>一、可擔任裁判</h3>
    <ul><li>今天已經沒有還沒打的場次：沒報名比賽、已經淘汰，或所有項目都打完。</li>
      <li>依交大、陽明、香山分組，擔任次數少的排前面。</li></ul>
    <h3>二、人手不足時可支援</h3>
    <ul><li>還有比賽，但不是馬上要打的人：個人賽排在接下來 N 場以後；團體賽要等前面場次的結果，下一場還不能開打。</li>
      <li>體資。</li>
      <li>滑鼠移到姓名上（平板點一下姓名），可以看到他的下一場。</li></ul>
    <h3>三、暫不可擔任（依項目、場次排序）</h3>
    <ul><li>正在比賽：所在場次已派桌、還沒分出勝負。</li>
      <li>正在擔任裁判：正在某桌記分。</li>
      <li>個人賽馬上要打：依個人賽叫場順序，排在接下來 N 場內的選手。N 預設等於球桌數（24），大約是接下來 20～30 分鐘會叫到的場次，可在「裁判資料設定 &gt; 分類定義」調整。</li>
      <li>團體賽下一場已經可以開打：前一輪都打完、對手確定。團體賽同一輪中誰的點單先到就先打，不照固定順序，所以只要隨時可能被叫，整隊都會被算在暫不可擔任。</li></ul>
    <h3>團體賽進行時請注意</h3>
    <p>團體賽哪一場先打，要看點單收齊的狀況和場控的安排。名單只能判斷「可不可能被叫」，判斷不出實際順序。<b>團體賽進行時可以與場控討論，盡量避免隊內隊伍同時打，無裁判可叫的情況。</b></p></div>`;
}
function rareList() {
  const out = [], seen = new Set();
  byPill(D.events).forEach(e => e.matches.slice().sort((a, b) => (a.stage === 'F') - (b.stage === 'F') || a.num - b.num).forEach(m => [m.A, m.B].forEach(S => {
    if (!S || !S.name) return;
    const full = sideText(S, m.team), key = `${e.name}|${full}`;
    if (seen.has(key)) return;
    const chars = [...new Set([...String(S.name)].filter(c => RARE[c]))];
    if (!chars.length) return;
    seen.add(key); out.push({ ev: e.name, no: m.no, full, chars });
  })));
  return out;
}
function rarePanel() {
  const l = rareList();
  if (!l.length) return '';
  return `<div class="panel"><div class="row phead" data-rareopen role="button" tabindex="0" aria-expanded="${rareOpen}"><h2 style="margin:0">生僻字讀音</h2><span class="spacer"></span>${icon(rareOpen ? 'chevup' : 'chevdown')}</div>
    ${rareOpen ? `<table class="list rare" style="margin-top:8px"><thead><tr><th>項目</th><th>場次</th><th>全稱</th><th>讀音</th></tr></thead><tbody>${l.map(x => `<tr><td class="nowrap">${esc(x.ev)}</td><td class="nowrap">${esc(x.no)}</td><td>${esc(x.full).replace(new RegExp(`[${x.chars.join('')}]`, 'gu'), c => `<b class="rk2">${c}</b>`)}</td><td class="nowrap">${x.chars.map(c => `<b>${c}</b>讀「${RARE[c]}」`).join('<br>')}</td></tr>`).join('')}</tbody></table>` : ''}</div>`;
}

// ---------------- 線上點單 ----------------
/** 簽到處註記要用紙本點單的隊伍：「項目|隊名」 */
function paperTeams(s) {
  const out = new Set(), ci = s.checkin || {};
  checkinSections(s).filter(x => x.team).forEach(sec => sec.rows.forEach(r => { const p = (ci[r.key] || {}).paper || {}; Object.keys(p).forEach(n => { if (p[n]) out.add(`${sec.code}|${n}`); }); }));
  return out;
}
/** 這場某一邊隊伍線上送出的點單（大會台還沒登錄時才用） */
function onlineLu(s, m, k) {
  const S = k === 'a' ? m.A : m.B;
  if (!m.team || !S || !S.name) return null;
  const o = ((s.olu || {})[m.id] || {})[teamKey(m.ev, S.name)] || null;
  // 只有按了「送出」的才算；暫存中的不帶入
  return o && o.final ? o : null;
}
function draftLu(s, m, k) { const S = k === 'a' ? m.A : m.B; if (!m.team || !S || !S.name) return null; const o = ((s.olu || {})[m.id] || {})[teamKey(m.ev, S.name)]; return o && !o.final ? o : null; }
/** 大會台畫面用：線上點單先當作已收點單顯示，派桌時才寫進正式紀錄（避免對手提早在即時賽程看到） */
function withOnline(s) {
  const dl = s.dlu || {};
  if ((!s.olu || !Object.keys(s.olu).length) && !Object.keys(dl).length) return s;
  const m = { ...s.m };
  // 大會台輸入、還沒派桌的紙本點單（只存在大會台讀得到的地方）
  Object.entries(dl).forEach(([id, x]) => { if (!x) return; const rec = m[id] || {}; m[id] = { ...rec, lineup: { ...(rec.lineup || {}), ...x } }; });
  s = { ...s, m };
  const ids = new Set(Object.keys(s.olu || {}));
  const D0 = derive(s);
  ids.forEach(id => {
    const x = D0.byId.get(id); if (!x || !x.team) return;
    const rec = s.m[id] || {};
    const lu = { ...(rec.lineup || {}) }, src = {};
    ['a', 'b'].forEach(k => { const o = onlineLu(s, x, k); if (o && !lu[k]) { lu[k] = o.lu; src[k] = o; } });
    if (Object.keys(src).length) m[id] = { ...rec, lineup: lu, olSrc: src };
  });
  return { ...s, m };
}

/** 這隊可以登入填點單的信箱 */
function teamMails(s, ev, team) { return Object.keys((s.teamacl || {})[teamKey(ev, team)] || {}).map(k => k.replace(/,/g, '.')); }
let mailAll = false;
/** 大會台送到隊伍線上點單頁面的通知 */
function nudgeOf(s, m, k) {
  const S = k === 'a' ? m.A : m.B; if (!S || !S.name) return null;
  const v = ((s.nudge || {})[teamKey(m.ev, S.name)] || {})[m.id];
  try { return v ? JSON.parse(v) : null; } catch (e) { return null; }
}
function nudgeDefault(s, m) { const sl = slotOf(s.sched, m); return sl ? `此為表定 ${sl.s} 的賽程，請盡速送出點單，謝謝！` : `請盡速送出 ${m.no} 的點單，謝謝！`; }
/** 該填線上點單還沒填的隊伍：這隊的下一場（有時間表時為表定 30 分鐘內）、還沒派桌、這隊有設定信箱、大會台與線上都沒有點單 */
function pendingOnline(s) {
  const now = NOW().getTime(), out = [];
  D.byId.forEach(m => {
    if (!m.team || m.rec.start || m.status === 'done' || m.status === 'reported') return;
    if (!(m.A && m.A.name && m.B && m.B.name)) return;
    const slot = slotOf(s.sched, m);
    const at = slot ? dueAt(s, { d: slot.d, t: slot.s }) : null;
    // 有時間表：表定前 30 分鐘起提醒；沒有時間表：這隊的下一場就提醒
    if (at && at - now > 30 * 60000) return;
    ['a', 'b'].forEach(k => {
      const S = k === 'a' ? m.A : m.B;
      if (m.rec.lineup && m.rec.lineup[k]) return;
      const earlier = [...D.byId.values()].some(o => o.team && o.ev === m.ev && o.id !== m.id && (o.stage === m.stage ? o.num < m.num : o.stage !== 'F') && [o.A, o.B].some(x => x && x.name === S.name) && !o.rec.start && o.status !== 'done' && o.status !== 'reported');
      if (earlier) return;
      const mails = teamMails(s, m.ev, S.name);
      if (mails.length) out.push({ m, k, team: S.name, opp: (k === 'a' ? m.B : m.A).name, mails, slot });
    });
  });
  return out.sort((a, b) => ((a.slot && a.slot.s) || '99').localeCompare((b.slot && b.slot.s) || '99') || a.m.num - b.m.num);
}
/** 催交線上點單的信：收件人是這隊所有可登入的信箱 */
function lineupMail(s, x) {
  const t = s.title || '交大盃';
  const subject = `【${t}_請盡快送出點單】${x.m.ev} ${x.team} ${x.m.no} 請盡快送出線上點單`;
  const body = [`${x.team} 您好：`, '',
    `${EVENT_FULL[x.m.ev]} ${matchTitle(x.m)}（對手：${x.opp}）尚未收到貴隊的線上點單，請盡快填寫完畢並送出。`, '',
    '填寫網址：https://nctu-ttc.tw/live/lineup.html', '',
    '只有以下帳號可以登入填寫點單：', ...x.mails.map(e => `・${e}`), '',
    '請用上列的 Google 帳號登入。若無法線上填寫，請盡快至大會。', '',
    `${s.edition || ''}${t}大會`].join('\n');
  // 用 Gmail 網頁版開好草稿（大會台登入的 Google 帳號寄出）
  return `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(x.mails.join(','))}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
function onlinePanel(s) {
  const l = pendingOnline(s);
  if (!l.length) return '';
  const sent = (s.notices || {}).mail || {};
  return `<div class="panel"><h2>線上點單未填（${l.length}）</h2>
    ${(mailAll ? l : l.slice(0, 5)).map(x => { const id = `${x.m.id}|${x.k}`; return `<div class="alertbox"><div class="small ameta">${esc(x.m.ev)} ${esc(x.m.no)}${x.slot ? `　表定 ${esc(x.slot.s)}` : ''}${sent[id] ? `　${fmtTime(sent[id])} 已擬信` : ''}</div>
      <div><b>${esc(x.team)}</b> 尚未填寫線上點單</div>
      <div class="row" style="margin-top:4px"><span class="small muted" style="flex:1">${x.mails.length} 個信箱${nudgeOf(s, x.m, x.k) ? `　${fmtTime(nudgeOf(s, x.m, x.k).ts)} 已頁面通知` : ''}</span><a class="btn ghost sm" href="${esc(lineupMail(s, x))}" target="_blank" rel="noopener" data-mailed="${esc(id)}">${icon('mail')}信件催繳</a><button class="btn ghost sm" data-nudge="${esc(id)}">${icon('bell')}頁面通知</button></div></div>`; }).join('')}
    ${l.length > 5 ? `<button class="btn plain sm" data-mailall>${mailAll ? '只顯示前 5 隊' : `顯示全部 ${l.length} 隊`}</button>` : ''}</div>`;
}

// ---------------- 派桌前檢查：隊伍或選手是否正在別桌比賽 ----------------
const nm = x => String(x || '').replace(/\s+/g, '');
/** 一場比賽裡的人：團體賽是「項目|隊名」加上點單上的選手，個人賽是「學校|姓名」 */
function peopleOf(m) {
  const out = [];
  ['A', 'B'].forEach((k, i) => {
    const S = m[k]; if (!S || !S.name) return;
    if (m.team) {
      out.push({ key: `T|${m.ev}|${nm(S.name)}`, label: S.name, side: S.name, team: true });
      const lu = (((m.rec.lineup || {})[i ? 'b' : 'a']) || []).flat().filter(Boolean);
      const unit = nm(unitFromTeam(S.name));
      // 已輸入點單：只看出賽選手；還沒輸入點單：看該隊報名名單上的所有選手
      const se = (getState().events || []).find(x => x.name === m.ev);
      const roster = lu.length ? lu : (((se && se.rosters) || {})[S.name] || []).flat().filter(Boolean);
      [...new Set(roster)].forEach(p => out.push({ key: `P|${unit}|${nm(p)}`, label: `${S.name} ${p}`, side: S.name, p, roster: !lu.length }));
    } else {
      const names = String(S.name).split(/[\/／]/), schools = String(S.school || '').split(/[\/／]/);
      names.forEach((p, j) => { const sc = nm(unitFromTeam(schools[schools.length === names.length ? j : 0] || '')); out.push({ key: `P|${sc}|${nm(p)}`, label: `${schools[schools.length === names.length ? j : 0] || ''} ${p}`.trim(), side: S.name, p }); });
    }
  });
  return out;
}
/** 這場的隊伍或選手，現在在哪些別的球桌上比賽；回傳一行一則的簡短提醒 */
function busyOf(m) {
  const mine = new Map(peopleOf(m).map(x => [x.key, x]));
  const mineN = new Map(peopleOf(m).filter(x => x.p).map(x => [nm(x.p), x]));
  const out = [];
  const at = o => `第 ${o.tables.join('、')} 桌`;
  D.byId.forEach(o => {
    if (o.id === m.id || o.status !== 'playing') return;
    // 社會組的隊伍不一定用學校名：社會組跟其他項目之間只比對姓名
    const cross = (m.ev === '社團') !== (o.ev === '社團');
    const hits = peopleOf(o).map(x => { const me = mine.get(x.key) || (cross && x.p ? mineN.get(nm(x.p)) : null); return { x, me, nameOnly: !!me && !mine.get(x.key) }; }).filter(h => h.me);
    if (!hits.length) return;
    const teamHit = hits.find(h => h.x.team);
    if (teamHit) { out.push({ o, text: `${teamHit.me.side} ${o.ev}正在${at(o)}比賽` }); return; }
    if (m.team) {
      // 這隊的成員在別場比賽：同一隊成員合併成一行
      const bySide = new Map();
      hits.forEach(h => { if (!bySide.has(h.me.side)) bySide.set(h.me.side, new Set()); bySide.get(h.me.side).add(h.me.p); });
      bySide.forEach((ps, side) => out.push({ o, roster: hits.some(h => h.me.roster), text: `${side} ${m.ev}成員 ${[...ps].join('、')} 正在${at(o)}比賽（${o.ev}）` }));
    } else if (o.team) {
      const sides = new Map();
      hits.forEach(h => { if (!sides.has(h.x.side)) sides.set(h.x.side, new Set()); sides.get(h.x.side).add(h.me.p); });
      sides.forEach((ps, side) => out.push({ o, roster: hits.some(h => h.x.roster), text: `${side} ${o.ev}正在${at(o)}比賽（${[...ps].join('、')}）` }));
    } else {
      out.push({ o, text: `${[...new Set(hits.map(h => h.me.p))].join('、')} 正在${at(o)}比賽（${o.ev}）` });
    }
  });
  // 這場會上場的人正在別桌擔任裁判：個人賽的選手；團體賽已排點看所有點的選手，還沒排點看整隊名單
  const want = new Map();
  if (m.team) {
    const se = (getState().events || []).find(x => x.name === m.ev);
    ['a', 'b'].forEach(k => { const S = k === 'a' ? m.A : m.B; if (!S || !S.name) return;
      const lu = (((m.rec.lineup || {})[k]) || []).flat().filter(Boolean);
      const list = lu.length ? lu : (((se && se.rosters) || {})[S.name] || []).flat().filter(Boolean);
      list.forEach(p => want.set(nm(p), S.name)); });
  } else [m.A, m.B].flatMap(x => String((x && x.name) || '').split(/[\/／]/)).forEach(p => { if (nm(p)) want.set(nm(p), ''); });
  D.tables.forEach((x, t) => {
    if (x.m.id === m.id || x.m.status !== 'playing') return;
    const r = (x.m.rec.refs || {})[t];
    if (r && want.has(nm(r))) out.push({ ref: true, o: x.m, text: `${r} 正在第 ${t} 桌擔任裁判` });
  });
  return out;
}

function setTables(mid, text, force = false, busyOk = false) {
  const s = getState();
  const m = D.byId.get(mid);
  const tables = parseTables(text);
  const bad = tables.find(t => t < 1 || t > (s.tables || 24));
  if (bad != null) { toast(`沒有第 ${bad} 桌`); render(); return; }
  const taken = tables.filter(t => D.tables.has(t) && D.tables.get(t).m.id !== mid && D.tables.get(t).m.status === 'playing');
  // 個人賽或只用一桌的團體賽：不能搶
  const hard = taken.find(t => { const o = D.tables.get(t).m; return !(o.team && o.tables.length > 1); });
  if (hard != null) { toast(`第 ${hard} 桌正在進行 ${shortEv(D.tables.get(hard).m)}，請先確認`); render(); return; }
  // 團體賽分多桌：這桌的點已打完就直接收回；還沒有紀錄的先問一聲
  const ask = taken.filter(t => !D.tables.get(t).idle);
  if (ask.length && !force) { modal = { kind: 'reclaim', mid, text, tables: ask }; drawModal(); render(); return; }
  const added = tables.filter(t => !m.tables.includes(t));
  // 隊伍或選手還在別桌比賽：先提醒，確認後才派桌
  if (added.length && !busyOk) { const busy = busyOf(m); if (busy.length) { modal = { kind: 'busy', mid, text, force, busy }; drawModal(); render(); return; } }
  update(st => {
    // 收回別場團體賽的桌子：從那場的桌次拿掉，那場在其他桌繼續
    taken.forEach(t => { const o = D.tables.get(t).m, r = st.m[o.id]; if (r && r.tables) r.tables = r.tables.filter(x => Number(x) !== t); });
    const rec = st.m[mid] = st.m[mid] || {};
    rec.tables = tables;
    // 派桌＝點單鎖定：線上送出、大會台還沒登錄的點單在這時寫進正式排點
    if (added.length && m.team) {
      const dl = (st.dlu || {})[mid] || {};
      ['a', 'b'].forEach(k => {
        if (rec.lineup && rec.lineup[k]) return;
        const ol = onlineLu(st, m, k), v = dl[k] || (ol || {}).lu;
        if (v) { rec.lineup = rec.lineup || {}; rec.lineup[k] = v; }
        // 記下這邊的點單來自隊伍線上送出：之後大會台不能直接改
        if (!dl[k] && ol) { rec.luSrc = { ...(rec.luSrc || {}), [k]: ol.ts || Date.now() }; }
      });
      if (st.dlu && st.dlu[mid]) delete st.dlu[mid];
    }
    if (tables.length && !rec.start) rec.start = Date.now();
    if (!tables.length && !(rec.g || rec.pts)) {
      delete rec.start;
      // 還沒開打就把桌次刪掉：視為叫錯，順便收回這場的廣播
      st.calls = (st.calls || []).filter(c => c.mid !== mid);
    }
    if (added.length) {
      st.calls = (st.calls || []).concat({ ts: Date.now(), mid, tables, text: callText(m, tables) }).slice(-40);
    }
  });
  if (added.length && m.status === 'wait') toast('提醒：此場次尚未符合開賽條件（對戰雙方或點單未齊）');
}

// ---------------- 排點 ----------------
// 排點紀錄：隊伍的線上紀錄（信箱）＋大會台的代填紀錄（暱稱），平常收合
const luUnlock = {}, luLogOpen = {};
function luLogHtml(m, k, S) {
  const s = getState();
  const o = ((s.olu || {})[m.id] || {})[teamKey(m.ev, S.name)];
  const team = ((o && o.log) || []).map(x => ({ ts: x.ts, by: x.by, a: x.a === '暫存' ? '編輯' : x.a }));
  const desk = ((((s.notices || {}).lulog || {})[m.id] || {})[k] || []);
  const all = [...team, ...desk].sort((a, b) => b.ts - a.ts);
  if (!all.length) return '';
  const key = `${m.id}|${k}`;
  return `<div class="small" style="margin:0 0 6px"><button class="btn plain sm" data-lulog="${esc(key)}">${icon(luLogOpen[key] ? 'chevup' : 'chevdown')}紀錄（${all.length}）</button>
    ${luLogOpen[key] ? `<div class="lulog">${all.map(x => `<div>${fmtTime(x.ts)}　${esc(x.by)}　${esc(x.a)}</div>`).join('')}</div>` : ''}</div>`;
}
const luLog = (mid, k, a) => update(st => { st.notices = st.notices || {}; const L = st.notices.lulog = st.notices.lulog || {}; L[mid] = L[mid] || {}; L[mid][k] = (L[mid][k] || []).concat({ ts: Date.now(), by: deskName(), a }).slice(-30); });
function lineupModal(m) {
  const e = getState().events.find(x => x.name === m.ev);
  const col = (k, S) => {
    const roster = (e.rosters && e.rosters[S.name]) || [];
    const l = draft[k] || (m.rec.lineup && m.rec.lineup[k]) || [];
    // 隊伍線上送出的點單大會台不能改（要改就退回讓隊伍改）；其他情況要先按「代填點單」才能填，紙本隊伍直接可以填
    const online = !!((m.rec.olSrc && m.rec.olSrc[k]) || (m.rec.luSrc && m.rec.luSrc[k]));
    const paper = paperSet.has(`${m.ev}|${S.name}`);
    const deskHas = !!(((getState().dlu || {})[m.id] || {})[k] || (m.rec.lineup && m.rec.lineup[k] && !online));
    const open = !online && (paper || deskHas || luUnlock[`${m.id}|${k}`]);
    const dis = open ? '' : 'disabled';
    const inp = (i, j, v) => (roster.length
      ? `<select data-lu="${k}|${i}|${j}" ${dis} style="width:${j == null ? 100 : 48}%"><option value=""></option>${roster.map(n => `<option ${n === v ? 'selected' : ''}>${esc(n)}</option>`).join('')}${v && !roster.includes(v) ? `<option selected>${esc(v)}</option>` : ''}<option value="__other">其他（手動輸入）</option></select>`
      : `<input type="text" data-lu="${k}|${i}|${j}" value="${esc(v || '')}" ${dis} style="width:${j == null ? 100 : 48}%">`);
    return `<div style="flex:1;min-width:260px"><h3>${esc(S.name)} ${m.rec.olSrc && m.rec.olSrc[k] ? `<span class="chip playing">線上點單 ${fmtTime(m.rec.olSrc[k].ts)} 送出</span>` : m.lineupOk[k] ? '<span class="chip playing">已收點單</span>' : draftLu(getState(), m, k) ? `<span class="chip warn">線上編輯中</span>` : '<span class="chip">尚未輸入</span>'}</h3>
      ${m.rec.olSrc && m.rec.olSrc[k] && !m.rec.start ? `<div class="small" style="margin:-4px 0 6px"><button class="btn plain sm" data-lureturn="${esc(m.id)}|${k}">退回讓隊伍修改</button></div>` : ''}
      ${POINTS.map((p, i) => `<div class="row" style="margin-bottom:6px;flex-wrap:nowrap"><span class="nowrap small muted" style="width:76px">第${'一二三四五'[i]}點 ${p.dbl ? '雙' : '單'}</span>
        <span style="flex:1;display:flex;gap:4px">${p.dbl ? inp(i, 0, (l[i] || [])[0]) + inp(i, 1, (l[i] || [])[1]) : inp(i, null, l[i])}</span></div>`).join('')}
      <div class="small" data-lu-warn="${k}" style="color:var(--red);min-height:20px"></div>
      ${luLogHtml(m, k, S)}
      <div class="row">${open ? `<button class="btn sm" data-lu-save="${k}">${icon('check')}儲存排點</button><button class="btn ghost sm" data-lu-clear="${k}">清除</button>` : online ? '' : `<button class="btn ghost sm" data-luunlock="${esc(m.id)}|${k}">${icon('edit')}代填點單</button>`}
        ${(() => { const mails = teamMails(getState(), m.ev, S.name); if (m.lineupOk[k] || !mails.length || m.rec.start) return ''; const x = { m, k, team: S.name, opp: ((k === 'a' ? m.B : m.A) || {}).name || '待定', mails, slot: slotOf(getState().sched, m) }; return `<a class="btn ghost sm" href="${esc(lineupMail(getState(), x))}" target="_blank" rel="noopener" data-mailed="${esc(m.id)}|${k}">${icon('mail')}信件催繳</a><button class="btn ghost sm" data-nudge="${esc(m.id)}|${k}">${icon('bell')}頁面通知</button>`; })()}
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
/** 「中原大學 鮑起萱/蔡羽婷」排成校名一行、姓名一行（雙打保留斜線） */
const twoLine = t => { const x = String(t || '').trim(), i = x.indexOf(' '); return i > 0 ? `${esc(x.slice(0, i))}<br>${esc(x.slice(i + 1))}` : esc(x); };
const BY_COLORS = ['#dcfce7', '#fef3c7', '#dbeafe', '#fce7f3', '#ede9fe', '#ffedd5'];
let showBy = false;
/** 成績視窗上方：這場的裁判、棄權是誰登記的、最後更新時間 */
function refLine(m, byBtn) {
  // 有交接紀錄就照時間列出（第 5 桌 10:02 王小明 → 10:30 李大華），沒有就列裁判姓名
  const log = (() => { try { return Array.isArray(m.rec.reflog) ? m.rec.reflog : JSON.parse(m.rec.reflog || '[]'); } catch (e) { return []; } })();
  const byT = new Map(); log.forEach(x => { if (!byT.has(x.t)) byT.set(x.t, []); byT.get(x.t).push(x); });
  const refs = [...new Set([...Object.values(m.rec.refs || {}), m.rec.ref, ...(m.rec.pts || []).map(p => p && p.ref)].filter(Boolean))];
  const who = byT.size ? [...byT].map(([t, l]) => `${byT.size > 1 ? `${esc(t)} 桌 ` : ''}${l.map(x => `${fmtTime(x.ts)} ${esc(x.n)}`).join(' → ')}`).join('；')
    : refs.length ? refs.map(esc).join('、') : '未登記';
  const wo = m.rec.wo ? (m.rec.woBy ? `棄權 ${esc(m.rec.woBy.by)} ${fmtTime(m.rec.woBy.ts)}` : '棄權登記者不明') : '';
  return `<div class="refline small muted"><span>裁判 ${who}</span>${wo ? `<span>${wo}</span>` : ''}${byBtn || ''}</div>`;
}
function scoreModal(m) {
  const locked = false; // 不再鎖定：完賽後大會台仍可修改
  const dis = '';
  const lu = m.rec.lineup || {};
  const gin = (pi, gi, side, v) => `<input class="g" type="text" inputmode="numeric" maxlength="2" data-g="${pi}|${gi}|${side}" value="${esc(v ?? '')}" ${dis}${byCol(pi, gi) ? ` style="background:${byCol(pi, gi)}"` : ''}>`;
  // 每局是誰記的：按「紀錄者」才顯示色塊
  const srcs = m.team ? (m.rec.pts || []).map(x => (x || {}).gb || []) : [m.rec.gb || []];
  const who = [...new Set(srcs.flat().filter(Boolean))];
  const byOf = pi => (m.team ? ((m.rec.pts || [])[pi] || {}).gb : m.rec.gb) || [];
  const byCol = (pi, gi) => { if (!showBy) return ''; const i = who.indexOf(byOf(pi)[gi]); return i < 0 ? '' : BY_COLORS[i % BY_COLORS.length]; };
  const bg = (pi, gi) => { const c = byCol(pi, gi); return c ? ` title="${esc(byOf(pi)[gi])}"` : ''; };
  const byBtn = who.length ? `<button class="btn ghost sm" data-showby aria-pressed="${showBy}">${icon('list')}${showBy ? '隱藏紀錄者' : '紀錄者'}</button>` : '';
  const byLegend = who.length && showBy ? `<div class="row small" style="justify-content:flex-end;margin:0 0 6px">${who.map((n, i) => `<span style="background:${BY_COLORS[i % BY_COLORS.length]};padding:2px 8px;border-radius:6px">${esc(n)}</span>`).join('')}</div>` : '';
  const block = (pi, games, title, an, bn, meta, solo) => `<div class="pt ${solo ? 'solo' : ''}"><h4>${title}</h4>
    ${an || bn ? `<div class="pn"><span>${twoLine(an)}</span><span>${twoLine(bn)}</span></div>` : ''}
    ${[0, 1, 2, 3, 4].map(gi => `<div class="gr"${bg(pi, gi)}>${gin(pi, gi, 0, (games[gi] || [])[0])}<span class="vs">:</span>${gin(pi, gi, 1, (games[gi] || [])[1])}</div>`).join('')}
    <div class="res" data-res="${pi}" ${solo ? 'hidden' : ''}></div><div class="meta">${meta}</div></div>`;
  let body;
  if (m.team) {
    const pts = m.rec.pts || [];
    body = POINTS.map((p, i) => {
      const x = pts[i] || {};
      const meta = `桌次 <select data-ptable="${i}" ${dis}><option value=""></option>${m.tables.map(t => `<option ${Number(x.table) === t ? 'selected' : ''}>${t}</option>`).join('')}</select>${x.ref ? `<span>裁判 ${esc(x.ref)}</span>` : ''}`;
      return block(i, x.g || [], `第${'一二三四五'[i]}點 ${p.dbl ? '雙打' : '單打'}`, lineName(lu.a, i), lineName(lu.b, i), meta);
    }).join('');
  } else {
    // 個人賽：雙方姓名和總比數只在上方顯示一次，這裡只放各局比分
    body = block('x', m.rec.g || [], '各局比分', '', '', '', true);
  }
  return `<div class="modal"><div class="row"><h2>${EVENT_FULL[m.ev]} ${esc(m.no)}　成績</h2>${chip(m)}${m.status === 'playing' && m.tables.length ? `<span class="small muted">第 ${m.tables.join('、')} 桌</span>` : ''}<span class="spacer"></span><button class="btn ghost sm" data-close aria-label="關閉" title="關閉">${icon('close')}</button></div>
    <div class="duel"><div class="n r">${m.team ? esc(sideText(m.A, true)) : twoLine(sideText(m.A))}</div><div class="total" id="sc-total"></div><div class="n">${m.team ? esc(sideText(m.B, true)) : twoLine(sideText(m.B))}</div></div>
    ${!m.known && hasRec(m) ? `<div class="alertbox" style="margin:6px 0">對手還沒確定，但這場已經有比分紀錄（可能是前一輪的成績改過）。確認不是這兩位的比賽，可以清除這場紀錄。<div class="row" style="margin-top:6px"><span class="spacer"></span><button class="btn ghost sm danger" data-scwipe>清除這場紀錄</button></div></div>` : ''}
    ${refLine(m, byBtn)}${byLegend}
    <div class="pts">${body}</div>
    <p class="small" id="sc-note" style="color:var(--red);min-height:18px"></p>
    <div class="row">
      <span class="small muted">棄權：</span>
      <button class="btn ghost sm" data-wo="b" ${dis}>${esc(sideText(m.A, m.team))} 棄權</button>
      <button class="btn ghost sm" data-wo="a" ${dis}>${esc(sideText(m.B, m.team))} 棄權</button>
      ${m.rec.wo ? `<button class="btn ghost sm" data-wo="" ${dis}>取消棄權</button>` : ''}
      <span class="spacer"></span>
      ${m.status === 'done' ? '<span class="small muted">已完賽</span>' : `<button class="btn yellow" data-confirm id="sc-confirm">${icon('check')}結束本場</button>`}
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
  if (modal.kind === 'nudge') {
    const st = getState(), m = D.byId.get(modal.mid), S = modal.side === 'a' ? m.A : m.B, old = nudgeOf(st, m, modal.side);
    host.innerHTML = `<div class="modal-bg"><div class="modal" style="width:min(480px,100%)"><div class="row"><h2 style="margin:0">頁面通知</h2><span class="spacer"></span><button class="btn ghost sm" data-close aria-label="關閉">${icon('close')}</button></div>
      <p class="small muted">給 ${esc(m.ev)} ${esc(m.no)}　${esc(S.name)} 的通知。</p>
      ${old ? `<div class="alertbox small" style="margin-bottom:8px">${fmtTime(old.ts)} 已通知：${esc(old.text)}</div>` : ''}
      <textarea id="nudge-t" rows="3" style="width:100%">${esc(old ? old.text : nudgeDefault(st, m))}</textarea>
      <div class="row" style="margin-top:10px">${old ? `<button class="btn ghost sm" data-nudge-del>${icon('close')}收回通知</button>` : ''}<span class="spacer"></span><button class="btn" data-nudge-ok>${icon('bell')}${old ? '重新送出' : '送出通知'}</button></div></div></div>`;
    return;
  }
  if (modal.kind === 'rnote') {
    const r = (getState().receipt || {})[modal.unit] || {};
    host.innerHTML = `<div class="modal-bg"><div class="modal" style="width:min(460px,100%)"><div class="row"><h2 style="margin:0">${esc(modal.unit)} 備註</h2><span class="spacer"></span><button class="btn ghost sm" data-close aria-label="關閉">${icon('close')}</button></div>
      <p class="small muted">收據抬頭、統編或其他要求。</p><textarea id="rnote-t" rows="4" style="width:100%">${esc(r.note || '')}</textarea>
      <div class="row" style="justify-content:flex-end;margin-top:10px"><button class="btn" data-rnote-ok>${icon('check')}儲存</button></div></div></div>`;
    return;
  }
  if (modal.kind === 'aclwipe') {
    host.innerHTML = `<div class="modal-bg"><div class="modal" style="width:min(420px,100%)"><h2>清除線上點單權限</h2>
      <p>所有隊伍的聯絡人信箱、共同編輯與線上送出的點單都會刪除，且無法復原。已寫進排點的點單不受影響。</p>
      <div class="row" style="justify-content:flex-end;margin-top:14px"><button class="btn ghost" data-close>取消</button><button class="btn danger-solid" data-aclwipe-ok>確認清除</button></div></div></div>`;
    return;
  }
  if (modal.kind === 'wipe') {
    host.innerHTML = `<div class="modal-bg"><div class="modal" style="width:min(420px,100%)"><h2>清除全部資料</h2>
      <p>籤表、參賽名單、時間表、排點、成績、廣播、場控提醒、簽到紀錄、停車證與收據、線上點單權限與線上點單都會刪除，且無法復原。建議先下載備份檔。</p>
      <p class="small muted">歷屆名次、管理員與首頁主視覺不會刪除。</p>
      <label style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="wipe-staff" checked>保留裁判名單</label>
      <label style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="wipe-park" checked>保留停車證與收據</label>
      <div class="row" style="justify-content:flex-end;margin-top:14px"><button class="btn ghost" data-close>取消</button><button class="btn danger-solid" data-wipe-ok>確認清除</button></div></div></div>`;
    return;
  }
  if (modal.kind === 'tierules') {
    host.innerHTML = `<div class="modal-bg"><div class="modal" style="width:min(560px,100%)"><div class="row"><h2>團體賽預賽互咬規則</h2><span class="spacer"></span><button class="btn ghost sm" data-close aria-label="關閉" title="關閉">${icon('close')}</button></div>
      <ol style="padding-left:22px;line-height:1.8;margin:8px 0">
        <li><b>勝場數</b>多者名次在前。</li>
        <li>勝場相同的隊伍，<b>只看他們彼此之間的比賽</b>，依序比：點數勝率（勝點／敗點）、局數勝率（勝局／敗局）、分數勝率（得分／失分）。</li>
        <li>比出一部分高低後，仍然相同的隊伍重新從第 2 步比起，同樣只看他們彼此之間的比賽。</li>
        <li>只剩<b>兩隊</b>相同時，看兩隊之間的勝負。</li>
        <li>全部都相同，由<b>裁判長抽籤</b>決定。</li>
      </ol>
      <div class="tiebox"><b>例：三隊各 1 勝 1 敗</b><br>A 3:0 勝 B、B 3:1 勝 C、C 3:2 勝 A。<br>點數：A 5:3、C 4:5、B 3:4，勝率 A &gt; C &gt; B，名次為 A、C、B。</div>
      <p class="small muted" style="margin-top:10px">棄權：整場棄權算 3:0、每點 3:0、每局 11:0。</p>
      <p><a href="https://docs.google.com/presentation/d/1aShjDmIyPohnXjChnB2U_LsyDY85MJUb/edit?usp=sharing&amp;ouid=101657985704309911789&amp;rtpof=true&amp;sd=true" target="_blank" rel="noopener">開啟互咬計算簡報</a></p></div></div>`;
    return;
  }
  if (modal.kind === 'busy') {
    const rows = modal.busy.map(b => `<li>${esc(b.text)}${b.ref ? '，請先安排替換裁判' : ''}</li>`).join('');
    host.innerHTML = `<div class="modal-bg"><div class="modal" style="width:min(480px,100%)"><h2>派桌前提醒</h2>
      <ul style="margin:8px 0 0;padding-left:20px;line-height:1.8">${rows}</ul>
      <div class="row" style="justify-content:flex-end;margin-top:14px"><button class="btn ghost" data-close>取消</button><button class="btn" data-busyok>仍要派桌</button></div></div></div>`;
    return;
  }
  if (modal.kind === 'reclaim') {
    const lines = modal.tables.map(t => { const o = D.tables.get(t).m; return `第 ${t} 桌目前是 ${esc(shortEv(o))}（${names(o)}）的其中一桌，收回後改在第 ${o.tables.filter(x => Number(x) !== t).join('、')} 桌繼續。`; });
    host.innerHTML = `<div class="modal-bg"><div class="modal" style="width:min(460px,100%)"><h2>收回球桌</h2>${lines.map(l => `<p>${l}</p>`).join('')}
      <p class="small muted">這桌的裁判沒有紀錄比數，系統無法判斷是否打完，請確認後再收回。</p>
      <div class="row" style="justify-content:flex-end;margin-top:14px"><button class="btn ghost" data-close>取消</button><button class="btn" data-reclaim>收回並派桌</button></div></div></div>`;
    return;
  }
  if (modal.kind === 'unpub') {
    host.innerHTML = `<div class="modal-bg"><div class="modal" style="width:min(420px,100%)"><h2>取消公開${esc(curEv)}決賽籤表</h2>
      <p>即時賽程頁面的決賽籤表會回到空白，籤號資料不會刪除，之後可以再公開。</p>
      <div class="row" style="justify-content:flex-end;margin-top:14px"><button class="btn ghost" data-close>取消</button><button class="btn danger-solid" data-fpub="0" data-ok>確認取消公開</button></div></div></div>`;
    return;
  }
  const m = D.byId.get(modal.mid);
  host.innerHTML = `<div class="modal-bg">${modal.kind === 'score' ? scoreModal(m) : lineupModal(m)}</div>`;
  refreshScore();
}

/** 公布、取消公布或修改成績後，存一份到歷屆名次（清除全部資料不會刪到） */
function syncHistory() {
  const s = getState();
  if (!s.edition) return;
  saveHistory(histKey(s.edition), entryFromState(s)).catch(err => toast(`歷屆名次未存到：${err.message || err}`));
}

// ---------------- 籤表 ----------------
// 各項目籤表（和即時賽程同步），點場次可以看、改比分。不顯示桌次與排點。
let recEv = null;
let recZoom = 1;
function viewRec(s) {
  if (!recEv || !D.events.some(e => e.name === recEv)) recEv = D.events.length ? byPill(D.events)[0].name : null;
  const e = D.events.find(x => x.name === recEv);
  const shown = m => m.status !== 'wait' && m.status !== 'ready';
  const mark = m => (m.status === 'reported' ? 'rep' : m.status === 'playing' ? 'live' : '');
  const ko = e ? (e.team ? e.matches.filter(m => m.stage === 'F') : e.matches) : [];
  const t = e ? bracketSvg(ko, e.team, { pos: e.team, noTables: true }) : { svg: '' };
  return e ? `<div class="recwrap"><div class="pills" style="margin-bottom:10px">${byPill(D.events).map(x => `<button class="${x.name === recEv ? 'on' : ''}" data-recev="${x.name}">${x.name}</button>`).join('')}</div>
      ${e.team ? '<div class="legend" style="margin:0 0 8px"><span><span class="lg live"></span>進行中</span><span><span class="lg rep"></span>已打完、裁判尚未按結束</span></div>' : ''}
      ${e.team ? `<h3 class="rech">預賽</h3>${groupTables(e, shown, { mark })}` : ''}
      ${t.svg ? `<div class="row" style="margin-top:10px"><h3 class="rech" style="margin:0">${e.team ? '決賽' : '籤表'}</h3><span class="spacer"></span><button class="btn ghost sm" data-reczoom="-1" aria-label="縮小" title="縮小">${icon('zoomOut')}</button><button class="btn ghost sm" data-reczoom="1" aria-label="放大" title="放大">${icon('zoomIn')}</button></div><div class="treebox rectree">${t.svg.replace(/width="[\d.]+" height="[\d.]+"/, `width="${Math.round(t.width * recZoom)}" height="${Math.round(t.height * recZoom)}"`)}</div>` : ''}</div>` : '<div class="panel"><p class="muted">尚未匯入籤表。</p></div>';
}

// ---------------- 場控提醒 ----------------
// 由賽程時間表推算（notices.js），大會可以改時間、改文字、刪除或自己加；時間到在上方提醒。
const NOW = () => { const q = new URLSearchParams(location.search).get('now'); const d = q ? new Date(q) : new Date(); return Number.isNaN(d.getTime()) ? new Date() : d; };
const hm = t => { const [h, m] = String(t || '0:0').split(':').map(Number); return (h || 0) * 60 + (m || 0); };
const WEEK = '日一二三四五六';
function dayName(s, d) {
  const date = (s.dates || [])[d - 1];
  const x = date ? new Date(`${date}T00:00:00`) : null;
  return `第${'一二三四'[d - 1] || d}天${x && !Number.isNaN(x.getTime()) ? ` ${x.getMonth() + 1}/${x.getDate()}（${WEEK[x.getDay()]}）` : ''}`;
}
function noticeList(s) {
  const n = s.notices || {}, edit = n.edit || {}, del = new Set(n.del || []);
  const gen = buildNotices((s.sched && s.sched.slots) || []).map(x => ({ ...x, id: `${x.d}|${x.kind}|${x.text}` }));
  return gen.filter(x => !del.has(x.id)).map(x => (edit[x.id] ? { ...x, ...edit[x.id], edited: true } : x))
    .concat((n.add || []).map(x => ({ ...x, own: true })))
    .map(x => ({ ...x, min: hm(x.t) }))
    .sort((a, b) => a.d - b.d || a.min - b.min);
}
const dueAt = (s, x) => { const d = (s.dates || [])[x.d - 1]; if (!d) return null; const t = new Date(`${d}T${x.t}:00`).getTime(); return Number.isNaN(t) ? null : t; };
const EV_IN_TEXT = [['大專男團', '男團'], ['大專女團', '女團'], ['社會組', '社團']];
/** 催交點單時，列出有團賽但還沒勾「已簽到」的隊伍 */
function lineupMissing(s, x) {
  if (x.kind !== 'lineup' || !/催交|領決賽點單/.test(x.text)) return '';
  if (/決賽/.test(x.text)) return '';
  const codes = EV_IN_TEXT.filter(([w]) => x.text.includes(w)).map(([, c]) => c);
  const name = Object.fromEntries(EV_IN_TEXT.map(([w, c]) => [c, w]));
  const parts = codes.map(c => [c, missingLineup(s, c)]).filter(([, m]) => m.length);
  return parts.length ? parts.map(([c, m]) => `<div class="small" style="margin-top:4px"><b>${name[c]}</b>尚未領點單：${m.map(r => `${esc(r.label)}${r.note ? `（${esc(r.note)}）` : ''}`).join('、')}</div>`).join('')
    : '<div class="small" style="margin-top:4px">簽到處顯示各隊都已領點單。</div>';
}
/** 時間到 30 分鐘內、還沒按已處理的提醒 */
function dueNotices(s) {
  const now = NOW().getTime(), done = (s.notices || {}).done || {};
  return noticeList(s).filter(x => { const t = dueAt(s, x); return t && now >= t && now < t + 30 * 60000 && !done[x.id]; });
}
/** 場控提醒分頁上方：時間到、還沒按已處理的提醒（其他分頁只在分頁名稱旁顯示數字） */
function noticeBanner(s) {
  return dueNotices(s).map(x => `<div class="alertbox notice-due"><div class="row"><span class="tag-k ${x.kind}">${KIND_NAME[x.kind]}</span><b>${x.t}</b><span style="flex:1">${esc(x.text)}</span>
    <button class="btn sm" data-ndone="${esc(x.id)}">${icon('check')}已處理</button></div>${lineupMissing(s, x)}</div>`).join('');
}
let nday = null;
function viewNotice(s) {
  const list = noticeList(s), done = (s.notices || {}).done || {};
  const days = [...new Set(list.map(x => x.d))];
  const now = NOW().getTime();
  if (nday === null || !days.includes(nday)) {
    const today = (s.dates || []).findIndex(d => d && new Date(`${d}T00:00:00`).toDateString() === NOW().toDateString());
    nday = days.includes(today + 1) ? today + 1 : (days[0] || 1);
  }
  const secs = checkinSections(s), ci = s.checkin || {};
  const all = secs.flatMap(x => x.rows), ok = all.filter(r => ci[r.key] && ci[r.key].ok).length;
  const miss = missingLineup(s);
  const notes = all.filter(r => ci[r.key] && ci[r.key].note);
  const n = s.notices || {};
  const changed = (n.del || []).length || Object.keys(n.edit || {}).length;
  const rows = list.filter(x => x.d === nday);
  return `<div class="panel"><div class="row"><h2 style="margin:0">簽到與點單</h2><span class="spacer"></span>
      <a class="btn ghost sm" href="checkin.html${location.search}" target="_blank">開啟簽到處頁面</a></div>
    ${secs.length ? `<p class="small">已簽到 <b>${ok}</b> / ${all.length}；有團體賽還沒領點單 <b>${miss.length}</b> 隊。</p>
      ${secs.filter(x => x.team).map(x => { const m = missingLineup(s, x.code); return m.length ? `<p class="small muted" style="margin:2px 0"><b>${esc(x.title.replace(/\s*\d+[組隊]$/, ''))}</b>尚未領點單：${m.map(r => esc(r.label)).join('、')}</p>` : ''; }).join('')}
      ${notes.length ? `<div class="small"><b>簽到處備註</b><ul style="margin:4px 0 0;padding-left:18px">${notes.map(r => `<li>${esc(r.label)}：${esc(ci[r.key].note)}</li>`).join('')}</ul></div>` : ''}`
      : '<p class="small muted">匯入籤表後才會有簽到名單。</p>'}</div>
    <div class="panel"><div class="row"><h2 style="margin:0">大會注意事項</h2><span class="spacer"></span>
      ${changed ? '<button class="btn ghost sm" data-nreset>還原成系統推算</button>' : ''}
      <button class="btn sm" data-nprint ${list.length ? '' : 'disabled'}>${icon('download')}列印大會注意事項</button></div>
      <p class="small muted">${s.sched ? '依資料設定上傳的賽程時間表推算，實際依現場情形為主。' : '請先到資料設定上傳賽程時間表，系統才會推算提醒時間。也可以先自己新增。'}</p>
      ${days.length > 1 ? `<div class="pills" style="margin:8px 0">${days.map(d => `<button class="${d === nday ? 'on' : ''}" data-nday="${d}">${dayName(s, d)}</button>`).join('')}</div>` : ''}
      <table class="list ntab"><thead><tr><th style="width:96px">時間</th><th style="width:56px">類別</th><th>事項</th><th style="width:150px"></th></tr></thead><tbody>
      ${rows.map(x => {
        const t = dueAt(s, x);
        const st = done[x.id] ? 'done' : t && now >= t && now < t + 30 * 60000 ? 'due' : t && now >= t ? 'past' : '';
        return `<tr class="${st}"><td><input type="text" inputmode="numeric" maxlength="5" data-nt="${esc(x.id)}" value="${x.t}"></td><td><span class="tag-k ${x.kind}">${KIND_NAME[x.kind]}</span></td>
          <td><input type="text" data-ntext="${esc(x.id)}" value="${esc(x.text)}" style="width:100%"></td>
          <td class="nowrap"><button class="btn ghost sm" data-ndone="${esc(x.id)}">${done[x.id] ? `${fmtTime(done[x.id])} 已處理` : '已處理'}</button>
            <button class="btn ghost sm" data-ndel="${esc(x.id)}" title="刪除">${icon('close')}</button></td></tr>`;
      }).join('')}
      <tr><td><input type="text" inputmode="numeric" maxlength="5" id="nnew-t" placeholder="17:40"></td><td><select id="nnew-k">${Object.entries(KIND_NAME).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></td>
        <td><input type="text" id="nnew-x" placeholder="自己新增的提醒，例如 17:40 女團先叫" style="width:100%"></td><td><button class="btn ghost sm" data-nadd>${icon('plus')}新增</button></td></tr>
      </tbody></table></div>`;
}
function noticeClick(d) {
  const s = getState();
  if (d.nday) { nday = Number(d.nday); render(); return true; }
  if (d.ndone) { update(t => { const n = t.notices = t.notices || {}; n.done = n.done || {}; if (n.done[d.ndone]) delete n.done[d.ndone]; else n.done[d.ndone] = Date.now(); }); return true; }
  if (d.ndel) { update(t => { const n = t.notices = t.notices || {}; if (d.ndel.startsWith('own-')) n.add = (n.add || []).filter(x => x.id !== d.ndel); else n.del = [...new Set([...(n.del || []), d.ndel])]; }); return true; }
  if ('nreset' in d) { update(t => { const n = t.notices = t.notices || {}; delete n.del; delete n.edit; }); return true; }
  if ('nadd' in d) {
    const mm = $('#nnew-t').value.trim().replace('：', ':').match(/^(\d{1,2}):?(\d{2})$/);
    const tm = mm && Number(mm[1]) < 24 && Number(mm[2]) < 60 ? `${mm[1].padStart(2, '0')}:${mm[2]}` : '', tx = $('#nnew-x').value.trim();
    if (!tm || !tx) { toast('請填時間（例如 17:40）和事項'); return true; }
    update(t => { const n = t.notices = t.notices || {}; n.add = (n.add || []).concat({ id: `own-${Date.now()}`, d: nday || 1, t: tm, kind: $('#nnew-k').value, text: tx }); });
    return true;
  }
  if ('nprint' in d) {
    const html = noticesHtml(`${s.edition || ''}${s.title || '交大盃'} 大會注意事項時間表`, noticeList(s), dd => dayName(s, dd));
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
    window.open(url, '_blank');
    return true;
  }
  return false;
}
function noticeChange(t) {
  const id = t.dataset.nt || t.dataset.ntext;
  if (!id) return false;
  const field = t.dataset.nt ? 't' : 'text';
  let v = t.value.trim();
  if (field === 't') { const m = v.replace('：', ':').match(/^(\d{1,2}):?(\d{2})$/); v = m && Number(m[1]) < 24 && Number(m[2]) < 60 ? `${m[1].padStart(2, '0')}:${m[2]}` : ''; if (!v) toast('時間請輸入像 17:40 這樣的格式'); }
  if (!v) { render(); return true; }
  update(st => {
    const n = st.notices = st.notices || {};
    if (id.startsWith('own-')) { const x = (n.add || []).find(y => y.id === id); if (x) x[field] = v; }
    else { n.edit = n.edit || {}; n.edit[id] = { ...(n.edit[id] || {}), [field]: v }; }
  });
  return true;
}

// ---------------- 決賽抽籤 ----------------
/** 同勝場的組別：列出互咬的計算過程 */
function tieNote(g) {
  const lines = [...new Set(g.table.rows.filter(r => r.tie).flatMap(r => r.why || []))];
  return lines.length ? `<div class="tiebox">${lines.map(l => `<div>${esc(l)}</div>`).join('')}</div>` : '';
}
/** 決賽籤號的問題：空字串代表沒問題或還沒填 */
function fposErr(e, se, g, k) {
  const fp = se.finalPos || {}, half = e.final.size / 2;
  const p = Number(fp[g.letter + k]);
  if (!p) return '';
  if (p < 1 || p > e.final.size) return '超出範圍';
  if (Object.values(fp).filter(x => Number(x) === p).length > 1) return '籤號重複';
  if (e.final.mark.get(p) !== k) return `此為${e.final.mark.get(p)}軍籤位`;
  const other = Number(fp[g.letter + (k === '冠' ? '亞' : '冠')]);
  if (other && (other <= half) === (p <= half)) return '同組冠亞軍須分在上下半區';
  return '';
}
/** 每組冠亞軍隊伍都選好、籤號都填了且沒有問題 */
function drawDone(e, se) {
  return !!(se && e.final && e.groups.length) && e.groups.every(g => g.rank && g.rank.c && g.rank.r && ['冠', '亞'].every(k => Number((se.finalPos || {})[g.letter + k]) && !fposErr(e, se, g, k)));
}
const REMIND_MS = 30 * 60 * 1000;
/** 抽完的時間記下來；抽完超過 30 分鐘還沒公開就提醒 */
function drawReminders(s) {
  const late = [];
  D.events.filter(e => e.team && e.final).forEach(e => {
    const se = s.events.find(x => x.name === e.name);
    const done = drawDone(e, se);
    if (done && !se.finalDone && !se.finalPub) setTimeout(() => update(t => { const x = t.events.find(y => y.name === e.name); if (x && !x.finalDone) x.finalDone = Date.now(); }));
    else if (!done && se && se.finalDone) setTimeout(() => update(t => { const x = t.events.find(y => y.name === e.name); if (x) delete x.finalDone; }));
    if (done && se.finalDone && !se.finalPub && Date.now() - se.finalDone > REMIND_MS) late.push(e.name);
  });
  return late.length ? `<div class="alertbox remind"><b>${late.join('、')}決賽籤已全部抽完超過 30 分鐘，尚未公開到即時賽程。</b>
    ${late.map(n => `<button class="btn sm" data-gopub="${esc(n)}">前往${esc(n)}決賽抽籤</button>`).join('')}</div>` : '';
}
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
  const check = (g, k) => fposErr(e, se, g, k);
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
        ${!cur && sug ? `<div class="small muted">名次試算：${esc(sug.team)}${sug.lot ? '（需由裁判長抽籤）' : ''}</div>` : ''}</td>
      <td class="${cls}"><div class="seg">${['到', '代抽', '未到'].map(x => `<button class="${roll === x ? 'on' : ''}${x === '未到' ? ' no' : ''}" data-rollset="${g.letter + k}|${x}">${x}</button>`).join('')}</div></td>
      <td class="${cls}"><input type="text" inputmode="numeric" style="width:56px" data-fpos="${g.letter + k}" value="${(se.finalPos || {})[g.letter + k] || ''}">
        ${err ? `<div class="small" style="color:var(--red)">${err}</div>` : k === '亞' && hint(g) && !(se.finalPos || {})[g.letter + k] ? `<div class="small muted">應抽${hint(g)}</div>` : ''}</td>`;
  };
  const allDone = e.groups.every(g => g.table.all);
  const finals = e.matches.filter(m => m.stage === 'F' && m.roundIdx === 0);
  return `<div class="panel"><div class="row"><div class="pills">${teams.map(x => `<button class="${x.name === curEv ? 'on' : ''}" data-ev="${x.name}">${x.name}</button>`).join('')}</div>
      <span class="spacer"></span><button class="btn ghost sm" data-tierules>互咬規則</button></div>
    <ul class="small" style="margin:6px 0 10px;padding-left:20px"><li>冠軍籤位：${marks.filter(x => x[1] === '冠').map(x => x[0]).join('、')}</li><li>亞軍籤位：${marks.filter(x => x[1] === '亞').map(x => x[0]).join('、')}</li><li>上半區：1 - ${half}、下半區：${half + 1} - ${e.final.size}</li></ul>
    <div style="overflow-x:auto"><table class="list drawt"><thead><tr><th rowspan="2">組別</th><th rowspan="2">預賽戰績</th><th colspan="3" class="gc first gtop">冠軍</th><th colspan="3" class="gr first gtop">亞軍</th></tr>
      <tr><th class="gc first">隊伍</th><th class="gc">點名</th><th class="gc">籤號</th><th class="gr first">隊伍</th><th class="gr">點名</th><th class="gr">籤號</th></tr></thead><tbody>
    ${e.groups.map(g => `<tr><td><b>${g.letter}</b></td><td class="small">${g.table.rows.map(r => `<div>${r.rank}. ${esc(r.team)} ${r.w} 勝 ${r.l} 敗${g.table.all && r.lot ? ' <span style="color:var(--red)">需抽籤</span>' : ''}</div>`).join('')}
      ${g.table.all ? tieNote(g) : ''}${g.table.all ? '' : '<div class="muted">預賽尚未全部確認</div>'}</td>${cell(g, '冠')}${cell(g, '亞')}</tr>`).join('')}
    </tbody></table></div></div>
    <div class="panel"><div class="row"><h2 style="margin:0">決賽籤表</h2><span class="spacer"></span>
      ${se.finalPub ? `<span class="small muted">${fmtTime(se.finalPub)} 已公開到即時賽程</span><button class="btn ghost sm" data-fpub="0">取消公開</button>`
        : `${drawDone(e, se) ? '' : '<span class="small muted">全部抽完後才能公開</span>'}<button class="btn sm" data-fpub="1" ${drawDone(e, se) ? '' : 'disabled'}>${icon('check')}確定並公開</button>`}</div>
    <div class="treebox" style="margin-top:10px">${bracketSvg(e.matches.filter(m => m.stage === 'F'), true, { pos: true }).svg}</div></div>
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
/**
 * 誰現在不能當裁判：
 * 比賽中＝正在打；即將出賽＝「進行中的項目」裡還有比賽要打（項目已開打且還沒打完）；擔任裁判＝正在某桌當裁判。
 * 其他項目還沒開打的人、已經淘汰的人都算可以當裁判。
 */
const refBuf = s => Math.max(1, Number((s.refOpt || {}).buf) || s.tables || 24);
/** 每個人接下來還沒打的場次（依表定時間排序），給「人手不足時可支援」的提示用 */
function upcomingOf(s) {
  const out = new Map();
  const undone = m => m.known && !m.rec.start && m.status !== 'done' && m.status !== 'reported';
  D.byId.forEach(m => {
    if (!undone(m)) return;
    const e = s.events.find(x => x.name === m.ev);
    const ppl = m.team ? [m.A, m.B].flatMap(x => ((e && e.rosters && e.rosters[x && x.name]) || []).flat())
      : [m.A, m.B].flatMap(x => String((x && x.name) || '').split(/[\/／]/)).map(x => x.trim().split(/\s+/).pop()).filter(Boolean);
    const sl = slotOf(s.sched, m), at = sl ? dueAt(s, { d: sl.d, t: sl.s }) : null;
    const text = `${sl ? `${dayLabel(s, sl.d, '')} ${sl.s}`.trim() : '未排時間'}　${m.ev} ${m.no}`;
    ppl.forEach(n => { const k = nm(n); if (!out.has(k)) out.set(k, []); out.get(k).push({ at: at || Infinity, num: m.num, team: !!m.team, text }); });
  });
  // 只列下一場；同一時段個人賽和團體賽都有時兩場都列（最多兩行）
  out.forEach((l, k) => { l.sort((a, b) => a.at - b.at || a.num - b.num); const f = l[0]; const g = l.find(x => x.team !== f.team && x.at === f.at && x.at !== Infinity); out.set(k, g ? [f, g] : [f]); });
  return out;
}
function busyPeople(s) {
  // now：正在比賽；soon：馬上要打（暫不可擔任）；later：還有比賽但不是馬上（人手不足時可支援）；onDuty：正在當裁判
  const now = new Map(), soon = new Map(), later = new Map();
  const people = m => {
    if (!m.team) return [m.A, m.B].flatMap(x => String((x && x.name) || '').split(/[\/／]/)).map(x => x.trim()).filter(Boolean);
    const e = s.events.find(x => x.name === m.ev);
    return [m.A, m.B].flatMap(x => ((e && e.rosters && e.rosters[x && x.name]) || []).flat());
  };
  const undone = m => m.known && !m.rec.start && m.status !== 'done' && m.status !== 'reported';
  // 進行中的項目：已有場次開打，或依時間表 10 分鐘內就要開始
  const t0 = NOW().getTime(), active = new Set();
  D.events.forEach(e => {
    const st = e.matches.map(m => m.status);
    const started = st.includes('playing') || st.some(x => x === 'done' || x === 'reported');
    const soonBySched = e.matches.some(m => { if (!undone(m)) return false; const sl = slotOf(s.sched, m); const at = sl ? dueAt(s, { d: sl.d, t: sl.s }) : null; return at && at - t0 <= 10 * 60000; });
    if ((started && st.some(x => x !== 'done')) || soonBySched) active.add(e.name);
  });
  // 個人賽：依叫場順序（輪次表），接下來的前 N 場算馬上要打（預設＝球桌數，大約是接下來 20～30 分鐘會叫到的場次），後面的算還沒輪到
  const N = refBuf(s);
  const indOn = D.events.some(e => !e.team && active.has(e.name));
  const next3 = new Set(indOn ? callQueue(D).slice(0, N).map(m => m.id) : []);
  if (indOn) D.events.forEach(e => { if (!e.team) active.add(e.name); });
  const put = (map, n, m) => { const k = nm(n); if (!map.has(k)) map.set(k, m); };
  D.byId.forEach(m => {
    if (m.status === 'playing') { people(m).forEach(n => put(now, n, m)); return; }
    if (!active.has(m.ev) || !undone(m)) return;
    const urgent = m.team ? m.status === 'ready' : next3.has(m.id);
    people(m).forEach(n => put(urgent ? soon : later, n, m));
  });
  const onDuty = new Map();
  D.tables.forEach((x, t) => { if (x.m.status === 'playing') { const n = (x.m.rec.refs || {})[t]; if (n) onDuty.set(nm(n), { t, m: x.m }); } });
  return { now, soon, later, onDuty };
}
/** 進行中場次的裁判替換請求 */
function swapList() {
  const out = [];
  D.byId.forEach(m => { if (m.status !== 'playing') return; Object.entries(m.rec.swap || {}).forEach(([t, sw]) => { if (sw) out.push({ m, t: Number(t), sw }); }); });
  return out.sort((a, b) => a.sw.ts - b.sw.ts);
}
function swapPanel() {
  const l = swapList();
  if (!l.length) return '';
  return `<div class="panel"><h2>裁判替換請求</h2>${l.map(({ m, t, sw }) => `<div class="alertbox"><div class="small ameta">${fmtTime(sw.ts)}</div>
    <div><b>${t} 桌 ${esc(sw.by)}</b> 請求其他裁判支援替換（${esc(sw.why)}）</div>
    <div class="row" style="margin-top:4px">${sw.sent ? `<span class="small" style="color:var(--green)">${fmtTime(sw.sent)} 已派出替換裁判</span>` : ''}<span class="spacer"></span>
      ${sw.sent ? '' : `<button class="btn ghost sm" data-swapsent="${esc(m.id)}|${t}">${icon('check')}已派出替換裁判</button>`}
      <button class="btn ghost sm" data-swapclear="${esc(m.id)}|${t}" title="移除這則請求">${icon('close')}</button></div></div>`).join('')}</div>`;
}
const ORGS = ['交大', '陽明', '香山', '體資', '大會'];
/** 不列入可擔任裁判：大會人員；陽明不當裁判時也排除陽明 */
const notRef = (s, n) => { const g = orgOf(s, n); return g === '大會' || (g === '陽明' && (s.refOpt || {}).ym === 'off'); };
const orgOf = (s, n) => (s.staffOrg || {})[n] || '未分組';
/** 裁判名單文字：【交大】這種標題下面接姓名，一行可以放好幾個名字（空白、頓號、斜線分隔） */
function parseStaff(text) {
  const names = [], org = {};
  let g = '';
  const add = (str, grp) => str.split(/[\s,，、\/／+＋]+/).map(x => x.replace(/[（(].*?[）)]/g, '').replace(/[：:]+$/, '').trim()).filter(x => x && !/^[【\[]/.test(x) && !/^[\p{P}\p{S}]+$/u.test(x)).forEach(n => {
    if (!names.includes(n)) names.push(n);
    if (grp && !org[n]) org[n] = grp;
  });
  String(text).split('\n').forEach(line => {
    let l = line.trim();
    if (!l) return;
    // 【交大】這種標題換校區；【男單】這種項目標題不算校區
    const h = l.match(/^[【\[]\s*(.+?)\s*[】\]]\s*(.*)$/);
    if (h) { g = [...ORGS, '未分組'].includes(h[1]) ? h[1] : ''; l = h[2]; if (!l) return; }
    // 「交大： 名字 名字 陽明： 名字」同一行可以有好幾段；其他「隊名：」前綴只拿名字、不改校區
    l.split(/([^\s：:]+)\s*[：:]/).forEach((part, i, arr) => {
      if (i % 2 === 1) { if ([...ORGS, '未分組'].includes(part)) g = part; else g = ''; return; }
      const label = i > 0 ? arr[i - 1] : null;
      add(part, label && !ORGS.includes(label) && label !== '未分組' ? '' : g);
    });
  });
  return { names, org };
}
function staffText(s) {
  const staff = s.staff || [];
  const groups = [...ORGS, ...new Set(staff.map(n => orgOf(s, n)).filter(g => !ORGS.includes(g)))];
  return groups.map(g => { const list = staff.filter(n => orgOf(s, n) === g); return list.length ? `【${g}】\n${list.join('\n')}` : ''; }).filter(Boolean).join('\n\n');
}
const orgTag = (s, n) => { const g = orgOf(s, n); return `<span class="otag o-${esc(g)}">${esc(g)}</span>`; };
/** 裁判名單編輯：裁判分頁與資料設定共用 */
// ---------------- 香山負責的球桌 ----------------
// 每行：日期 時段 桌號，例如「12/5 08:30-13:30 1-11」；香山一律從第 1 桌算起
const XS_DEFAULT = '12/5 08:30-13:30 1-11\n12/5 13:30-17:40 1-8\n12/6 08:30-13:40 1-10\n12/6 14:10-15:40 1-6';
function xsSlots(s) {
  const text = (s.refOpt || {}).xs ?? XS_DEFAULT;
  return String(text).split('\n').map(l => l.trim().match(/^(\d{1,2})\/(\d{1,2})\s+(\d{1,2}:\d{2})\s*[-~～]\s*(\d{1,2}:\d{2})\s+(\d+)\s*[-~～]\s*(\d+)/)).filter(Boolean)
    .map(([, mo, d, a, b, x, y]) => ({ mo: +mo, d: +d, a: a.padStart(5, '0'), b: b.padStart(5, '0'), from: +x, to: +y }));
}
/** 現在這個時段香山負責哪幾桌；也回傳今天下一個時段 */
function xsNow(s) {
  const now = NOW(), hm2 = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const today = xsSlots(s).filter(x => x.mo === now.getMonth() + 1 && x.d === now.getDate()).sort((p, q) => p.a.localeCompare(q.a));
  return { cur: today.find(x => hm2 >= x.a && hm2 < x.b) || null, next: today.find(x => x.a > hm2) || null, today };
}
function xsBanner(s) {
  const { cur, next, today } = xsNow(s), T = s.tables || 24, links = (s.refOpt || {}).links || {};
  const lk = [['自己人賽程', links.self], ['球隊裁判紀錄表', links.log]].filter(([, u]) => u).map(([t, u]) => `<a href="${esc(u)}" target="_blank" rel="noopener">${t}</a>`).join('　');
  const msg = cur ? `<b>${cur.a}-${cur.b}</b> 香山負責第 <b>${cur.from}-${cur.to}</b> 桌，我們負責第 <b>${cur.to + 1}-${T}</b> 桌`
    : today.length ? '目前時段沒有香山裁判，全部球桌由我們負責' : '今天沒有安排香山裁判';
  return `<div class="xsbar">${msg}${next ? `<span class="small muted">　${next.a} 起香山改為第 ${next.from}-${next.to} 桌</span>` : ''}</div>`;
}
function staffEditor(s, where) {
  const ym = (s.refOpt || {}).ym === 'off' ? 'off' : 'on';
  const rc = s.refcode;
  const links = (s.refOpt || {}).links || {};
  const sec = (title, body, first) => `<section class="refsec${first ? ' first' : ''}"><h3>${title}</h3>${body}</section>`;
  const linkRow = (k, label) => {
    const url = links[k] || '';
    const a = url ? `<a href="${esc(url)}" target="_blank" rel="noopener">${icon('list')}${label}</a>` : `<span class="muted">${label}</span>`;
    return where === 'set'
      ? `<div class="row" style="margin-bottom:6px"><label class="small" style="width:110px" for="lk-${k}">${label}</label><input type="url" id="lk-${k}" data-link="${k}" value="${esc(url)}" placeholder="Google 試算表網址" style="flex:1;min-width:200px">${url ? `<a class="btn ghost sm" href="${esc(url)}" target="_blank" rel="noopener">開啟</a>` : ''}</div>`
      : `<div class="reflink">${a}${url ? '' : '<span class="small muted">　尚未設定</span>'}</div>`;
  };
  return sec('裁判密碼', `<p class="small muted">設定後，裁判要輸入密碼才能記分。密碼外流時按「更換」，所有裁判都要重新輸入。</p>
    <div class="row">${rc ? `<span>目前密碼 <b style="font-size:20px;letter-spacing:2px">${esc(rc)}</b></span>` : '<span class="small" style="color:var(--red)">尚未設定，任何拿到連結的人都能記分</span>'}
      <input type="text" inputmode="numeric" id="rc-new" placeholder="自訂，留空自動產生 6 位數" maxlength="12" style="width:220px">
      <button class="btn sm" data-refcode>${icon('shuffle')}${rc ? '更換' : '設定'}</button>
      ${rc ? `<button class="btn ghost sm" data-refcode-off>取消密碼</button>` : ''}</div>`, true)
    + sec('自己人裁判名單', `<p class="small muted">用【交大】【陽明】【香山】【體資】【大會】當標題，標題下面接姓名，一行一位。</p>
    <textarea data-staff rows="16" style="width:100%" placeholder="【交大】&#10;王小明 李大華&#10;【陽明】&#10;【香山】&#10;【大會】">${esc(staffText(s))}</textarea>`)
    + sec('分類定義', `<p class="small" style="margin:0;line-height:2.2">個人賽接下來 <input type="number" min="1" max="99" data-refbuf value="${refBuf(s)}" style="width:64px;display:inline-block;vertical-align:middle"> 場內會叫到的人，不列入可擔任裁判（預設＝球桌數）</p>
    <div class="pills" style="margin-top:8px">${[['on', '陽明會當裁判'], ['off', '陽明不當裁判']].map(([k, t]) => `<button class="${ym === k ? 'on' : ''}" data-ymopt="${k}">${t}</button>`).join('')}</div>`)
    + sec('香山負責的球桌', `<p class="small muted">例如「12/5 08:30-13:30 1-11」。香山從第 1 桌算起。</p>
    <textarea data-xs rows="5" style="width:100%">${esc((s.refOpt || {}).xs ?? XS_DEFAULT)}</textarea>`)
    + sec('參考連結', `${where === 'set' ? '' : '<p class="small muted">網址在「資料設定 &gt; 裁判資料設定」輸入。</p>'}${linkRow('self', '自己人賽程')}${linkRow('log', '球隊裁判紀錄表')}`);
}
function viewRefs(s) {
  const cnt = refCounts();
  const staff = s.staff || [];
  // 舊版名單整份貼上時沒有拆開，這裡自動重新整理一次
  if (!staffFixed && staff.some(n => /[【】：:\/／+＋]/.test(n))) {
    staffFixed = true;
    const p = parseStaff(staff.join('\n').replace(/\n([：:])/g, '$1'));
    setTimeout(() => update(st => { st.staff = p.names; st.staffOrg = { ...(st.staffOrg || {}), ...p.org }; }));
  }
  if (staffOpen == null) staffOpen = !staff.length;
  const { now, soon, later, onDuty } = busyPeople(s);
  const sub = `<div class="row" style="margin-bottom:12px"><div class="pills">${[['avail', '可擔任裁判'], ['count', '擔任次數']].map(([k, t]) => `<button class="${refTab === k ? 'on' : ''}" data-reftab="${k}">${t}</button>`).join('')}</div><span class="spacer"></span>
    ${s.refcode ? `<span class="small">裁判密碼 <b style="font-size:16px;letter-spacing:1px">${esc(s.refcode)}</b></span>` : `<span class="small" style="color:var(--red)">未設定裁判密碼</span>`}
    <button class="btn ghost sm" data-staffopen aria-expanded="${staffOpen}">${icon(staffOpen ? 'chevup' : 'chevdown')}${staffOpen ? '收合裁判資料設定' : '裁判資料設定'}</button></div>`;
  const editor = `<div><div class="panel"><div class="row"><h2 style="margin:0">裁判資料設定</h2></div>
      ${staffEditor(s, 'tab')}</div></div>`;
  const wrap = body => `${sub}<div class="${staffOpen ? 'desk' : ''}"><div>${body}</div>${staffOpen ? editor : ''}</div>`;
  if (refTab === 'count') {
    const names = [...new Set([...staff, ...cnt.keys()])].sort((a, b) => (cnt.get(b) || 0) - (cnt.get(a) || 0) || a.localeCompare(b, 'zh-Hant'));
    return wrap(`<div class="panel"><h2>擔任次數</h2><p class="small muted">個人賽一場計一次，團體賽一點計一次。</p>
      ${names.length ? `<table class="list" style="max-width:480px"><thead><tr><th>姓名</th><th>次數</th></tr></thead><tbody>${names.map(n => `<tr><td>${orgTag(s, n)}${esc(n)}</td><td>${cnt.get(n) || 0}</td></tr>`).join('')}</tbody></table>` : '<p class="muted small">尚無紀錄。</p>'}</div>`);
  }
  const k = nm;
  const why = n => (onDuty.has(k(n)) ? `正在第 ${onDuty.get(k(n)).t} 桌擔任裁判` : now.has(k(n)) ? `正在比賽（${shortEv(now.get(k(n)))}）` : soon.has(k(n)) ? `${soon.get(k(n)).team ? '下一場要比賽' : `${refBuf(s)} 場內會叫到`}（${shortEv(soon.get(k(n)))}）` : '');
  const byCnt = (a, b) => (cnt.get(a) || 0) - (cnt.get(b) || 0);
  const pool = staff.filter(n => !notRef(s, n));
  // 體資：有缺才請他們支援，放在「人手不足時可支援」
  const backup = n => orgOf(s, n) === '體資';
  const free = pool.filter(n => !why(n) && !backup(n) && !later.has(k(n))).sort(byCnt);
  // 人手不足時：所屬項目進行中、但自己的場次還沒輪到的人也可以支援
  const spare = pool.filter(n => !why(n) && (backup(n) || later.has(k(n)))).sort(byCnt);
  // 暫不可擔任：依項目、場次排序
  const whyM = n => (onDuty.has(k(n)) ? onDuty.get(k(n)).m : now.get(k(n)) || soon.get(k(n)));
  const mKey = m => (m ? PILL_ORDER.indexOf(m.ev) * 1e6 + stageOrder(m) * 1e3 + m.num : 9e9);
  const rest = pool.filter(n => why(n) && !spare.includes(n)).sort((a, b) => mKey(whyM(a)) - mKey(whyM(b)));
  const groups = [...ORGS, ...new Set(staff.map(n => orgOf(s, n)).filter(g => !ORGS.includes(g)))];
  const plan = upcomingOf(s);
  const tip = n => { const l = plan.get(k(n)) || []; return l.length ? ` class="tipcell" tabindex="0" data-tip="${esc(l.map(x => x.text).join('\n'))}"` : ''; };
  const cols = (list, withTip) => `<div class="orgcols">${groups.map(g => [g, list.filter(n => orgOf(s, n) === g)]).filter(([, l]) => l.length).map(([g, l]) => `<div><h3><span class="otag o-${esc(g)}">${esc(g)}</span>${l.length} 位</h3><table class="list"><tbody>${l.map(n => `<tr><td${withTip ? tip(n) : ''}>${esc(n)}</td><td class="muted small" style="text-align:right">${cnt.get(n) || 0} 次</td></tr>`).join('')}</tbody></table></div>`).join('')}</div>`;
  // 球桌橫向排列，可以左右滑：每桌顯示裁判姓名與校區
  const swaps = new Map(swapList().map(x => [x.t, x.sw]));
  const xs = xsNow(s).cur;
  const strip = `<div class="panel"><h2>各桌裁判</h2>${xsBanner(s)}<div class="refstrip">${Array.from({ length: s.tables || 24 }, (_, i) => i + 1).map(t => {
    const x = D.tables.get(t), on = x && x.m.status === 'playing', n = on ? (x.m.rec.refs || {})[t] : '', sw = swaps.get(t);
    const isXs = xs && t >= xs.from && t <= xs.to;
    return `<div class="rcell ${on ? (n ? 'on' : 'none') : 'idle'} ${sw ? 'swap' : ''} ${isXs ? 'xs' : ''}"><b>${t}${isXs ? '<span class="xst">香山</span>' : ''}</b>${on ? (n ? `<span>${staff.includes(n) ? orgTag(s, n) : ''}</span><span class="rn">${esc(n)}</span>` : '<span class="rn">未登記</span>') : '<span class="rn muted">空桌</span>'}${sw ? `<small>請求替換</small>` : ''}</div>`;
  }).join('')}</div></div>`;
  return wrap(`${handPanel(s)}${strip}${swapPanel()}
    <div class="panel"><h2>可擔任裁判（${free.length}）</h2>
      ${staff.length ? (free.length ? cols(free) : '<p class="small muted">目前沒有空閒的裁判。</p>') : '<p class="muted small">請先按「裁判資料設定」輸入自己人裁判名單，香山裁判也在那裡新增。</p>'}</div>
    ${spare.length ? `<div class="panel"><h2>人手不足時可支援（${spare.length}）</h2><p class="small muted">還沒要打的人和體資。滑鼠移到姓名上（平板點一下姓名）可以看到他的下一場。</p>${cols(spare, true)}</div>` : ''}
    ${rest.length ? `<div class="panel"><h2>暫不可擔任（${rest.length}）</h2><table class="list restt"><tbody>${rest.map(n => `<tr><td>${orgTag(s, n)}${esc(n)}</td><td class="muted">${why(n)}</td><td class="small muted" style="text-align:right">${cnt.get(n) || 0} 次</td></tr>`).join('')}</tbody></table></div>` : ''}
    ${refDefPanel()}
    ${staffOpen ? `<div class="panel"><h2>當天新增香山裁判</h2><div class="row"><input type="text" id="xs-name" placeholder="姓名，多位用空白分隔" style="flex:1;min-width:180px"><button class="btn sm" data-addxs>${icon('plus')}新增</button></div></div>` : ''}`);
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
    }).join('')}</tbody></table></div>${histPanel()}`;
}

// ---------------- 歷屆名次（可修改，存到資料庫 history） ----------------
let histSaved = null, histSel = null, histDraft = null;
const RANKS = ['冠軍', '亞軍', '季軍', '殿軍'];
function histPanel() {
  if (histSaved === null) { histSaved = {}; loadHistory().then(h => { histSaved = h; render(); }).catch(() => {}); }
  const list = mergeHistory(histSaved, null);
  if (!histDraft) {
    const y = list.find(x => x.edition === histSel) || list[0];
    if (!y) return '';
    histSel = y.edition; histDraft = JSON.parse(JSON.stringify(y));
  }
  const h = histDraft;
  const inFile = HISTORY.some(y => y.edition === h.edition);
  const saved = !h.isNew && histSaved[histKey(h.edition)] != null;
  return `<div class="panel"><div class="row"><h2 style="margin:0">歷屆名次</h2><span class="spacer"></span><button class="btn ghost sm" data-hnew>${icon('plus')}新增一屆</button></div>
    <p class="small muted">今年的名次在上方公布成績時會自動存入。</p>
    <div class="pills" style="margin:8px 0 12px">${list.map(y => `<button class="${!h.isNew && y.edition === h.edition ? 'on' : ''}" data-hsel="${esc(y.edition)}">${y.year}</button>`).join('')}${h.isNew ? '<button class="on">新的一屆</button>' : ''}</div>
    <div class="row" style="margin-bottom:10px"><label>年份 <input type="number" data-hyear value="${h.year}" style="width:90px"></label>
      <label>屆數 ${h.isNew ? `<input type="text" data-hed value="${esc(h.edition)}" placeholder="例如 第十四屆" style="width:140px">` : `<b>${esc(h.edition)}</b>`}</label></div>
    <div class="agrid hedit">${ANN_ORDER.map(ev => `<div class="ab"><h3>${ANN_NAME[ev]}</h3>
      ${(h.p[ev] || []).map(([r, v], i) => `<div class="row hrow"><select data-hd="${ev}|${i}|0">${RANKS.map(x => `<option ${x === r ? 'selected' : ''}>${x}</option>`).join('')}</select>
        <input type="text" data-hd="${ev}|${i}|1" value="${esc(v)}" placeholder="學校 姓名或隊名"><button class="btn ghost sm" data-hdel="${ev}|${i}" title="刪除這一列">${icon('close')}</button></div>`).join('')}
      <button class="btn ghost sm" data-hadd="${ev}">${icon('plus')}新增一列</button></div>`).join('')}</div>
    <div class="row" style="margin-top:12px"><button class="btn sm" data-hsave>${icon('check')}儲存</button>
      <button class="btn ghost sm" data-hcancel>放棄修改</button><span class="spacer"></span>
      ${saved ? `<button class="btn ghost sm danger" data-hrevert>${inFile ? '還原成原始資料' : '刪除這一屆'}</button>` : ''}</div></div>`;
}
function histClick(d) {
  if ('hnew' in d) { histDraft = { year: new Date().getFullYear(), edition: '', p: {}, isNew: true }; }
  else if (d.hsel) { histSel = d.hsel; histDraft = null; }
  else if ('hcancel' in d) { histDraft = null; }
  else if (d.hadd) { (histDraft.p[d.hadd] = histDraft.p[d.hadd] || []).push([RANKS[Math.min(3, histDraft.p[d.hadd].length)], '']); }
  else if (d.hdel) { const [ev, i] = d.hdel.split('|'); histDraft.p[ev].splice(Number(i), 1); }
  else if ('hsave' in d) {
    const h = histDraft;
    const ed = String(h.edition || '').trim();
    if (!ed) { toast('請填屆數'); return; }
    if (h.isNew && mergeHistory(histSaved, null).some(y => y.edition === ed)) { toast(`${ed} 已經有資料，請直接點年份修改`); return; }
    const p = {};
    ANN_ORDER.forEach(ev => { const rows = (h.p[ev] || []).map(([r, v]) => [r, String(v).trim()]).filter(([, v]) => v); if (rows.length) p[ev] = rows; });
    const out = { year: Number(h.year) || new Date().getFullYear(), edition: ed, p };
    const key = histKey(ed);
    saveHistory(key, out).then(() => { histSaved = { ...histSaved, [key]: JSON.stringify(out) }; histSel = ed; histDraft = null; render(); toast('歷屆名次已儲存'); })
      .catch(err => toast(`儲存失敗：${err.message || err}`));
    return;
  } else if ('hrevert' in d) {
    const key = histKey(histDraft.edition);
    saveHistory(key, null).then(() => { const n = { ...histSaved }; delete n[key]; histSaved = n; histDraft = null; render(); toast('已更新'); })
      .catch(err => toast(`失敗：${err.message || err}`));
    return;
  }
  render();
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
    ${aclPanel(s)}
    <div class="panel"><div class="row"><h2 style="margin:0">裁判資料設定</h2><span class="spacer"></span><span class="small muted">${refSummary(s)}</span><button class="btn ghost sm" data-staffset>${icon('list')}${staffSetOpen ? '收合' : '展開'}</button></div>${staffSetOpen ? staffEditor(s, 'set') : ''}</div>
    ${parkPanel(s)}
    <div class="panel"><h2>備份與還原</h2><div class="row">
      <button class="btn ghost" data-backup>${icon('download')}下載備份檔</button>
      <label class="btn ghost">${icon('upload')}還原備份檔<input type="file" accept=".json" hidden data-restore></label>
      ${LOCAL || !s.events.length ? '<button class="btn ghost" data-demo>載入示範資料</button>' : ''}
      <button class="btn ghost danger" data-wipe>清除全部資料</button></div></div>`;
}

// ---------------- 停車證 ----------------
// 抽籤系統從繳費表單整理後同步過來；之後追加申請的，在這裡直接改。簽到處的名單和簽到表會跟著更新。
// ---------------- 線上點單權限 ----------------
// 報名表上的聯絡人信箱＝該校各隊填線上點單的權限。信箱只存在資料庫（只有大會台與本人讀得到），不會進到程式碼。
let aclOpen = false, aclMiss = [];
function teamList(s) {
  const out = [];
  D.events.filter(e => e.team).forEach(e => {
    const names = new Set();
    // 以籤表上的隊名為準（參賽名單的寫法可能不同，不另外算一隊）
    (e.groups || []).forEach(g => (g.teams || []).forEach(n => { if (n) names.add(n); }));
    if (!names.size) e.matches.forEach(m => [m.A, m.B].forEach(S => { if (S && S.name) names.add(S.name); }));
    [...names].sort((a, b) => a.localeCompare(b, 'zh-Hant')).forEach(n => out.push({ ev: e.name, team: n, key: teamKey(e.name, n) }));
  });
  return out;
}
function aclPanel(s) {
  const list = teamList(s), acl = s.teamacl || {};
  const own = k => Object.entries(acl[k] || {}).filter(([, v]) => v === 'owner').map(([e]) => e.replace(/,/g, '.'));
  const edList = k => Object.entries(acl[k] || {}).filter(([, v]) => v === 'editor').map(([e]) => e.replace(/,/g, '.'));
  const done = list.filter(t => own(t.key).length).length;
  const head = `<div class="row"><h2 style="margin:0">線上點單權限</h2><span class="spacer"></span><span class="small muted">${done} / ${list.length} 隊已設定聯絡人</span><button class="btn ghost sm" data-aclopen>${icon('list')}${aclOpen ? '收合' : '展開'}</button></div>`;
  if (!aclOpen) return `<div class="panel">${head}</div>`;
  return `<div class="panel">${head}
    <p class="small muted">匯入報名表單回應（男子組、女子組、社會組可一次選多個檔案），依隊名帶入「聯絡人 email」欄的信箱，沒填的隊伍留空。信箱只存在資料庫，只有大會台與本人看得到。參賽隊伍登入 <b>nctu-ttc.tw/live/lineup.html</b> 填寫。</p>
    <div class="row"><label class="btn ghost sm">${icon('upload')}匯入報名表單回應<input type="file" accept=".xlsx,.csv" multiple hidden data-aclimp></label>
      <button class="btn ghost sm danger" data-aclwipe>清除全部權限與線上點單</button></div>
    ${aclMiss.length ? `<p class="small" style="color:var(--red)">報名表中有這些隊名在籤表找不到，請手動填寫：${esc(aclMiss.join('、'))}</p>` : ''}
    <table class="list" style="margin-top:8px"><thead><tr><th>項目</th><th>隊伍</th><th>聯絡人信箱</th><th>共同編輯（聯絡人可自行增減，最多 3 個；大會台不限）</th></tr></thead><tbody>
    ${list.map(t => `<tr><td class="nowrap">${esc(t.ev)}</td><td>${esc(t.team)}</td><td><input type="email" data-aclown="${esc(t.key)}" value="${esc(own(t.key).join(', '))}" placeholder="未設定" style="width:100%;min-width:200px"></td><td><input type="text" data-acled="${esc(t.key)}" value="${esc(edList(t.key).join(', '))}" placeholder="以逗號分隔" style="width:100%;min-width:220px"></td></tr>`).join('')}
    </tbody></table></div>`;
}
/** 設定某隊的共同編輯（整份取代） */
function setEditors(s, key, text) {
  const up = {}, cur = (s.teamacl || {})[key] || {};
  const want = new Set(String(text || '').split(/[\s,，;；]+/).map(x => x.trim().toLowerCase()).filter(x => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x)).map(mailKey));
  Object.entries(cur).forEach(([k, v]) => { if (v === 'editor' && !want.has(k)) { up[`teamacl/${key}/${k}`] = null; up[`myteams/${k}/${key}`] = null; } });
  want.forEach(k => { if (!cur[k]) { up[`teamacl/${key}/${k}`] = 'editor'; up[`myteams/${k}/${key}`] = true; } });
  return up;
}
/** 設定某隊的聯絡人信箱（取代原本的聯絡人，保留共同編輯） */
function setOwner(s, key, email) { return ownerUpdates(s.teamacl, key, parseMails(email)); }
async function importAcl(files) {
  const s = getState();
  const list = teamList(s);
  const byName = new Map(list.map(t => [t.ev + '|' + nm(t.team), t]));
  const want = new Map(); // 隊伍代號 -> 信箱（可多個）
  const miss = [];
  for (const f of files) {
    const rows = await readFormFile(f);
    const { kind, responses } = parseResponses(rows);
    const teamEv = EVENTS[kind][0];
    // 只用報名表的「聯絡人 email」欄；沒有填就留空，不用表單的「電子郵件地址」
    responses.filter(r => r.include).forEach(r => {
      const use = String(r.contactEmail || '').split(/[\s,，;；\/]+/).filter(x => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x));
      if (!use.length) return;
      r.teams.filter(t => !t.waitlist).forEach(t => {
        const hit = byName.get(teamEv + '|' + nm(t.name)) || list.find(x => x.ev === teamEv && looseKey(x.team) === looseKey(t.name));
        if (hit) want.set(hit.key, [...new Set([...(want.get(hit.key) || []), ...use])]); else miss.push(`${teamEv} ${t.name}`);
      });
    });
  }
  const up = {};
  want.forEach((e, key) => Object.assign(up, setOwner(s, key, e.join(','))));
  aclMiss = [...new Set(miss)];
  if (Object.keys(up).length) await writePaths(up);
  toast(`已帶入 ${want.size} 隊的聯絡人信箱`);
  render();
}
function refSummary(s) {
  const staff = s.staff || [];
  return [...ORGS, '未分組'].map(g => [g, staff.filter(n => orgOf(s, n) === g).length]).filter(([, n]) => n).map(([g, n]) => `${g} ${n}`).join('、') || '尚未輸入';
}
function parkPanel(s) {
  const park = s.parking || {}, rc = s.receipt || {};
  const units = [...new Set([...Object.keys(park), ...Object.keys(rc)])].sort((a, b) => a.localeCompare(b, 'zh-Hant'));
  const total = Object.values(park).reduce((a, n) => a + (Number(n) || 0), 0);
  const need = units.filter(u => (rc[u] || {}).need).length;
  const head = `<div class="row"><h2 style="margin:0">停車證與收據</h2><span class="spacer"></span><span class="small muted">停車證 ${total} 張${need ? `，收據 ${need} 份` : ''}</span><button class="btn ghost sm" data-parkopen aria-expanded="${parkOpen}">${icon('list')}${parkOpen ? '收合' : '展開'}</button></div>`;
  if (!parkOpen) return `<div class="panel">${head}</div>`;
  return `<div class="panel">${head}
    <p class="small muted">匯入繳費表單回應，帶入各單位的停車證張數（有「收據」欄位時一併帶入）。帶入後請核對標題旁的總張數；賽前透過粉專追加停車證的單位，直接在表格增減張數。要不要收據、收據抬頭等要求也可以直接修改。簽到處會依校名自動帶入停車證張數。</p>
    <div class="row" style="margin-bottom:8px"><label class="btn ghost sm">${icon('upload')}匯入繳費表單<input type="file" accept=".xlsx,.csv" hidden data-payimp></label></div>
    <table class="list"><thead><tr><th>單位</th><th style="width:100px">停車證</th><th style="width:70px">收據</th><th>備註</th><th style="width:50px"></th></tr></thead><tbody>
    ${units.map(u => { const r = rc[u] || {}; return `<tr><td>${esc(u)}</td><td><input type="number" min="0" style="width:70px" data-parkn="${esc(u)}" value="${Number(park[u]) || 0}"></td>
      <td><input type="checkbox" data-rneed="${esc(u)}" ${r.need ? 'checked' : ''} aria-label="需要收據"></td>
      <td><span class="small">${esc(r.note || '')}</span> <button class="btn ghost sm ${r.note ? 'on' : ''}" data-rnote="${esc(u)}" title="備註" aria-label="備註">${icon('edit')}</button></td>
      <td><button class="btn ghost sm" data-parkdel="${esc(u)}" title="刪除">${icon('close')}</button></td></tr>`; }).join('')}
    <tr><td><input type="text" id="park-u" placeholder="學校或單位名稱" style="width:100%"></td><td><input type="number" id="park-n" min="0" value="1" style="width:70px"></td><td></td><td></td><td><button class="btn ghost sm" data-parkadd>${icon('plus')}新增</button></td></tr>
    </tbody></table></div>`;
}
/** 繳費表單：單位、停車證張數，有收據、抬頭、統編欄位時一併帶入 */
async function importPayment(file) {
  const cv = x => (x && typeof x === 'object' && !(x instanceof Date) ? (x.keep ?? x.t ?? '') : String(x ?? ''));
  const rows = (await readFormFile(file)).map(r => (r || []).map(cv));
  const head = (rows[0] || []).map(h => String(h).replace(/\s+/g, ''));
  const col = re => head.findIndex(h => re.test(h));
  const cu = col(/單位|隊伍|學校/), cn = col(/停車/), cr = col(/收據/), ct = col(/抬頭/), ci = col(/統編|統一編號/);
  if (cu < 0) { toast('找不到「單位名稱」欄位'); return; }
  const park = {}, rc = {};
  rows.slice(1).forEach(r => {
    const raw = String(r[cu] || '').trim(); if (!raw) return;
    const u = unitFromTeam(raw) || raw;
    const n = cn >= 0 ? parseInt(String(r[cn] || '').replace(/[^\d]/g, ''), 10) || 0 : 0;
    if (n) park[u] = (park[u] || 0) + n;
    const rv = cr >= 0 ? String(r[cr] || '').trim() : '';
    const needIt = !!rv && !/不需|不要|^否|^無|^no/i.test(rv);
    const note = [ct >= 0 && r[ct] ? `抬頭：${String(r[ct]).trim()}` : '', ci >= 0 && r[ci] ? `統編：${String(r[ci]).trim()}` : ''].filter(Boolean).join('　');
    if (needIt || note) rc[u] = { need: needIt || !!(rc[u] && rc[u].need), note: [rc[u] && rc[u].note, note].filter(Boolean).join('；') };
  });
  update(st => { st.parking = park; st.receipt = { ...rc }; });
  toast(`已匯入：停車證 ${Object.values(park).reduce((a, n) => a + n, 0)} 張${Object.keys(rc).length ? `，收據 ${Object.values(rc).filter(x => x.need).length} 份` : ''}。請核對張數，粉專追加的請手動增減`);
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
      if (old && old.finalPub) e.finalPub = old.finalPub;
      if (old && old.finalDone) e.finalDone = old.finalDone;
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
// 擬信催交：照常打開信件程式，稍後記下擬信時間（先讓連結動作完成再重畫）
document.addEventListener('click', ev => {
  const a = ev.target.closest('a[data-mailed]'); if (!a) return;
  const id = a.dataset.mailed;
  setTimeout(() => update(st => { st.notices = st.notices || {}; st.notices.mail = { ...(st.notices.mail || {}), [id]: Date.now() }; }), 400);
});
document.addEventListener('click', async ev => {
  const t = ev.target.closest('button, [data-table], [data-signout], [data-mid], .phead');
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
  if (d.pub) { const e = D.events.find(x => x.name === d.pub); const v = podiumText(e); update(s => { s.podium = { ...(s.podium || {}), [d.pub]: v }; }); syncHistory(); toast(`${ANN_NAME[d.pub]} 已公布`); return; }
  if (d.unpub) { update(s => { const p = { ...(s.podium || {}) }; delete p[d.unpub]; s.podium = p; }); syncHistory(); return; }
  if (d.rollset) { const [k, v] = d.rollset.split('|'); update(s => { const se = s.events.find(x => x.name === curEv); se.roll = se.roll || {}; se.roll[k] = se.roll[k] === v ? '' : v; }); return; }
  if (d.fpub) {
    const on = d.fpub === '1';
    if (!on && !('ok' in d)) { modal = { kind: 'unpub' }; drawModal(); return; }
    if (!on) { modal = null; drawModal(); }
    update(s => { const se = s.events.find(x => x.name === curEv); if (on) se.finalPub = Date.now(); else delete se.finalPub; });
    toast(on ? `${curEv}決賽籤表已公開` : `${curEv}決賽籤表已取消公開`); return;
  }
  if ('tierules' in d) { modal = { kind: 'tierules' }; drawModal(); return; }
  if ('busyok' in d && modal && modal.kind === 'busy') { const x = modal; modal = null; drawModal(); setTables(x.mid, x.text, x.force, true); return; }
  if ('reclaim' in d && modal && modal.kind === 'reclaim') { const x = modal; modal = null; drawModal(); setTables(x.mid, x.text, true); return; }
  if (d.busyopen) { busyOpen.has(d.busyopen) ? busyOpen.delete(d.busyopen) : busyOpen.add(d.busyopen); render(); return; }
  if (d.lureturn) {
    const i = d.lureturn.lastIndexOf('|'), mid = d.lureturn.slice(0, i), k = d.lureturn.slice(i + 1);
    const st = getState(), m = D.byId.get(mid), S = k === 'a' ? m.A : m.B, tk = teamKey(m.ev, S.name), o = ((st.olu || {})[mid] || {})[tk];
    if (!o) return;
    const rec = { ...o, final: false, log: (o.log || []).concat({ by: '大會台', ts: Date.now(), a: '退回修改' }) };
    writePaths({ [`olu/${mid}/${tk}`]: JSON.stringify(rec) }).then(() => { toast('已退回，隊伍可以重新修改送出'); drawModal(); }).catch(err => toast(`退回失敗：${err.message || err}`));
    return;
  }
  if ('lgopen' in d) { legendOpen = !legendOpen; render(); return; }
  if (d.nudge) { const i = d.nudge.lastIndexOf('|'); modal = { kind: 'nudge', mid: d.nudge.slice(0, i), side: d.nudge.slice(i + 1) }; drawModal(); return; }
  if ('scwipe' in d) { if (!confirm('清除這場的比分、桌次與裁判紀錄？')) return; const id = modal.mid; updateMatch(id, r => { Object.keys(r).forEach(k => delete r[k]); }); modal = null; drawModal(); toast('已清除這場紀錄'); return; }
  if ('showby' in d) { showBy = !showBy; drawModal(); return; }
  if ('nudgeDel' in d) {
    const m = D.byId.get(modal.mid), S = modal.side === 'a' ? m.A : m.B, tk = teamKey(m.ev, S.name), mid = modal.mid; modal = null; drawModal();
    writePaths({ [`nudge/${tk}/${mid}`]: null }).then(() => toast(`已收回給 ${S.name} 的通知`)).catch(err => toast(`收回失敗：${err.message || err}`));
    return;
  }
  if ('nudgeOk' in d) {
    const m = D.byId.get(modal.mid), S = modal.side === 'a' ? m.A : m.B, text = $('#nudge-t').value.trim().slice(0, 300);
    if (!text) { toast('請輸入通知內容'); return; }
    const tk = teamKey(m.ev, S.name), mid = modal.mid; modal = null; drawModal();
    writePaths({ [`nudge/${tk}/${mid}`]: JSON.stringify({ text, ts: Date.now() }) }).then(() => toast(`已通知 ${S.name}`)).catch(err => toast(`通知失敗：${err.message || err}`));
    return;
  }
  if ('rareopen' in d) { rareOpen = !rareOpen; render(); return; }
  if ('refdef' in d) { refDefOpen = !refDefOpen; render(); return; }
  if (d.round) { roundOpen.has(d.round) ? roundOpen.delete(d.round) : roundOpen.add(d.round); render(); return; }
  if ('mailall' in d) { mailAll = !mailAll; render(); return; }
  if ('aclopen' in d) { aclOpen = !aclOpen; render(); return; }
  if ('aclwipe' in d) {
    modal = { kind: 'aclwipe' }; drawModal(); return;
  }
  if ('aclwipeOk' in d) {
    modal = null; drawModal();
    writePaths({ teamacl: null, myteams: null, olu: null, nudge: null }).then(() => toast('已清除線上點單權限與點單')).catch(err => toast(`清除失敗：${err.message || err}`));
    return;
  }
  if ('refcode' in d) {
    const v = ($('#rc-new').value || '').trim().replace(/\s/g, '') || String(Math.floor(100000 + Math.random() * 900000));
    if (getState().refcode && !confirm(`更換成 ${v}？所有裁判都要重新輸入密碼。`)) return;
    setRefCode(v).then(() => toast(`裁判密碼：${v}`)).catch(err => toast(`設定失敗：${err.message || err}`)); return;
  }
  if ('refcodeOff' in d) { if (!confirm('取消密碼後，任何拿到連結的人都能記分。確定取消？')) return; setRefCode(null).then(() => toast('已取消裁判密碼')).catch(err => toast(`取消失敗：${err.message || err}`)); return; }
  if (d.ymopt) { update(st => { st.refOpt = { ...(st.refOpt || {}), ym: d.ymopt }; }); return; }
  if (d.staffset !== undefined) { staffSetOpen = !staffSetOpen; render(); return; }
  if (d.parkopen !== undefined) { parkOpen = !parkOpen; render(); return; }
  if ('staffopen' in d) { staffOpen = !staffOpen; render(); return; }
  if (d.swapsent || d.swapclear) {
    const v = d.swapsent || d.swapclear, i = v.lastIndexOf('|'), mid = v.slice(0, i), t = v.slice(i + 1);
    updateMatch(mid, r => { if (!r.swap || !r.swap[t]) return; if (d.swapsent) r.swap[t] = { ...r.swap[t], sent: Date.now() }; else { delete r.swap[t]; if (!Object.keys(r.swap).length) delete r.swap; } });
    toast(d.swapsent ? '已通知該桌裁判' : '已移除'); return;
  }
  if ('addxs' in d) {
    const names = $('#xs-name').value.split(/[\s,，、]+/).map(x => x.trim()).filter(Boolean);
    if (!names.length) { toast('請輸入姓名'); return; }
    update(st => { st.staff = [...new Set([...(st.staff || []), ...names])]; st.staffOrg = { ...(st.staffOrg || {}) }; names.forEach(n => { st.staffOrg[n] = '香山'; }); });
    toast(`已新增 ${names.length} 位香山裁判`); return;
  }
  if (d.uncall) { const ts = Number(d.uncall); update(st => { st.calls = (st.calls || []).filter(c => c.ts !== ts); }); toast('已收回這則廣播'); return; }
  if (d.recev) { recEv = d.recev; render(); return; }
  if (tab === 'rec' && d.mid && t.tagName !== 'BUTTON') { openModal('score', d.mid); return; }
  if (d.handok) { const k = d.handok; update(s => { s.notices = s.notices || {}; s.notices.hand = { ...(s.notices.hand || {}), [k]: Date.now() }; }); return; }
  if ('bcopen' in d) { bcOpen = !bcOpen; render(); return; }
  if ('bcmore' in d) { bcMore = !bcMore; render(); return; }
  if ('qopen' in d) { qOpen = !qOpen; render(); return; }
  if (d.reczoom) { recZoom = Math.min(1.6, Math.max(0.4, recZoom + 0.2 * Number(d.reczoom))); render(); return; }
  if (d.goev) { curEv = d.goev; tab = 'ctrl'; render(); window.scrollTo(0, 0); return; }
  if (d.parkdel) { update(st => { const p = { ...(st.parking || {}) }; delete p[d.parkdel]; st.parking = p; const r = { ...(st.receipt || {}) }; delete r[d.parkdel]; st.receipt = r; }); return; }
  if (d.rnote) { modal = { kind: 'rnote', unit: d.rnote }; drawModal(); return; }
  if ('rnoteOk' in d) { const v = $('#rnote-t').value.trim().slice(0, 200), u = modal.unit; modal = null; drawModal(); update(st => { st.receipt = { ...(st.receipt || {}) }; st.receipt[u] = { ...(st.receipt[u] || {}), note: v }; }); return; }
  if ('parkadd' in d) {
    const u = $('#park-u').value.trim(), n = Math.max(0, Number($('#park-n').value) || 0);
    if (!u || !n) { toast('請填單位名稱和張數'); return; }
    update(st => { const p = { ...(st.parking || {}) }; p[u] = (Number(p[u]) || 0) + n; st.parking = p; }); return;
  }
  if (noticeClick(d)) return;
  if (['hnew', 'hsel', 'hcancel', 'hadd', 'hdel', 'hsave', 'hrevert'].some(k => k in d)) { histClick(d); return; }
  if (d.gopub) { tab = 'draw'; curEv = d.gopub; render(); return; }
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
    // 還沒派桌：先存在大會台專用的地方，派桌時才寫進正式紀錄（公開資料）；已派桌就直接寫
    const started = !!(getState().m[modal.mid] || {}).start;
    if (started) updateMatch(modal.mid, r => { r.lineup = r.lineup || {}; r.lineup[d.luSave] = l; });
    else update(st => { st.dlu = st.dlu || {}; st.dlu[modal.mid] = { ...(st.dlu[modal.mid] || {}), [d.luSave]: l }; });
    luLog(modal.mid, d.luSave, '代填');
    drawModal();
    $(`[data-lu-warn="${d.luSave}"]`).textContent = w;
    toast('排點已儲存');
  } else if (d.luClear) {
    if (!confirm('清除這一隊的排點？')) return;
    luLog(modal.mid, d.luClear, '清除');
    delete draft[d.luClear];
    update(st => {
      const r = st.m[modal.mid]; if (r && r.lineup) { delete r.lineup[d.luClear]; if (!Object.keys(r.lineup).length) delete r.lineup; }
      const x = (st.dlu || {})[modal.mid]; if (x) { delete x[d.luClear]; if (!Object.keys(x).length) delete st.dlu[modal.mid]; }
    });
    drawModal();
  }
  else if (d.luunlock) {
    const i = d.luunlock.lastIndexOf('|'), mid = d.luunlock.slice(0, i), k = d.luunlock.slice(i + 1), m = D.byId.get(mid), S = k === 'a' ? m.A : m.B;
    if (draftLu(getState(), m, k) && !confirm(`${S.name} 正在線上編輯點單，確定由大會代填？`)) return;
    luUnlock[d.luunlock] = true; drawModal();
  }
  else if (d.lulog) { luLogOpen[d.lulog] = !luLogOpen[d.lulog]; drawModal(); }
  else if ('wo' in d) { if (d.wo) walkover(modal.mid, d.wo); else updateMatch(modal.mid, r => { delete r.wo; delete r.woBy; }); drawModal(); }
  else if (d.wojudge) {
    const i = d.wojudge.lastIndexOf('|'), mid = d.wojudge.slice(0, i), k = d.wojudge.slice(i + 1); const m = D.byId.get(mid); if (!m) return;
    const loser = sideText(k === 'a' ? m.A : m.B, m.team), winner = sideText(k === 'a' ? m.B : m.A, m.team);
    if (!confirm(`判 ${loser} 棄權，${winner} 晉級？這場會結束、球桌空出來。`)) return;
    walkover(mid, k === 'a' ? 'b' : 'a'); toast(`已判 ${loser} 棄權`);
  }
  else if (d.finish) { updateMatch(d.finish, r => { r.fin = Date.now(); r.end = Date.now(); r.finBy = deskName(); delete r.absent; (r.pts || []).forEach(p => { if (p) delete p.absent; }); }); toast('已完賽'); }
  else if ('confirm' in d) { updateMatch(modal.mid, r => { r.fin = Date.now(); r.end = Date.now(); r.tables = []; delete r.absent; (r.pts || []).forEach(p => { if (p) delete p.absent; }); }); modal = null; drawModal(); toast('本場已結束'); }
  else if ('fillRank' in d) {
    update(s => { const se = s.events.find(x => x.name === curEv); const e = D.events.find(x => x.name === curEv); se.rank = se.rank || {};
      e.groups.forEach(g => { if (g.table.all && !g.table.rows[0].lot && !g.table.rows[1].lot) se.rank[g.letter] = { c: g.table.rows[0].team, r: g.table.rows[1].team }; }); });
    toast('已依互咬規則帶入名次，需要抽籤的組別請以選單指定');
  } else if ('schedClear' in d) update(s => { delete s.sched; });
  else if ('backup' in d) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(getState())], { type: 'application/json' }));
    a.download = `交大盃當日備份_${fmtTime(Date.now()).replace(':', '')}.json`; a.click();
  } else if ('demo' in d) { if (!getState().events.length || t.dataset.sure) { replaceState(demoState()); tab = 'ctrl'; render(); toast('已載入示範資料'); } else { t.dataset.sure = 1; t.textContent = '再按一次以覆蓋現有資料'; } }
  else if ('wipe' in d) { modal = { kind: 'wipe' }; drawModal(); }
  else if ('wipeOk' in d) {
    const keep = $('#wipe-staff') && $('#wipe-staff').checked, keepPark = $('#wipe-park') && $('#wipe-park').checked, st0 = getState();
    modal = null; drawModal();
    replaceState({ ...emptyState(), ...(keep ? { staff: st0.staff || [], staffOrg: st0.staffOrg || {}, refOpt: st0.refOpt || {} } : {}), ...(keepPark ? { parking: st0.parking || {}, receipt: st0.receipt || {} } : {}) });
    writePaths({ teamacl: null, myteams: null, olu: null, nudge: null }).catch(() => {});
    render(); toast('已清除全部資料');
  }
});

document.addEventListener('change', async ev => {
  const t = ev.target, d = t.dataset;
  if (noticeChange(t)) return;
  if (d.parkn) { const n = Math.max(0, Number(t.value) || 0); update(st => { st.parking = { ...(st.parking || {}), [d.parkn]: n }; }); return; }
  if (d.rneed) { update(st => { st.receipt = { ...(st.receipt || {}) }; st.receipt[d.rneed] = { ...(st.receipt[d.rneed] || {}), need: t.checked }; }); return; }
  if ('payimp' in d) { if (t.files[0]) { try { await importPayment(t.files[0]); } catch (err) { toast(`匯入失敗：${err.message || err}`); } t.value = ''; } return; }
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
  else if (d.ann) { const [ev, k] = d.ann.split('|'); update(s => { s.podium = { ...(s.podium || {}) }; s.podium[ev] = { ...s.podium[ev], [k]: t.value.trim() }; }); syncHistory(); }
  else if (d.annTitle != null) update(s => { s.annTitle = t.value.trim(); });
  else if (d.set) update(s => {
    // 改屆數時，成績公告標題裡的舊屆數一起換掉
    if (d.set === 'edition' && s.edition && s.annTitle && s.annTitle.includes(s.edition)) s.annTitle = s.annTitle.split(s.edition).join(t.value);
    s[d.set] = d.set === 'tables' ? Math.max(2, Number(t.value) || 24) : t.value;
  });
  else if (d.imp) { if (t.files[0]) await importBracket(d.imp, t.files[0]); }
  else if ('impall' in d) { if (t.files.length) await importAll([...t.files]); }
  else if ('aclimp' in d) { if (t.files.length) { try { await importAcl([...t.files]); } catch (err) { toast(`匯入失敗：${err.message || err}`); } t.value = ''; } }
  else if (d.acled !== undefined) { const up = setEditors(getState(), d.acled, t.value); if (Object.keys(up).length) writePaths(up).then(() => toast('已更新共同編輯')).catch(err => toast(`更新失敗：${err.message || err}`)); }
  else if (d.aclown !== undefined) { const up = setOwner(getState(), d.aclown, t.value); writePaths(up).then(() => toast('已更新聯絡人信箱')).catch(err => toast(`更新失敗：${err.message || err}`)); }
  else if ('refbuf' in d) update(st => { st.refOpt = { ...(st.refOpt || {}), buf: Math.max(1, Number(t.value) || 0) || null }; });
  else if ('xs' in d) update(st => { st.refOpt = { ...(st.refOpt || {}), xs: t.value }; });
  else if (d.link) update(st => { st.refOpt = { ...(st.refOpt || {}), links: { ...((st.refOpt || {}).links || {}), [d.link]: t.value.trim() } }; });
  else if ('staff' in d) { const p = parseStaff(t.value); update(s => { s.staff = p.names; s.staffOrg = p.org; }); }
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
  if (histDraft && (t.dataset.hd || 'hyear' in t.dataset || 'hed' in t.dataset)) {
    if (t.dataset.hd) { const [e, i, f] = t.dataset.hd.split('|'); histDraft.p[e][Number(i)][Number(f)] = t.value; }
    else if ('hyear' in t.dataset) histDraft.year = t.value; else histDraft.edition = t.value;
    return;
  }
  if (t.dataset.lu && t.tagName === 'INPUT') { draft[t.dataset.lu[0]] = readLineup(t.dataset.lu[0]); return; }
  if (!t.dataset.g || !modal) return;
  const [pi, gi, side] = t.dataset.g.split('|');
  const v = t.value.replace(/\D/g, '');
  if (v !== t.value) t.value = v;
  const m = D.byId.get(modal.mid);
  updateMatch(modal.mid, r => {
    let games;
    let o;
    if (m.team) { r.pts = r.pts || []; o = r.pts[pi] = r.pts[pi] || {}; games = o.g = o.g || []; }
    else { o = r; games = r.g = r.g || []; }
    games[gi] = games[gi] || ['', ''];
    games[gi][side] = v === '' ? '' : Number(v);
    o.gb = o.gb || []; o.gb[gi] = deskName(); for (let i = 0; i < o.gb.length; i++) if (o.gb[i] == null) o.gb[i] = '';
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
  D = derive(withOnline(s));
  if (!typing) render();
  if (modal) {
    const inModal = active && active.closest && active.closest('#modal');
    if (local || inModal) refreshScore(); else drawModal();
  }
});
onAuth(a => { if (a.error && (a.isAdmin || !a.cloud)) toast(a.error); render(); });
setInterval(() => { const a = document.activeElement; if (!modal && !(a && /INPUT|SELECT/.test(a.tagName))) render(); }, 30000);
render();
// 可收合區塊的標題列也能用鍵盤展開
document.addEventListener('keydown', ev => { if ((ev.key === 'Enter' || ev.key === ' ') && ev.target.classList && ev.target.classList.contains('phead')) { ev.preventDefault(); ev.target.click(); } });
// 「人手不足時可支援」的下一場提示：平板沒有滑鼠，點一下姓名顯示，再點一下或點別處收起
document.addEventListener('click', ev => {
  const c = ev.target.closest && ev.target.closest('.tipcell');
  document.querySelectorAll('.tipcell.tipon').forEach(x => { if (x !== c) x.classList.remove('tipon'); });
  if (c) c.classList.toggle('tipon');
});
