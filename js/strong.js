// 猛將資料庫：用人名比對（有些人會換學校）
import { STRONG } from './strongdata.js';

const RANK = { 1: '冠軍', 2: '亞軍', 3: '季軍', 4: '殿軍' };
export const rankLabel = r => RANK[r] || '前八';
const TEAM_EV = new Set(['男團', '女團', '社團']);

export const cleanName = s => String(s ?? '').replace(/[\s　]+/g, '').replace(/黄/g, '黃');

// 成績由近到遠；同一年全大運在前
const KORD = { 全大運: 0, 分區預賽: 1, 盃賽: 2 };
const byRecent = (x, y) => (y.y - x.y) || ((KORD[x.k] ?? 3) - (KORD[y.k] ?? 3)) || (x.r - y.r);

/** 姓名 → { name, schools, ind: [紀錄], team: [紀錄] } */
let DATA = [];
const INDEX = new Map();
let NAMES = [];

/** 換一份資料（內建資料或共用試算表） */
export function setData(records) {
  DATA = records;
  INDEX.clear();
  for (const r of records) {
    for (const n of r.n) {
      const k = cleanName(n);
      if (!k) continue;
      if (!INDEX.has(k)) INDEX.set(k, { name: k, schools: [], ind: [], team: [] });
      const p = INDEX.get(k);
      if (r.u && r.d !== '社會' && !p.schools.includes(r.u)) p.schools.push(r.u); // 社會組的隊名不當學校
      (TEAM_EV.has(r.e) ? p.team : p.ind).push(r);
    }
  }
  INDEX.forEach(p => { p.ind.sort(byRecent); p.team.sort(byRecent); });
  NAMES = [...INDEX.keys()].sort((a, b) => b.length - a.length);
}
setData(STRONG);

/**
 * 共用試算表（成績總表）的 CSV 轉成資料。
 * 欄位：賽事、年份、組別、項目、名次、學校、隊名、姓名（依標題找欄位，順序可不同，可多欄）
 */
export function recordsFromRows(rows, normSchool = x => x) {
  const hi = rows.findIndex(r => r && r.some(c => String(c).trim() === '姓名') && r.some(c => String(c).trim() === '賽事'));
  if (hi < 0) throw new Error('找不到「賽事」「姓名」標題列');
  const H = rows[hi].map(c => String(c).trim());
  const col = name => H.indexOf(name);
  const C = { s: col('賽事'), y: col('年份'), d: col('組別'), e: col('項目'), r: col('名次'), u: col('學校'), t: col('隊名'), n: col('姓名') };
  const get = (row, k) => (C[k] >= 0 ? String(row[C[k]] ?? '').trim() : '');
  const out = [];
  for (const row of rows.slice(hi + 1)) {
    if (!row) continue;
    const ev = get(row, 's'), y = parseInt(get(row, 'y'), 10), r = parseInt(get(row, 'r'), 10);
    const names = get(row, 'n').split(/[、,，/／;；\s]+/).map(cleanName).filter(x => x && !/名單缺/.test(x));
    if (!ev || !names.length || !r) continue;
    const k = /預賽/.test(ev) ? '分區預賽' : /全大運/.test(ev) ? '全大運' : '盃賽';
    const m = ev.match(/^(.+?)(第.+屆)$/);
    const label = m ? m[2] + m[1] : /屆/.test(ev) ? ev : `${Number.isNaN(y) ? '' : y}${ev}`;
    out.push({ y: Number.isNaN(y) ? 0 : y, k, s: label, d: get(row, 'd').replace(/組$/, ''), e: get(row, 'e'), r,
      u: normSchool(get(row, 'u')), t: get(row, 't'), n: names });
  }
  return out;
}

/** 資料涵蓋範圍，依資料自動產生：[{ k, items: ['112全大運', ...] }] */
export function coverage() {
  const m = new Map();
  for (const r of DATA) {
    if (!m.has(r.k)) m.set(r.k, new Map());
    m.get(r.k).set(r.s, r.y);
  }
  return [...m.entries()].sort((a, b) => (KORD[a[0]] ?? 3) - (KORD[b[0]] ?? 3))
    .map(([k, items]) => ({ k, items: [...items.entries()].sort((a, b) => a[1] - b[1]).map(x => x[0]) }));
}
export const playerCount = () => INDEX.size;

