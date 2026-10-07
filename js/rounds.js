// 重疊名單與輪次表
// 重疊名單：男團、女團裡有打個人賽的人；社團裡有打大專男團、女團的人。
// 輪次表：照第十二屆「輪次表」的版面產生 Excel，填好場次、籤位、隊名與重疊名單，其他欄位留空給試算表處理。
import { toCn } from './util.js';
import { buildKO } from './bracket.js';
import { range, frange, fmt } from './schedule.js';

export const cleanName = s => String(s ?? '').replace(/[\s　]+/g, '').replace(/黄/g, '黃');
const looseTeam = s => cleanName(s).replace(/台/g, '臺');

/** 隊員欄拆成名字 */
export function splitMembers(text) {
  return String(text ?? '')
    .replace(/[（(][^）)]*[）)]/g, ' ')
    .split(/[^㐀-鿿豈-﫿A-Za-z·．.]+/)
    .map(cleanName)
    .filter(x => x.length >= 2);
}

/**
 * events: { 項目: [entry] }，entry 有 school、name、members
 * 回傳 { 男團: [{ team, school, hits: [{ name, tag }] }], 女團: [...], 社團: [...] }
 */
export function computeOverlaps(events) {
  const out = {};
  const indexOf = (ev, splitDouble) => {
    const m = new Map(); // 姓名|學校 -> true
    (events[ev] || []).forEach(e => {
      const names = splitDouble ? String(e.name).split(/[/／、]/) : [e.name];
      names.map(cleanName).filter(Boolean).forEach(n => m.set(`${n}|${e.school}`, true));
    });
    return m;
  };
  [['男團', '男單', '男雙'], ['女團', '女單', '女雙']].forEach(([team, single, double]) => {
    if (!events[team] || !events[team].length) return;
    const si = indexOf(single, false), di = indexOf(double, true);
    out[team] = events[team].map(t => {
      const hits = [];
      splitMembers(t.members).forEach(n => {
        if (si.has(`${n}|${t.school}`)) hits.push({ name: n, tag: '單' });
        else if (di.has(`${n}|${t.school}`)) hits.push({ name: n, tag: '雙' });
      });
      return { team: t.name, school: t.school, hits };
    });
  });
  if (events['社團'] && events['社團'].length) {
    const who = new Map(); // 姓名 -> [「男團 臺灣大學申」]
    ['男團', '女團'].forEach(ev => (events[ev] || []).forEach(t => {
      splitMembers(t.members).forEach(n => {
        if (!who.has(n)) who.set(n, []);
        who.get(n).push(`${ev} ${t.name}`);
      });
    }));
    out['社團'] = events['社團'].map(t => {
      const hits = [];
      splitMembers(t.members).forEach(n => { if (who.has(n)) hits.push({ name: n, tag: who.get(n).join('、') }); });
      return { team: t.name, school: t.school, hits };
    });
  }
  return out;
}

export const hitText = hits => hits.map(h => `${h.name}（${h.tag}）`).join('、');
/** 輪次表上的簡短寫法：同一類放一起，例如「單 張峻林、蔡孟倫／雙 陳睿恩」 */
function shortText(hits) {
  const g = new Map();
  hits.forEach(h => { if (!g.has(h.tag)) g.set(h.tag, []); g.get(h.tag).push(h.name); });
  if ([...g.keys()].every(k => k === '單' || k === '雙')) return [...g.entries()].map(([k, v]) => `${k} ${v.join('、')}`).join('／');
  return hitText(hits);
}

/** 輪次表備註：大專團寫有打個人賽的人；社團沒有重疊寫「無大專組」 */
function noteFor(event, teams, ovMap) {
  const lines = [];
  teams.forEach(name => {
    if (!name) return;
    const o = ovMap.get(looseTeam(name));
    if (o && o.hits.length) lines.push(`${name}：${shortText(o.hits)}`);
  });
  if (!lines.length && event === '社團' && teams.some(Boolean)) return '無大專組';
  return lines.join('\n');
}

