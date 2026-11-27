// 參賽者系統原型：管理頁（報名回覆表格、名額、候補遞補、繳費對帳、異動申請、設定）
import { GROUPS, EVENTS, KIND, UNIT_WORD, STATUS_TEXT, PAY_TEXT, phase, quotaOf, waitRank, feeOf, payState, paidSum, entryName, fmtMoney, fmtTime, fmtDT } from './model.js';
import { getState, update, subscribe, resetDemo } from './store.js';
import { applyChange } from './changes.js';
import { esc, $, $$, icon, toast, header, demoBar } from './ui.js';

const ROLE_KEY = 'jdb-reg14-role';
let role = (() => { try { return localStorage.getItem(ROLE_KEY) || 'finance'; } catch (e) { return 'finance'; } })(); // admin | finance（總召、總務）
let tab = 'sheet';
const sheet = { name: 'team', q: '', ev: '', st: '', sort: null, dir: 1 };
let detail = null; // 打開明細的報名 id
const fin = () => role === 'finance';
const BY = () => (fin() ? 'finance@example.com' : 'admin@example.com');

const TABS = [['sheet', '報名回覆', 'table'], ['quota', '名額', 'bars'], ['wait', '候補遞補', 'list'], ['pay', '繳費對帳', 'money'], ['req', '異動申請', 'swap'], ['set', '設定', 'gear']];

function render() {
  const st = getState();
  $('#top').innerHTML = header(st.settings, '報名管理', `<label class="rolesel">示範身分<select data-role><option value="finance" ${fin() ? 'selected' : ''}>總召、總務</option><option value="admin" ${fin() ? '' : 'selected'}>管理員</option></select></label>`);
  const pend = Object.values(st.regs).reduce((a, r) => a + (r.reqs || []).filter(q => q.status === 'pending').length, 0);
  const unpaid = Object.values(st.regs).filter(r => payState(r) === 'reported').length;
  const badge = k => (k === 'req' && pend ? `<span class="badge">${pend}</span>` : k === 'pay' && unpaid && fin() ? `<span class="badge">${unpaid}</span>` : '');
  $('#tabs').innerHTML = TABS.filter(([k]) => k !== 'pay' || fin()).map(([k, t, ic]) => `<button class="${tab === k ? 'on' : ''}" data-tab="${k}">${icon(ic)}${t}${badge(k)}</button>`).join('');
  if (tab === 'pay' && !fin()) tab = 'sheet';
  $('#main').innerHTML = demoBar('<button class="btn ghost sm" data-reset>重設示範資料</button>') + ({ sheet: viewSheet, quota: viewQuota, wait: viewWait, pay: viewPay, req: viewReq, set: viewSet }[tab])(st);
  drawDetail();
}

