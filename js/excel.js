// Excel 輸出（ExcelJS）
import { toCn } from './util.js';
import { EVENT_TYPE } from './parse.js';

export const EVENT_TITLE = {
  男單: '大專組男子單打', 女單: '大專組女子單打', 男雙: '大專組男子雙打', 女雙: '大專組女子雙打',
  男團: '大專組男子團體', 女團: '大專組女子團體', 社團: '社會組團體',
};

const FONT = '標楷體';
const thin = { style: 'thin' };
const medium = { style: 'medium' };

function lib(x) { return x || globalThis.ExcelJS; }

function addBorder(cell, side, style = thin) {
  cell.border = { ...(cell.border || {}), [side]: style };
}

function pageSetup(ws) {
  ws.pageSetup = {
    paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0,
    margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
  };
}

/** 依籤號查人 */
function posIndex(entries, assign) {
  const m = new Map();
  if (!entries || !assign) return m;
  entries.forEach(e => { if (assign[e.id]) m.set(assign[e.id], e); });
  return m;
}

// ---------------- 單淘汰 ----------------

/**
 * 在工作表上畫一棵樹。
 * leafRows: Map(leafNode -> row)，leafText(leaf) -> [A, B, C] 欄內容
 */
function drawTree(ws, root, isLeaf, leafRows, leafText, firstCol) {
  const leaves = [];
  (function f(n) { if (isLeaf(n)) leaves.push(n); else n.children.forEach(f); })(root);
  const maxD = Math.max(...leaves.map(l => l.depth));
  const colOf = n => firstCol + (maxD - n.depth);
  const rowOf = new Map();
  leaves.forEach(l => rowOf.set(l, leafRows.get(l)));
  let rightMost = firstCol;

  function line(row, fromCol, toCol) {
    for (let c = fromCol; c <= toCol; c++) addBorder(ws.getCell(row, c), 'bottom', medium);
  }

  (function place(n, parentCol) {
    if (isLeaf(n)) {
      const r = rowOf.get(n);
      const [a, b, c] = leafText(n);
      const ca = ws.getCell(r, 1), cb = ws.getCell(r, 2), cc = ws.getCell(r, 3);
      ca.value = a; cb.value = b; cc.value = c;
      [ca, cb].forEach(x => { x.font = { name: FONT, size: 11 }; x.alignment = { vertical: 'bottom', shrinkToFit: true }; });
      cc.font = { name: FONT, size: 10 }; cc.alignment = { horizontal: 'center', vertical: 'bottom' };
      line(r, 1, parentCol - 1);
      return r;
    }
    const pc = colOf(n);
    rightMost = Math.max(rightMost, pc);
    const rows = n.children.map(c => place(c, pc));
    const r1 = Math.min(...rows), r2 = Math.max(...rows);
    for (let r = r1 + 1; r <= r2; r++) addBorder(ws.getCell(r, pc), 'left', medium);
    const rm = Math.floor((r1 + r2) / 2);
    const cell = ws.getCell(rm, pc);
    cell.value = n.label || '';
    cell.font = { name: FONT, size: 9 };
    cell.alignment = { horizontal: 'center', vertical: 'bottom' };
    line(rm, pc, (parentCol ?? pc + 2) - 1);
    rowOf.set(n, rm);
    return rm;
  })(root, null);
  return { rightMost: rightMost + 2 };
}

function setKoColumns(ws, nameWidth, nCols) {
  ws.getColumn(1).width = 12;
  ws.getColumn(2).width = nameWidth;
  ws.getColumn(3).width = 4.5;
  for (let c = 4; c <= 3 + nCols; c++) ws.getColumn(c).width = 5;
}

function title(ws, text, sub) {
  const c = ws.getCell(1, 1);
  c.value = text;
  c.font = { name: FONT, size: 16, bold: true };
  if (sub) {
    const s = ws.getCell(1, 6);
    s.value = sub;
    s.font = { name: FONT, size: 10 };
  }
}

function podium(ws, row, col) {
  ['冠軍-', '亞軍-', '季軍-', '季軍-'].forEach((t, i) => {
    const c = ws.getCell(row + i, col);
    c.value = t;
    c.font = { name: FONT, size: 11 };
  });
}

