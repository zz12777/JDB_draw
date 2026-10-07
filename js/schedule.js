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
  finalDay1: true, // 第一天時間許可時，先打大專團體決賽第一輪
  day1Latest: '20:00', // 第一天最晚結束
  roundTo: 10,   // 時段長度取整（分鐘）
  teamChunk: 'auto', // 團體預賽每個時段叫：auto 自動、full 一整輪、half 半輪
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
export const range = (a, b) => (a === b ? toCn(a) : `${toCn(a)}~${toCn(b)}`);
export const frange = (a, b) => (a === b ? `決${a}` : `決${a}-${b}`);

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
  // ---------- 大專團體決賽 ----------
  const finals = TEAM.filter(e => structs[e] && structs[e].kind === 'rr' && structs[e].groups.length >= 1);
  const ko = {}, top = {};
  finals.forEach(e => { ko[e] = buildKO([structs[e].groups.length * 2]); top[e] = Math.max(...ko[e].matches.map(m => m.depth)); });
  const teamUnit = (depth, first) => (depth <= 1 ? { unit: p.tSemi, split: p.splitSemi } : first ? { unit: p.tAfterDraw, split: p.split } : { unit: p.tFinal, split: p.split });
  const koItems = (e, k, d, afterDraw) => {
    const r = k.rounds.find(x => x.depth === d);
    if (!r) return null;
    const first = afterDraw && d === Math.max(...k.matches.map(m => m.depth));
    const { unit, split } = teamUnit(d, first);
    return { event: e, count: r.count, unit, text: frange(r.from, r.to), tableMin: r.count * unit, minLen: unit / split };
  };

  const s1 = toMin(p.day1Start), s2 = toMin(p.day2Start);
  const moved = new Set();
  if (teams.length && nPreRounds) {
    // 預賽一輪一輪叫；男女團一輪加起來比桌數多很多時（超過 1.25 倍），每輪拆成兩半叫，一個時段叫半輪
    const sumRound = Math.max(...structs[teams[0]].rounds.map((_, r) => teams.reduce((x, e) => x + ((structs[e].rounds[r] || {}).count || 0), 0)));
    const half = p.teamChunk === 'half' || (p.teamChunk !== 'full' && sumRound > T * 1.25);
    const chunksOf = e => structs[e].rounds.flatMap(x => {
      if (!x.count) return [];
      const parts = half && x.count >= 2 ? [[x.from, x.from + Math.ceil(x.count / 2) - 1], [x.from + Math.ceil(x.count / 2), x.to]] : [[x.from, x.to]];
      return parts.map(([a, b]) => ({ event: e, count: b - a + 1, unit: p.tPre, text: range(a, b), tableMin: (b - a + 1) * p.tPre, minLen: p.tPre / p.split }));
    });
    const chunks = {};
    teams.forEach(e => { chunks[e] = chunksOf(e); });
    const blockRows = day1.filter(s => s.block);
    let first = 0;
    if (blockRows.length) {
      // 重疊時段：個人賽 8 強以後各輪照順序打，團體預賽第一批用其他桌子同時進行
      const r1 = teams.map(e => chunks[e][0]).filter(Boolean);
      const indTm = blockRows.reduce((s, x) => s + x.tableMin, 0);
      const teamTm = r1.reduce((s, x) => s + x.tableMin, 0);
      blockRows[0].teamItems = r1;
      blockRows[0].teamSpan = blockRows.length;
      day1.blockNeed = Math.max((indTm + teamTm) / T, Math.max(0, ...r1.map(x => x.minLen)));
      first = 1;
    }
    // 之後每個時段：男女團各叫下一批；打完預賽的那項接著抽籤，時間許可再打決賽第一輪
    const latest = toMin(p.day1Latest || '20:00');
    const withFinal = new Set(p.finalDay1 ? finals.filter(e => teams.includes(e)) : []);
    let rows;
    for (;;) {
      const queue = {};
      teams.forEach(e => {
        const q = chunks[e].slice(first);
        if (finals.includes(e)) {
          q.push({ event: e, text: '抽籤', draw: true, tableMin: 0, minLen: p.drawMin, count: 0, unit: 0 });
          if (withFinal.has(e)) { const x = koItems(e, ko[e], top[e], true); q.push({ ...x, final: true }); }
        }
        queue[e] = q;
      });
      const n = Math.max(0, ...teams.map(e => queue[e].length));
      rows = [];
      for (let k = 0; k < n; k++) {
        const items = teams.map(e => queue[e][k]).filter(Boolean);
        const r = slot(`d1-q${k}`, items);
        r.items = []; r.teamItems = items; r.teamSpan = 1;
        r.desc = items.map(x => (x.draw ? `${x.event} 抽籤` : `${x.event} ${x.text}（${x.count}場×${x.unit}分）`)).join('、');
        rows.push(r);
      }
      const tmp = [...day1, ...rows];
      place(tmp, s1, day1.blockNeed);
      const over = rows.filter(r => r.teamItems.some(x => x.final) && r.end > latest + 0.01);
      if (!over.length || !withFinal.size) break;
      // 決賽第一輪放不下：比較晚打完的那項留到第二天
      const last = rows.filter(r => r.teamItems.some(x => x.final)).pop();
      withFinal.delete(last.teamItems.find(x => x.final).event);
    }
    withFinal.forEach(e => moved.add(e));
    rows.forEach(r => { r.teamItems.forEach(x => { if (x.draw) x.bold = true; }); });
    day1.push(...rows);
  }

  // ---------- 第二天：大專團體決賽、社會組 ----------
  // 大專決賽各輪：男女團各自從自己的第一輪開始，第 j 個時段放兩項各自的第 j 輪
  const uniRounds = [];
  finals.forEach(e => {
    let j = 0;
    for (let d = top[e] - (moved.has(e) ? 1 : 0); d >= 0; d--) {
      const x = koItems(e, ko[e], d, false);
      if (!x) continue;
      (uniRounds[j] = uniRounds[j] || []).push(x);
      j++;
    }
  });
  const day2 = [];
  const social = structs['社團'] && structs['社團'].kind === 'rr' ? structs['社團'] : null;
  const socRounds = social ? social.rounds : [];
  const socStart = Math.max(1, +p.socialStartRound || 1) - 1;
  const nSlots = Math.max(uniRounds.length, socRounds.length ? socStart + socRounds.length : 0);
  for (let j = 0; j < nSlots; j++) {
    const items = [...(uniRounds[j] || [])];
    const sr = j - (uniRounds.length ? socStart : 0);
    if (sr >= 0 && sr < socRounds.length) {
      const x = socRounds[sr];
      items.push({ event: '社團', count: x.count, unit: p.tPre, text: range(x.from, x.to), tableMin: x.count * p.tPre, minLen: p.tPre / p.split });
    }
    if (items.length) day2.push(slot(`d2-s${j + 1}`, items));
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

  const e1 = place(day1, s1, day1.blockNeed);
  // 每一格要顯示的文字與跨列（團體欄跨好幾列表示同時進行）
  [day1, day2].forEach(rows => {
    rows.forEach(r => { r.cells = r.cells || {}; r.skip = r.skip || new Set(); });
    rows.forEach((r, i) => {
      (r.items || []).forEach(x => { r.cells[x.event] = { text: x.text, span: 1 }; });
      (r.teamItems || []).forEach(x => {
        const n = r.teamSpan || 1;
        r.cells[x.event] = { text: x.text, span: n, bold: !!x.draw };
        for (let k = 1; k < n; k++) rows[i + k].skip.add(x.event);
      });
      if (r.draw) r.cells[r.drawCol] = { text: r.draw, span: 1, bold: true };
    });
  });
  const e2 = place(day2, s2, 0);
  // 每一格（項目＋場次範圍）的開始、結束時間，給輪次表標題用
  const times = {};
  [[day1, 1], [day2, 2]].forEach(([rows, day]) => rows.forEach((r, i) => {
    Object.entries(r.cells).forEach(([ev, x]) => {
      const last = rows[Math.min(rows.length - 1, i + (x.span || 1) - 1)];
      times[`${ev}|${x.text}`] = { day, start: r.start, end: last.end };
    });
  }));
  let cum = 0;
  [...day1, ...day2].forEach(r => { cum += r.diff; r.cumDiff = cum; });

  const count = es => es.reduce((s, e) => s + (structs[e] ? (structs[e].kind === 'ko' ? structs[e].matches.length : structs[e].matchCount) : 0), 0);
  const summary = {
    singles: count(['男單', '女單']), doubles: count(['男雙', '女雙']),
    teamPre: count(teams), teamFinal: finals.reduce((s, e) => s + ko[e].matches.length, 0),
    socialPre: social ? social.matchCount : 0, socialFinal: social ? social.groups.length * 2 - 1 : 0,
  };
  return { day1, day2, end1: e1, end2: e2, start1: s1, start2: s2, summary, notes, tables: T, times };
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
    cols.forEach((c, ci) => {
      const x = r.cells[c];
      if (!x) return;
      const cell = ws.getCell(rr, c0 + ci);
      cell.value = x.text;
      if (x.bold) cell.font = { name: KAI, size: 12, bold: true };
      if (x.span > 1) ws.mergeCells(rr, c0 + ci, rr + x.span - 1, c0 + ci);
    });
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
    const parts = x.desc ? [x.desc] : [...(x.items || []), ...(x.teamItems || [])].map(i => `${i.event} ${i.text}（${i.count}場×${i.unit}分）`);
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