// ---------------- 報名回覆（像試算表） ----------------
const evSum = r => EVENTS.map(ev => { const n = r.entries.filter(e => e.ev === ev && e.status !== 'out').length; return n ? `${ev}${n}` : ''; }).filter(Boolean).join(' ');
const stText = (st, e) => (e.status === 'wait' ? `候補 ${waitRank(st, e)}` : STATUS_TEXT[e.status]);
function sheetDef(st) {
  const base = r => [['contact', '聯絡人', r.contact.name], ['email', 'email', r.contact.email], ['phone', '手機', r.contact.phone || ''], ['pay', '繳費狀態', PAY_TEXT[payState(r)]]];
  if (sheet.name === 'team') {
    return {
      rows: Object.values(st.regs).flatMap(r => r.entries.filter(e => KIND[e.ev] === 'team').map(e => ({ r, e, cells: [['ts', '時間戳記', fmtTime(e.ts), e.ts], ['ev', '項目', e.ev], ['unit', '單位', r.unit], ['name', '隊名', e.name], ['coach', '教練', e.coach], ['leader', '領隊', e.leader], ['captain', '隊長', e.captain],
        ['members', '隊員', (e.members || []).join('、')], ['n', '人數', (e.members || []).length, (e.members || []).length], ['lineup', '點單', e.lineup === 'paper' ? '紙本' : '線上'], ['st', '狀態', stText(st, e)], ...base(r)] }))),
    };
  }
  if (sheet.name === 'ind') {
    return { rows: Object.values(st.regs).flatMap(r => r.entries.filter(e => KIND[e.ev] !== 'team').map(e => ({ r, e, cells: [['ts', '時間戳記', fmtTime(e.ts), e.ts], ['ev', '項目', e.ev], ['unit', '單位', r.unit], ['name', '選手', entryName(e)], ['st', '狀態', stText(st, e)], ...base(r)] }))) };
  }
  return {
    rows: Object.values(st.regs).map(r => { const f = feeOf(st, r); return { r, e: null, cells: [['ts', '時間戳記', fmtTime(r.createdAt), r.createdAt], ['grp', '組別', GROUPS[r.group].name], ['unit', '單位', r.unit], ['contact', '聯絡人', r.contact.name], ['email', 'email', r.contact.email], ['phone', '手機', r.contact.phone || ''],
      ['eds', '共同管理', (r.editors || []).join('、')], ['sum', '報名項目', evSum(r)], ['park', '停車證', r.parking || 0, r.parking || 0], ...(fin() ? [['fee', '應繳', f.total, f.total], ['paid', '已回報', paidSum(r), paidSum(r)]] : []), ['pay', '繳費狀態', PAY_TEXT[payState(r)]], ['upd', '最後修改', fmtTime(r.updatedAt), r.updatedAt]] }; }),
  };
}
function sheetRows(st) {
  let rows = sheetDef(st).rows;
  if (sheet.ev) rows = rows.filter(x => (x.e ? x.e.ev === sheet.ev : GROUPS[x.r.group].events.includes(sheet.ev)));
  if (sheet.st) rows = rows.filter(x => (x.e ? x.e.status === sheet.st : true));
  const ts = sheet.q.split(/\s+/).filter(Boolean);
  if (ts.length) rows = rows.filter(x => { const t = x.cells.map(c => c[2]).join(' '); return ts.every(k => t.includes(k)); });
  const k = sheet.sort;
  rows = rows.slice().sort((a, b) => {
    if (!k) return (a.cells[0][3] || 0) - (b.cells[0][3] || 0);
    const ca = a.cells.find(c => c[0] === k), cb = b.cells.find(c => c[0] === k);
    const va = ca ? (ca[3] ?? ca[2]) : '', vb = cb ? (cb[3] ?? cb[2]) : '';
    return (typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb), 'zh-Hant')) * sheet.dir;
  });
  return rows;
}
function viewSheet(st) {
  const rows = sheetRows(st);
  const cols = (rows[0] || sheetDef(st).rows[0] || { cells: [] }).cells;
  const evs = sheet.name === 'team' ? EVENTS.filter(e => KIND[e] === 'team') : sheet.name === 'ind' ? EVENTS.filter(e => KIND[e] !== 'team') : EVENTS;
  const pill = (k, v, t, cur) => `<button class="${cur === v ? 'on' : ''}" data-${k}="${v}">${t}</button>`;
  return `<div class="panel"><div class="row"><div class="seg">${[['team', '團體賽'], ['ind', '個人賽'], ['unit', '報名單位']].map(([k, t]) => pill('sheet', k, t, sheet.name)).join('')}</div>
      <label class="sbox">${icon('search')}<input id="sq" type="search" placeholder="搜尋學校、隊名、姓名、email" value="${esc(sheet.q)}"></label><span class="spacer"></span>
      <span class="small muted">${rows.length} 筆</span><button class="btn ghost sm" data-xlsx>${icon('download')}匯出 Excel</button></div>
    <div class="row" style="margin-top:8px"><div class="pills">${pill('fev', '', '全部項目', sheet.ev)}${evs.map(e => pill('fev', e, e, sheet.ev)).join('')}</div>
      ${sheet.name !== 'unit' ? `<div class="pills">${pill('fst', '', '全部狀態', sheet.st)}${pill('fst', 'ok', '正取', sheet.st)}${pill('fst', 'wait', '候補', sheet.st)}${pill('fst', 'out', '已退出', sheet.st)}</div>` : ''}</div>
    <div class="gsheet"><table><thead><tr><th class="rn"></th>${cols.map(c => `<th data-sort="${c[0]}" class="${sheet.sort === c[0] ? 'on' : ''}">${esc(c[1])}${sheet.sort === c[0] ? (sheet.dir > 0 ? ' ▲' : ' ▼') : ''}</th>`).join('')}</tr></thead>
      <tbody>${rows.map((x, i) => `<tr data-rid="${x.r.id}" class="${x.e && x.e.status === 'out' ? 'dim' : x.e && x.e.status === 'wait' ? 'waitrow' : ''}"><td class="rn">${i + 1}</td>${x.cells.map(c => `<td class="c-${c[0]}">${esc(c[2])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
    <p class="small muted" style="margin:8px 0 0">點標題排序，點一列看這個單位的完整資料與修改紀錄。</p></div>`;
}
async function exportXlsx(st) {
  if (!window.ExcelJS) { toast('Excel 元件載入中，請稍候再按一次'); return; }
  const rows = sheetRows(st);
  const cols = (rows[0] || { cells: [] }).cells;
  const wb = new window.ExcelJS.Workbook(), ws = wb.addWorksheet({ team: '團體賽', ind: '個人賽', unit: '報名單位' }[sheet.name]);
  ws.addRow(cols.map(c => c[1])).font = { bold: true };
  rows.forEach(x => ws.addRow(x.cells.map(c => (c[0] === 'ts' || c[0] === 'upd' ? new Date(c[3]) : c[2]))));
  ws.columns.forEach((c, i) => { c.width = Math.min(40, Math.max(8, ...rows.slice(0, 200).map(x => String(x.cells[i] ? x.cells[i][2] : '').length * 1.8), cols[i] ? cols[i][1].length * 2 : 8)); });
  ws.getColumn(1).numFmt = 'yyyy/m/d hh:mm';
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  const buf = await wb.xlsx.writeBuffer();
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([buf])); a.download = `報名回覆_${{ team: '團體賽', ind: '個人賽', unit: '報名單位' }[sheet.name]}.xlsx`; a.click();
}

// ---------------- 名額 ----------------
function viewQuota(st) {
  const s = st.settings;
  return `<div class="panel"><h2>各項目名額</h2><p class="small muted" style="margin:0 0 8px">開放名額 = 上限 − 主辦預留。額滿後新的報名自動列入候補；名額在「設定」修改。報名期間：${fmtDT(s.open)} 至 ${fmtDT(s.close)}（${{ before: '尚未開始', open: '報名中', closed: '已截止' }[phase(st)]}）</p>
    <table class="list qt"><thead><tr><th>項目</th><th class="r">上限</th><th class="r">預留</th><th class="r">開放</th><th class="r">正取</th><th class="r">候補</th><th class="r">剩餘</th><th style="width:30%"></th></tr></thead><tbody>
    ${EVENTS.map(ev => { const q = quotaOf(st, ev), pct = q.open ? Math.min(100, Math.round(q.ok / q.open * 100)) : 0; return `<tr><td><b>${ev}</b> <span class="small muted">（${UNIT_WORD[KIND[ev]]}）</span></td><td class="r">${q.quota}</td><td class="r">${q.reserved}</td><td class="r">${q.open}</td><td class="r"><b>${q.ok}</b></td><td class="r">${q.wait || ''}</td><td class="r">${q.full ? '<span class="st wait">已額滿</span>' : q.left}</td><td><div class="bar"><span style="width:${pct}%" class="${q.full ? 'full' : ''}"></span></div></td></tr>`; }).join('')}</tbody></table></div>`;
}

// ---------------- 候補遞補 ----------------
function viewWait(st) {
  const s = st.settings, now = Date.now();
  const promoted = Object.values(st.regs).flatMap(r => r.entries.filter(e => e.promotedAt && e.status === 'ok').map(e => ({ r, e }))).sort((a, b) => b.e.promotedAt - a.e.promotedAt);
  const blocks = EVENTS.map(ev => { const q = quotaOf(st, ev); if (!q.wait) return ''; return `<div class="panel"><div class="row"><h2 style="margin:0">${ev} 候補（${q.wait}）</h2><span class="small muted">${q.left ? `目前空出 ${q.left} ${UNIT_WORD[KIND[ev]]}，可以遞補` : '目前沒有空出的名額'}</span></div>
      <table class="list"><thead><tr><th>順位</th><th>單位</th><th>隊名／選手</th><th>進入候補</th><th></th></tr></thead><tbody>${q.waitList.map((x, i) => `<tr><td>${i + 1}</td><td>${esc(x.r.unit)}</td><td>${esc(entryName(x.e))}</td><td class="small">${fmtTime(x.e.ts)}</td><td class="r"><button class="btn sm" data-promote="${x.r.id}|${x.e.id}">${icon('check')}遞補</button></td></tr>`).join('')}</tbody></table></div>`; }).join('');
  return `<div class="panel"><h2>遞補流程</h2><ol class="small" style="margin:0;padding-left:20px;line-height:1.8"><li>有人退出、空出名額時，按候補名單的「遞補」，該筆改為正取並設定繳費期限（${s.payDays} 天，可在設定修改）。</li><li>系統開啟一封寫好的 Email（已遞補、應繳金額、匯款資訊、繳費期限），由總務按寄出。</li><li>期限內未回報匯款會在下方標示，由大會決定是否繼續往下遞補。</li></ol>
    <p class="small muted" style="margin:6px 0 0">遞補順序目前依進入候補的先後，規則待討論。</p></div>
    ${blocks || '<div class="panel"><p class="muted">目前沒有候補。</p></div>'}
    ${promoted.length ? `<div class="panel"><h2>已遞補</h2><table class="list"><thead><tr><th>項目</th><th>單位</th><th>隊名／選手</th><th>遞補時間</th><th>繳費期限</th><th>繳費狀態</th><th></th></tr></thead><tbody>${promoted.map(({ r, e }) => { const ps = payState(r), late = Date.parse(e.payDue) < now && (ps === 'none'); return `<tr class="${late ? 'late' : ''}"><td>${e.ev}</td><td>${esc(r.unit)}</td><td>${esc(entryName(e))}</td><td class="small">${fmtTime(e.promotedAt)}</td><td class="small">${esc(fmtDT(e.payDue))}${late ? ' <b style="color:var(--red)">已逾期</b>' : ''}</td><td><span class="pay ${ps}">${PAY_TEXT[ps]}</span></td><td class="r"><button class="btn ghost sm" data-pmail="${r.id}|${e.id}">${icon('mail')}再開一次信</button></td></tr>`; }).join('')}</tbody></table></div>` : ''}`;
}
function promoteMail(st, r, e) {
  const s = st.settings, f = feeOf(st, r);
  const to = [r.contact.email, ...(r.editors || [])].join(',');
  const subj = `【${s.title}】${e.ev} ${entryName(e)} 已遞補為正取`;
  const body = `${r.contact.name} 您好：\n\n${r.unit} ${e.ev}「${entryName(e)}」已由候補遞補為正取。\n\n目前應繳金額：${f.total.toLocaleString('en-US')} 元（已含遞補的項目）\n匯款帳號：${s.bank.name}（${s.bank.code}）${s.bank.account}\n請於 ${fmtDT(e.payDue)} 前完成匯款，並登入報名系統按「回報匯款」。\n\n若不參加，也請回覆告知，我們會通知下一位候補。\n\n${s.edition}${s.title}大會 敬上`;
  return `mailto:${to}?subject=${encodeURIComponent(subj)}&body=${encodeURIComponent(body)}`;
}

/** 開啟寫好的信（用使用者自己的郵件程式寄出） */
function openMail(url) { window._lastMail = url; const a = document.createElement('a'); a.href = url; a.click(); }

// ---------------- 繳費對帳（總召、總務） ----------------
let payFilter = 'reported';
function viewPay(st) {
  const regs = Object.values(st.regs).sort((a, b) => a.createdAt - b.createdAt);
  const cnt = k => regs.filter(r => payState(r) === k).length;
  const list = regs.filter(r => !payFilter || payState(r) === payFilter);
  return `<div class="panel"><div class="row"><h2 style="margin:0">繳費對帳</h2><span class="small muted">只有總召、總務看得到匯款明細</span><span class="spacer"></span><button class="btn ghost sm" data-payx>${icon('download')}匯出 Excel</button></div>
    <div class="pills" style="margin:8px 0">${[['reported', '待對帳'], ['mismatch', '金額不符'], ['none', '尚未回報'], ['received', '已收到'], ['', '全部']].map(([k, t]) => `<button class="${payFilter === k ? 'on' : ''}" data-pf="${k}">${t}${k ? `（${cnt(k)}）` : ''}</button>`).join('')}</div>
    <table class="list payt"><thead><tr><th>單位</th><th class="r">應繳</th><th>匯款回報</th><th class="r">回報合計</th><th>狀態</th><th>對帳</th></tr></thead><tbody>
    ${list.map(r => { const f = feeOf(st, r), ps = payState(r), diff = paidSum(r) - f.total; return `<tr><td><b>${esc(r.unit)}</b><div class="small muted">${GROUPS[r.group].name}　${esc(r.contact.name)}</div></td><td class="r">${f.total.toLocaleString('en-US')}</td>
      <td class="small">${(r.pays || []).map(p => `${esc(fmtDT(p.time))}　${Number(p.amount).toLocaleString('en-US')} 元　後五碼 ${esc(p.last5)}`).join('<br>') || '<span class="muted">尚未回報</span>'}</td>
      <td class="r">${paidSum(r).toLocaleString('en-US')}${(r.pays || []).length && diff ? `<div class="small" style="color:var(--red)">${diff > 0 ? '多' : '少'} ${Math.abs(diff).toLocaleString('en-US')}</div>` : ''}</td>
      <td><span class="pay ${ps}">${PAY_TEXT[ps]}</span>${r.fin && r.fin.at ? `<div class="small muted">${fmtTime(r.fin.at)}</div>` : ''}${ps === 'mismatch' && r.fin.note ? `<div class="small">${esc(r.fin.note)}</div>` : ''}</td>
      <td><div class="row" style="gap:6px"><button class="btn sm" data-recv="${r.id}">${icon('check')}已收到</button><input class="note-in" data-mnote="${r.id}" placeholder="不符原因（參賽者看得到）"><button class="btn ghost sm" data-mis="${r.id}">金額不符</button></div></td></tr>`; }).join('') || '<tr><td colspan="6" class="muted">沒有資料</td></tr>'}</tbody></table></div>`;
}
async function exportPay(st) {
  if (!window.ExcelJS) { toast('Excel 元件載入中，請稍候再按一次'); return; }
  const wb = new window.ExcelJS.Workbook(), ws = wb.addWorksheet('繳費對帳');
  ws.addRow(['組別', '單位', '聯絡人', 'email', '應繳', '回報合計', '匯款紀錄', '狀態', '備註', '最後對帳']).font = { bold: true };
  Object.values(st.regs).forEach(r => ws.addRow([GROUPS[r.group].name, r.unit, r.contact.name, r.contact.email, feeOf(st, r).total, paidSum(r), (r.pays || []).map(p => `${fmtDT(p.time)} ${p.amount} 後五碼${p.last5}`).join('\n'), PAY_TEXT[payState(r)], (r.fin && r.fin.note) || '', r.fin && r.fin.at ? new Date(r.fin.at) : '']));
  ws.columns.forEach(c => { c.width = 16; });
  const buf = await wb.xlsx.writeBuffer();
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([buf])); a.download = '繳費對帳.xlsx'; a.click();
}

