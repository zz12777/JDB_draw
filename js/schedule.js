// 賽程時間表：依籤表規劃估算每個時段要多久，排出兩天的時間表
// 算法沿用往年「交大盃時間估算模型」：每場比賽佔用桌子的分鐘數加總，除以桌數，就是這個時段要多久。
import { toCn } from './util.js';
import { buildKO } from './bracket.js';

export const DEFAULT_PARAMS = {
  tables: 24,
  day1Date: '', day2Date: '',
  day1Start: '08:30', day2Start: '08:30',
  // 個人賽每場分鐘，依「該輪場數」：17 場以上、5 到 16 場、1 到 4 場（往年公式）
  single: [20, 25, 30],
  double: [25, 25, 30],
  // 團體賽每場佔用的桌分鐘
  tPre: 100,     // 預賽
  tFinal: 105,   // 決賽（四強前）
  tSemi: 150,    // 四強起
  tAfterDraw: 120, // 抽籤後第一輪（要等點單，社會組決賽第一輪）
  split: 2,      // 一場團體賽最多拆幾桌（四強前）
  splitSemi: 5,  // 四強起最多拆幾桌
  teamStartStage: 8, // 個人賽打到幾強時，大專團體預賽開始
  socialStartRound: 2, // 社會組預賽在大專團體決賽第幾輪開始
  drawMin: 20,   // 決賽抽籤
  roundTo: 10,   // 時段長度取整（分鐘）
};

const IND = ['男單', '女單', '男雙', '女雙'];
const TEAM = ['男團', '女團'];
export const DAY1_COLS = ['男單', '女單', '男雙', '女雙', '男團', '女團'];
export const DAY2_COLS = ['男團', '女團', '社團'];
export const COL_TITLE = {
  男單: '大專組\n男子單打', 女單: '大專組\n女子單打', 男雙: '大專組\n男子雙打', 女雙: '大專組\n女子雙打',
  男團: '大專組\n男子團體', 女團: '大專組\n女子團體', 社團: '社會組\n團體賽',
};

export const toMin = hhmm => { const [h, m] = String(hhmm || '08:30').split(':').map(Number); return (h || 0) * 60 + (m || 0); };
export const fmt = min => `${String(Math.floor(min / 60) % 24).padStart(2, '0')}:${String(Math.round(min % 60)).padStart(2, '0')}`;
const roundTo = (x, step) => Math.max(step, Math.round(x / step) * step);

/** 個人賽每場分鐘：依該輪「完整輪次」的場數（資格賽照它所在那一級算） */
export function indMinutes(event, nominal, p) {
  const t = event.endsWith('雙') ? p.double : p.single;
  return nominal >= 17 ? t[0] : nominal >= 5 ? t[1] : t[2];
}
const range = (a, b) => (a === b ? toCn(a) : `${toCn(a)}~${toCn(b)}`);
const frange = (a, b) => (a === b ? `決${a}` : `決${a}-${b}`);

/** 單淘汰各輪（由第一輪到決賽）：{ depth, count, from, to } */
function koRounds(st) {
  return st.rounds.slice().sort((a, b) => b.depth - a.depth);
}

/**
 * 排出兩天的時段。
 * structs: { 項目: 籤表結構 }（只放有名單、規劃正確的項目）
 * override: { 時段 id: 分鐘 }，手動調整的時段長度
 */