// ---------------- Excel ----------------
const NS = 'NSimSun';
const BLUE = 'FF57A2D8', ORANGE = 'FFFF9900';
const side = (style, argb) => ({ style, color: { argb } });

function dayLabel(date, n) {
  if (!date) return `第${n === 1 ? '一' : '二'}天`;
  const d = new Date(date + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return date;
  return `${d.getMonth() + 1}/${d.getDate()}(${'日一二三四五六'[d.getDay()]})`;
}

/**
 * 一個區塊（一輪、一個或多個項目由上往下）。
 * kind 'pre'：前輪完賽、點單、籤位、隊名、桌次、備註、完賽（第一天格式）
 * kind 'final'：發點單、前輪完賽、點單、籤位、隊名、桌次、桌次、備註、完賽（第二天格式）
 */
function drawBlock(ws, top, left, block, color) {
  const fin = block.kind === 'final';
  const cols = fin
    ? ['', '', '發點單', '前輪\n完賽\n(O)', '點單\n(V)', '', '', '桌次', '桌次', '開始時間、\n尚有大專組、\n備註等', '完賽\n(1)']
    : ['', '', '前輪\n完賽\n(O)', '點單\n(V)', '', '', '桌次', '開始時間、\n尚有大專組、\n備註等', '完賽\n(1)'];
  const W = fin ? [6, 9, 6.7, 6.7, 6.7, 4.3, 18.1, 7.2, 7.2, 24, 6.2] : [6.3, 9, 6.7, 6.7, 4.3, 15.3, 14.4, 24, 6.7];
  W.forEach((w, i) => { const c = ws.getColumn(left + i); if (!c.width || c.width < w) c.width = w; });
  ws.getColumn(left + W.length).width = 4.7;
  const n = W.length;
  const at = (r, i) => ws.getCell(r, left + i);
  const iSlot = fin ? 5 : 4, iTeam = fin ? 6 : 5, iTable = fin ? 7 : 6, iNote = fin ? 9 : 7, iDone = n - 1;

  // 標題列
  const t = at(top, 0);
  t.value = `${block.dayText} 團體賽賽程 `;
  at(top, 3).value = `|${block.label}`;
  at(top, iTeam).value = block.time ? `| ${block.time}` : '';
  for (let i = 0; i < n; i++) {
    const c = at(top, i);
    c.font = { name: 'Arial', size: 14, bold: true };
    c.alignment = { vertical: 'middle' };
    if (fin) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9CB9C' } };
  }
  ws.getRow(top).height = 30;
  // 表頭
  cols.forEach((v, i) => {
    const c = at(top + 1, i);
    c.value = v || null;
    c.font = { name: 'Arial', size: i === iNote || i === iTable ? 8 : 9 };
    c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDDD9C4' } };
    c.border = { top: side('medium', color), left: side('medium', color), right: side('medium', color), bottom: side('medium', color) };
  });
  ws.getRow(top + 1).height = 35.25;

  let r = top + 2;
  block.parts.forEach(part => {
    const start = r;
    part.matches.forEach(m => {
      const r2 = r + 1;
      [r, r2].forEach((rr, k) => {
        ws.getRow(rr).height = Math.max(ws.getRow(rr).height || 0, fin ? 22.5 : 17.4);
        const s = m.sides[k];
        at(rr, iSlot).value = s.slot || null;
        at(rr, iTeam).value = s.team || null;
        for (let i = 2; i < n; i++) {
          const c = at(rr, i);
          c.font = { name: NS, size: i === iTeam ? 14 : i === iSlot ? 12 : 14, color: i === iTeam ? { argb: 'FFB45F06' } : undefined };
          c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
          c.border = {
            left: side('medium', color), right: side('medium', color),
            top: k === 0 ? side('medium', color) : side('dotted', color),
            bottom: k === 1 ? side('medium', color) : side('dotted', color),
          };
        }
      });
      // 場次、桌次、備註、完賽 兩列合併
      const merged = [1, iTable, iNote, iDone];
      if (fin) merged.push(iTable + 1);
      merged.forEach(i => ws.mergeCells(r, left + i, r2, left + i));
      const lab = at(r, 1);
      lab.value = m.label;
      lab.font = { name: NS, size: 14, color: fin ? { argb: 'FFB45F06' } : undefined };
      lab.alignment = { horizontal: 'center', vertical: 'middle' };
      lab.border = { top: side('medium', color), bottom: side('medium', color), left: side('medium', color), right: side('medium', color) };
      const note = at(r, iNote);
      note.value = m.note || null;
      // 備註比較長時把這兩列拉高，免得字被切掉（每列約 15 個字）
      const lines = String(m.note || '').split('\n').reduce((x, l) => x + Math.max(1, Math.ceil(l.length / 15)), 0);
      const h = Math.max(fin ? 22.5 : 17.4, lines * 6.5);
      [r, r2].forEach(rr => { const row = ws.getRow(rr); row.height = Math.max(row.height || 0, h); });
      note.font = { name: NS, size: 9 };
      note.alignment = { horizontal: 'left', vertical: 'top', wrapText: true };
      r += 2;
    });
    // 項目名稱直排合併
    if (r > start) {
      ws.mergeCells(start, left, r - 1, left);
      const c = at(start, 0);
      c.value = part.event.split('').join('\n');
      c.font = { name: NS, size: 16, color: fin ? { argb: 'FFB45F06' } : undefined };
      c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      c.border = { top: side('medium', color), bottom: side('medium', color), left: side('medium', color), right: side('medium', color) };
    }
  });
  return r; // 下一個可用列
}

function preBlocks(struct, event, byPos, ovMap) {
  // 預賽：每一輪一組場次
  return struct.rounds.map((rd, ri) => {
    const matches = [];
    struct.groups.forEach(g => g.matches.filter(m => m.round === ri + 1).forEach(m => {
      const sideOf = k => {
        const e = byPos.get(g.startPos + k - 1);
        return { slot: `${g.letter}${k}`, team: e ? e.name : '' };
      };
      const sides = [sideOf(m.a), sideOf(m.b)];
      matches.push({ num: m.num, label: `(${m.label})`, sides, note: noteFor(event, sides.map(s => s.team), ovMap) });
    }));
    matches.sort((x, y) => x.num - y.num);
    return { round: ri, key: `${event}|${range(rd.from, rd.to)}`, matches };
  });
}

function finalBlocks(nGroups, event) {
  const ko = buildKO([nGroups * 2]);
  const depths = [...new Set(ko.matches.map(m => m.depth))].sort((a, b) => b - a);
  return depths.map((d, i) => {
    const ms = ko.matches.filter(m => m.depth === d).sort((a, b) => a.num - b.num);
    const rd = ko.rounds.find(x => x.depth === d);
    return {
      round: i, key: `${event}|${frange(rd.from, rd.to)}`,
      matches: ms.map(m => ({
        num: m.num, label: `決(${m.label})`,
        sides: m.children.map(c => (c.kind === 'leaf' ? { slot: String(c.pos), team: '' } : { slot: '', team: `決(${c.label})勝` })),
        note: '',
      })),
    };
  });
}

const ROUND_NAME = ['一', '二', '三', '四', '五', '六', '七'];

/**
 * sources: { 項目: { st, byPos } }（男團、女團、社團）
 * overlaps: computeOverlaps 的結果
 * sch: buildSchedule 的結果（可為 null），params：日期
 */
export function roundsWorkbook(sources, overlaps, sch, params, ExcelJSLib = globalThis.ExcelJS) {
  const wb = new ExcelJSLib.Workbook();
  wb.creator = '交大盃抽籤系統';
  const ovMaps = {};
  Object.entries(overlaps).forEach(([ev, list]) => { ovMaps[ev] = new Map(list.map(o => [looseTeam(o.team), o])); });
  const timeOf = key => (sch && sch.times[key]) || null;
  const timeText = t => (t ? `${fmt(t.start)}~${fmt(t.end)}` : '');
  const d1 = dayLabel(params.day1Date, 1), d2 = dayLabel(params.day2Date, 2);

  // 第一天：大專預賽各輪並排，每輪男團在上、女團在下；時間許可的決賽第一輪接在右邊
  const day1 = [], day2 = [];
  const uni = ['男團', '女團'].filter(e => sources[e]);
  const pre = {};
  uni.forEach(e => { pre[e] = preBlocks(sources[e].st, e, sources[e].byPos, ovMaps[e] || new Map()); });
  const nPre = Math.max(0, ...uni.map(e => pre[e].length));
  for (let i = 0; i < nPre; i++) {
    const parts = uni.filter(e => pre[e][i]).map(e => ({ event: e, matches: pre[e][i].matches }));
    const times = uni.map(e => pre[e][i] && timeOf(pre[e][i].key)).filter(Boolean);
    const t = times.length ? { start: Math.min(...times.map(x => x.start)), end: Math.max(...times.map(x => x.end)) } : null;
    day1.push({ kind: 'pre', dayText: d1, label: `第${ROUND_NAME[i] || i + 1}輪`, time: timeText(t), parts });
  }
  // 決賽各輪
  uni.forEach(e => {
    const fb = finalBlocks(sources[e].st.groups.length, e);
    fb.forEach((b, i) => {
      const t = timeOf(b.key);
      const blk = { kind: 'final', label: `${e}決賽第${ROUND_NAME[i] || i + 1}輪`, time: timeText(t), parts: [{ event: e, matches: b.matches }], order: i, ev: e };
      if (t && t.day === 1) day1.push({ ...blk, dayText: d1 });
      else day2.push({ ...blk, dayText: d2 });
    });
  });
  // 第二天：大專決賽同一輪的女團、男團並排；再來社會組
  day2.sort((a, b) => (a.order - b.order) || (a.ev === '女團' ? -1 : 1));
  if (sources['社團']) {
    const s = sources['社團'];
    preBlocks(s.st, '社團', s.byPos, ovMaps['社團'] || new Map()).forEach((b, i) => {
      day2.push({ kind: 'pre', dayText: d2, label: `社會組第${ROUND_NAME[i] || i + 1}輪`, time: timeText(timeOf(b.key)), parts: [{ event: '社團', matches: b.matches }] });
    });
    finalBlocks(s.st.groups.length, '社團').forEach((b, i) => {
      day2.push({ kind: 'final', dayText: d2, label: `社會組決賽第${ROUND_NAME[i] || i + 1}輪`, time: timeText(timeOf(b.key)), parts: [{ event: '社團', matches: b.matches }] });
    });
  }

  const sheet = (name, blocks, perRow, color) => {
    if (!blocks.length) return;
    const ws = wb.addWorksheet(name);
    ws.getColumn(1).width = 3;
    let top = 1;
    for (let i = 0; i < blocks.length; i += perRow) {
      let left = 2, bottom = top;
      blocks.slice(i, i + perRow).forEach(b => {
        const c = b.kind === 'final' ? ORANGE : color;
        bottom = Math.max(bottom, drawBlock(ws, top, left, b, c));
        left += (b.kind === 'final' ? 11 : 9) + 1;
      });
      top = bottom + 2;
    }
    ws.views = [{ showGridLines: true }];
  };
  sheet('輪次表_團day1', day1, day1.length || 1, BLUE);
  sheet('輪次表_團day2', day2, 2, BLUE);

  // 重疊名單
  const ws = wb.addWorksheet('重疊名單');
  ws.columns = [{ width: 8 }, { width: 18 }, { width: 70 }];
  ws.addRow(['項目', '隊名', '重疊']).font = { bold: true };
  ['男團', '女團', '社團'].forEach(ev => (overlaps[ev] || []).forEach(o => {
    ws.addRow([ev, o.team, o.hits.length ? hitText(o.hits) : (ev === '社團' ? '無大專組' : '無')]);
  }));
  ws.addRow([]);
  ws.addRow(['', '說明', '大專團：括號是這個人也打的個人賽（單＝單打、雙＝雙打）。社團：括號是這個人也打的大專團體隊伍。']);
  return wb;
}
