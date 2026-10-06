// 交大盃抽籤系統：介面
import { parseResponses, buildEntries, EVENTS, ALL_EVENTS, EVENT_TYPE, KIND_LABEL } from './parse.js';
import { readFormFile, readWorkbookValues } from './reader.js';
import { parseFinalBracket } from './finalparse.js';
import { scoresheetDocx, scoresheetPages, PDF_CSS, DEFAULT_TITLE } from './scoresheet.js';
import { looseKey, extractSchool, normalizeText } from './schools.js';
import * as B from './bracket.js';
import { runDraw, checkDraw, swapPositions } from './draw.js';
import { bracketWorkbook, finalWorkbook, orderWorkbook, workbookBlob, sortForOrder } from './excel.js';
import { newSeed, uid, toCn } from './util.js';
import { entryStrong, arrangeRR, allPlayers, recLabel, isGeneral, coverage, setData, recordsFromRows } from './strong.js';
import { parseCsvText } from './reader.js';

// ---------------- 圖示（線條） ----------------
const ICON = {
  upload: '<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/>',
  download: '<path d="M12 4v12M7 11l5 5 5-5"/><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/>',
  file: '<path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z"/><path d="M14 3v5h5"/>',
  shuffle: '<path d="M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  check: '<path d="M5 12l5 5L20 7"/>',
  alert: '<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17v.5"/>',
  save: '<path d="M5 3h11l3 3v15H5z"/><path d="M8 3v5h7V3M8 21v-7h8v7"/>',
  open: '<path d="M3 7a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/>',
  reset: '<path d="M4 4v6h6"/><path d="M5 15a8 8 0 1 0 1-9L4 10"/>',
  swap: '<path d="M7 4 3 8l4 4M3 8h14M17 12l4 4-4 4M21 16H7"/>',
  star: '<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5v.7M12 17v.5"/>',
};
const icon = n => `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${ICON[n]}</svg>`;

// ---------------- 狀態 ----------------
const KEY = 'jdb-draw-v1';
const blank = () => ({ version: 1, aliases: {}, sources: {}, events: {}, step: 0, event: '男團',
  sheetSettings: { title: DEFAULT_TITLE, blanks: 3, withFinal: true }, sheetUploads: {} });
let S = load();

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s && s.version === 1) { const b = blank(); return { ...b, ...s, sheetSettings: fixTitle({ ...b.sheetSettings, ...(s.sheetSettings || {}) }), sheetUploads: s.sheetUploads || {}, step: 0 }; } // 每次打開都從步驟 1 開始
  } catch { /* 無法讀取就從頭開始 */ }
  return blank();
}
function fixTitle(st) {
  if (!st.title || /第十屆/.test(st.title)) st.title = DEFAULT_TITLE;
  return st;
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { /* 空間不足或無法寫入 */ }
}
function ev(name) {
  if (!S.events[name]) S.events[name] = { entries: [], waitlist: [], plan: null, draw: null };
  return S.events[name];
}
const activeEvents = () => ALL_EVENTS.filter(e => S.events[e] && S.events[e].entries.length);

// ---------------- 小工具 ----------------
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, 2600);
}
function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
const fmtSeed = v => (v === '' || v == null ? '' : v);
const unitWord = name => (name === '社團' ? '單位' : '學校');
const nameWord = name => (EVENT_TYPE[name] === 'team' ? '隊名' : EVENT_TYPE[name] === 'double' ? '選手（A/B）' : '選手');

// ---------------- 籤表設定 ----------------
/** 團體賽預設：女團以 3 隊循環為主，其他以 4 隊循環為主，剩下的用另一種補 */
function rrDefault(n, pref) {
  const other = pref === 3 ? 4 : 3;
  for (let a = Math.floor(n / pref); a >= 0; a--) {
    const rest = n - a * pref;
    if (rest % other === 0) return pref === 3 ? { n3: a, n4: rest / 4 } : { n3: rest / 3, n4: a };
  }
  return { n3: 0, n4: Math.ceil(n / 4) };
}
function rrSizes(p) { return [...Array(p.n3).fill(3), ...Array(p.n4).fill(4)]; }
function defaultPlan(name, n) {
  if (EVENT_TYPE[name] === 'team') {
    const p = { kind: 'rr', forN: n, ...rrDefault(n, name === '女團' ? 3 : 4) };
    p.sizes = rrSizes(p);
    return p;
  }
  const k = B.defaultSections(n);
  return { kind: 'ko', forN: n, sections: k, sizes: B.splitSizes(n, k) };
}
function planOf(name) {
  const e = ev(name);
  const n = e.entries.length;
  // 人數變了，或是舊版格式，就依人數重設
  if (!e.plan || e.plan.forN !== n || (e.plan.kind === 'rr' && e.plan.n3 === undefined)) e.plan = defaultPlan(name, n);
  return e.plan;
}
function planError(name) {
  const p = planOf(name);
  const n = ev(name).entries.length;
  const sum = p.sizes.reduce((a, b) => a + b, 0);
  if (sum === n) return '';
  return p.kind === 'rr'
    ? `3 隊區 ${p.n3} 個 + 4 隊區 ${p.n4} 個 = ${sum} 隊，與報名 ${n} 隊不符`
    : `各區人數合計 ${sum}，與報名 ${n} 不符`;
}
function structureOf(name) {
  const pe = planError(name);
  if (pe) return { err: pe };
  try { return { st: B.buildStructure(planOf(name)) }; } catch (err) { return { err: err.message }; }
}
const sig = entries => entries.map(x => `${x.id}|${x.school}|${fmtSeed(x.seed)}`).join(';');

// ---------------- 版面 ----------------
const STEPS = ['上傳表單回應', '名單校正', '籤表規劃', '抽籤', '下載完成籤表', '點單', '猛將資料庫', '使用說明'];

function renderSteps() {
  $('#steps').innerHTML = STEPS.map((s, i) =>
    `<button class="${S.step === i ? 'on' : ''}" data-step="${i}">${i < 6 ? `<span class="n">${i + 1}</span>` : icon(i === 6 ? 'star' : 'help')}${s}</button>`).join('');
}
function render() {
  renderSteps();
  [stepUpload, stepEdit, stepPlan, stepDraw, stepExport, stepSheets, stepStrong, stepHelp][S.step]();
  save();
}
function eventTabs(withCount = true) {
  const list = ALL_EVENTS.filter(e => S.events[e]);
  if (!list.length) return '';
  if (!list.includes(S.event)) S.event = list[0];
  return `<div class="tabs">${list.map(e =>
    `<button class="tab ${S.event === e ? 'on' : ''}" data-ev="${e}">${e}${withCount ? `<span class="c">${S.events[e].entries.length}</span>` : ''}</button>`).join('')}</div>`;
}

