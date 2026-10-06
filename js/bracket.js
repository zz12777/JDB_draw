// 籤表結構：個人賽單淘汰（分區 + X 單敗）與團體賽分組循環
import { toCn, LETTERS } from './util.js';

/**
 * X 單敗的資格賽位置（來自「(個賽)4-32單敗_直式A4交大盃專用.xlsm」）。
 * base：基底格數；pairs：哪幾格是一場資格賽（兩人），其餘格子一人。
 * 21、23 單敗範本本身少一個籤位，依前後規律補正。
 */
const PAIRS = {
  2: [], 3: [2],
  4: [], 5: [2], 6: [2, 3], 7: [1, 2, 3], 8: [1, 2, 3, 4],
  9: [3], 10: [3, 6], 11: [2, 3, 6], 12: [2, 3, 6, 7], 13: [2, 3, 4, 6, 7],
  14: [2, 3, 4, 5, 6, 7], 15: [1, 2, 3, 4, 5, 6, 7], 16: [1, 2, 3, 4, 5, 6, 7, 8],
  17: [6], 18: [6, 14], 19: [3, 6, 14], 20: [3, 6, 11, 14], 21: [3, 6, 7, 11, 14],
  22: [3, 6, 7, 11, 14, 15], 23: [2, 3, 6, 7, 11, 14, 15], 24: [2, 3, 6, 7, 10, 11, 14, 15],
  25: [2, 3, 5, 6, 7, 10, 11, 14, 15], 26: [2, 3, 5, 6, 7, 10, 11, 13, 14, 15],
  27: [2, 3, 4, 5, 6, 7, 10, 11, 13, 14, 15], 28: [2, 3, 4, 5, 6, 7, 10, 11, 12, 13, 14, 15],
  29: [2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13, 14, 15], 30: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
  31: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
  32: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16],
};

export const MIN_SECTION = 2;
export const MAX_SECTION = 32;

function baseOf(x) {
  if (x <= 3) return 2;
  if (x <= 8) return 4;
  if (x <= 16) return 8;
  return 16;
}

const leaf = pos => ({ kind: 'leaf', pos, children: [] });
const match = (a, b) => ({ kind: 'match', children: [a, b] });

function combine(nodes) {
  while (nodes.length > 1) {
    const next = [];
    for (let i = 0; i < nodes.length; i += 2) next.push(match(nodes[i], nodes[i + 1]));
    nodes = next;
  }
  return nodes[0];
}

/** 一個 X 單敗分區的樹，籤號從 startPos 開始 */
export function sectionTree(x, startPos = 1) {
  if (!PAIRS[x]) throw new Error(`不支援 ${x} 單敗（範圍 ${MIN_SECTION} 到 ${MAX_SECTION}）`);
  const base = baseOf(x);
  const pairs = new Set(PAIRS[x]);
  let pos = startPos;
  const slots = [];
  for (let s = 1; s <= base; s++) {
    if (pairs.has(s)) { slots.push(match(leaf(pos), leaf(pos + 1))); pos += 2; }
    else { slots.push(leaf(pos)); pos += 1; }
  }
  const root = combine(slots.slice());
  if (pos - startPos !== x) throw new Error(`${x} 單敗結構錯誤`);
  root.slots = slots;
  root.hasPairs = pairs.size > 0;
  return root;
}

export function isPow2(n) { return n >= 1 && (n & (n - 1)) === 0; }

/** 預設分區數：每區越大越好（最多 32 人），所以取能讓每區不超過 32 人的最少分區數（1、2、4、8） */
export function defaultSections(n) {
  let k = 1;
  while (Math.ceil(n / k) > MAX_SECTION) k *= 2;
  return k;
}

/** 平均分配各區人數，人多的分區放前面 */
export function splitSizes(n, k) {
  const base = Math.floor(n / k), extra = n % k;
  return Array.from({ length: k }, (_, i) => base + (i < extra ? 1 : 0));
}

function annotate(root) {
  const leaves = [], matches = [];
  (function walk(node, depth) {
    node.depth = depth;
    if (node.kind === 'leaf') { node.cap = 1; leaves.push(node); return; }
    node.children.forEach(c => walk(c, depth + 1));
    node.cap = node.children.reduce((s, c) => s + c.cap, 0);
    if (node.kind === 'match') matches.push(node);
  })(root, 0);
  return { leaves, matches };
}

function roundLabel(depth, count) {
  if (depth === 0) return '決賽';
  if (depth === 1) return '四強';
  if (depth === 2 && count === 4) return '八強';
  const full = 2 ** depth;
  if (count < full) return '資格賽';
  return `${full * 2}強`;
}

/**
 * 個人賽完整結構。
 * sizes：各分區人數，分區數須為 1、2、4、8。
 */
