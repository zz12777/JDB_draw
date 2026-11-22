// 比賽當日系統：資料結構與規則（不碰畫面，可單獨測試）
import { buildKO, buildRR, championSlots } from '../../js/bracket.js';
import { toCn } from '../../js/util.js';

export const EVENT_ORDER = ['男團', '女團', '社團', '男單', '女單', '男雙', '女雙'];
export const EVENT_FULL = {
  男團: '男子團體組', 女團: '女子團體組', 社團: '社會團體組',
  男單: '男子單打', 女單: '女子單打', 男雙: '男子雙打', 女雙: '女子雙打',
};
export const isTeam = ev => /團$/.test(ev);
/** 團體賽五點：單、單、雙、單、單 */
export const POINTS = [{ dbl: false }, { dbl: false }, { dbl: true }, { dbl: false }, { dbl: false }];

export function emptyState() {
  return { v: 1, title: '交大盃', edition: '第十三屆', tables: 24, events: [], m: {}, notice: '',
    annTitle: '第十三屆TIBHAR交大盃成績公告', dates: ['2026-12-05', '2026-12-06'], podium: {} };
}

/** 成績公告的項目順序與名稱 */
export const ANN_ORDER = ['男單', '女單', '男雙', '女雙', '男團', '女團', '社團'];
export const ANN_NAME = {
  男單: '大專男子組個人單打', 女單: '大專女子組個人單打', 男雙: '大專男子組個人雙打', 女雙: '大專女子組個人雙打',
  男團: '大專男子團體組', 女團: '大專女子團體組', 社團: '社會團體組',
};
/** 第幾天的日期：12/5（六）；沒有設定就用時間表上的寫法 */
export function dayLabel(state, d, fallback = '') {
  const v = (state.dates || [])[d - 1];
  const t = v ? new Date(`${v}T00:00:00`) : null;
  if (!t || Number.isNaN(t.getTime())) return fallback;
  return `${t.getMonth() + 1}/${t.getDate()}（${'日一二三四五六'[t.getDay()]}）`;
}

// ---------------- 數字讀法 ----------------
const D = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
/** 廣播用的讀法：26 讀「二十六」，101 讀「一百零一」（籤表上的場次編號另有寫法，見 toCn） */
export function cnSpoken(n) {
  n = Math.trunc(n);
  if (n < 10) return D[n];
  if (n < 20) return '十' + (n % 10 ? D[n % 10] : '');
  if (n < 100) return D[Math.floor(n / 10)] + '十' + (n % 10 ? D[n % 10] : '');
  const h = Math.floor(n / 100), r = n % 100;
  if (!r) return D[h] + '百';
  if (r < 10) return D[h] + '百零' + D[r];
  return D[h] + '百' + D[Math.floor(r / 10)] + '十' + (r % 10 ? D[r % 10] : '');
}

// ---------------- 比分規則 ----------------
/** 一局是否成立：11 分制，領先 2 分；回傳 'a' | 'b' | null（未完成或不合規則） */
export function gameWinner(g) {
  if (!g || g[0] === '' || g[1] === '' || g[0] == null || g[1] == null) return null;
  const a = Number(g[0]), b = Number(g[1]);
  if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0) return null;
  const hi = Math.max(a, b), lo = Math.min(a, b);
  if (hi < 11 || hi - lo < 2) return null;
  if (hi > 11 && hi - lo !== 2) return null;
  return a > b ? 'a' : 'b';
}
/** 一局比分填了但不合規則 */
export function gameInvalid(g) {
  if (!g) return false;
  const filled = g[0] !== '' && g[0] != null && g[1] !== '' && g[1] != null;
  return filled && !gameWinner(g);
}
/** 五戰三勝：回傳 { a, b, winner } */
export function gamesResult(games, wo) {
  if (wo) return { a: wo === 'a' ? 3 : 0, b: wo === 'b' ? 3 : 0, winner: wo, wo: true };
  let a = 0, b = 0;
  (games || []).forEach(g => { const w = gameWinner(g); if (w === 'a') a++; else if (w === 'b') b++; });
  return { a, b, winner: a >= 3 ? 'a' : b >= 3 ? 'b' : null };
}
/**
 * 團體賽：先取得三點者獲勝。
 * 預賽若拆桌先打了後面的點，前三點仍須全部打完才算完賽；決賽取得三點即完賽。
 */