// ---------------- 步驟 1：上傳 ----------------
function stepUpload() {
  const kinds = ['men', 'women', 'social'];
  $('#main').innerHTML = `
  <section class="panel">
    <h2>上傳報名表單回應</h2>
    <div class="note">
      <b>下載方式與檔案格式</b>
      <ul>
        <li>請在 Google 試算表選「檔案 &gt; 下載 &gt; Microsoft Excel (.xlsx)」，上傳 .xlsx 檔（CSV 檔會抓不到刪除線）。</li>
      </ul>
    </div>
    <div class="note">
      <b>刪除線的處理規則（僅 .xlsx）</b>
      <ul>
        <li>整列劃掉：視為作廢的回應，預設不採用（下方表格可以手動勾回來）。</li>
        <li>格子裡只劃掉部分名字：被劃掉的名字直接排除。</li>
      </ul>
    </div>
    <div class="drops">
      ${kinds.map(k => {
        const src = S.sources[k];
        return `<label class="drop ${src ? 'done' : ''}" data-drop="${k}">
          <span class="t">${icon(src ? 'check' : 'upload')}${KIND_LABEL[k]}</span>
          <span class="f">${src ? `${esc(src.fileName)}，${src.responses.length} 筆回應` : '點這裡選檔案，或把檔案拉進來'}</span>
          <input type="file" accept=".xlsx,.csv" hidden data-file="${k}">
        </label>`;
      }).join('')}
    </div>
    <p class="small muted">只上傳一份也可以，上傳後檢查下面的回應，再按「產生名單」。</p>
  </section>
  ${kinds.filter(k => S.sources[k]).map(responsePanel).join('')}`;
}

function responsePanel(k) {
  const src = S.sources[k];
  const rs = src.responses;
  const evs = EVENTS[k];
  const has = evs.some(e => S.events[e] && S.events[e].entries.length);
  // 同校多筆回應：產生名單時會合併
  const bySchool = new Map();
  rs.forEach(r => {
    if (!r.include || !r.school) return;
    if (!bySchool.has(r.school)) bySchool.set(r.school, []);
    bySchool.get(r.school).push(r.rowNo);
  });
  const sameSchool = r => {
    const list = r.include && r.school ? (bySchool.get(r.school) || []).filter(n => n !== r.rowNo) : [];
    return list.length ? `<span class="tag info">與第 ${list.join('、')} 列同${k === 'social' ? '單位' : '校'}，名單會合併</span>` : '';
  };
  return `<section class="panel">
    <div class="row"><h2>${KIND_LABEL[k]}回應</h2><span class="muted small">${esc(src.fileName)}</span><span class="spacer"></span>
      <button class="btn" data-build="${k}">${icon('check')}${has ? '重新產生名單' : '產生名單'}</button></div>
    <p class="small muted">採用 ${rs.filter(r => r.include).length} / ${rs.length} 筆。同校的多筆回應在產生名單時會合併，重複的人或隊伍只留一筆。${k === 'social' ? '社會組的「單位」用來做同單位分開，同一個人報的多隊請填相同單位。' : '學校欄可以直接修改。'}</p>
    <div class="tbl-wrap scroll"><table>
      <thead><tr><th>採用</th><th class="num">列</th><th>${k === 'social' ? '單位' : '學校'}</th><th>隊伍</th><th class="num">團體</th>${k === 'social' ? '' : '<th class="num">單打</th><th class="num">雙打</th>'}<th>提醒</th></tr></thead>
      <tbody>${rs.map((r, i) => `<tr class="${r.include ? '' : 'off'}">
        <td><input type="checkbox" data-inc="${k}:${i}" ${r.include ? 'checked' : ''}></td>
        <td class="num">${r.rowNo}</td>
        <td><input type="text" value="${esc(r.school)}" data-rschool="${k}:${i}"></td>
        <td>${r.teams.map(t => `<span class="chip">${esc(t.name)}${t.waitlist ? '（候補）' : ''}</span>`).join(' ')}</td>
        <td class="num">${r.teams.length || ''}</td>
        ${k === 'social' ? '' : `<td class="num">${r.singles.length || ''}</td><td class="num">${r.doubles.length || ''}</td>`}
        <td>${r.manual ? '<span class="tag info">手動補入（無時間戳記）</span>' : ''}${r.notes.map(n => `<span class="tag">${esc(n)}</span>`).join('')}${sameSchool(r)}</td>
      </tr>`).join('')}</tbody></table></div>
  </section>`;
}

async function handleFile(file, hint) {
  try {
    const rows = await readFormFile(file);
    const { kind, responses } = parseResponses(rows, S.aliases);
    if (hint && kind !== hint) toast(`這份檔案看起來是${KIND_LABEL[kind]}，已放到${KIND_LABEL[kind]}`);
    S.sources[kind] = { fileName: file.name, responses };
    render();
  } catch (err) {
    toast('讀取失敗：' + err.message);
  }
}

function buildFromSource(k) {
  const src = S.sources[k];
  const evs = EVENTS[k];
  const has = evs.some(e => S.events[e] && S.events[e].entries.length);
  if (has && !confirm(`${evs.join('、')} 已有名單，重新產生會覆蓋你在名單校正做的修改，確定嗎？`)) return;
  const { events, waitlist } = buildEntries(k, src.responses, S.aliases);
  for (const e of evs) {
    S.events[e] = { entries: events[e], waitlist: waitlist[e], plan: null, draw: null };
  }
  S.event = evs[0];
  S.step = 1;
  toast(evs.map(e => `${e} ${events[e].length}`).join('，'));
  render();
}

