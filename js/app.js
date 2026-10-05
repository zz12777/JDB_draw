// 交大盃抽籤系統：介面
import { parseResponses, buildEntries, EVENTS, ALL_EVENTS, EVENT_TYPE, KIND_LABEL } from './parse.js';
import { readFormFile } from './reader.js';
import { looseKey } from './schools.js';
import * as B from './bracket.js';
import { runDraw, checkDraw, swapPositions } from './draw.js';
import { bracketWorkbook, orderWorkbook, workbookBlob, sortForOrder } from './excel.js';
import { newSeed, uid, toCn } from './util.js';

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
};
const icon = n => `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${ICON[n]}</svg>`;

// ---------------- 狀態 ----------------
const KEY = 'jdb-draw-v1';
const blank = () => ({ version: 1, aliases: {}, sources: {}, events: {}, step: 0, event: '男團' });
let S = load();

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s && s.version === 1) return { ...blank(), ...s };
  } catch { /* 無法讀取就從頭開始 */ }
  return blank();
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
function defaultPlan(name, n) {
  if (EVENT_TYPE[name] === 'team') {
    const size = name === '女團' ? 3 : 4;
    const g = Math.max(1, B.defaultGroupCount(n, size));
    return { kind: 'rr', groupSize: size, groups: g, sizes: B.groupSizes(n, g) };
  }
  const k = B.defaultSections(n);
  return { kind: 'ko', sections: k, sizes: B.splitSizes(n, k) };
}
function planOf(name) {
  const e = ev(name);
  const n = e.entries.length;
  const sum = p => p.sizes.reduce((a, b) => a + b, 0);
  if (!e.plan || sum(e.plan) !== n) e.plan = defaultPlan(name, n);
  return e.plan;
}
function structureOf(name) {
  try { return { st: B.buildStructure(planOf(name)) }; } catch (err) { return { err: err.message }; }
}
const sig = entries => entries.map(x => `${x.id}|${x.school}|${fmtSeed(x.seed)}`).join(';');

// ---------------- 版面 ----------------
const STEPS = ['上傳表單回應', '名單校正', '籤表規劃', '抽籤', '下載完成籤表'];

function renderSteps() {
  $('#steps').innerHTML = STEPS.map((s, i) =>
    `<button class="${S.step === i ? 'on' : ''}" data-step="${i}"><span class="n">${i + 1}</span>${s}</button>`).join('');
}
function render() {
  renderSteps();
  [stepUpload, stepEdit, stepPlan, stepDraw, stepExport][S.step]();
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
          <span class="f">${src ? `${esc(src.fileName)}，${src.responses.length} 筆回應` : '點這裡選檔，或把檔案拖進來'}</span>
          <input type="file" accept=".xlsx,.csv" hidden data-file="${k}">
        </label>`;
      }).join('')}
    </div>
    <p class="small muted">不用三份都有，只上傳其中一份也可以。上傳後檢查下面的回應，再按「產生名單」。</p>
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
    <p class="small muted">採用 ${rs.filter(r => r.include).length} / ${rs.length} 筆。整列劃掉的回應預設不勾選，格子裡劃掉的名字已直接排除。同校的多筆回應在產生名單時會合併，重複的人或隊伍只留一筆。${k === 'social' ? '社會組的「單位」用來做同單位分開，同一個人報的多隊請填相同單位。' : '學校欄可以直接修改。'}</p>
    <div class="tbl-wrap scroll"><table>
      <thead><tr><th>採用</th><th class="num">列</th><th>${k === 'social' ? '單位' : '學校'}</th><th>隊伍</th><th class="num">團體</th><th class="num">單打</th><th class="num">雙打</th><th>提醒</th></tr></thead>
      <tbody>${rs.map((r, i) => `<tr class="${r.include ? '' : 'off'}">
        <td><input type="checkbox" data-inc="${k}:${i}" ${r.include ? 'checked' : ''}></td>
        <td class="num">${r.rowNo}</td>
        <td><input type="text" value="${esc(r.school)}" data-rschool="${k}:${i}"></td>
        <td>${r.teams.map(t => `<span class="chip">${esc(t.name)}${t.waitlist ? '（候補）' : ''}</span>`).join(' ')}</td>
        <td class="num">${r.teams.length || ''}</td>
        <td class="num">${r.singles.length || ''}</td>
        <td class="num">${r.doubles.length || ''}</td>
        <td>${r.notes.map(n => `<span class="tag">${esc(n)}</span>`).join('')}${sameSchool(r)}</td>
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
    <div class="note small">地主隊（例如陽明交大）和工作人員保留名額不在表單裡，請用「新增一列」或右邊的「貼上名單」加入。
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
      <label class="field">每區隊數<select data-plan="groupSize">${[3, 4, 5].map(k => `<option ${plan.groupSize === k ? 'selected' : ''}>${k}</option>`).join('')}</select></label>
      <label class="field">區數<input type="number" min="1" value="${plan.groups}" data-plan="groups"></label>
      <span class="spacer"></span>
      <button class="btn ghost sm" data-plan-reset>${icon('reset')}依人數重設</button>
    </div>
    <p class="small muted">除不盡時，多出的隊伍分到最後幾區。</p>`;
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
      要對調兩個籤位：先點一列，再點另一列。</p>
    <div class="tbl-wrap scroll"><table>
      <thead><tr><th class="num">籤號</th><th>位置</th>${st.kind === 'ko' ? '<th>首場</th>' : ''}<th>${unitWord(name)}</th><th>${nameWord(name)}</th><th>種子</th></tr></thead>
      <tbody>${Array.from({ length: st.positions }, (_, i) => i + 1).map(p => {
        const x = byPos.get(p);
        return `<tr class="click ${pick === p ? 'sel' : ''}" data-pos="${p}">
          <td class="num">${p}</td><td>${where(p)}</td>${st.kind === 'ko' ? `<td>${firstOf.get(p) || ''}</td>` : ''}
          <td>${esc(x ? x.school : '')}</td><td>${esc(x ? x.name : '')}</td><td>${x && fmtSeed(x.seed) !== '' ? '<span class="tag info">種子</span>' : ''}</td></tr>`;
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
    <p class="small muted">規則：學校依人數由多到少處理，每間學校沿著籤表一路往下平均分配（上下半區、四分之一區…到各籤區），同校越晚相遇越好；種子固定在指定籤號。輸入之前的亂數代碼可以重現同一個結果。</p>
    ${result || (!err && !stale ? '<div class="empty">還沒抽籤</div>' : '')}
  </section>`;
}

