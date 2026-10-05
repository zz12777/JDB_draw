// 解析上傳的最終籤表 Excel（本系統輸出或第十屆格式），取得籤位與結構
import { EVENT_TYPE } from './parse.js';
import { buildKO, buildRR, splitSizes, defaultSections, isPow2 } from './bracket.js';
import { cnToNum, toCn } from './util.js';

const str = v => (v === null || v === undefined ? '' : String(v).trim());
const intOf = v => {
  const n = typeof v === 'number' ? v : (/^\d+$/.test(str(v)) ? Number(str(v)) : NaN);
  return Number.isInteger(n) && n > 0 ? n : null;
};

/**
 * sheets: [{name, rows}]，回傳 { st, byPos: Map(籤號 -> {school, name}), info, warnings }
 */
export function parseFinalBracket(sheets, event) {
  return EVENT_TYPE[event] === 'team' ? parseTeam(sheets) : parseKO(sheets, event);
}

function parseKO(sheets, event) {
  const warnings = [];
  const use = sheets.filter(s => !/決賽|結果|BACKUP|backup|名單|順序/.test(s.name));
  const sizes = [];
  const byPos = new Map();
  for (const sh of use) {
    let count = 0;
    sh.rows.forEach(row => {
      if (!row) return;
      const pos = intOf(row[2]);
      if (!pos) return;
      // 籤號欄：同列沒有其他數字（排除場次欄），且學校或姓名有字，或是空白籤表
      byPos.set(pos, { school: str(row[0]), name: str(row[1]) });
      count++;
    });
    if (count) sizes.push(count);
  }
  const N = byPos.size;
  if (!N) throw new Error('找不到籤號（C 欄應為 1、2、3…）');
  for (let p = 1; p <= N; p++) if (!byPos.has(p)) throw new Error(`籤號 ${p} 找不到，請確認籤表`);
  let secSizes = sizes;
  if (sizes.length === 1 && N > 32) {
    secSizes = splitSizes(N, defaultSections(N));
    warnings.push(`只有一個分頁但有 ${N} 籤，依預設切成 ${secSizes.join('/')}`);
  }
  if (!isPow2(secSizes.length)) throw new Error(`分區分頁數為 ${secSizes.length}，必須是 1、2、4、8`);
  const st = buildKO(secSizes);
  const empty = [...byPos.values()].filter(x => !x.name).length;
  if (empty) warnings.push(`有 ${empty} 個籤位沒有名字`);
  // 從籤表上的線與場次位置還原實際對戰（人工調整過的籤表也能正確對應）
  let matches = null;
  try {
    matches = readMatches(sheets.filter(s => !/結果|BACKUP|backup|名單|順序/.test(s.name)));
    if (matches.length !== N - 1) {
      warnings.push(`從籤表讀到 ${matches.length} 場，預期 ${N - 1} 場，改用標準籤表結構`);
      matches = null;
    }
  } catch (e) {
    warnings.push('無法從籤表讀出對戰關係，改用標準籤表結構');
    matches = null;
  }
  return { st, byPos, matches, info: `${N} 籤（${secSizes.join(' / ')}）`, warnings };
}

function parseTeam(sheets) {
  const warnings = [];
  const groups = [];
  for (const sh of sheets.filter(s => !/決賽|結果/.test(s.name))) {
    const rows = sh.rows;
    for (let r = 0; r < rows.length; r++) {
      const row = rows[r];
      if (!row) continue;
      const m = str(row[0]).match(/^([A-Za-z])\s*(組|區)$/);
      if (!m) continue;
      const names = [];
      for (let k = r + 2; k < rows.length; k++) {
        const x = rows[k];
        if (!x || intOf(x[0]) !== names.length + 1) break;
        names.push(str(x[1]));
      }
      if (names.length) groups.push({ letter: m[1].toUpperCase(), names });
    }
    if (groups.length) break;
  }
  if (!groups.length) throw new Error('找不到分組表（A 欄應有「A組」或「A區」）');
  const st = buildRR(groups.map(g => g.names.length));
  const byPos = new Map();
  st.groups.forEach((g, i) => groups[i].names.forEach((n, j) => byPos.set(g.startPos + j, { school: '', name: n })));
  const empty = [...byPos.values()].filter(x => !x.name).length;
  if (empty) warnings.push(`有 ${empty} 個位置沒有隊名`);
  return { st, byPos, info: `${groups.length} 組，${byPos.size} 隊`, warnings };
}

/**
 * 依籤表版面還原每場對戰：每個工作表中，C 欄數字是籤位、「X勝」是前一場勝方，
 * 中文場次所在的欄由左到右處理，把上方與下方最近的節點配成一場。
 * 回傳 [{num, label, a, b}]，a/b 為 {pos} 或 {ref: 場次國字}
 */
export function readMatches(sheets) {
  const all = [];
  for (const sh of sheets) {
    const nodes = []; // {row, side}
    const labels = [];
    sh.rows.forEach((row, r) => {
      if (!row) return;
      const pos = intOf(row[2]);
      if (pos) nodes.push({ row: r, side: { pos } });
      row.forEach((v, c) => {
        if (pos && c <= 2) return;
        const t = str(v);
        if (!t) return;
        const win = t.match(/^(.+?)勝$/);
        if (win && cnToNum(win[1]) && c <= 4) { nodes.push({ row: r, side: { ref: win[1] } }); return; }
        if (c >= 3 && cnToNum(t)) labels.push({ row: r, col: c, label: t });
      });
    });
    labels.sort((a, b) => a.col - b.col || a.row - b.row);
    const active = nodes.sort((a, b) => a.row - b.row);
    for (const lb of labels) {
      let ai = -1;
      for (let i = 0; i < active.length; i++) if (active[i].row <= lb.row) ai = i;
      const bi = active.findIndex(x => x.row > lb.row);
      if (ai < 0 || bi < 0) continue;
      const a = active[ai], b = active[bi];
      all.push({ num: cnToNum(lb.label), label: lb.label, a: a.side, b: b.side });
      active.splice(bi, 1);
      active.splice(ai, 1, { row: (a.row + b.row) / 2, side: { ref: lb.label } });
    }
  }
  all.sort((x, y) => x.num - y.num);
  void toCn;
  return all;
}