// ---------------- 異動申請 ----------------
function viewReq(st) {
  const all = Object.values(st.regs).flatMap(r => (r.reqs || []).map(q => ({ r, q }))).sort((a, b) => b.q.ts - a.q.ts);
  const pend = all.filter(x => x.q.status === 'pending'), done = all.filter(x => x.q.status !== 'pending');
  const logs = Object.values(st.regs).flatMap(r => r.log.map(l => ({ r, l }))).sort((a, b) => b.l.ts - a.l.ts).slice(0, 40);
  return `<div class="panel"><h2>待審核的異動申請（${pend.length}）</h2><p class="small muted" style="margin:0 0 8px">報名截止後的名單修改要經大會核准才會更新。截止前報名者可以自己修改，紀錄在下方「最近修改」。</p>
    ${pend.length ? `<table class="list"><tbody>${pend.map(({ r, q }) => `<tr><td class="nowrap small">${fmtTime(q.ts)}</td><td><b>${esc(r.unit)}</b><div class="small muted">${esc(q.by)}</div></td><td>${esc(q.text)}</td>
      <td class="r"><div class="row" style="gap:6px;justify-content:flex-end"><input class="note-in" data-rnote="${r.id}|${q.id}" placeholder="回覆（選填）"><button class="btn sm" data-rok="${r.id}|${q.id}">${icon('check')}核准</button><button class="btn ghost sm" data-rno="${r.id}|${q.id}">不核准</button></div></td></tr>`).join('')}</tbody></table>` : '<p class="muted small">目前沒有待審核的申請。</p>'}</div>
    ${done.length ? `<div class="panel"><h2>已處理</h2><table class="list small"><tbody>${done.map(({ r, q }) => `<tr><td class="nowrap">${fmtTime(q.decidedAt)}</td><td>${esc(r.unit)}</td><td>${esc(q.text)}</td><td class="nowrap">${q.status === 'approved' ? '已核准' : '未核准'}${q.reply ? `：${esc(q.reply)}` : ''}</td><td class="muted">${esc(q.decidedBy || '')}</td></tr>`).join('')}</tbody></table></div>` : ''}
    <div class="panel"><h2>最近修改</h2><table class="list small"><tbody>${logs.map(({ r, l }) => `<tr><td class="nowrap">${fmtTime(l.ts)}</td><td class="nowrap">${esc(r.unit)}</td><td>${esc(l.text)}</td><td class="muted">${esc(l.by)}</td></tr>`).join('')}</tbody></table></div>`;
}