export function buildKO(sizes) {
  const k = sizes.length;
  if (!isPow2(k) || k > 8) throw new Error('分區數必須是 1、2、4、8');
  const sections = [];
  let pos = 1;
  sizes.forEach((x, i) => {
    const root = sectionTree(x, pos);
    sections.push({ index: i, letter: k > 1 ? LETTERS[i] : '', size: x, startPos: pos, root, slots: root.slots, hasPairs: root.hasPairs });
    pos += x;
  });
  const root = combine(sections.map(s => s.root));
  const { leaves, matches } = annotate(root);
  sections.forEach(s => { s.depth = s.root.depth; });

  // 場次編號：最深的一輪先編，同一輪由上往下（跨分區連續）
  const order = new Map();
  let seq = 0;
  (function dfs(n) { order.set(n, seq++); n.children.forEach(dfs); })(root);
  const sorted = matches.slice().sort((a, b) => (b.depth - a.depth) || (order.get(a) - order.get(b)));
  sorted.forEach((m, i) => { m.num = i + 1; m.label = toCn(i + 1); });

  // 每場屬於哪個分區（決賽區為 -1）
  const secOf = new Map();
  sections.forEach(s => (function mark(n) { secOf.set(n, s.index); n.children.forEach(mark); })(s.root));
  matches.forEach(m => { m.section = secOf.has(m) ? secOf.get(m) : -1; });

  const byDepth = new Map();
  sorted.forEach(m => {
    if (!byDepth.has(m.depth)) byDepth.set(m.depth, []);
    byDepth.get(m.depth).push(m);
  });
  const rounds = [...byDepth.entries()].sort((a, b) => b[0] - a[0]).map(([depth, ms]) => ({
    depth, count: ms.length, label: roundLabel(depth, ms.length),
    from: ms[0].num, to: ms[ms.length - 1].num,
  }));

  sections.forEach(s => {
    const ms = matches.filter(m => m.section === s.index);
    s.prelims = ms.filter(m => m.children.every(c => c.kind === 'leaf') &&
      roundLabel(m.depth, byDepth.get(m.depth).length) === '資格賽').length;
    s.matchCount = ms.length;
  });

  return { kind: 'ko', root, leaves, matches: sorted, sections, rounds, positions: pos - 1 };
}

// ---------------- 團體賽分組循環 ----------------

/** 每輪的對戰（組內編號），依第十屆籤表 */
const RR = {
  2: [[[1, 2]]],
  3: [[[1, 2]], [[1, 3]], [[2, 3]]],
  4: [[[1, 3], [2, 4]], [[2, 3], [1, 4]], [[1, 2], [3, 4]]],
  5: [[[2, 5], [3, 4]], [[1, 5], [2, 3]], [[1, 4], [3, 5]], [[1, 3], [2, 4]], [[1, 2], [4, 5]]],
  6: [[[1, 6], [2, 5], [3, 4]], [[1, 5], [4, 6], [2, 3]], [[1, 4], [3, 5], [2, 6]],
      [[1, 3], [2, 4], [5, 6]], [[1, 2], [3, 6], [4, 5]]],
};

/** 預設組數 */
export function defaultGroupCount(n, size) {
  if (n <= 0) return 0;
  if (size === 3) return Math.max(1, Math.floor(n / 3));
  return Math.ceil(n / size);
}

/** 各組隊數：平均分，多出來的放最後幾組 */
export function groupSizes(n, g) {
  const base = Math.floor(n / g), extra = n % g;
  return Array.from({ length: g }, (_, i) => base + (i >= g - extra ? 1 : 0));
}

export function buildRR(sizes) {
  if (sizes.some(s => !RR[s])) throw new Error('每組隊數必須在 2 到 6 之間');
  let pos = 1;
  const groups = sizes.map((size, i) => {
    const children = Array.from({ length: size }, (_, j) => leaf(pos + j));
    const g = { kind: 'group', index: i, letter: LETTERS[i] || `G${i + 1}`, size, startPos: pos, children, matches: [] };
    pos += size;
    return g;
  });
  // 場次編號：一輪一輪，每輪 A 組到最後一組
  const maxRounds = Math.max(...sizes.map(s => RR[s].length));
  let num = 0;
  const rounds = [];
  for (let r = 0; r < maxRounds; r++) {
    const from = num + 1;
    groups.forEach(g => {
      (RR[g.size][r] || []).forEach(([a, b]) => {
        num++;
        g.matches.push({ a, b, num, label: toCn(num), round: r + 1 });
      });
    });
    rounds.push({ label: `第${r + 1}輪`, from, to: num, count: num - from + 1 });
  }
  // 抽籤用的樹：組與組之間二分（上下半區）
  function split(list) {
    if (list.length === 1) return list[0];
    const half = Math.ceil(list.length / 2);
    return { kind: 'split', children: [split(list.slice(0, half)), split(list.slice(half))] };
  }
  const root = split(groups);
  const { leaves } = annotate(root);
  return { kind: 'rr', root, leaves, groups, rounds, positions: pos - 1, matchCount: num };
}

/** 依項目設定建立結構 */
export function buildStructure(plan) {
  return plan.kind === 'ko' ? buildKO(plan.sizes) : buildRR(plan.sizes);
}