function koSheets(wb, event, st, entries, assign) {
  const byPos = posIndex(entries, assign);
  const isDouble = EVENT_TYPE[event] === 'double';
  const nameWidth = isDouble ? 20 : 12;
  const multi = st.sections.length > 1;
  const isLeaf = n => n.kind === 'leaf';
  const leafText = l => {
    const e = byPos.get(l.pos);
    return [e ? e.school : '', e ? e.name : '', l.pos];
  };

  st.sections.forEach((s, i) => {
    const ws = wb.addWorksheet(event + (s.letter || ''));
    const depthSpan = Math.max(...st.leaves.filter(l => l.pos >= s.startPos && l.pos < s.startPos + s.size).map(l => l.depth)) - s.root.depth;
    setKoColumns(ws, nameWidth, depthSpan + 3);
    title(ws, EVENT_TITLE[event] + (multi ? `(${toCn(i + 1)})` : ''));
    const rows = new Map();
    let r = 3;
    (function f(n) { if (isLeaf(n)) { rows.set(n, r); r += 2; } else n.children.forEach(f); })(s.root);
    const { rightMost } = drawTree(ws, s.root, isLeaf, rows, leafText, 4);
    if (!multi) podium(ws, 3, rightMost + 1);
    ws.views = [{ showGridLines: false }];
    pageSetup(ws);
  });

  if (multi) {
    const ws = wb.addWorksheet(event + '決賽');
    const roots = new Set(st.sections.map(s => s.root));
    const isL = n => roots.has(n);
    const span = st.sections[0].root.depth;
    setKoColumns(ws, 14, span + 3);
    title(ws, EVENT_TITLE[event] + (st.sections.length === 4 ? ' 四強' : st.sections.length === 2 ? ' 決賽' : ' 八強'));
    const rows = new Map();
    let r = 4;
    st.sections.forEach(s => { rows.set(s.root, r); r += 8; });
    const txt = n => {
      const s = st.sections.find(x => x.root === n);
      return [`${s.letter}區`, `${n.label}勝`, ''];
    };
    const { rightMost } = drawTree(ws, st.root, isL, rows, txt, 4);
    podium(ws, 3, rightMost + 1);
    ws.views = [{ showGridLines: false }];
    pageSetup(ws);
  }
}

// ---------------- 分組循環 ----------------

function rrSheet(wb, event, st, entries, assign) {
  const byPos = posIndex(entries, assign);
  const ws = wb.addWorksheet(event + '預賽');
  const maxSize = Math.max(...st.groups.map(g => g.size));
  ws.getColumn(1).width = 4;
  ws.getColumn(2).width = 14;
  for (let c = 3; c < 3 + maxSize; c++) ws.getColumn(c).width = 13;
  ws.getColumn(3 + maxSize).width = 7;
  ws.getColumn(4 + maxSize).width = 7;
  const perPage = maxSize >= 4 ? 4 : 5;

  let r = 1;
  st.groups.forEach((g, gi) => {
    if (gi % perPage === 0) {
      if (gi > 0) ws.getRow(r - 1).addPageBreak();
      const t = ws.getCell(r, 1);
      t.value = EVENT_TITLE[event] + ' 預賽';
      t.font = { name: FONT, size: 16, bold: true };
      const s = ws.getCell(r, 5);
      s.value = '(預賽各組取前二晉級)';
      s.font = { name: FONT, size: 10 };
      r += 2;
    }
    const n = g.size;
    const names = Array.from({ length: n }, (_, j) => {
      const e = byPos.get(g.startPos + j);
      return e ? e.name : '';
    });
    const box = (cell, v, opt = {}) => {
      cell.value = v;
      cell.font = { name: FONT, size: opt.size || 11 };
      cell.alignment = { horizontal: 'center', vertical: 'middle', shrinkToFit: true };
      cell.border = { top: thin, left: thin, bottom: thin, right: thin };
      if (opt.fill) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9D9D9' } };
    };
    ws.mergeCells(r, 1, r + 1, 2);
    box(ws.getCell(r, 1), `${g.letter}組`);
    for (let j = 0; j < n; j++) {
      box(ws.getCell(r, 3 + j), j + 1);
      box(ws.getCell(r + 1, 3 + j), names[j]);
    }
    ws.mergeCells(r, 3 + n, r + 1, 3 + n); box(ws.getCell(r, 3 + n), '勝場');
    ws.mergeCells(r, 4 + n, r + 1, 4 + n); box(ws.getCell(r, 4 + n), '名次');
    const label = new Map(g.matches.map(m => [`${Math.min(m.a, m.b)}-${Math.max(m.a, m.b)}`, m.label]));
    for (let i = 1; i <= n; i++) {
      const rr = r + 1 + i;
      box(ws.getCell(rr, 1), i);
      box(ws.getCell(rr, 2), names[i - 1]);
      for (let j = 1; j <= n; j++) {
        const c = ws.getCell(rr, 2 + j);
        if (j === i) box(c, '', { fill: true });
        else if (j < i) box(c, label.get(`${j}-${i}`) || '');
        else box(c, '');
      }
      box(ws.getCell(rr, 3 + n), '');
      box(ws.getCell(rr, 4 + n), '');
      ws.getRow(rr).height = 22;
    }
    r += n + 4;
  });
  ws.views = [{ showGridLines: false }];
  pageSetup(ws);
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
