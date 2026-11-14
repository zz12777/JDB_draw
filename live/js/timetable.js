// 讀賽程時間表 Excel：每個時間區段各項目打哪些場次
import { cnToNum } from '../../js/util.js';

const EV = [[/大專男團|男子團體|男團/, '男團'], [/大專女團|女子團體|女團/, '女團'], [/社會|社團/, '社團'],
  [/男子?單/, '男單'], [/女子?單/, '女單'], [/男子?雙/, '男雙'], [/女子?雙/, '女雙']];
const evOf = t => { const s = String(t ?? '').replace(/\s+/g, ''); if (!s || s.length > 8) return null; const hit = EV.find(([re]) => re.test(s)); return hit ? hit[1] : null; };
const TIME = /(\d{1,2})[:：](\d{2})\s*[-~～－]\s*(\d{1,2})[:：](\d{2})/;
const pad = (h, m) => `${String(h).padStart(2, '0')}:${m}`;

/** 「一~六四」「六五」「決1-16」「決31」「決賽抽籤」 */
function parseCell(text) {
  const t = String(text ?? '').replace(/\s+/g, '');
  if (!t) return null;
  if (/抽籤/.test(t)) return { draw: true };
  const f = t.match(/^決\(?([^\-~～－)]+)\)?(?:[\-~～－]\(?([^)]+)\)?)?$/);
  const num = x => (/^\d+$/.test(x) ? Number(x) : cnToNum(x));
  if (f) { const a = num(f[1]), b = f[2] ? num(f[2]) : a; return a && b ? { f: true, from: a, to: b } : null; }
  const p = t.split(/[~～－-]/).map(num);
  if (!p[0] || p.some(x => !x)) return null;
  return { from: p[0], to: p[p.length - 1] };
}

/** sheets: [{name, rows}]；回傳 [{ d: 第幾天, day: '12/5', s, e, ev, f, from, to, draw }] */
export function parseTimetable(sheets) {
  const sh = sheets.find(x => /時間|賽程/.test(x.name)) || sheets[0];
  const slots = [];
  let cols = null, d = 0, day = '';
  (sh ? sh.rows : []).forEach(row => {
    if (!row) return;
    const head = new Map();
    row.forEach((c, i) => { const ev = evOf(c); if (ev) head.set(i, ev); });
    if (head.size >= 2) {
      cols = head; d++;
      const label = String(row[0] ?? '').replace(/\s+/g, '');
      const md = label.match(/(\d{1,2})月(\d{1,2})日/);
      day = md ? `${md[1]}/${md[2]}` : `第${'一二三四'[d - 1] || d}天`;
      return;
    }
    if (!cols) return;
    const tm = row.slice(0, 3).map(c => String(c ?? '').match(TIME)).find(Boolean);
    if (!tm) return;
    const s = pad(tm[1], tm[2]), e = pad(tm[3], tm[4]);
    cols.forEach((ev, i) => { const x = parseCell(row[i]); if (x) slots.push({ d, day, s, e, ev, ...x }); });
  });
  if (!slots.length) throw new Error('找不到時間區段與場次，請確認是賽程時間表');
  // 跨好幾列的格子（合併儲存格）只有第一列有字：把結束時間延到同一欄下一格開始
  const byCol = new Map();
  slots.forEach(x => { const k = `${x.d}|${x.ev}`; byCol.set(k, (byCol.get(k) || []).concat(x)); });
  byCol.forEach(list => list.sort((a, b) => a.s.localeCompare(b.s)).forEach((x, i) => { const n = list[i + 1]; if (n && x.e < n.s) x.e = n.s; }));
  return slots;
}

/** 某一場的表定時段 */
export function slotOf(sched, m) {
  if (!sched || !sched.slots) return null;
  return sched.slots.find(x => x.ev === m.ev && !x.draw && !!x.f === (m.stage === 'F') && m.num >= x.from && m.num <= x.to) || null;
}