export function teamResult(rec, stage) {
  if (rec && rec.wo) return { a: rec.wo === 'a' ? 3 : 0, b: rec.wo === 'b' ? 3 : 0, winner: rec.wo, done: true, wo: true, pts: POINTS.map(() => ({ a: 0, b: 0, winner: null })) };
  const pts = POINTS.map((_, i) => gamesResult(rec && rec.pts && rec.pts[i] ? rec.pts[i].g : [], rec && rec.pts && rec.pts[i] ? rec.pts[i].wo : null));
  let a = 0, b = 0;
  pts.forEach(p => { if (p.winner === 'a') a++; else if (p.winner === 'b') b++; });
  const winner = a >= 3 ? 'a' : b >= 3 ? 'b' : null;
  const first3 = pts.slice(0, 3).every(p => p.winner);
  const done = !!winner && (stage !== 'P' || first3);
  return { a, b, winner, done, pts, needFirst3: !!winner && !done };
}

// ---------------- 結構 ----------------
const structCache = new Map();
function structOf(e) {
  const key = JSON.stringify([e.kind, e.kind === 'ko' ? e.sizes : e.groups.map(g => g.teams.length)]);
  if (!structCache.has(key)) {
    if (e.kind === 'ko') structCache.set(key, { st: buildKO(e.sizes) });
    else {
      const st = buildRR(e.groups.map(g => g.teams.length));
      const n = st.groups.length * 2;
      const ko = n >= 2 && n <= 64 ? buildKO([n]) : null;
      structCache.set(key, { st, ko, mark: ko ? championSlots(ko) : new Map() });
    }
  }
  return structCache.get(key);
}

function koMatches(ko, custom) {
  const roundOf = num => ko.rounds.find(r => num >= r.from && num <= r.to) || ko.rounds[0];
  const src = custom
    ? custom.map(m => ({ num: m.num, a: m.a, b: m.b }))
    : ko.matches.map(m => ({ num: m.num, a: side(m.children[0]), b: side(m.children[1]) }));
  function side(c) { return c.kind === 'leaf' ? { pos: c.pos } : { ref: c.num }; }
  return src.map(m => {
    const r = roundOf(m.num);
    const fix = s => (s.ref != null && typeof s.ref !== 'number' ? { ref: custom.find(x => x.label === s.ref).num } : s);
    return { num: m.num, a: fix(m.a), b: fix(m.b), round: r.label, roundIdx: ko.rounds.indexOf(r) };
  });
}

/**
 * 由狀態算出所有場次目前的樣子。
 * 回傳 { events: [{ name, type, rounds: [{ key, label, matches }], groups?, final? }], byId, tables }
 */
