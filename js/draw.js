// 抽籤：同校分開
import { makeRng, shuffle } from './util.js';

const hasSeed = e => e.seed !== null && e.seed !== undefined && e.seed !== '';

function lessKey(a, b) {
  for (let i = 0; i < a.length; i++) {
    if (a[i] < b[i]) return true;
    if (a[i] > b[i]) return false;
  }
  return false;
}

/**
 * 沿著籤表樹一路往下平均分配，讓同校越晚相遇越好。
 * entries: [{id, school, seed}]，seed 為固定籤號或空白
 * structure: buildKO / buildRR 的結果
 * 回傳 { id: 籤號 }
 */
export function runDraw(entries, structure, seed) {
  const rng = makeRng(seed);
  const N = structure.positions;
  if (entries.length !== N) throw new Error(`名單 ${entries.length} 筆與籤表 ${N} 籤不符`);

  const posLeaf = new Map(structure.leaves.map(l => [l.pos, l]));
  const parent = new Map();
  (function walk(n) { n.children.forEach(c => { parent.set(c, n); walk(c); }); })(structure.root);

  const free = new Map();
  (function init(n) {
    const f = n.kind === 'leaf' ? 1 : n.children.reduce((s, c) => s + init(c), 0);
    free.set(n, f);
    return f;
  })(structure.root);

  const counts = new Map(); // node -> Map(school -> n)
  const sc = (node, school) => counts.get(node)?.get(school) || 0;
  const taken = new Set();
  const assign = {};

  function occupy(leafNode, school) {
    taken.add(leafNode.pos);
    for (let n = leafNode; n; n = parent.get(n)) {
      free.set(n, free.get(n) - 1);
      if (!counts.has(n)) counts.set(n, new Map());
      const m = counts.get(n);
      m.set(school, (m.get(school) || 0) + 1);
    }
  }

  // 1. 種子固定
  for (const e of entries.filter(hasSeed)) {
    const p = Number(e.seed);
    const lf = posLeaf.get(p);
    if (!lf) throw new Error(`「${e.name}」的種子籤號 ${e.seed} 不在 1 到 ${N} 之間`);
    if (taken.has(p)) throw new Error(`種子籤號 ${p} 重複`);
    occupy(lf, e.school);
    assign[e.id] = p;
  }

  // 2. 學校依總人數由多到少，同人數隨機
  const groups = new Map();
  const totals = new Map();
  for (const e of entries) {
    totals.set(e.school, (totals.get(e.school) || 0) + 1);
    if (hasSeed(e)) continue;
    if (!groups.has(e.school)) groups.set(e.school, []);
    groups.get(e.school).push(e);
  }
  const schools = shuffle([...groups.keys()], rng).sort((a, b) => totals.get(b) - totals.get(a));

  for (const school of schools) {
    const list = shuffle(groups.get(school), rng);
    const leaves = [];
    distribute(structure.root, list.length, school, leaves);
    shuffle(leaves, rng).forEach((lf, i) => { assign[list[i].id] = lf.pos; });
  }

  function distribute(node, n, school, out) {
    if (n === 0) return;
    if (node.kind === 'leaf') { occupy(node, school); out.push(node); return; }
    const kids = node.children;
    const got = kids.map(() => 0);
    for (let i = 0; i < n; i++) {
      let best = -1, bestKey = null;
      kids.forEach((c, j) => {
        const f = free.get(c) - got[j];
        if (f <= 0) return;
        // 同校越少越好；一樣時空位比例高的優先；再一樣隨機
        const key = [sc(c, school) + got[j], -f / c.cap, rng()];
        if (best < 0 || lessKey(key, bestKey)) { best = j; bestKey = key; }
      });
      if (best < 0) throw new Error('空位不足');
      got[best]++;
    }
    kids.forEach((c, j) => distribute(c, got[j], school, out));
  }

  return assign;
}