// ---------------- 設定 ----------------
function viewSet(st) {
  const s = st.settings;
  const f = (k, v, t = 'text', w = 180) => `<input data-s="${k}" type="${t}" value="${esc(v)}" style="width:${w}px">`;
  return `<div class="panel"><h2>每年要改的設定</h2><p class="small muted" style="margin:0 0 10px">在這裡改，不必改程式。</p>
    <div class="grid4"><label>名稱${f('title', s.title)}</label><label>屆數${f('edition', s.edition)}</label><label>比賽第一天${f('d0', s.dates[0], 'date')}</label><label>比賽第二天${f('d1', s.dates[1], 'date')}</label>
      <label>報名開始${f('open', s.open, 'datetime-local', 210)}</label><label>報名截止${f('close', s.close, 'datetime-local', 210)}</label><label>停車證每張（元）${f('parkingPrice', s.parkingPrice, 'number', 100)}</label><label>遞補繳費期限（天）${f('payDays', s.payDays, 'number', 100)}</label>
      <label>匯款銀行${f('bankName', s.bank.name, 'text', 220)}</label><label>銀行代碼${f('bankCode', s.bank.code, 'text', 80)}</label><label>帳號${f('bankAcc', s.bank.account, 'text', 200)}</label>
      <label>計入名額的時間點 <span class="small muted">（待討論）</span><select data-s="basis"><option value="submit" ${s.basis === 'submit' ? 'selected' : ''}>送出報名</option><option value="report" ${s.basis === 'report' ? 'selected' : ''}>回報匯款</option><option value="received" ${s.basis === 'received' ? 'selected' : ''}>總務確認收到</option></select></label></div>
    <h3>各項目</h3><table class="list"><thead><tr><th>項目</th><th>上限</th><th>主辦預留</th><th>報名費</th><th>團體賽人數</th><th>個人賽每單位上限</th></tr></thead><tbody>
    ${EVENTS.map(ev => { const c = s.events[ev]; const n = (k, v, w = 70) => `<input type="number" min="0" data-ev="${ev}|${k}" value="${v ?? ''}" style="width:${w}px">`; return `<tr><td><b>${ev}</b></td><td>${n('quota', c.quota)}</td><td>${n('reserved', c.reserved)}</td><td>${n('fee', c.fee, 90)}</td><td>${KIND[ev] === 'team' ? `${n('min', c.min, 56)} ～ ${n('max', c.max, 56)} 人` : ''}</td><td>${KIND[ev] !== 'team' ? `${n('perUnit', c.perUnit, 56)} ${UNIT_WORD[KIND[ev]]}` : ''}</td></tr>`; }).join('')}</tbody></table>
    <h3>角色</h3><div class="grid4"><label>管理員（一行一個 Google 帳號）<textarea data-s="admins" rows="3">${esc(s.admins.join('\n'))}</textarea></label><label>總召、總務（看得到匯款明細）<textarea data-s="finance" rows="3">${esc(s.finance.join('\n'))}</textarea></label></div>
    <div class="row" style="margin-top:12px"><span class="spacer"></span><button class="btn" data-save>${icon('check')}儲存設定</button></div></div>`;
}
function saveSet() {
  const v = k => { const el = $(`[data-s="${k}"]`); return el ? el.value.trim() : ''; };
  update(n => {
    const s = n.settings;
    s.title = v('title'); s.edition = v('edition'); s.dates = [v('d0'), v('d1')]; s.open = v('open'); s.close = v('close');
    s.parkingPrice = Number(v('parkingPrice')) || 0; s.payDays = Number(v('payDays')) || 3; s.basis = v('basis');
    s.bank = { name: v('bankName'), code: v('bankCode'), account: v('bankAcc') };
    s.admins = v('admins').split(/\s+/).filter(Boolean); s.finance = v('finance').split(/\s+/).filter(Boolean);
    $$('[data-ev]').forEach(inp => { const [ev, k] = inp.dataset.ev.split('|'); s.events[ev][k] = Number(inp.value) || 0; });
  });
  toast('已儲存設定');
}