// ---------------- 步驟 2：名單校正 ----------------
function stepEdit() {
  if (!Object.keys(S.events).length) {
    $('#main').innerHTML = `<section class="panel"><div class="empty">還沒有名單。請先在步驟 1 上傳表單回應並產生名單，或直接新增項目。</div>
      <div class="row" style="justify-content:center">${ALL_EVENTS.map(e => `<button class="btn ghost sm" data-newev="${e}">${icon('plus')}${e}</button>`).join('')}</div></section>`;
    return;
  }
  const name = S.event in S.events ? S.event : Object.keys(S.events)[0];
  S.event = name;
  const e = ev(name);
  const missing = ALL_EVENTS.filter(x => !S.events[x]);
  const counts = new Map();
  e.entries.forEach(x => counts.set(x.school, (counts.get(x.school) || 0) + 1));
  const schools = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const suspects = suspectGroups();
  const flagged = e.entries.filter(x => x.flags && x.flags.length).length;

  $('#main').innerHTML = `
  ${eventTabs()}
  <div class="grid2">
  <section class="panel">
    <div class="row"><h2>${name}名單</h2><span class="muted small">${e.entries.length} ${EVENT_TYPE[name] === 'team' ? '隊' : EVENT_TYPE[name] === 'double' ? '組' : '人'}</span>
      <span class="spacer"></span>
      <button class="btn ghost sm" data-addrow>${icon('plus')}新增一列</button>
      <button class="btn ghost sm" data-dlorder>${icon('download')}下載抽籤順序表</button></div>
    <div class="note small">若陽明交大保留名額不在表單裡，請用「新增一列」或右邊的「貼上名單」加入。
      種子欄填固定籤號（例如 1），抽籤時會固定在那個位置。</div>
    ${flagged ? `<div class="note warn small">有 ${flagged} 筆需要確認（看提醒欄）。</div>` : ''}
    <div class="tbl-wrap scroll"><table>
      <thead><tr><th class="num">#</th><th>${unitWord(name)}</th><th>${nameWord(name)}</th><th>種子</th><th>提醒</th><th></th></tr></thead>
      <tbody>${sortForOrder(e.entries).map((x, i) => `<tr>
        <td class="num">${i + 1}</td>
        <td><input type="text" value="${esc(x.school)}" data-f="school" data-id="${x.id}"></td>
        <td><input type="text" value="${esc(x.name)}" data-f="name" data-id="${x.id}"></td>
        <td><input type="number" class="seed" min="1" value="${esc(fmtSeed(x.seed))}" data-f="seed" data-id="${x.id}"></td>
        <td>${(x.flags || []).map(f => `<span class="tag">${esc(f)}</span>`).join('')}${x.src ? `<span class="tag info">表單第 ${x.src} 列</span>` : ''}</td>
        <td><button class="btn ghost sm danger" data-del="${x.id}" title="刪除">${icon('trash')}</button></td>
      </tr>`).join('') || `<tr><td colspan="6" class="empty">沒有資料</td></tr>`}</tbody></table></div>
    ${e.waitlist && e.waitlist.length ? `<h3>候補名單</h3><div class="tbl-wrap"><table><tbody>
      ${e.waitlist.map(x => `<tr><td>${esc(x.school)}</td><td>${esc(x.name)}</td><td><button class="btn ghost sm" data-promote="${x.id}">${icon('plus')}加入正式名單</button></td></tr>`).join('')}
      </tbody></table></div>` : ''}
  </section>
  <aside>
    <section class="panel">
      <h2>${unitWord(name)}統計</h2>
      <p class="small muted">直接改名稱會套用到所有項目，例如把「台大」改成「臺灣大學」。</p>
      <div class="tbl-wrap scroll" style="max-height:300px"><table><tbody>
        ${schools.map(([s, c]) => `<tr><td><input type="text" value="${esc(s)}" data-rename="${esc(s)}"></td><td class="num">${c}</td></tr>`).join('')}
      </tbody></table></div>
      ${suspects.length ? `<div class="note warn small"><b>疑似同一間</b><ul>${suspects.map(g => `<li>${g.map(esc).join('、')}</li>`).join('')}</ul></div>` : ''}
    </section>
    <section class="panel">
      <h2>貼上名單</h2>
      <p class="small muted">每行一筆：${unitWord(name)}、${nameWord(name)}、種子（可省略），用 Tab 或逗號隔開。可直接從 Excel 複製兩欄貼上。</p>
      <textarea id="paste" placeholder="陽明交大\t陽明交大紅\t1"></textarea>
      <div class="row" style="margin-top:8px"><button class="btn" data-paste>${icon('plus')}加入</button></div>
    </section>
    ${missing.length ? `<section class="panel"><h2>新增項目</h2><div class="row">${missing.map(x => `<button class="btn ghost sm" data-newev="${x}">${icon('plus')}${x}</button>`).join('')}</div></section>` : ''}
  </aside>
  </div>`;
}

function suspectGroups() {
  const all = new Set();
  Object.values(S.events).forEach(e => e.entries.forEach(x => x.school && all.add(x.school)));
  const m = new Map();
  all.forEach(s => {
    const k = looseKey(s);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(s);
  });
  return [...m.values()].filter(g => g.length > 1);
}

function renameSchool(from, to) {
  to = to.trim();
  if (!to || from === to) return;
  Object.values(S.events).forEach(e => {
    [...e.entries, ...(e.waitlist || [])].forEach(x => { if (x.school === from) x.school = to; });
  });
  S.aliases[from] = to;
  Object.keys(S.aliases).forEach(k => { if (S.aliases[k] === from) S.aliases[k] = to; });
  toast(`已把「${from}」改成「${to}」`);
}

function pasteRows(text) {
  const e = ev(S.event);
  let n = 0;
  text.split(/\r?\n/).forEach(line => {
    if (!line.trim()) return;
    let parts = line.split('\t');
    if (parts.length < 2) parts = line.split(/[,，]/);
    if (parts.length < 2) parts = line.trim().split(/\s+/);
    const [school, name, seed] = parts.map(s => (s || '').trim());
    if (!school || !name) return;
    e.entries.push({ id: uid(), school, name, seed: seed && /^\d+$/.test(seed) ? Number(seed) : '', src: null, flags: [] });
    n++;
  });
  toast(`已加入 ${n} 筆`);
}

// ---------------- 步驟 3：籤表規劃 ----------------
function stepPlan() {
  const list = activeEvents();
  if (!list.length) { $('#main').innerHTML = `<section class="panel"><div class="empty">還沒有名單，請先完成步驟 1、2。</div></section>`; return; }
  if (!list.includes(S.event)) S.event = list[0];
  const name = S.event;
  const e = ev(name);
  const n = e.entries.length;
  const plan = planOf(name);
  const { st, err } = structureOf(name);

  let body = '';
  if (plan.kind === 'ko') {
    body = `
    <div class="row">
      <label class="field">分區數<select data-plan="sections">${[1, 2, 4, 8].map(k => `<option ${plan.sections === k ? 'selected' : ''}>${k}</option>`).join('')}</select></label>
      ${plan.sizes.map((s, i) => `<label class="field">${plan.sizes.length > 1 ? String.fromCharCode(65 + i) + '區' : '人數'}<input type="number" min="2" max="32" value="${s}" data-size="${i}"></label>`).join('')}
      <span class="spacer"></span>
      <button class="btn ghost sm" data-plan-reset>${icon('reset')}依人數重設</button>
    </div>
    <p class="small muted">每區用一張「X 單敗」籤表（X 為 2 到 32），各區冠軍再進${plan.sizes.length > 1 ? '決賽頁' : '決賽'}。人數除不盡時，人多的分區放前面，可以手動調整，總數要等於 ${n}。</p>`;
  } else {
    body = `
    <div class="row">
      <label class="field">3 隊循環（區數）<input type="number" min="0" value="${plan.n3}" data-plan="n3"></label>
      <label class="field">4 隊循環（區數）<input type="number" min="0" value="${plan.n4}" data-plan="n4"></label>
      <span class="spacer"></span>
      <button class="btn ghost sm" data-plan-reset>${icon('reset')}依人數重設</button>
    </div>
    <p class="small muted">3 隊區排在前面，4 隊區排在後面。3 × 3 隊區數 + 4 × 4 隊區數 要等於 ${n}。</p>`;
  }

  let preview = '';
  if (err) preview = `<div class="note bad">${esc(err)}</div>`;
  else if (st.kind === 'ko') {
    preview = `
    <div class="stats">
      <div class="stat"><div class="k">總籤數</div><div class="v">${st.positions}</div></div>
      <div class="stat"><div class="k">分區人數</div><div class="v">${st.sections.map(s => s.size).join(' / ')}</div></div>
      <div class="stat"><div class="k">總場數</div><div class="v">${st.matches.length} 場</div></div>
    </div>`;
  } else {
    preview = `
    <div class="stats">
      <div class="stat"><div class="k">總隊數</div><div class="v">${st.positions}</div></div>
      <div class="stat"><div class="k">區數</div><div class="v">${st.groups.length}</div></div>
      <div class="stat"><div class="k">各區隊數</div><div class="v">${summarizeSizes(st.groups.map(g => g.size))}</div></div>
      <div class="stat"><div class="k">預賽總場數</div><div class="v">${st.matchCount} 場</div></div>
    </div>`;
  }

  $('#main').innerHTML = `
  ${eventTabs()}
  <section class="panel">
    <div class="row"><h2>${name}籤表規劃</h2><span class="muted small">${n} ${EVENT_TYPE[name] === 'team' ? '隊' : EVENT_TYPE[name] === 'double' ? '組' : '人'}</span>
      <span class="spacer"></span>
      <button class="btn" data-dlblank ${err ? 'disabled' : ''}>${icon('download')}下載空白籤表</button></div>
    ${body}
    ${preview}
  </section>`;
}