export function derive(state) {
  const byId = new Map();
  const events = [];
  for (const e of state.events) {
    const { st, ko, mark } = structOf(e);
    const team = isTeam(e.name);
    const out = { name: e.name, team, kind: e.kind, rounds: [], matches: [] };
    const add = (m) => {
      m.ev = e.name; m.team = team;
      m.no = m.stage === 'F' ? m.label : `(${m.label})`; // 顯示用場次：(一)、決(一)
      m.rec = state.m[m.id] || {};
      out.matches.push(m); byId.set(m.id, m);
    };
    if (e.kind === 'ko') {
      const res = new Map();
      const ms = koMatches(st, e.custom).sort((x, y) => x.num - y.num);
      const name = p => { const x = e.byPos[p]; return x ? { name: x.name, school: x.school, pos: p } : { name: '', school: '', pos: p }; };
      ms.forEach(m => add({ ...m, id: `${e.name}|K|${m.num}`, stage: 'K', label: toCn(m.num), src: [m.a, m.b] }));
      resolveKO(out.matches, name, res);
      st.rounds.forEach((r, i) => out.rounds.push({ key: 'K' + i, label: r.label, matches: out.matches.filter(m => m.roundIdx === i) }));
    } else {
      // 預賽
      out.groups = st.groups.map((g, gi) => ({ letter: g.letter, teams: e.groups[gi].teams.slice(), matches: [] }));
      st.groups.forEach((g, gi) => g.matches.forEach(x => {
        const teams = e.groups[gi].teams;
        const m = { id: `${e.name}|P|${x.num}`, stage: 'P', num: x.num, label: toCn(x.num), round: `預賽第${x.round}輪`, roundIdx: x.round - 1,
          group: g.letter, gi, ia: x.a - 1, ib: x.b - 1,
          A: { name: teams[x.a - 1] }, B: { name: teams[x.b - 1] } };
        add(m); out.groups[gi].matches.push(m);
      }));
      out.matches.sort((x, y) => x.num - y.num);
      out.matches.forEach(finish);
      // 前一輪是否打完
      out.matches.forEach(m => {
        const prev = t => out.groups[m.gi].matches.filter(x => x.roundIdx < m.roundIdx && (x.A.name === t || x.B.name === t)).every(x => x.confirmed);
        m.prevDone = { a: prev(m.A.name), b: prev(m.B.name) };
      });
      st.rounds.forEach((r, i) => out.rounds.push({ key: 'P' + i, label: `預賽第${i + 1}輪`, matches: out.matches.filter(m => m.stage === 'P' && m.roundIdx === i) }));
      // 各組名次
      out.groups.forEach(g => { g.table = standings(g); g.rank = (e.rank && e.rank[g.letter]) || {}; });
      // 決賽
      if (ko) {
        const fp = e.finalPos || {};
        const teamAt = new Map();
        out.groups.forEach(g => ['冠', '亞'].forEach(k => {
          const pos = fp[g.letter + k]; const t = g.rank[k === '冠' ? 'c' : 'r'];
          if (pos) teamAt.set(Number(pos), { name: t || '', seed: g.letter + k });
        }));
        const fm = koMatches(ko).sort((x, y) => x.num - y.num).map(m => ({ ...m, id: `${e.name}|F|${m.num}`, stage: 'F', label: `決(${toCn(m.num)})`, src: [m.a, m.b] }));
        const before = out.matches.length;
        fm.forEach(add);
        const finals = out.matches.slice(before);
        resolveKO(finals, p => { const x = teamAt.get(p); return { name: x ? x.name : '', pos: p, hint: `${mark.get(p) || ''} ${p}`, seed: x ? x.seed : '' }; }, new Map());
        ko.rounds.forEach((r, i) => out.rounds.push({ key: 'F' + i, label: `決賽 ${r.label}`, matches: finals.filter(m => m.roundIdx === i) }));
        out.final = { size: ko.positions, mark, teamAt, fp };
      }
    }
    events.push(out);
  }

  function resolveKO(list, nameOf, res) {
    const byNum = new Map(list.map(m => [m.num, m]));
    list.forEach(m => {
      const get = s => {
        if (s.pos != null) return { ...nameOf(s.pos), known: true };
        const p = byNum.get(s.ref);
        const w = p && p.confirmed && p.winner ? (p.winner === 'a' ? p.A : p.B) : null;
        return w ? { ...w, from: s.ref } : { name: '', pending: `${p ? p.label : ''}勝`, from: s.ref };
      };
      m.A = get(m.src[0]); m.B = get(m.src[1]);
      m.prevDone = { a: !!m.A.name, b: !!m.B.name };
      finish(m);
      res.set(m.num, m);
    });
  }

  function finish(m) {
    const rec = m.rec;
    const r = m.team ? teamResult(rec, m.stage) : gamesResult(rec.g, rec.wo);
    m.score = [r.a, r.b];
    m.result = r;
    const complete = m.team ? r.done : !!r.winner;
    m.winner = complete ? r.winner : null;
    m.confirmed = !!rec.confirmed && complete;
    m.known = !!(m.A && m.A.name) && !!(m.B && m.B.name);
    m.tables = rec.tables || [];
    m.lineupOk = { a: !!(rec.lineup && rec.lineup.a), b: !!(rec.lineup && rec.lineup.b) };
    const lineReady = !m.team || (m.lineupOk.a && m.lineupOk.b);
    m.status = m.confirmed ? 'done' : complete ? 'reported' : m.tables.length ? 'playing' : (m.known && lineReady) ? 'ready' : 'wait';
  }

  // 球桌使用情形
  const tables = new Map();
  // 已打完但大會尚未確認的場次仍留在桌上（裁判可修正），新派的場次會蓋過去
  [...byId.values()].filter(m => m.status === 'playing' || m.status === 'reported').sort((x, y) => (x.status === 'playing') - (y.status === 'playing')).forEach(m => {
    m.tables.forEach(t => {
      let point = null;
      let finished = false;
      if (m.team && m.rec.pts) m.rec.pts.forEach((p, i) => { if (p && Number(p.table) === Number(t)) { if (m.result.pts[i].winner) finished = true; else point = i; } });
      // 團體賽分多桌：這桌的點打完、還沒開下一點，大會可以把這桌派給其他場
      const idle = m.team && m.status === 'playing' && m.tables.length > 1 && point == null && finished;
      tables.set(Number(t), { m, point, idle });
    });
  });
  return { events: events.sort((x, y) => EVENT_ORDER.indexOf(x.name) - EVENT_ORDER.indexOf(y.name)), byId, tables };
}

