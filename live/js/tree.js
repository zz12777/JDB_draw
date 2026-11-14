// 單淘汰樹狀圖（SVG）：籤位在左，往右晉級；獲勝的一方以粗線標示
import { sideText } from './model.js';
import { esc } from './ui.js';

const RH = 30, COL = 92;

/** matches：同一張單淘汰表的所有場次（derive 的結果）；回傳 { svg, width, height } */
export function bracketSvg(matches, team, opt = {}) {
  if (!matches.length) return { svg: '', width: 0, height: 0 };
  const byNum = new Map(matches.map(m => [m.num, m]));
  const refd = new Set(matches.flatMap(m => m.src.filter(s => s.ref != null).map(s => s.ref)));
  const root = matches.find(m => !refd.has(m.num));
  // opt.pos：隊名前加籤號（團體決賽）
  const leafText = s => { const t = sideText(s, team) || ''; return opt.pos && s.name && s.pos != null ? `${s.pos}　${t}` : t; };
  const maxLen = Math.max(4, ...matches.flatMap(m => [m.A, m.B].filter((_, i) => m.src[i].pos != null).map(s => leafText(s).length)));
  const NAME = Math.min(300, maxLen * 14 + 16);
  const X = m => NAME + (m.roundIdx + 1) * COL;
  let row = 0;
  const leaves = [], pos = new Map();
  (function lay(m) {
    const kids = m.src.map((s, i) => {
      if (s.pos != null) { const y = row++ * RH + RH / 2 + 4; leaves.push({ y, side: i ? m.B : m.A }); return { x: NAME, y }; }
      const c = byNum.get(s.ref); lay(c); return { x: X(c), y: pos.get(c.num).y };
    });
    pos.set(m.num, { y: (kids[0].y + kids[1].y) / 2, kids });
  })(root);
  const out = [], thick = [];
  matches.forEach(m => {
    const p = pos.get(m.num), x = X(m);
    const show = m.status !== 'wait' && m.status !== 'ready';
    p.kids.forEach((k, i) => {
      const d = `M${k.x} ${k.y}H${x}V${p.y}`;
      const win = m.winner === (i ? 'b' : 'a');
      (win ? thick : out).push(`<path d="${d}" class="${win ? 'w' : 'l'}"/>`);
      if (show) out.push(`<text x="${x - 8}" y="${k.y - 5}" class="sc ${win ? 'b' : ''}" text-anchor="end">${m.score[i]}</text>`);
    });
    out.push(`<text x="${x + 5}" y="${p.y - 5}" class="no ${m.status === 'playing' ? 'live' : ''}">${esc(m.no)}</text>`);
    if (m.status === 'playing' && m.tables.length) out.push(`<text x="${x + 5}" y="${p.y + 13}" class="tb">第 ${m.tables.join('、')} 桌</text>`);
  });
  const rp = pos.get(root.num), rx = X(root);
  const champ = root.winner ? sideText(root.winner === 'a' ? root.A : root.B, team) : '';
  (root.winner ? thick : out).push(`<path d="M${rx} ${rp.y}H${rx + COL}" class="${root.winner ? 'w' : 'l'}"/>`);
  if (champ) out.push(`<text x="${rx + COL + 8}" y="${rp.y + 5}" class="nm b">${esc(champ)}</text>`);
  leaves.forEach(l => out.push(`<text x="${NAME - 8}" y="${l.y + 5}" class="nm ${l.side.name ? '' : 'mu'}" text-anchor="end">${esc(leafText(l.side))}</text>`));
  const width = rx + COL + (champ ? champ.length * 15 + 20 : 20), height = row * RH + 12;
  return { width, height, svg: `<svg class="tree" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">${out.join('')}${thick.join('')}</svg>` };
}