export function buildSchedule(structs, p = DEFAULT_PARAMS, override = {}) {
  const T = Math.max(1, +p.tables || 24);
  const notes = [];

  // ---------- 第一天：個人賽 ----------
  const ind = IND.filter(e => structs[e] && structs[e].kind === 'ko');
  const Dmax = Math.max(-1, ...ind.map(e => Math.max(...structs[e].matches.map(m => m.depth))));
  const indSlots = []; // 每個時段：各項目這一輪
  for (let d = Dmax; d >= 0; d--) {
    const items = [];
    ind.forEach(e => {
      const r = structs[e].rounds.find(x => x.depth === d);
      if (!r) return;
      const unit = indMinutes(e, 2 ** d, p);
      items.push({ event: e, count: r.count, unit, text: range(r.from, r.to), tableMin: r.count * unit, minLen: unit });
    });
    if (items.length) indSlots.push({ depth: d, items });
  }

  // ---------- 第一天：大專團體預賽 ----------
  const teams = TEAM.filter(e => structs[e] && structs[e].kind === 'rr');
  const nPreRounds = Math.max(0, ...teams.map(e => structs[e].rounds.length));
  const preRound = r => {
    const items = [];
    teams.forEach(e => {
      const x = structs[e].rounds[r];
      if (!x || !x.count) return;
      items.push({ event: e, count: x.count, unit: p.tPre, text: range(x.from, x.to), tableMin: x.count * p.tPre, minLen: p.tPre / p.split });
    });
    return items;
  };

  const slot = (id, items, extra = {}) => {
    const tableMin = items.reduce((s, x) => s + x.tableMin, 0);
    const minLen = Math.max(0, ...items.map(x => x.minLen));
    const est = Math.max(tableMin / T, minLen);
    return { id, items, tableMin, minLen, est, ...extra };
  };

  const day1 = [];
  // 團體預賽第一輪在個人賽打到「幾強」那一輪開始，跟個人賽剩下的輪次重疊
  const startDepth = Math.round(Math.log2(Math.max(2, p.teamStartStage))) - 1; // 8 強 -> 該輪 4 場 -> depth 2
  let blockStart = indSlots.findIndex(s => s.depth <= startDepth);
  if (!teams.length || nPreRounds === 0) blockStart = -1;
  if (teams.length && nPreRounds && blockStart < 0) blockStart = indSlots.length; // 個人賽太少，團體接在後面

  indSlots.forEach((s, k) => {
    day1.push(slot(`d1-i${s.depth}`, s.items, { block: blockStart >= 0 && k >= blockStart }));
  });
  if (teams.length && nPreRounds) {
    const r1 = preRound(0);
    const blockRows = day1.filter(s => s.block);
    if (blockRows.length) {
      // 重疊時段：個人賽各輪照順序打，團體預賽第一輪用其他桌子同時進行
      const indTm = blockRows.reduce((s, x) => s + x.tableMin, 0);
      const teamTm = r1.reduce((s, x) => s + x.tableMin, 0);
      blockRows[0].teamItems = r1;
      blockRows[0].teamSpan = blockRows.length;
      blockRows.blockNeed = Math.max((indTm + teamTm) / T, Math.max(0, ...r1.map(x => x.minLen)));
      day1.blockNeed = blockRows.blockNeed;
    } else {
      const s0 = slot('d1-t0', r1);
      s0.teamItems = r1; s0.items = []; s0.teamSpan = 1;
      day1.push(s0);
    }
    for (let r = 1; r < nPreRounds; r++) {
      const items = preRound(r);
      const s = slot(`d1-t${r}`, items);
      s.teamItems = items; s.items = [];
      s.teamSpan = 1;
      day1.push(s);
    }
    day1.push({ id: 'd1-draw', items: [], est: p.drawMin, draw: '決賽抽籤', tableMin: 0, minLen: p.drawMin });
  }

  // ---------- 第二天：大專團體決賽、社會組 ----------
  const finals = TEAM.filter(e => structs[e] && structs[e].kind === 'rr' && structs[e].groups.length >= 1);
  const ko = {};
  finals.forEach(e => { ko[e] = buildKO([structs[e].groups.length * 2]); });
  const teamUnit = (depth, first) => (depth <= 1 ? { unit: p.tSemi, split: p.splitSemi } : first ? { unit: p.tAfterDraw, split: p.split } : { unit: p.tFinal, split: p.split });
  const koItems = (e, k, d, afterDraw) => {
    const r = k.rounds.find(x => x.depth === d);
    if (!r) return null;
    const first = afterDraw && d === Math.max(...k.matches.map(m => m.depth));
    const { unit, split } = teamUnit(d, first);
    return { event: e, count: r.count, unit, text: frange(r.from, r.to), tableMin: r.count * unit, minLen: unit / split };
  };
  const day2 = [];
  const social = structs['社團'] && structs['社團'].kind === 'rr' ? structs['社團'] : null;
  const fD = Math.max(-1, ...finals.map(e => Math.max(...ko[e].matches.map(m => m.depth))));
  const socRounds = social ? social.rounds : [];
  const socStart = Math.max(1, +p.socialStartRound || 1);
  let j = 0, sr = 0;
  for (let d = fD; d >= 0 || sr < socRounds.length; d--) {
    j++;
    const items = [];
    if (d >= 0) finals.forEach(e => { const x = koItems(e, ko[e], d, false); if (x) items.push(x); });
    if (social && j >= socStart && sr < socRounds.length) {
      const x = socRounds[sr++];
      items.push({ event: '社團', count: x.count, unit: p.tPre, text: range(x.from, x.to), tableMin: x.count * p.tPre, minLen: p.tPre / p.split });
    }
    if (!items.length) continue;
    day2.push(slot(`d2-s${j}`, items));
    if (d < 0 && sr >= socRounds.length) break;
  }
  if (social && social.groups.length) {
    day2.push({ id: 'd2-draw', items: [], est: p.drawMin, draw: '決賽抽籤', drawCol: '社團', tableMin: 0, minLen: p.drawMin });
    const k = buildKO([social.groups.length * 2]);
    const sd = Math.max(...k.matches.map(m => m.depth));
    for (let d = sd; d >= 0; d--) {
      const x = koItems('社團', k, d, true);
      if (x) day2.push(slot(`d2-f${d}`, [x]));
    }
  }

  // ---------- 時段長度與時間 ----------
  function place(rows, start, blockNeed) {
    let t = start;
    const blockRows = rows.filter(r => r.block);
    rows.forEach(r => {
      r.plan = roundTo(r.est, p.roundTo);
      if (r.block && r === blockRows[blockRows.length - 1] && blockNeed) {
        // 重疊時段的最後一輪延長到團體預賽第一輪打完
        const before = blockRows.slice(0, -1).reduce((s, x) => s + (override[x.id] ?? x.plan), 0);
        r.plan = Math.max(r.plan, roundTo(blockNeed - before, p.roundTo));
        r.est = Math.max(r.est, blockNeed - before);
      }
      r.len = override[r.id] != null && override[r.id] !== '' ? +override[r.id] : r.plan;
      r.diff = r.len - r.est;
      r.start = t; t += r.len; r.end = t;
    });
    return t;
  }
  const s1 = toMin(p.day1Start), s2 = toMin(p.day2Start);
  const e1 = place(day1, s1, day1.blockNeed);
  const e2 = place(day2, s2, 0);
  let cum = 0;
  [...day1, ...day2].forEach(r => { cum += r.diff; r.cumDiff = cum; });

  const count = es => es.reduce((s, e) => s + (structs[e] ? (structs[e].kind === 'ko' ? structs[e].matches.length : structs[e].matchCount) : 0), 0);
  const summary = {
    singles: count(['男單', '女單']), doubles: count(['男雙', '女雙']),
    teamPre: count(teams), teamFinal: finals.reduce((s, e) => s + ko[e].matches.length, 0),
    socialPre: social ? social.matchCount : 0, socialFinal: social ? social.groups.length * 2 - 1 : 0,
  };
  return { day1, day2, end1: e1, end2: e2, start1: s1, start2: s2, summary, notes, tables: T };
}