function summarizeSizes(sizes) {
  const m = new Map();
  sizes.forEach(s => m.set(s, (m.get(s) || 0) + 1));
  return [...m.entries()].map(([s, c]) => `${s}隊×${c}`).join('、');
}

// ---------------- 步驟 4：抽籤 ----------------
let pick = null; // 對調用

function stepDraw() {
  const list = activeEvents();
  if (!list.length) { $('#main').innerHTML = `<section class="panel"><div class="empty">還沒有名單，請先完成步驟 1、2。</div></section>`; return; }
  if (!list.includes(S.event)) S.event = list[0];
  const name = S.event;
  const e = ev(name);
  const { st, err } = structureOf(name);
  const d = e.draw;
  const stale = d && d.sig !== sig(e.entries);

  let result = '';
  if (d && !stale && st) {
    const chk = checkDraw(e.entries, st, d.assign);
    const byPos = new Map(e.entries.map(x => [d.assign[x.id], x]));
    const where = p => {
      if (st.kind === 'rr') {
        const g = st.groups.find(x => p >= x.startPos && p < x.startPos + x.size);
        return `${g.letter}區 ${p - g.startPos + 1}`;
      }
      const s = st.sections.find(x => p >= x.startPos && p < x.startPos + x.size);
      return s.letter ? `${s.letter}區` : '';
    };
    const firstOf = new Map();
    if (st.kind === 'ko') st.matches.forEach(m => m.children.forEach(c => { if (c.kind === 'leaf') firstOf.set(c.pos, m.label); }));
    result = `
    ${chk.errors.length ? `<div class="note bad"><b>錯誤</b><ul>${chk.errors.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}
    ${chk.warnings.length ? `<div class="note warn"><b>需要留意</b><ul>${chk.warnings.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>`
      : (!chk.errors.length ? `<div class="note ok">${icon('check')} 檢查通過：每個人都有籤號，同校都已盡量分開。</div>` : '')}
    <p class="small muted">亂數代碼 <b>${esc(d.seed)}</b>，${new Date(d.time).toLocaleString('zh-TW')} 抽出${d.swaps ? `，之後手動對調 ${d.swaps} 次` : ''}。
      對調兩個籤位方式：先點一列，再點另一列。</p>
    <div class="tbl-wrap scroll"><table>
      <thead><tr><th class="num">籤號</th><th>位置</th>${st.kind === 'ko' ? '<th>首場</th>' : ''}<th>${unitWord(name)}</th><th>${nameWord(name)}</th><th>猛將</th><th>種子</th></tr></thead>
      <tbody>${Array.from({ length: st.positions }, (_, i) => i + 1).map(p => {
        const x = byPos.get(p);
        return `<tr class="click ${pick === p ? 'sel' : ''}" data-pos="${p}">
          <td class="num">${p}</td><td>${where(p)}</td>${st.kind === 'ko' ? `<td>${firstOf.get(p) || ''}</td>` : ''}
          <td>${esc(x ? x.school : '')}</td><td>${esc(x ? x.name : '')}</td><td>${x ? lampCell(x, st.kind === 'rr') : ''}</td><td>${x && fmtSeed(x.seed) !== '' ? '<span class="tag info">種子</span>' : ''}</td></tr>`;
      }).join('')}</tbody></table></div>`;
  }

  $('#main').innerHTML = `
  ${eventTabs()}
  <section class="panel">
    <div class="row"><h2>${name}抽籤</h2><span class="spacer"></span>
      <label class="field" style="flex-direction:row;align-items:center;gap:8px">亂數代碼<input type="text" id="seed" value="" placeholder="留空自動產生" style="width:140px"></label>
      <button class="btn" data-run ${err ? 'disabled' : ''}>${icon('shuffle')}${d ? '重抽' : '開始抽籤'}</button></div>
    ${err ? `<div class="note bad">${esc(err)}，請回步驟 3 調整。</div>` : ''}
    ${stale ? `<div class="note warn">抽籤後名單或種子有變更，請重新抽籤。</div>` : ''}
    <p class="small muted">規則：學校依隊數/人數由多到少處理，每間學校沿著籤表一路往下平均分配（上下半區、四分之一區…到各籤區），同校越晚相遇越好。輸入之前的亂數代碼可以重現同一個結果。</p>
    ${result || (!err && !stale ? '<div class="empty">還沒抽籤</div>' : '')}
  </section>`;
}

function doDraw(name) {
  const e = ev(name);
  const { st, err } = structureOf(name);
  if (err) return toast(err);
  const seed = ($('#seed').value || '').trim() || newSeed();
  try {
    let assign = runDraw(e.entries, st, seed);
    if (st.kind === 'rr') {
      const score = new Map(e.entries.map(x => [x.id, entryStrong(x, true).score]));
      assign = arrangeRR(e.entries, st, assign, x => score.get(x.id) || 0, a => checkDraw(e.entries, st, a));
    }
    e.draw = { assign, seed, time: Date.now(), sig: sig(e.entries), swaps: 0 };
    pick = null;
    toast(`${name}抽籤完成`);
  } catch (ex) {
    toast('抽籤失敗：' + ex.message);
  }
  render();
}

// ---------------- 步驟 5：下載 ----------------
function stepExport() {
  const list = activeEvents();
  if (!list.length) { $('#main').innerHTML = `<section class="panel"><div class="empty">還沒有名單。</div></section>`; return; }
  const rows = list.map(name => {
    const e = ev(name);
    const ok = e.draw && e.draw.sig === sig(e.entries);
    return `<tr><td>${name}</td><td class="num">${e.entries.length}</td>
      <td>${ok ? '<span class="tag ok">已抽籤</span>' : e.draw ? '<span class="tag">名單有變更，需重抽</span>' : '<span class="tag">未抽籤</span>'}</td>
      <td><div class="row">
        <button class="btn sm" data-dlfinal="${name}" ${ok ? '' : 'disabled'}>${icon('download')}完成籤表</button>
        <button class="btn ghost sm" data-dlblank-ev="${name}">${icon('file')}空白籤表</button>
        <button class="btn ghost sm" data-dlorder-ev="${name}">${icon('file')}抽籤順序表</button>
      </div></td></tr>`;
  }).join('');
  $('#main').innerHTML = `
  <section class="panel">
    <div class="row"><h2>下載</h2><span class="spacer"></span>
      <button class="btn" data-dlall>${icon('download')}下載全部完成籤表</button></div>
    <div class="note warn"><b>完成籤表需再經人工檢查</b>：下載後請核對名單、校名與籤位等。</div>
    <p class="small muted">完成籤表比照往年最終 Excel：個人賽每個分區一個分頁並附決賽頁，團體賽為預賽分組表，另附「抽籤結果」工作表（含學校、選手出現次數供核對）。</p>
    <div class="tbl-wrap"><table><thead><tr><th>項目</th><th class="num">數量</th><th>狀態</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
  </section>`;
}

async function dlFinal(name) {
  const e = ev(name);
  const { st } = structureOf(name);
  const wb = finalWorkbook(name, st, e.entries, e.draw.assign, undefined, { time: e.draw.time, seed: e.draw.seed });
  download(await workbookBlob(wb), `${name}_完成籤表.xlsx`);
  toast(`已下載${name}完成籤表，需再經人工檢查`);
}
async function dlBlank(name) {
  const { st, err } = structureOf(name);
  if (err) return toast(err);
  download(await workbookBlob(bracketWorkbook(name, st, null, null)), `${name}_空白籤表.xlsx`);
}
async function dlOrder(name) {
  download(await workbookBlob(orderWorkbook(name, ev(name).entries)), `${name}_抽籤順序表.xlsx`);
}

// ---------------- 步驟 6：點單 ----------------
function drawnSource(name) {
  const e = S.events[name];
  if (!e || !e.draw || e.draw.sig !== sig(e.entries)) return null;
  const { st, err } = structureOf(name);
  if (err) return null;
  const byPos = new Map(e.entries.map(x => [e.draw.assign[x.id], { school: x.school, name: x.name }]));
  return { st, byPos, matches: null, label: '抽籤結果' };
}
function uploadSource(name) {
  const u = S.sheetUploads[name];
  if (!u) return null;
  const st = B.buildStructure({ kind: u.kind, sizes: u.sizes });
  return { st, byPos: new Map(u.people.map(([p, school, nm]) => [p, { school, name: nm }])), matches: u.matches, label: `上傳：${u.fileName}（${u.info}）`, warnings: u.warnings };
}
const sheetSource = name => uploadSource(name) || drawnSource(name);

function stepSheets() {
  const st0 = S.sheetSettings;
  const rows = ALL_EVENTS.map(name => {
    const src = sheetSource(name);
    const up = S.sheetUploads[name];
    return `<tr><td>${name}</td>
      <td>${src ? esc(src.label) : '<span class="muted">尚無籤表</span>'}${src && src.warnings && src.warnings.length ? src.warnings.map(w => `<br><span class="tag">${esc(w)}</span>`).join('') : ''}</td>
      <td><div class="row">
        <label class="btn ghost sm">${icon('upload')}上傳最終籤表<input type="file" accept=".xlsx" hidden data-sheetup="${name}"></label>
        ${up && drawnSource(name) ? `<button class="btn ghost sm" data-sheetclear="${name}">${icon('reset')}改用抽籤結果</button>` : ''}
        <button class="btn sm" data-dlsheet="${name}" ${src ? '' : 'disabled'}>${icon('download')}下載點單 Word</button>
        <button class="btn ghost sm" data-pdfsheet="${name}" ${src ? '' : 'disabled'}>${icon('file')}PDF</button>
      </div></td></tr>`;
  }).join('');
  $('#main').innerHTML = `
  <section class="panel">
    <h2>產生點單</h2>
    <div class="note warn"><b>點單需再經人工檢查</b>：下載後請與籤表核對場次、籤號、校名與姓名等。</div>
    <p class="small muted">每個項目可以直接套用步驟 4 的抽籤結果，或上傳最終籤表 Excel。</p>
    <div class="row">
      <label class="field grow">賽事名稱（點單標題）<input type="text" value="${esc(st0.title)}" data-sset="title"></label>
      <label class="field">空白點單張數<input type="number" min="0" value="${st0.blanks}" data-sset="blanks"></label>
      <label class="field" style="flex-direction:row;align-items:center;gap:6px;margin-top:18px"><input type="checkbox" ${st0.withFinal ? 'checked' : ''} data-sset="withFinal">團體賽附決賽點單（每組取前二）</label>
    </div>
    <div class="tbl-wrap" style="margin-top:12px"><table><thead><tr><th>項目</th><th>籤表來源</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
    <h3>格式</h3>
    <ul class="small">
      <li>個人賽：一頁兩張，上半是前半場次、下半是後半場次（例如 130 張時，第 1 頁是第一場和第六六場），整疊對半裁切後疊起來就是場次順序。</li>
      <li>團體賽：一場一頁，五點（單單雙單單）。</li>
      <li>最後會多附幾張空白點單，張數可在上方設定。</li>
      <li>PDF：按「PDF」直接下載 A4 PDF 檔，版面與 Word 點單相同，頁數多時需要等幾十秒。</li>
    </ul>
  </section>`;
}

async function dlSheet(name) {
  const src = sheetSource(name);
  if (!src) return toast('這個項目還沒有籤表');
  const s = S.sheetSettings;
  try {
    const blob = await scoresheetDocx({ event: name, st: src.st, byPos: src.byPos, matches: src.matches,
      title: s.title || DEFAULT_TITLE, blanks: Math.max(0, +s.blanks || 0), withFinal: !!s.withFinal });
    download(blob, `${name}點單.docx`);
    toast(`已下載${name}點單，需再經人工檢查`);
  } catch (e) { toast('產生失敗：' + e.message); }
}

let pdfBusy = false;
async function pdfSheet(name) {
  const src = sheetSource(name);
  if (!src) return toast('這個項目還沒有籤表');
  if (pdfBusy) return toast('正在產生 PDF，請稍候');
  if (!globalThis.html2canvas || !globalThis.jspdf) return toast('PDF 元件載入失敗，請重新整理網頁');
  pdfBusy = true;
  const s = S.sheetSettings;
  const pages = scoresheetPages({ event: name, st: src.st, byPos: src.byPos, matches: src.matches,
    title: s.title || DEFAULT_TITLE, blanks: Math.max(0, +s.blanks || 0), withFinal: !!s.withFinal });
  const host = document.createElement('div');
  host.className = 'ssr';
  host.style.cssText = 'position:fixed;left:-10000px;top:0;width:210mm;background:#fff;';
  document.body.appendChild(host);
  try {
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    const pdf = new globalThis.jspdf.jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
    for (let i = 0; i < pages.length; i++) {
      host.innerHTML = `<style>${PDF_CSS}</style>${pages[i]}`;
      const canvas = await globalThis.html2canvas(host.querySelector('.page'), { scale: 2, backgroundColor: '#ffffff', logging: false });
      if (i > 0) pdf.addPage();
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.85), 'JPEG', 0, 0, 210, 297);
      if (i % 5 === 0) toast(`產生 PDF 中：${i + 1} / ${pages.length} 頁`);
    }
    pdf.save(`${name}點單.pdf`);
    toast(`已下載${name}點單 PDF，需再經人工檢查`);
  } catch (e) {
    toast('PDF 產生失敗：' + e.message);
  } finally {
    host.remove();
    pdfBusy = false;
  }
}

async function handleSheetUpload(file, name) {
  try {
    const sheets = await readWorkbookValues(await file.arrayBuffer());
    const r = parseFinalBracket(sheets, name);
    S.sheetUploads[name] = {
      fileName: file.name, info: r.info, warnings: r.warnings, kind: r.st.kind,
      sizes: r.st.kind === 'ko' ? r.st.sections.map(x => x.size) : r.st.groups.map(g => g.size),
      people: [...r.byPos.entries()].map(([p, x]) => [p, x.school, x.name]),
      matches: r.matches || null,
    };
    toast(`${name}：已讀取 ${r.info}`);
  } catch (e) { toast(`${name} 讀取失敗：${e.message}`); }
  render();
}

// ---------------- 使用說明 ----------------
// ---------------- 猛將資料庫 ----------------
let strongQ = '', strongAll = false;
// 共用試算表：大家在這裡新增成績，網頁打開時讀「發布到網路」的 CSV
const SHEET_EDIT = 'https://docs.google.com/spreadsheets/d/1oXrar8-PJ2dkPQxfqPcpRjuZymbHljeCh486AXuX5Cc/edit?usp=sharing';
const SHEET_CSV = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vTDauYybFKVAo7xdR7NMbbJHzMYay7B-PcLa2v70E0wg-NUGHdox11mMWoiFMW_f_Q9mWlop_n-UC_q/pub?gid=1568254390&single=true&output=csv';
let sheetStatus = { state: 'loading' };
async function loadSheet() {
  sheetStatus = { state: 'loading' };
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 15000);
    const res = await fetch(SHEET_CSV + '&t=' + Date.now(), { signal: ctl.signal, cache: 'no-store' });
    clearTimeout(timer);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const recs = recordsFromRows(parseCsvText(await res.text()), u => extractSchool(u) || normalizeText(u));
    if (!recs.length) throw new Error('試算表沒有資料');
    setData(recs);
    sheetStatus = { state: 'ok', time: Date.now(), count: recs.length };
  } catch (err) {
    sheetStatus = { state: 'fail', msg: err.name === 'AbortError' ? '逾時' : err.message };
  }
  if (S.step === 3 || S.step === 6) render();
}
const strongOpen = new Set();
const KIND_TEXT = { 全大運: '全大運決賽前八', 分區預賽: '全大運分區預賽前四', 盃賽: '交大盃與其他盃賽前四' };
/** 一串成績：全大運用藍色，其他用黑色 */
const recHtml = list => list.map(r => `<span class="${r.k === '全大運' ? 'rec-top' : ''}">${esc(recLabel(r))}</span>`).join('、');
/** 抽籤結果的亮燈：實心是個人賽得過名次，空心是只有團體賽名次 */
function lampCell(x, isTeam) {
  const s = entryStrong(x, isTeam);
  if (!s.list.length) return '';
  const tip = s.list.map(p => `${p.name}：${[...p.ind, ...p.team].map(recLabel).join('、')}`).join('\n');
  if (!isTeam) return `<span class="lamp ${s.a ? 'on' : 'half'}" title="${esc(tip)}"></span>`;
  return `<span class="lamps" title="${esc(tip)}">${s.a ? `<span class="lamp on"></span>${s.a}` : ''}${s.b ? `<span class="lamp half"></span>${s.b}` : ''}</span>`;
}
/** 團體：個人賽有名次的列成績，只有團體名次的列名字就好 */
function teamDetail(list) {
  const a = list.filter(p => p.level === 2), b = list.filter(p => p.level === 1);
  return [...a.map(p => `<b>${esc(p.name)}</b> ${recHtml(p.ind)}`),
    ...(b.length ? [`<span class="muted">團體得名：</span>${esc(b.map(p => p.name).join('、'))}`] : [])].join('<br>');
}
function strongEntries() {
  return activeEvents().map(name => {
    const type = EVENT_TYPE[name];
    const isTeam = type === 'team';
    const rows = ev(name).entries.map(x => ({ x, s: entryStrong(x, isTeam) })).filter(r => r.s.list.length)
      .sort((a, b) => b.s.score - a.s.score);
    return { name, type, isTeam, rows };
  }).filter(g => g.rows.length);
}
function detailOf(g, s) {
  if (g.isTeam) return teamDetail(s.list);
  if (g.type === 'single') return recHtml([...s.list[0].ind, ...s.list[0].team]); // 單打不用再寫名字
  return s.list.map(p => `<b>${esc(p.name)}</b> ${recHtml([...p.ind, ...p.team])}`).join('<br>');
}
function strongListHtml() {
  const q = strongQ.trim();
  const people = allPlayers().map(p => ({ ...p, ind: p.ind.filter(isGeneral), team: p.team.filter(isGeneral) }))
    .filter(p => p.ind.length || (strongAll && p.team.length))
    .filter(p => !q || p.name.includes(q) || p.schools.some(u => u.includes(q)))
    .sort((a, b) => (b.ind.length - a.ind.length) || (b.team.length - a.team.length));
  const shown = people.slice(0, 300);
  return `<div class="tbl-wrap scroll"><table>
      <thead><tr><th>姓名</th><th>學校</th><th>個人賽</th><th>團體賽</th></tr></thead>
      <tbody>${shown.map(p => `<tr><td class="nowrap">${esc(p.name)}</td><td>${esc(p.schools.join('、'))}</td>
        <td class="small">${recHtml(p.ind)}</td><td class="small">${recHtml(p.team)}</td></tr>`).join('')}</tbody>
    </table></div>
    <p class="small muted">共 ${people.length} 人${people.length > shown.length ? `，只顯示前 ${shown.length} 人，請用搜尋` : ''}。</p>`;
}
function stepStrong() {
  const groups = strongEntries();
  const cov = coverage();
  $('#main').innerHTML = `
  <section class="panel">
    <div class="row"><h2>資料庫涵蓋範圍</h2><span class="spacer"></span>
      <a class="btn ghost" href="${SHEET_EDIT}" target="_blank" rel="noopener">${icon('open')}開啟共用試算表</a></div>
    <p class="small">要新增成績，請到共用試算表新增（請用交大盃信箱開啟），存檔後重新整理這個網頁就會更新。</p>
    <p class="small muted">${sheetStatus.state === 'ok' ? `目前資料：共用試算表，${sheetStatus.count} 筆，${new Date(sheetStatus.time).toLocaleString('zh-TW')} 讀取。`
      : sheetStatus.state === 'loading' ? '正在讀取共用試算表，先顯示網頁內建資料。'
      : `讀不到共用試算表（${esc(sheetStatus.msg)}），先用網頁內建資料。`}</p>
    <div class="kv">${cov.map(c => `<b>${esc(KIND_TEXT[c.k] || c.k)}</b><span>${esc(c.items.join('、'))}</span>`).join('')}</div>
    <p class="small muted">用人名比對，換學校也找得到。<span class="lamp on"></span>個人賽得過名次　<span class="lamp half"></span>只有團體賽名次。成績<span class="rec-top">藍色</span>是全大運決賽，黑色是分區預賽與盃賽。公開組選手只能報社會組，不列在下方資料庫，但一樣會用在社會組的燈號。</p>
  </section>
  <section class="panel">
    <h2>本屆名單裡的猛將</h2>
    ${groups.length ? groups.map(g => `
      <details class="fold" data-fold="${g.name}" ${strongOpen.has(g.name) ? 'open' : ''}>
        <summary>${g.name}<span class="muted small">　${g.rows.length} ${g.isTeam ? '隊' : '筆'}</span></summary>
        <div class="tbl-wrap"><table>
          <thead><tr><th>${unitWord(g.name)}</th><th>${nameWord(g.name)}</th>${g.isTeam ? '<th class="num">猛將</th>' : ''}<th>成績</th></tr></thead>
          <tbody>${g.rows.map(({ x, s }) => `<tr><td class="nowrap">${esc(x.school)}</td><td class="nowrap">${esc(x.name)}</td>
            ${g.isTeam ? `<td class="num nowrap">${s.a ? `<span class="lamp on"></span>${s.a}` : ''} ${s.b ? `<span class="lamp half"></span>${s.b}` : ''}</td>` : ''}
            <td class="small">${detailOf(g, s)}</td></tr>`).join('')}</tbody>
        </table></div>
      </details>`).join('')
    : '<div class="empty">名單裡還沒有找到資料庫中的選手（先完成步驟 1、2）。</div>'}
  </section>
  <section class="panel">
    <div class="row"><h2>資料庫（一般組）</h2><span class="spacer"></span>
      <input type="search" id="strong-q" placeholder="搜尋姓名或學校" value="${esc(strongQ)}" style="width:180px">
      <label class="small"><input type="checkbox" id="strong-all" ${strongAll ? 'checked' : ''}> 含只有團體賽名次的選手</label></div>
    <div id="strong-list">${strongListHtml()}</div>
  </section>`;
}

function stepHelp() {
  $('#main').innerHTML = `
  <section class="panel">
    <h2>專案檔</h2>
    <p>網頁不會把資料存到任何伺服器，進度只存在這台電腦的瀏覽器裡。</p>
    <div class="kv">
      <b>匯出專案檔</b><span>把目前的名單、校名修正、籤表設定和抽籤結果，存成一個 .json 檔。可以當備份或交接給別人。</span>
      <b>匯入專案檔</b><span>讀回那個 .json 檔，就能從存檔的地方繼續。</span>
      <b>清除全部</b><span>清掉這台電腦上的所有資料，例如要從頭開始，或用公用電腦做完要清掉個資時。</span>
    </div>
  </section>
  <section class="panel">
    <h2>多台電腦使用</h2>
    <p>每台電腦、每個瀏覽器的資料各自獨立，A 電腦做的校正，B 電腦看不到。
      要換電腦或交給別人接手，在原本的電腦「匯出專案檔」，到另一台「匯入專案檔」。</p>
    <p>建議抽籤由一個人操作，抽完後匯出專案檔，連同完成籤表一起放進共用資料夾存檔。</p>
  </section>
  <section class="panel">
    <h2>籤表規劃</h2>
    <ul>
      <li><b>個人賽</b>：人數切成數個分區（A、B、C…），每區一張「X 單敗」籤表，X 為 2 到 32。預設每區越大越好（每區最多 32 人）：32 人以下不分區，33 到 64 人分 2 區，65 到 128 人分 4 區，129 人以上分 8 區。人數除不盡時各區差一人，人多的分區放前面，也可以手動改各區人數。</li>
      <li><b>團體賽</b>：預賽分組循環，可設定 3 隊循環與 4 隊循環各幾區，3 隊區排前面。每區取前二晉級，決賽籤表另外處理。</li>
      <li><b>團體賽場次編號</b>：一輪一輪編，每輪由 A 組到最後一組。4 隊組：第一輪 1-3、2-4，第二輪 2-3、1-4，第三輪 1-2、3-4；3 隊組：1-2、1-3、2-3。</li>
    </ul>
  </section>
  <section class="panel">
    <h2>抽籤邏輯</h2>
    <ul>
      <li><b>同校分開</b>：同一學校（社團為同一單位）的選手或隊伍盡量分散。</li>
      <li><b>上下半區平均</b>：同校 2 人時一定分在上下半區，決賽前不會相遇。</li>
      <li><b>同籤區不重複</b>：同校 3 人以上時，同一個籤區不會有兩個同校。學校有 n 人，就在籤表上找第一個「小區塊數大於等於 n」的層級，讓這些人各落在不同的小區塊。</li>
      <li><b>種子也算進同校分布</b>：已固定的種子會先佔位，同校其他人會避開種子所在的區域。</li>
      <li><b>抽完自動檢查</b>：每人都有籤號且不重複；各區同校人數超過理想值、第一場就同校對戰、學校隊數比區數多（一定同區）都會列出提醒。</li>
      <li><b>團體賽</b>：組與組之間同樣分上下半區平均，同校隊伍盡量不同組，組內 1 到 4 號位置隨機。</li>
    </ul>
  </section>
  <section class="panel">
    <h2>流程</h2>
    <ol>
      <li><b>上傳表單回應</b>：Google 試算表「檔案 &gt; 下載 &gt; Microsoft Excel (.xlsx)」，男子組、女子組、社會組各一份。整列劃掉的回應預設不採用，格子裡劃掉的名字直接排除。</li>
      <li><b>名單校正</b>：檢查名單、統一校名、加入保留名額、設定種子籤號。</li>
      <li><b>籤表規劃</b>：設定分區人數或每區隊數，下載空白籤表檢查。</li>
      <li><b>抽籤</b>：同校分開抽籤，可重抽、可手動對調籤位。記下亂數代碼可以重現結果。</li>
      <li><b>下載完成籤表</b>：各項目的 Excel 籤表與抽籤結果，需再經人工檢查。</li>
      <li><b>點單</b>：用抽籤結果或上傳最終籤表，產生 Word 點單或 PDF，需再經人工檢查。</li>
      <li><b>猛將資料庫</b>：歷年全大運與交大盃得名的選手，抽籤結果會用燈號標出名單裡的猛將。</li>
    </ol>
  </section>`;
}

// ---------------- 事件 ----------------
document.addEventListener('click', async ev0 => {
  const t = ev0.target.closest('[data-pdfsheet],[data-sheetclear],[data-dlsheet],[data-step],[data-ev],[data-build],[data-del],[data-addrow],[data-dlorder],[data-promote],[data-paste],[data-newev],[data-plan-reset],[data-dlblank],[data-run],[data-pos],[data-dlfinal],[data-dlblank-ev],[data-dlorder-ev],[data-dlall]');
  if (!t) return;
  const d = t.dataset;
  if (d.sheetclear) { delete S.sheetUploads[d.sheetclear]; render(); }
  else if (d.dlsheet) dlSheet(d.dlsheet);
  else if (d.pdfsheet) pdfSheet(d.pdfsheet);
  else if (d.step !== undefined) { S.step = +d.step; pick = null; render(); }
  else if (d.ev) { S.event = d.ev; pick = null; render(); }
  else if (d.build) buildFromSource(d.build);
  else if (d.del) {
    const e = ev(S.event);
    e.entries = e.entries.filter(x => x.id !== d.del);
    render();
  } else if (d.addrow !== undefined) {
    ev(S.event).entries.unshift({ id: uid(), school: '', name: '', seed: '', src: null, flags: ['新增'] });
    render();
  } else if (d.promote) {
    const e = ev(S.event);
    const x = e.waitlist.find(w => w.id === d.promote);
    e.waitlist = e.waitlist.filter(w => w.id !== d.promote);
    e.entries.push({ ...x, flags: [...(x.flags || []), '由候補加入'] });
    render();
  } else if (d.paste !== undefined) { pasteRows($('#paste').value); render(); }
  else if (d.newev) { ev(d.newev); S.event = d.newev; S.step = 1; render(); }
  else if (d.planReset !== undefined) { ev(S.event).plan = null; render(); }
  else if (d.dlblank !== undefined) dlBlank(S.event);
  else if (d.dlorder !== undefined) dlOrder(S.event);
  else if (d.run !== undefined) {
    const e = ev(S.event);
    if (e.draw && !confirm('重抽會取代目前的抽籤結果，確定嗎？')) return;
    doDraw(S.event);
  } else if (d.pos) {
    const p = +d.pos;
    const e = ev(S.event);
    if (pick === null) pick = p;
    else if (pick === p) pick = null;
    else {
      e.draw.assign = swapPositions(e.draw.assign, pick, p);
      e.draw.swaps = (e.draw.swaps || 0) + 1;
      toast(`已對調籤號 ${pick} 和 ${p}`);
      pick = null;
    }
    render();
  } else if (d.dlfinal) dlFinal(d.dlfinal);
  else if (d.dlblankEv) dlBlank(d.dlblankEv);
  else if (d.dlorderEv) dlOrder(d.dlorderEv);
  else if (d.dlall !== undefined) {
    const ready = activeEvents().filter(n => ev(n).draw && ev(n).draw.sig === sig(ev(n).entries));
    if (!ready.length) return toast('還沒有抽完籤的項目');
    for (const n of ready) { await dlFinal(n); await new Promise(r => setTimeout(r, 400)); }
  }
});

// 搜尋只更新結果表，不重畫整頁；中文輸入法選字中不更新
function updateStrongList(t) {
  strongQ = t.value;
  const box = $('#strong-list');
  if (box) box.innerHTML = strongListHtml();
}
document.addEventListener('input', ev0 => {
  if (ev0.target.id === 'strong-q' && !ev0.isComposing) updateStrongList(ev0.target);
});
document.addEventListener('compositionend', ev0 => {
  if (ev0.target.id === 'strong-q') updateStrongList(ev0.target);
});
document.addEventListener('toggle', ev0 => {
  const f = ev0.target.dataset && ev0.target.dataset.fold;
  if (f) { if (ev0.target.open) strongOpen.add(f); else strongOpen.delete(f); }
}, true);

document.addEventListener('change', ev0 => {
  if (ev0.target.id === 'strong-all') { strongAll = ev0.target.checked; $('#strong-list').innerHTML = strongListHtml(); return; }
  const t = ev0.target;
  const d = t.dataset;
  if (d.file) { if (t.files[0]) handleFile(t.files[0], d.file); return; }
  if (d.sheetup) { if (t.files[0]) handleSheetUpload(t.files[0], d.sheetup); t.value = ''; return; }
  if (d.sset) {
    const k = d.sset;
    S.sheetSettings[k] = k === 'withFinal' ? t.checked : k === 'blanks' ? Math.max(0, +t.value || 0) : t.value.trim();
    save();
    return;
  }
  if (d.inc) {
    const [k, i] = d.inc.split(':');
    S.sources[k].responses[+i].include = t.checked;
    render();
  } else if (d.rschool) {
    const [k, i] = d.rschool.split(':');
    S.sources[k].responses[+i].school = t.value.trim();
    save();
  } else if (d.f && d.id) {
    const x = ev(S.event).entries.find(y => y.id === d.id);
    if (!x) return;
    if (d.f === 'seed') x.seed = t.value === '' ? '' : Number(t.value);
    else x[d.f] = t.value.trim();
    if (d.f !== 'seed') render(); else save();
  } else if (d.rename) {
    renameSchool(d.rename, t.value);
    render();
  } else if (d.plan) {
    const e = ev(S.event);
    const n = e.entries.length;
    const p = planOf(S.event);
    if (d.plan === 'sections') { p.sections = +t.value; p.sizes = B.splitSizes(n, p.sections); }
    void n;
    if (d.plan === 'n3' || d.plan === 'n4') { p[d.plan] = Math.max(0, Math.floor(+t.value || 0)); p.sizes = rrSizes(p); }
    render();
  } else if (d.size !== undefined) {
    const p = planOf(S.event);
    const i = +d.size;
    const n = ev(S.event).entries.length;
    const v = Math.max(2, Math.min(32, +t.value || 2));
    // 改一區時，差額由最後一區（或倒數第二區）吸收
    const sizes = p.sizes.slice();
    sizes[i] = v;
    const diff = n - sizes.reduce((a, b) => a + b, 0);
    const j = i === sizes.length - 1 ? sizes.length - 2 : sizes.length - 1;
    if (j >= 0) sizes[j] += diff;
    p.sizes = sizes;
    render();
  }
});

// 拖曳上傳
document.addEventListener('dragover', e => {
  const z = e.target.closest('[data-drop]');
  if (z) { e.preventDefault(); z.classList.add('over'); }
});
document.addEventListener('dragleave', e => {
  const z = e.target.closest('[data-drop]');
  if (z) z.classList.remove('over');
});
document.addEventListener('drop', e => {
  const z = e.target.closest('[data-drop]');
  if (!z) return;
  e.preventDefault();
  [...e.dataTransfer.files].forEach(f => handleFile(f, z.dataset.drop));
});

// 專案檔
$('#btn-export').innerHTML = `${icon('save')}匯出專案檔`;
$('#lbl-import').outerHTML = `${icon('open')}匯入專案檔`;
$('#btn-reset').innerHTML = `${icon('reset')}清除全部`;
$('#btn-export').onclick = () => {
  const d = new Date();
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}_${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`;
  download(new Blob([JSON.stringify(S, null, 1)], { type: 'application/json' }), `交大盃抽籤_${stamp}.json`);
};
$('#file-import').onchange = async e => {
  const f = e.target.files[0];
  if (!f) return;
  try {
    const s = JSON.parse(await f.text());
    if (s.version !== 1) throw new Error('版本不符');
    const b = blank();
    S = { ...b, ...s, sheetSettings: fixTitle({ ...b.sheetSettings, ...(s.sheetSettings || {}) }), sheetUploads: s.sheetUploads || {} };
    toast('已匯入');
    render();
  } catch (err) { toast('匯入失敗：' + err.message); }
  e.target.value = '';
};
$('#btn-reset').onclick = () => {
  if (!confirm('會清除這台電腦上所有名單與抽籤結果（建議先匯出專案檔），確定嗎？')) return;
  S = blank();
  render();
};

render();
loadSheet();