export const recLabel = r => `${r.s} ${r.d}${r.e} ${rankLabel(r.r)}`;
export const allPlayers = () => [...INDEX.values()];
export const isGeneral = r => r.d === '一般' || r.d === '大專';

/** 個人賽有名次的是「猛將」，只有團體賽名次的算「團體得名」 */
export function lookup(name) {
  const p = INDEX.get(cleanName(name));
  if (!p) return null;
  return { ...p, level: p.ind.length ? 2 : 1 };
}

/** 從一段文字（雙打「甲/乙」、團體隊員欄）找出資料庫裡的人 */
export function findNames(text) {
  const t = String(text ?? '');
  const tokens = t.split(/[^㐀-鿿豈-﫿]+/).map(cleanName).filter(Boolean);
  const found = new Set();
  for (const tok of tokens) {
    if (INDEX.has(tok)) { found.add(tok); continue; }
    if (tok.length > 4) for (const n of NAMES) if (n.length >= 3 && tok.includes(n)) found.add(n); // 名字連在一起沒分隔
  }
  return [...found].map(lookup);
}

/** 一個籤（個人、雙打、團隊）裡的猛將 */
export function entryStrong(entry, isTeam) {
  const list = isTeam ? findNames(entry.members) : findNames(entry.name);
  const a = list.filter(p => p.level === 2).length;
  const b = list.length - a;
  return { list, a, b, score: a * 10 + b };
}

/**
 * 團體賽抽完後的調整（不改變誰跟誰同組）：
 * 1. 組內最強的隊放最後一個位置（3 隊組第一輪輪空，4 隊組每輪都在後一場）
 * 2. 同樣隊數的組，越強的組越往後排，場次越晚
 * 第 2 步如果讓同校分開變差，就只在上下半區內各自排，再不行就不排。
 */
export function arrangeRR(entries, st, assign, scoreOf, check) {
  const byPos = new Map(entries.map(e => [assign[e.id], e]));
  const content = st.groups.map(g => Array.from({ length: g.size }, (_, i) => byPos.get(g.startPos + i)));
  const sc = e => (e ? scoreOf(e) : 0);
  const seeded = list => list.some(e => e && e.seed !== '' && e.seed != null);
  // 1. 組內：最強的放最後（同分不動）
  content.forEach(list => {
    if (seeded(list)) return;
    let best = list.length - 1;
    list.forEach((e, i) => { if (sc(e) > sc(list[best])) best = i; });
    if (best !== list.length - 1) [list[best], list[list.length - 1]] = [list[list.length - 1], list[best]];
  });
  const toAssign = c => {
    const out = { ...assign };
    st.groups.forEach((g, gi) => c[gi].forEach((e, i) => { if (e) out[e.id] = g.startPos + i; }));
    return out;
  };
  const inner = toAssign(content);
  const gScore = list => {
    const s = list.map(sc).sort((x, y) => y - x);
    return s[0] * 1000 + s.reduce((x, y) => x + y, 0);
  };
  function reorder(idxSets) {
    const c = content.slice();
    for (const idx of idxSets) {
      for (const size of new Set(idx.map(i => st.groups[i].size))) {
        const slots = idx.filter(i => st.groups[i].size === size && !seeded(content[i]));
        const sorted = slots.map(i => content[i]).sort((x, y) => gScore(x) - gScore(y)); // 穩定排序，同分保持原順序
        slots.forEach((i, k) => { c[i] = sorted[k]; });
      }
    }
    return toAssign(c);
  }
  const base = check(inner).warnings.length;
  const all = reorder([st.groups.map((_, i) => i)]);
  if (check(all).warnings.length <= base) return all;
  const halves = st.root.kind === 'split'
    ? st.root.children.map(h => { const s = []; (function f(n) { if (n.kind === 'group') s.push(n.index); else n.children.forEach(f); })(h); return s; })
    : [st.groups.map((_, i) => i)];
  const half = reorder(halves);
  if (check(half).warnings.length <= base) return half;
  return inner;
}