// ---------------- Excel ----------------
const KAI = '標楷體';
const thin = { style: 'thin', color: { argb: 'FF808080' } };
const B = { top: thin, left: thin, bottom: thin, right: thin };

function dayBlock(ws, row, title, cols, rows, isDay1) {
  const nc = cols.length;
  const c0 = 3;
  const head = ws.getRow(row);
  ws.getCell(row, 2).value = '時間';
  cols.forEach((c, i) => { ws.getCell(row, c0 + i).value = COL_TITLE[c]; });
  head.height = 34;
  for (let c = 2; c < c0 + nc; c++) {
    const cell = ws.getCell(row, c);
    cell.font = { name: KAI, size: 12, bold: true };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = B;
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCE6F1' } };
  }
  const first = row + 1;
  rows.forEach((r, i) => {
    const rr = first + i;
    ws.getCell(rr, 2).value = fmt(r.start);
    for (let c = 2; c < c0 + nc; c++) {
      const cell = ws.getCell(rr, c);
      cell.font = { name: KAI, size: 12 };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border = B;
    }
    ws.getRow(rr).height = 24;
  });
  rows.forEach((r, i) => {
    const rr = first + i;
    (r.items || []).forEach(x => { const ci = cols.indexOf(x.event); if (ci >= 0) ws.getCell(rr, c0 + ci).value = x.text; });
    if (r.teamItems) {
      r.teamItems.forEach(x => {
        const ci = cols.indexOf(x.event);
        if (ci < 0) return;
        ws.getCell(rr, c0 + ci).value = x.text;
        if (r.teamSpan > 1) ws.mergeCells(rr, c0 + ci, rr + r.teamSpan - 1, c0 + ci);
      });
    }
    if (r.draw) {
      const from = r.drawCol ? cols.indexOf(r.drawCol) : cols.indexOf('男團');
      const to = r.drawCol ? from : cols.indexOf('女團');
      if (from >= 0) {
        if (to > from) ws.mergeCells(rr, c0 + from, rr, c0 + to);
        ws.getCell(rr, c0 + from).value = r.draw;
      }
    }
  });
  const last = first + rows.length - 1;
  if (rows.length) {
    ws.mergeCells(first, 1, last, 1);
    const t = ws.getCell(first, 1);
    t.value = title;
    t.font = { name: KAI, size: 12, bold: true };
    t.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    t.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2EAC8' } };
    for (let r = first; r <= last; r++) ws.getCell(r, 1).border = B;
  }
  void isDay1;
  return last + 2;
}