/**
 * 某項目的冠亞季季（依大會確認過的決賽結果）。尚未產生的名次為 null。
 * e：derive 算出的項目
 */
export function podium(e) {
  const list = e.team ? e.matches.filter(m => m.stage === 'F') : e.matches;
  if (!list.length) return null;
  const refd = new Set(list.flatMap(m => m.src.filter(s => s.ref != null).map(s => s.ref)));
  const root = list.find(m => !refd.has(m.num));
  if (!root) return null;
  const pick = (m, win) => (m && m.confirmed && m.winner ? ((m.winner === 'a') === win ? m.A : m.B) : null);
  const semis = root.src.filter(s => s.ref != null).map(s => list.find(m => m.num === s.ref));
  return { c: pick(root, true), r: pick(root, false), s: [pick(semis[0], false), pick(semis[1], false)] };
}

// ---------------- 分組循環名次（互咬） ----------------
// 1. 勝場數多者在前
// 2. 勝場數相同：只算這幾隊彼此之間的比賽，依序比 點數勝率（勝點／敗點）、局數勝率、分數勝率
//    某一項分出高低後，仍然相同的幾隊重新從頭比（只看他們彼此之間）
// 3. 只剩兩隊相同：看兩隊之間的勝負
// 4. 全部相同：由裁判長抽籤
// 棄權：整場棄權算 3:0、每點 3:0、每局 11:0；單點棄權算該點 3:0、每局 11:0
function matchStats(m) {
  if (m.result && m.result.wo) {
    const aw = m.winner === 'a';
    return { p: aw ? [3, 0] : [0, 3], g: aw ? [9, 0] : [0, 9], s: aw ? [99, 0] : [0, 99] };
  }
  const st = { p: [m.score[0], m.score[1]], g: [0, 0], s: [0, 0] };
  ((m.result && m.result.pts) || []).forEach((p, i) => {
    if (p.wo) { const k = p.winner === 'a' ? 0 : 1; st.g[k] += 3; st.s[k] += 33; return; }
    st.g[0] += p.a; st.g[1] += p.b;
    const raw = ((m.rec && m.rec.pts) || [])[i] || {};
    (raw.g || []).forEach(x => { if (gameWinner(x)) { st.s[0] += Number(x[0]) || 0; st.s[1] += Number(x[1]) || 0; } });
  });
  return st;
}
const gcd = (a, b) => (b ? gcd(b, a % b) : a);
const ratioKey = (w, l) => (l === 0 ? (w === 0 ? '0' : '∞') : `${w / gcd(w, l)}/${l / gcd(w, l)}`);
const ratioVal = (w, l) => (l === 0 ? (w === 0 ? 0 : Infinity) : w / l);
const CRIT = [['p', '點數'], ['g', '局數'], ['s', '分數']];
function breakTie(teams, matches, why) {
  if (teams.length === 1) return [{ team: teams[0], why }];
  const among = matches.filter(m => teams.includes(m.A.name) && teams.includes(m.B.name));
  if (teams.length === 2) {
    const m = among[0];
    if (m && m.winner) {
      const w = m.winner === 'a' ? m.A.name : m.B.name, l = teams.find(t => t !== w);
      const line = `兩隊對戰 ${m.score[m.winner === 'a' ? 0 : 1]}:${m.score[m.winner === 'a' ? 1 : 0]}，${w} 勝`;
      return [{ team: w, why: [...why, line] }, { team: l, why: [...why, line] }];
    }
    return teams.map(t => ({ team: t, lot: true, why: [...why, '由裁判長抽籤'] }));
  }
  const tot = Object.fromEntries(teams.map(t => [t, { p: [0, 0], g: [0, 0], s: [0, 0] }]));
  among.forEach(m => {
    const st = matchStats(m), a = tot[m.A.name], b = tot[m.B.name];
    CRIT.forEach(([k]) => { a[k][0] += st[k][0]; a[k][1] += st[k][1]; b[k][0] += st[k][1]; b[k][1] += st[k][0]; });
  });
  for (const [k, label] of CRIT) {
    const groups = new Map();
    teams.forEach(t => { const key = ratioKey(...tot[t][k]); if (!groups.has(key)) groups.set(key, []); groups.get(key).push(t); });
    if (groups.size > 1) {
      const list = [...groups.values()].sort((x, y) => ratioVal(...tot[y[0]][k]) - ratioVal(...tot[x[0]][k]));
      return list.flatMap(gr => breakTie(gr, matches, [...why, `${teams.length} 隊${label} ${gr.map(t => `${t} ${tot[t][k][0]}:${tot[t][k][1]}`).join('、')}`])).map(r => r);
    }
  }
  return teams.map(t => ({ team: t, lot: true, why: [...why, `${teams.length} 隊點數、局數、分數勝率都相同，由裁判長抽籤`] }));
}
export function standings(g) {
  const rows = g.teams.map(t => ({ team: t, w: 0, l: 0, pf: 0, pa: 0, played: 0 }));
  const of = t => rows.find(r => r.team === t);
  const done = g.matches.filter(m => m.confirmed);
  done.forEach(m => {
    const a = of(m.A.name), b = of(m.B.name);
    a.played++; b.played++;
    a.pf += m.score[0]; a.pa += m.score[1]; b.pf += m.score[1]; b.pa += m.score[0];
    if (m.winner === 'a') { a.w++; b.l++; } else { b.w++; a.l++; }
  });
  const byW = [...new Set(rows.map(r => r.w))].sort((x, y) => y - x);
  const order = byW.flatMap(w => breakTie(rows.filter(r => r.w === w).map(r => r.team), done, []));
  const sorted = order.map((o, i) => Object.assign(of(o.team), { rank: i + 1, lot: !!o.lot, why: o.why, tie: rows.filter(r => r.w === of(o.team).w).length > 1 }));
  const all = g.matches.every(m => m.confirmed);
  return { rows: sorted, all };
}