// ---------------- 單位明細 ----------------
function drawDetail() {
  const host = $('#modal'), st = getState(), r = detail && st.regs[detail];
  if (!r) { host.hidden = true; host.innerHTML = ''; return; }
  const f = feeOf(st, r);
  host.hidden = false;
  host.innerHTML = `<div class="modal-bg"><div class="modal" style="width:min(760px,100%)"><div class="row"><span class="gtag">${GROUPS[r.group].name}</span><h2 style="margin:0">${esc(r.unit)}</h2><span class="spacer"></span><button class="btn ghost sm" data-close>${icon('close')}</button></div>
    <p class="small">聯絡人 ${esc(r.contact.name)}　${esc(r.contact.email)}${r.contact.phone ? `　${esc(r.contact.phone)}` : ''}${(r.editors || []).length ? `<br>共同管理 ${esc(r.editors.join('、'))}` : ''}</p>
    <table class="list"><tbody>${r.entries.map(e => `<tr class="${e.status === 'out' ? 'dim' : ''}"><td><b>${e.ev}</b></td><td>${esc(entryName(e))}${e.members ? `<div class="small muted">教練 ${esc(e.coach || '－')}　領隊 ${esc(e.leader || '－')}　隊長 ${esc(e.captain || '－')}<br>${esc(e.members.join('、'))}</div>` : ''}</td><td class="nowrap">${stText(st, e)}</td></tr>`).join('')}</tbody></table>
    <p class="small">停車證 ${r.parking || 0} 張　繳費狀態 ${PAY_TEXT[payState(r)]}${fin() ? `　應繳 ${fmtMoney(f.total)}　已回報 ${fmtMoney(paidSum(r))}` : ''}</p>
    <h3>修改紀錄</h3><div class="small log">${r.log.slice().reverse().map(l => `<div>${fmtTime(l.ts)}　${esc(l.by)}　${esc(l.text)}</div>`).join('')}</div></div></div>`;
}

