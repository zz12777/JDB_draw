// Excel 輸出（ExcelJS），版面比照「2_空白籤表」範本
import { EVENT_TYPE } from './parse.js';
import { toCn } from './util.js';

export const EVENT_TITLE = {
  男單: '大專組男子單打', 女單: '大專組女子單打', 男雙: '大專組男子雙打', 女雙: '大專組女子雙打',
  男團: '大專組男子團體', 女團: '大專組女子團體', 社團: '社會組團體',
};
const SHORT_TITLE = { 男單: '男子單打', 女單: '女子單打', 男雙: '男子雙打', 女雙: '女子雙打' };

const KAI = '標楷體';
const MED = { style: 'medium' };

function lib(x) { return x || globalThis.ExcelJS; }

function posIndex(entries, assign) {
  const m = new Map();
  if (!entries || !assign) return m;
  entries.forEach(e => { if (assign[e.id]) m.set(assign[e.id], e); });
  return m;
}

function setWidths(ws, widths) {
  widths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });
}

function a4(ws) {
  ws.pageSetup = { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
}

// ---------------- 單淘汰 ----------------
// 範本規則：
// 籤號在 C 欄（跨兩列置中，對齊線的高度），A 學校、B 姓名；
// 每一輪佔兩欄，第 h 輪的直線在 3 + 2h 欄的右框線（E、G、I、K、M…）；
// 選手的線從 D 欄畫到第一場的直線那一欄；
// 場次國字在直線左側靠右，前兩輪寫在直線那一欄，第三輪以後寫在前一欄；
// 勝方的線從直線右一欄畫到下一場的直線那一欄。

// 先記錄所有框線、合併與文字，最後一次套用（合併會覆蓋格式，所以框線最後畫）
function makeOps() { return { borders: new Map(), merges: [], texts: [] }; }
function opBorder(ops, r, c, side) {
  const k = r + ',' + c;
  if (!ops.borders.has(k)) ops.borders.set(k, new Set());
  ops.borders.get(k).add(side);
}
function opLine(ops, row, from, to) { for (let c = from; c <= to; c++) opBorder(ops, row, c, 'bottom'); }
function applyOps(ws, ops) {
  for (const [r1, c1, r2, c2] of ops.merges) ws.mergeCells(r1, c1, r2, c2);
  for (const t of ops.texts) {
    const c = ws.getCell(t.r, t.c);
    c.value = t.v;
    // 合併後的格子共用同一個樣式物件，要換成新物件才不會互相影響
    c.style = { ...c.style, font: { name: KAI, size: t.size || 12 },
      alignment: { horizontal: t.h || 'right', vertical: 'middle', shrinkToFit: !!t.shrink } };
  }
  for (const [k, sides] of ops.borders) {
    const [r, c] = k.split(',').map(Number);
    const border = {};
    sides.forEach(sd => { border[sd] = MED; });
    const cell = ws.getCell(r, c);
    cell.style = { ...cell.style, border };
  }
}

/**
 * 畫一棵樹。rowOf: Map(葉 -> 線所在列)，hOf(node) -> 輪次高度，
 * colOfH(h) -> 直線所在欄，leafStart：葉的線從哪一欄開始。
 * 場次國字放在直線那一欄（緊貼直線左側），整段直線範圍合併後垂直置中。
 */
function drawTree(ops, root, isLeaf, rowOf, hOf, colOfH, leafStart) {
  (function place(n, parentCol) {
    if (isLeaf(n)) {
      const r = rowOf.get(n);
      opLine(ops, r, leafStart, parentCol);
      return r;
    }
    const vc = colOfH(hOf(n));
    const rows = n.children.map(c => place(c, vc));
    const r1 = Math.min(...rows), r2 = Math.max(...rows);
    for (let r = r1 + 1; r <= r2; r++) opBorder(ops, r, vc, 'right');
    if (r2 > r1 + 1) ops.merges.push([r1 + 1, vc, r2, vc]);
    ops.texts.push({ r: r1 + 1, c: vc, v: n.label || '' });
    const rm = Math.floor((r1 + r2) / 2);
    opLine(ops, rm, vc + 1, parentCol ?? vc + 1);
    return rm;
  })(root, null);
}

const W = 8.73; // 範本欄寬

function koSheets(wb, event, st, entries, assign) {
  const byPos = posIndex(entries, assign);
  const ws = wb.addWorksheet(event);
  setWidths(ws, Array(24).fill(W));
  const ops = makeOps();

  // 各分區的高度一致（從分區冠軍往下算），讓不同大小的分區欄位對齊
  const rel = (n, s) => n.depth - s.root.depth;
  let H = 0;
  st.sections.forEach(s => {
    (function f(n) { if (n.kind === 'match') { H = Math.max(H, rel(n, s) + 1); n.children.forEach(f); } })(s.root);
  });

  let row = 1;
  st.sections.forEach(s => {
    // 有資格賽的分區每格 4 列（單人在第 1 列，資格賽兩人在第 1、3 列），否則每人 2 列
    const per = s.hasPairs ? 4 : 2;
    const rowOf = new Map();
    s.slots.forEach((slot, i) => {
      const base = row + per * i;
      if (slot.kind === 'leaf') rowOf.set(slot, base);
      else { rowOf.set(slot.children[0], base); rowOf.set(slot.children[1], base + 2); }
    });
    for (const [lf, r] of rowOf) {
      const e = byPos.get(lf.pos);
      const put = (col, v) => {
        ops.merges.push([r, col, r + 1, col]);
        ops.texts.push({ r, c: col, v, h: 'center', shrink: col < 3 });
      };
      put(3, lf.pos);
      if (e) { put(1, e.school); put(2, e.name); }
    }
    drawTree(ops, s.root, n => n.kind === 'leaf', rowOf, n => H - rel(n, s), h => 3 + 2 * h, 4);
    row += per * s.slots.length;
  });
  applyOps(ws, ops);
  for (let r = 1; r < row; r++) ws.getRow(r).height = 17.5;
  ws.views = [{ showGridLines: false }];
  a4(ws);

  if (st.sections.length > 1) finalSheet(wb, event, st);
}

function finalSheet(wb, event, st) {
  const ws = wb.addWorksheet(event + '決賽');
  setWidths(ws, [W, W, W, 11.18, ...Array(16).fill(W)]);
  const ops = makeOps();
  const k = st.sections.length;
  ops.texts.push({ r: 3, c: 2, v: `${SHORT_TITLE[event] || event} ${k === 2 ? '冠亞' : k === 4 ? '四強' : '八強'}`, size: 18, h: 'left' });
  ['冠軍-', '亞軍-', '季軍-', '季軍-'].forEach((v, i) => ops.texts.push({ r: 4 + i, c: 8, v, size: 16, h: 'left' }));
  const roots = new Set(st.sections.map(s => s.root));
  const gap = k === 2 ? 12 : k === 4 ? 8 : 6;
  const rowOf = new Map();
  st.sections.forEach((s, i) => {
    const r = 12 + gap * i;
    rowOf.set(s.root, r);
    ops.merges.push([r, 4, r + 1, 4]);
    ops.texts.push({ r, c: 4, v: `${s.root.label}勝`, size: 18, h: 'center' });
  });
  const levels = Math.log2(k);
  drawTree(ops, st.root, n => roots.has(n), rowOf, n => levels - n.depth, h => 7 + 2 * h, 5);
  applyOps(ws, ops);
  ws.getRow(3).height = 25;
  for (let i = 4; i < 8; i++) ws.getRow(i).height = 21.5;
  ws.views = [{ showGridLines: false }];
  a4(ws);
}

// ---------------- 分組循環 ----------------
// 範本：一個分頁，各區由上往下排，區與區之間空一列；
// 第 1 列：「A區」、1..n、勝場、名次；第 2 列：隊名；之後每隊一列，左下半格填場次。

function rrSheet(wb, event, st, entries, assign) {
  const byPos = posIndex(entries, assign);
  const ws = wb.addWorksheet(event);
  const maxSize = Math.max(...st.groups.map(g => g.size));
  setWidths(ws, Array(maxSize + 4).fill(13));
  const box = (r, c, v, font = KAI) => {
    const cell = ws.getCell(r, c);
    if (v !== undefined) cell.value = v;
    cell.font = { name: font, size: 14 };
    cell.alignment = { horizontal: 'center', vertical: 'middle', shrinkToFit: true };
    cell.border = { top: MED, left: MED, bottom: MED, right: MED };
  };
  let r = 1;
  st.groups.forEach(g => {
    const n = g.size;
    const names = Array.from({ length: n }, (_, j) => {
      const e = byPos.get(g.startPos + j);
      return e ? e.name : '';
    });
    ws.mergeCells(r, 1, r + 1, 2);
    box(r, 1, `${g.letter}區`, '微軟正黑體');
    for (let j = 0; j < n; j++) { box(r, 3 + j, j + 1); box(r + 1, 3 + j, names[j]); }
    ws.mergeCells(r, 3 + n, r + 1, 3 + n); box(r, 3 + n, '勝場');
    ws.mergeCells(r, 4 + n, r + 1, 4 + n); box(r, 4 + n, '名次');
    const label = new Map(g.matches.map(m => [`${Math.min(m.a, m.b)}-${Math.max(m.a, m.b)}`, m.label]));
    for (let i = 1; i <= n; i++) {
      const rr = r + 1 + i;
      box(rr, 1, i);
      box(rr, 2, names[i - 1]);
      for (let j = 1; j <= n; j++) box(rr, 2 + j, j < i ? (label.get(`${j}-${i}`) || '') : '', '微軟正黑體');
      box(rr, 3 + n, '');
      box(rr, 4 + n, '');
    }
    for (let x = r; x <= r + 1 + n; x++) ws.getRow(x).height = 18;
    r += n + 3;
  });
  ws.views = [{ showGridLines: false }];
  a4(ws);
}

// ---------------- 完成籤表（比照「2_最終excel檔」） ----------------
// 個人賽：每個分區一個分頁（男單A、男單B…），第 1 列標題「大專組男子單打(一)」，
// 籤表從第 4 列開始；另有「決賽」分頁。團體賽：標題「大專組男子團體 預賽」，A組、B組…，
// 每頁 4 組（3 隊組每頁 5 組），隊名字級全部一致（以最長的隊名能放下的字級為準）。

function finalKoSheets(wb, event, st, entries, assign) {
  const byPos = posIndex(entries, assign);
  const multi = st.sections.length > 1;
  const isDouble = EVENT_TYPE[event] === 'double';
  st.sections.forEach((s, i) => {
    const ws = wb.addWorksheet(event + (s.letter || ''));
    const ops = makeOps();
    const rel = n => n.depth - s.root.depth;
    let H = 0;
    (function f(n) { if (n.kind === 'match') { H = Math.max(H, rel(n) + 1); n.children.forEach(f); } })(s.root);
    // 欄寬：A 學校、B 姓名、C 籤號、D 起為籤表（直線欄較寬放場次，連接欄較窄）
    const widths = [11.6, isDouble ? 17.5 : 10, 5, 4.5];
    for (let h = 1; h <= H + 1; h++) widths.push(6.5, 3.6);
    setWidths(ws, widths);
    ops.texts.push({ r: 1, c: 1, v: EVENT_TITLE[event] + (multi ? `(${toCn(i + 1)})` : ''), size: 20, h: 'left' });
    const per = s.hasPairs ? 4 : 2;
    const top = 4;
    const rowOf = new Map();
    s.slots.forEach((slot, j) => {
      const base = top + per * j;
      if (slot.kind === 'leaf') rowOf.set(slot, base);
      else { rowOf.set(slot.children[0], base); rowOf.set(slot.children[1], base + 2); }
    });
    for (const [lf, r] of rowOf) {
      const e = byPos.get(lf.pos);
      const put = (col, v) => {
        ops.merges.push([r, col, r + 1, col]);
        ops.texts.push({ r, c: col, v, h: 'center', shrink: col < 3 });
      };
      put(3, lf.pos);
      put(1, e ? e.school : '');
      put(2, e ? e.name : '');
    }
    drawTree(ops, s.root, n => n.kind === 'leaf', rowOf, n => H - rel(n), h => 3 + 2 * h, 4);
    applyOps(ws, ops);
    ws.getCell(1, 1).font = { name: KAI, size: 20, bold: true };
    ws.getRow(1).height = 27.5;
    ws.getRow(2).height = 17;
    ws.getRow(3).height = 17;
    const last = top + per * s.slots.length;
    for (let r = top; r < last; r++) ws.getRow(r).height = per === 4 ? 11.25 : 15;
    ws.views = [{ showGridLines: false }];
    ws.pageSetup = { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 1 };
  });
  if (multi) finalKoFinal(wb, event, st);
}

function finalKoFinal(wb, event, st) {
  const ws = wb.addWorksheet(event + '決賽');
  const k = st.sections.length;
  const levels = Math.log2(k);
  setWidths(ws, [8.7, 8.7, 11.3, ...Array(14).fill(8.7)]);
  const ops = makeOps();
  ops.texts.push({ r: 1, c: 1, v: `${EVENT_TITLE[event]} ${k === 2 ? '決賽' : k === 4 ? '四強' : '八強'}`, size: 24, h: 'left' });
  const roots = new Set(st.sections.map(s => s.root));
  const rowOf = new Map();
  st.sections.forEach((s, i) => {
    const r = 6 + 8 * i;
    rowOf.set(s.root, r);
    ops.merges.push([r, 3, r + 1, 3]);
    ops.texts.push({ r, c: 3, v: `${s.root.label}勝`, size: 16, h: 'center' });
  });
  drawTree(ops, st.root, n => roots.has(n), rowOf, n => levels - n.depth, h => 5 + 2 * h, 4);
  const pc = Math.max(9, 5 + 2 * levels + 2);
  ops.texts.push({ r: 4, c: pc, v: '冠軍-\n亞軍-\n季軍-\n季軍-', size: 16, h: 'left' });
  applyOps(ws, ops);
  ws.getCell(1, 1).font = { name: KAI, size: 24, bold: true };
  ws.getCell(4, pc).alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
  ws.getRow(1).height = 33.5;
  ws.getRow(4).height = 86;
  for (let r = 6; r < 6 + 8 * k; r++) ws.getRow(r).height = 25;
  ws.views = [{ showGridLines: false }];
  ws.pageSetup = { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 1 };
}

/** 依欄寬估算能放下最長名稱的字級（中文字算 1，英數算 0.55） */
export function fitFontSize(names, colWidth, max = 14, min = 8) {
  const units = t => [...String(t || '')].reduce((a, ch) => a + (/[\u0000-ÿ]/.test(ch) ? 0.55 : 1), 0);
  const longest = Math.max(1, ...names.map(units));
  const px = colWidth * 7 + 5 - 10;
  const size = Math.floor((px / (longest * 96 / 72)) * 2) / 2;
  return Math.max(min, Math.min(max, size));
}

function finalRrSheet(wb, event, st, entries, assign) {
  const byPos = posIndex(entries, assign);
  const ws = wb.addWorksheet(event);
  const maxSize = Math.max(...st.groups.map(g => g.size));
  const nameW = maxSize >= 4 ? 14.5 : 13;
  setWidths(ws, [7.4, 15, ...Array(maxSize).fill(nameW), 7.4, 7.4]);
  const allNames = [...byPos.values()].map(e => e.name);
  const nameSize = fitFontSize(allNames, Math.min(15, nameW));
  const box = (r, c, v, size = 14) => {
    const cell = ws.getCell(r, c);
    if (v !== undefined) cell.value = v;
    cell.font = { name: KAI, size };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = { top: MED, left: MED, bottom: MED, right: MED };
  };
  const t = ws.getCell(2, 1);
  t.value = EVENT_TITLE[event] + ' 預賽';
  t.font = { name: KAI, size: 24, bold: true };
  const sub = ws.getCell(2, 5);
  sub.value = '(預賽各組取前二晉級)';
  sub.font = { name: KAI, size: 16 };
  ws.getRow(2).height = 31;
  const perPage = maxSize >= 4 ? 4 : 5;
  let r = 5;
  st.groups.forEach((g, gi) => {
    if (gi > 0 && gi % perPage === 0) ws.getRow(r - 1).addPageBreak();
    const n = g.size;
    const names = Array.from({ length: n }, (_, j) => {
      const e = byPos.get(g.startPos + j);
      return e ? e.name : '';
    });
    ws.mergeCells(r, 1, r + 1, 2);
    box(r, 1, `${g.letter}組`);
    for (let j = 0; j < n; j++) { box(r, 3 + j, j + 1); box(r + 1, 3 + j, names[j], nameSize); }
    ws.mergeCells(r, 3 + n, r + 1, 3 + n); box(r, 3 + n, '勝場');
    ws.mergeCells(r, 4 + n, r + 1, 4 + n); box(r, 4 + n, '名次');
    const label = new Map(g.matches.map(m => [`${Math.min(m.a, m.b)}-${Math.max(m.a, m.b)}`, m.label]));
    for (let i = 1; i <= n; i++) {
      const rr = r + 1 + i;
      box(rr, 1, i);
      box(rr, 2, names[i - 1], nameSize);
      for (let j = 1; j <= n; j++) box(rr, 2 + j, j < i ? (label.get(`${j}-${i}`) || '') : '');
      box(rr, 3 + n, '');
      box(rr, 4 + n, '');
    }
    for (let x = r; x <= r + 2 + n; x++) ws.getRow(x).height = 23;
    r += n + 3;
  });
  ws.views = [{ showGridLines: false }];
  ws.pageSetup = { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
}

// ---------------- 名單類 ----------------

function whereOf(st, pos) {
  if (!pos) return '';
  if (st.kind === 'rr') {
    const g = st.groups.find(x => pos >= x.startPos && pos < x.startPos + x.size);
    return g ? `${g.letter}組 ${pos - g.startPos + 1}號` : '';
  }
  const s = st.sections.find(x => pos >= x.startPos && pos < x.startPos + x.size);
  return s && s.letter ? `${s.letter}區` : '';
}

export function addListSheet(wb, sheetName, event, entries, assign, st, meta) {
  const ws = wb.addWorksheet(sheetName);
  const nameCol = EVENT_TYPE[event] === 'team' ? event : event;
  const head = ['序號', event === '社團' ? '單位' : '學校', nameCol, '種子', '抽籤序號'];
  if (assign) head.push('位置', '學校出現次數', '選手出現次數');
  ws.addRow(head);
  const schoolN = new Map(), nameN = new Map();
  entries.forEach(e => {
    schoolN.set(e.school, (schoolN.get(e.school) || 0) + 1);
    nameN.set(e.name, (nameN.get(e.name) || 0) + 1);
  });
  entries.forEach((e, i) => {
    const row = [i + 1, e.school, e.name, e.seed === '' || e.seed == null ? null : Number(e.seed), assign ? (assign[e.id] || null) : null];
    if (assign) row.push(st ? whereOf(st, assign[e.id]) : '', schoolN.get(e.school), nameN.get(e.name));
    ws.addRow(row);
  });
  ws.getRow(1).font = { bold: true };
  [6, 12, 22, 6, 9, 12, 13, 13].forEach((w, i) => { ws.getColumn(i + 1).width = w; });
  if (meta && meta.time) {
    const d = new Date(meta.time);
    const pad = x => String(x).padStart(2, '0');
    const info = [['抽出時間', `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`]];
    if (meta.seed) info.push(['亂數代碼', meta.seed]);
    info.forEach(([k, v], i) => {
      const a = ws.getCell(1 + i, 10), b = ws.getCell(1 + i, 11);
      a.value = k; b.value = v;
      a.font = { bold: true };
      b.font = { bold: true };
    });
    ws.getColumn(10).width = 10;
    ws.getColumn(11).width = 22;
  }
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  return ws;
}

/** 依抽籤順序排：同校在一起、人多的學校在前 */
export function sortForOrder(entries) {
  const count = new Map(), first = new Map();
  entries.forEach((e, i) => {
    count.set(e.school, (count.get(e.school) || 0) + 1);
    if (!first.has(e.school)) first.set(e.school, i);
  });
  return entries.slice().sort((a, b) =>
    (count.get(b.school) - count.get(a.school)) ||
    (first.get(a.school) - first.get(b.school)));
}

// ---------------- 對外 ----------------

/** 籤表活頁簿：entries/assign 為空時是空白籤表 */
export function bracketWorkbook(event, st, entries, assign, ExcelJSLib, meta) {
  const wb = new (lib(ExcelJSLib).Workbook)();
  wb.creator = '交大盃抽籤系統';
  if (st.kind === 'ko') koSheets(wb, event, st, entries, assign);
  else rrSheet(wb, event, st, entries, assign);
  if (entries && assign) {
    const sorted = entries.slice().sort((a, b) => (assign[a.id] || 1e9) - (assign[b.id] || 1e9));
    addListSheet(wb, event + '抽籤結果', event, sorted, assign, st, meta);
  }
  return wb;
}

/** 完成籤表（最終格式） */
export function finalWorkbook(event, st, entries, assign, ExcelJSLib, meta) {
  const wb = new (lib(ExcelJSLib).Workbook)();
  wb.creator = '交大盃抽籤系統';
  if (st.kind === 'ko') finalKoSheets(wb, event, st, entries, assign);
  else finalRrSheet(wb, event, st, entries, assign);
  const sorted = entries.slice().sort((a, b) => (assign[a.id] || 1e9) - (assign[b.id] || 1e9));
  addListSheet(wb, event + '抽籤結果', event, sorted, assign, st, meta);
  return wb;
}

export function orderWorkbook(event, entries, ExcelJSLib) {
  const wb = new (lib(ExcelJSLib).Workbook)();
  addListSheet(wb, event, event, sortForOrder(entries), null, null);
  return wb;
}

export async function workbookBlob(wb) {
  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