// ---------------- 文字 ----------------
export function sideText(s, team) {
  if (!s) return '';
  if (s.name) return team || !s.school ? s.name : `${s.school} ${s.name}`;
  if (s.pending) return s.pending;
  if (s.hint) return s.hint.trim();
  return '';
}
export function matchTitle(m) {
  return m.stage === 'F' ? `決賽第${cnSpoken(m.num)}場次` : `第${cnSpoken(m.num)}場次`;
}
/** 廣播稿 */
export function callText(m, tables = m.tables) {
  return `${m.ev}${m.no}，${sideText(m.A, m.team)}、${sideText(m.B, m.team)}，第 ${tables.join('、')} 桌`;
}
/**
 * 未到的再次唱名。ab：{ a, b, table, point }；有 point 時唱名到該點選手。
 * 例：男團(四)，中正大學A 第三點 甲／乙，請到第 7 桌
 */
export function recallText(m, ab) {
  const lu = m.rec.lineup || {};
  const one = k => {
    const S = k === 'a' ? m.A : m.B;
    if (ab.point == null) return sideText(S, m.team);
    const v = (lu[k] || [])[ab.point];
    const who = Array.isArray(v) ? v.filter(Boolean).join('／') : (v || '');
    return `${sideText(S, m.team)} 第${'一二三四五'[ab.point]}點${who ? ` ${who}` : ''}`;
  };
  const names = [ab.a ? one('a') : '', ab.b ? one('b') : ''].filter(Boolean).join('、');
  const t = ab.table || (m.tables || []).join('、');
  return `${m.ev}${m.no}，${names}，請到第 ${t} 桌`;
}
/** 某場目前所有未到回報：整場一筆、各點各一筆 */
export function absences(m) {
  const out = [];
  const r = m.rec || {};
  if (r.absent && (r.absent.a || r.absent.b)) out.push({ ...r.absent, point: null, key: 'm' });
  (r.pts || []).forEach((p, i) => { if (p && p.absent && (p.absent.a || p.absent.b)) out.push({ ...p.absent, point: i, key: `p${i}` }); });
  return out;
}
export const fmtTime = ts => { if (!ts) return ''; const d = new Date(ts); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
export const parseTables = text => [...new Set(String(text || '').split(/[^0-9]+/).filter(Boolean).map(Number))];
