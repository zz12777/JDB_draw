// Excel 輸出（ExcelJS），版面比照「2_空白籤表」範本
import { EVENT_TYPE } from './parse.js';

export const EVENT_TITLE = {
  男單: '大專組男子單打', 女單: '大專組女子單打', 男雙: '大專組男子雙打', 女雙: '大專組女子雙打',
  男團: '大專組男子團體', 女團: '大專組女子團體', 社團: '社會組團體',
};
const SHORT_TITLE = { 男單: '男子單打', 女單: '女子單打', 男雙: '男子雙打', 女雙: '女子雙打' };

const KAI = '標楷體';
const MED = { style: 'medium' };

function lib(x) { return x || globalThis.ExcelJS; }

function addBorder(cell, side) {
  cell.border = { ...(cell.border || {}), [side]: MED };
}

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

function hline(ws, row, from, to) {
  for (let c = from; c <= to; c++) addBorder(ws.getCell(row, c), 'bottom');
}

function labelCell(ws, row, col, text, size = 12) {
  const c = ws.getCell(row, col);
  c.value = text;
  c.font = { name: KAI, size };
  c.alignment = { horizontal: 'right', vertical: 'middle' };
}

/**
 * 畫一棵樹。rowOf: Map(葉 -> 線所在列)，colOfH(h) -> 直線欄，
 * hOf(node) -> 輪次高度，leafStart：葉的線從哪一欄開始。
 * 回傳 Map(節點 -> 輸出線所在列)。
 */
function drawTree(ws, root, isLeaf, rowOf, hOf, colOfH, leafStart) {
  const out = new Map();
  (function place(n, parentCol) {
    if (isLeaf(n)) {
      const r = rowOf.get(n);
      hline(ws, r, leafStart, parentCol);
      out.set(n, r);
      return r;
    }
    const h = hOf(n);
    const vc = colOfH(h);
    const rows = n.children.map(c => place(c, vc));
    const r1 = Math.min(...rows), r2 = Math.max(...rows);
    for (let r = r1 + 1; r <= r2; r++) addBorder(ws.getCell(r, vc), 'right');
    const rm = Math.floor((r1 + r2) / 2);
    labelCell(ws, rm, h <= 2 ? vc : vc - 1, n.label || '');
    hline(ws, rm, vc + 1, parentCol ?? vc + 1);
    out.set(n, rm);
    return rm;
  })(root, null);
  return out;
}

function koSheets(wb, event, st, entries, assign) {
  const byPos = posIndex(entries, assign);
  const ws = wb.addWorksheet(event);
  setWidths(ws, [8.7, 13, 13, 13, 13, 13, 13, 13, 13, 13, 13, 13, 13, 13, 13]);

  // 各分區的高度一致（從分區冠軍往下算），讓不同大小的分區欄位對齊
  const rel = (n, s) => n.depth - s.root.depth;
  let H = 0;
  st.sections.forEach(s => {
    (function f(n) { if (n.kind === 'match') { H = Math.max(H, rel(n, s) + 1); n.children.forEach(f); } })(s.root);
  });

  let row = 1;
  st.sections.forEach(s => {
    // 版面列：有資格賽的分區每格 4 列（單人在第 1 列，資格賽兩人在第 1、3 列），否則每人 2 列
    const per = s.hasPairs ? 4 : 2;
    const rowOf = new Map();
    s.slots.forEach((slot, i) => {
      const base = row + per * i;
      if (slot.kind === 'leaf') rowOf.set(slot, base);
      else { rowOf.set(slot.children[0], base); rowOf.set(slot.children[1], base + 2); }
    });
    for (const [lf, r] of rowOf) {
      const e = byPos.get(lf.pos);
      const put = (col, v, align) => {
        ws.mergeCells(r, col, r + 1, col);
        const c = ws.getCell(r, col);
        c.value = v;
        c.font = { name: KAI, size: 12 };
        c.alignment = { horizontal: align, vertical: 'middle', shrinkToFit: true };
      };
      put(3, lf.pos, 'center');
      if (e) { put(1, e.school, 'center'); put(2, e.name, 'center'); }
    }
    drawTree(ws, s.root, n => n.kind === 'leaf', rowOf, n => H - rel(n, s), h => 3 + 2 * h, 4);
    row += per * s.slots.length;
  });
  for (let r = 1; r < row; r++) ws.getRow(r).height = 17.5;
  ws.views = [{ showGridLines: false }];
  a4(ws);

  if (st.sections.length > 1) finalSheet(wb, event, st);
}

function finalSheet(wb, event, st) {
  const ws = wb.addWorksheet(event + '決賽');
  setWidths(ws, [8.7, 13, 13, 11.2, 8.7, 13, 13, 13, 13, 13, 13, 13, 13]);
  const k = st.sections.length;
  const t = ws.getCell(3, 2);
  t.value = `${SHORT_TITLE[event] || event} ${k === 2 ? '冠亞' : k === 4 ? '四強' : '八強'}`;
  t.font = { name: KAI, size: 18 };
  ws.getRow(3).height = 25;
  ['冠軍-', '亞軍-', '季軍-', '季軍-'].forEach((v, i) => {
    const c = ws.getCell(4 + i, 8);
    c.value = v;
    c.font = { name: KAI, size: 16 };
    ws.getRow(4 + i).height = 21.5;
  });
  const roots = new Set(st.sections.map(s => s.root));
  const gap = k === 2 ? 12 : k === 4 ? 8 : 6;
  const rowOf = new Map();
  st.sections.forEach((s, i) => {
    const r = 12 + gap * i;
    rowOf.set(s.root, r);
    ws.mergeCells(r, 4, r + 1, 4);
    const c = ws.getCell(r, 4);
    c.value = `${s.root.label}勝`;
    c.font = { name: KAI, size: 18 };
    c.alignment = { horizontal: 'center', vertical: 'middle' };
  });
  const top = st.root.depth; // 0
  const levels = Math.log2(k);
  drawTree(ws, st.root, n => roots.has(n), rowOf, n => levels - (n.depth - top), h => 7 + 2 * h, 5);
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

// ---------------- 名單類 ----------------

function whereOf(st, pos) {
  if (!pos) return '';
  if (st.kind === 'rr') {
    const g = st.groups.find(x => pos >= x.startPos && pos < x.startPos + x.size);
    return g ? `${g.letter}區 ${pos - g.startPos + 1}號` : '';
  }
  const s = st.sections.find(x => pos >= x.startPos && pos < x.startPos + x.size);
  return s && s.letter ? `${s.letter}區` : '';
}

export function addListSheet(wb, sheetName, event, entries, assign, st) {
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
export function bracketWorkbook(event, st, entries, assign, ExcelJSLib) {
  const wb = new (lib(ExcelJSLib).Workbook)();
  wb.creator = '交大盃抽籤系統';
  if (st.kind === 'ko') koSheets(wb, event, st, entries, assign);
  else rrSheet(wb, event, st, entries, assign);
  if (entries && assign) {
    const sorted = entries.slice().sort((a, b) => (assign[a.id] || 1e9) - (assign[b.id] || 1e9));
    addListSheet(wb, event + '抽籤結果', event, sorted, assign, st);
  }
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