function doDraw(name) {
  const e = ev(name);
  const { st, err } = structureOf(name);
  if (err) return toast(err);
  const seed = ($('#seed').value || '').trim() || newSeed();
  try {
    const assign = runDraw(e.entries, st, seed);
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
    <p class="small muted">完成籤表包含預賽籤表、決賽頁與「抽籤結果」工作表，抽籤結果附上學校、選手出現次數供核對。</p>
    <div class="tbl-wrap"><table><thead><tr><th>項目</th><th class="num">數量</th><th>狀態</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
  </section>`;
}

async function dlFinal(name) {
  const e = ev(name);
  const { st } = structureOf(name);
  const wb = bracketWorkbook(name, st, e.entries, e.draw.assign);
  download(await workbookBlob(wb), `${name}_完成籤表.xlsx`);
}
async function dlBlank(name) {
  const { st, err } = structureOf(name);
  if (err) return toast(err);
  download(await workbookBlob(bracketWorkbook(name, st, null, null)), `${name}_空白籤表.xlsx`);
}
async function dlOrder(name) {
  download(await workbookBlob(orderWorkbook(name, ev(name).entries)), `${name}_抽籤順序表.xlsx`);
}

// ---------------- 事件 ----------------
document.addEventListener('click', async ev0 => {
  const t = ev0.target.closest('[data-step],[data-ev],[data-build],[data-del],[data-addrow],[data-dlorder],[data-promote],[data-paste],[data-newev],[data-plan-reset],[data-dlblank],[data-run],[data-pos],[data-dlfinal],[data-dlblank-ev],[data-dlorder-ev],[data-dlall]');
  if (!t) return;
  const d = t.dataset;
  if (d.step !== undefined) { S.step = +d.step; pick = null; render(); }
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

document.addEventListener('change', ev0 => {
  const t = ev0.target;
  const d = t.dataset;
  if (d.file) { if (t.files[0]) handleFile(t.files[0], d.file); return; }
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
    if (d.plan === 'groupSize') { p.groupSize = +t.value; p.groups = Math.max(1, B.defaultGroupCount(n, p.groupSize)); p.sizes = B.groupSizes(n, p.groups); }
    if (d.plan === 'groups') { p.groups = Math.max(1, +t.value || 1); p.sizes = B.groupSizes(n, p.groups); }
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
    S = { ...blank(), ...s };
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