// ---------------- 事件 ----------------
document.addEventListener('click', ev => {
  const row = ev.target.closest('tr[data-rid]');
  if (row && !ev.target.closest('button,input')) { detail = row.dataset.rid; drawDetail(); return; }
  if (ev.target.classList.contains('modal-bg')) { detail = null; drawDetail(); return; }
  const th = ev.target.closest('th[data-sort]');
  if (th) { const k = th.dataset.sort; if (sheet.sort === k) sheet.dir = -sheet.dir; else { sheet.sort = k; sheet.dir = 1; } render(); return; }
  const b = ev.target.closest('button'); if (!b) return;
  const d = b.dataset, st = getState();
  if (d.tab) { tab = d.tab; render(); }
  else if ('reset' in d) { if (confirm('重設示範資料？')) { resetDemo(); toast('已重設示範資料'); } }
  else if ('close' in d) { detail = null; drawDetail(); }
  else if (d.sheet) { sheet.name = d.sheet; sheet.ev = ''; sheet.st = ''; sheet.sort = null; render(); }
  else if (d.fev !== undefined) { sheet.ev = d.fev; render(); }
  else if (d.fst !== undefined) { sheet.st = d.fst; render(); }
  else if ('xlsx' in d) exportXlsx(st);
  else if ('payx' in d) exportPay(st);
  else if (d.pf !== undefined) { payFilter = d.pf; render(); }
  else if (d.recv) { update(n => { const r = n.regs[d.recv]; r.fin = { state: 'received', at: Date.now(), by: BY() }; r.log.push({ ts: Date.now(), by: BY(), text: '總務確認已收到款項' }); }); toast('已標示為已收到款項'); }
  else if (d.mis) { const note = ($(`[data-mnote="${d.mis}"]`).value || '').trim(); if (!note) { toast('請寫一句不符的原因，參賽者會看到'); return; } update(n => { const r = n.regs[d.mis]; r.fin = { state: 'mismatch', note, at: Date.now(), by: BY() }; r.log.push({ ts: Date.now(), by: BY(), text: `總務標示金額不符：${note}` }); }); }
  else if (d.promote) {
    const [rid, eid] = d.promote.split('|');
    const q = quotaOf(st, st.regs[rid].entries.find(e => e.id === eid).ev);
    if (!q.left && !confirm('目前沒有空出的名額，仍要遞補嗎？')) return;
    let url = '';
    update(n => { const r = n.regs[rid], e = r.entries.find(x => x.id === eid); const due = new Date(Date.now() + n.settings.payDays * 864e5 - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 16);
      Object.assign(e, { status: 'ok', promotedAt: Date.now(), payDue: due }); if (r.fin && r.fin.state === 'received') r.fin = { ...r.fin, state: 'mismatch', note: '遞補後應繳金額增加，請補匯差額' };
      r.log.push({ ts: Date.now(), by: BY(), text: `${e.ev} ${entryName(e)} 由候補遞補為正取，繳費期限 ${fmtDT(due)}` }); url = promoteMail(n, r, e); });
    openMail(url); toast('已遞補，信件已開啟，確認內容後按寄出');
  }
  else if (d.pmail) { const [rid, eid] = d.pmail.split('|'); const r = st.regs[rid]; openMail(promoteMail(st, r, r.entries.find(e => e.id === eid))); }
  else if (d.rok || d.rno) {
    const [rid, qid] = (d.rok || d.rno).split('|'), reply = ($(`[data-rnote="${rid}|${qid}"]`) || {}).value || '';
    update(n => { const r = n.regs[rid], q = r.reqs.find(x => x.id === qid);
      Object.assign(q, { status: d.rok ? 'approved' : 'rejected', decidedAt: Date.now(), decidedBy: BY(), reply: reply.trim() });
      if (d.rok) {
        if (q.change) applyChange(n, rid, q.change, BY(), q.contact ? { contact: q.contact } : {});
        else if (q.patch) { const e = r.entries.find(x => x.id === q.entryId); if (e) Object.assign(e, q.patch); }
        r.log.push({ ts: Date.now(), by: BY(), text: `核准異動申請：${q.text}` });
      } else r.log.push({ ts: Date.now(), by: BY(), text: `未核准異動申請：${q.text}${q.reply ? `（${q.reply}）` : ''}` });
    });
    toast(d.rok ? '已核准並更新名單' : '已標示為不核准');
  }
  else if ('save' in d) saveSet();
});
document.addEventListener('change', ev => { if (ev.target.matches('[data-role]')) { role = ev.target.value; try { localStorage.setItem(ROLE_KEY, role); } catch (e) { /* 無痕 */ } render(); } });
let composing = false;
document.addEventListener('compositionstart', () => { composing = true; });
document.addEventListener('compositionend', ev => { composing = false; if (ev.target.id === 'sq') search(ev.target); });
document.addEventListener('input', ev => { if (ev.target.id === 'sq' && !composing) search(ev.target); });
function search(el) { sheet.q = el.value; const pos = el.selectionStart; render(); const n = $('#sq'); n.focus(); n.setSelectionRange(pos, pos); }
document.addEventListener('keydown', ev => { if (ev.key === 'Escape' && detail) { detail = null; drawDetail(); } });
// 有人在打字（設定、備註）時，其他分頁的更新先不重畫
subscribe(() => { const a = document.activeElement; if (a && /INPUT|TEXTAREA|SELECT/.test(a.tagName) && a.id !== 'sq') return; render(); });
render();