function dayTitle(date, n) {
  if (!date) return `第${n === 1 ? '一' : '二'}天`;
  const d = new Date(date + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return date;
  return `${d.getMonth() + 1}月${d.getDate()}日\n星期${'日一二三四五六'[d.getDay()]}`;
}

export function scheduleWorkbook(sch, p, ExcelJSLib = globalThis.ExcelJS) {
  const wb = new ExcelJSLib.Workbook();
  wb.creator = '交大盃抽籤系統';
  const ws = wb.addWorksheet('賽程時間預定表');
  ws.columns = [{ width: 11 }, { width: 9 }, ...Array(6).fill({ width: 16 })];
  ws.mergeCells(1, 1, 1, 8);
  const t = ws.getCell(1, 1);
  t.value = '賽程時間預定表';
  t.font = { name: KAI, size: 20, bold: true };
  t.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 36;
  let r = dayBlock(ws, 3, dayTitle(p.day1Date, 1), DAY1_COLS, sch.day1, true);
  r = dayBlock(ws, r, dayTitle(p.day2Date, 2), DAY2_COLS, sch.day2, false);
  ['一、本表為時間預定表，請各隊於預定比賽時間前一小時到場，並留意大會廣播。',
    '二、因賽程緊湊，必要時大會得採分桌進行比賽，請各隊配合。',
    '三、若賽程提前，大會有權利提前進行比賽。'].forEach((v, i) => {
    ws.mergeCells(r + i, 1, r + i, 8);
    const c = ws.getCell(r + i, 1);
    c.value = v;
    c.font = { name: KAI, size: 11 };
  });
  ws.views = [{ showGridLines: false }];
  ws.pageSetup = { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 1 };

  // 估算明細
  const d = wb.addWorksheet('估算明細');
  d.addRow(['日', '開始', '結束', '表定(分)', '估算(分)', '時間差(分)', '累計時間差(分)', '內容', '桌分鐘', '說明']);
  const line = (day, x) => {
    const parts = [...(x.items || []), ...(x.teamItems || [])].map(i => `${i.event} ${i.text}（${i.count}場×${i.unit}分）`);
    if (x.draw) parts.push(x.draw);
    d.addRow([day, fmt(x.start), fmt(x.end), x.len, Math.round(x.est), Math.round(x.diff), Math.round(x.cumDiff), parts.join('、'), Math.round(x.tableMin || 0),
      x.block ? '與團體預賽第一輪重疊' : '']);
  };
  sch.day1.forEach(x => line('第一天', x));
  sch.day2.forEach(x => line('第二天', x));
  d.getRow(1).font = { bold: true };
  [8, 8, 8, 9, 9, 10, 13, 60, 9, 20].forEach((w, i) => { d.getColumn(i + 1).width = w; });
  d.addRow([]);
  d.addRow(['時間差：表定減估算，正數表示時間抓得比較寬鬆，負數表示可能會延遲。']);
  d.addRow([`桌數 ${sch.tables}；每個時段估算 = 該時段所有場次的桌分鐘 ÷ 桌數，但至少要等最久的一場打完。`]);
  return wb;
}