/**
 * 抽完的檢查。
 * 回傳 { errors: [], warnings: [] }，每則為字串。
 */
export function checkDraw(entries, structure, assign) {
  const errors = [], warnings = [];
  const N = structure.positions;
  const posTo = new Map();
  for (const e of entries) {
    const p = assign[e.id];
    if (!p) { errors.push(`${e.school} ${e.name} 沒有籤號`); continue; }
    if (p < 1 || p > N) errors.push(`${e.school} ${e.name} 籤號 ${p} 超出範圍`);
    if (posTo.has(p)) errors.push(`籤號 ${p} 重複：${posTo.get(p).name}、${e.name}`);
    posTo.set(p, e);
  }
  if (errors.length) return { errors, warnings };

  const totals = new Map();
  entries.forEach(e => totals.set(e.school, (totals.get(e.school) || 0) + 1));

  // 每個節點下各校人數
  const counts = new Map();
  (function walk(n) {
    const m = new Map();
    if (n.kind === 'leaf') {
      const e = posTo.get(n.pos);
      if (e) m.set(e.school, 1);
    } else {
      n.children.forEach(c => {
        walk(c);
        counts.get(c).forEach((v, k) => m.set(k, (m.get(k) || 0) + v));
      });
    }
    counts.set(n, m);
  })(structure.root);

  // 理論上限：從根往下，每層把上限平均分給子節點
  const limitOf = new Map();
  const over = [];
  (function walk(n, share) {
    // share: Map(school -> 這個節點最多可容許的人數)
    if (n.kind === 'leaf') return;
    const kids = n.children;
    kids.forEach(c => {
      const cs = new Map();
      share.forEach((v, school) => {
        const lim = Math.min(Math.ceil(v / kids.length), c.cap);
        cs.set(school, lim);
        const have = counts.get(c).get(school) || 0;
        if (have > lim && c.kind !== 'leaf') over.push({ node: c, school, have, lim });
      });
      walk(c, cs);
    });
  })(structure.root, totals);

  const label = node => nodeLabel(structure, node);
  for (const o of over) {
    warnings.push(`${o.school}：${label(o.node)}有 ${o.have} 個，理想最多 ${o.lim} 個`);
  }

  // 第一場就同校
  if (structure.kind === 'ko') {
    structure.matches.forEach(m => {
      if (m.children.every(c => c.kind === 'leaf')) {
        const [a, b] = m.children.map(c => posTo.get(c.pos));
        if (a.school === b.school) warnings.push(`第 ${m.label} 場同校對戰：${a.school} ${a.name} 對 ${b.name}`);
      }
    });
  }

  // 人數比籤區多，無法完全分開
  const units = structure.kind === 'ko' ? structure.matches.filter(m => m.children.every(c => c.kind === 'leaf')).length
    : structure.groups.length;
  totals.forEach((t, school) => {
    if (structure.kind === 'rr' && t > structure.groups.length) {
      warnings.push(`${school} 有 ${t} 隊，比區數 ${structure.groups.length} 多，一定有同區`);
    }
  });
  void units;
  return { errors, warnings };
}

function nodeLabel(structure, node) {
  if (structure.kind === 'rr') {
    if (node.kind === 'group') return `${node.letter} 區`;
    const gs = [];
    (function f(n) { if (n.kind === 'group') gs.push(n.letter); else n.children.forEach(f); })(node);
    return `${gs[0]} 到 ${gs[gs.length - 1]} 區`;
  }
  const ps = [];
  (function f(n) { if (n.kind === 'leaf') ps.push(n.pos); else n.children.forEach(f); })(node);
  return `籤號 ${Math.min(...ps)} 到 ${Math.max(...ps)} `;
}

/** 對調兩個籤位 */
export function swapPositions(assign, p1, p2) {
  const out = { ...assign };
  for (const id in out) {
    if (out[id] === p1) out[id] = p2;
    else if (out[id] === p2) out[id] = p1;
  }
  return out;
}
