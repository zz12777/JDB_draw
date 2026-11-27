// 即時賽程的追蹤：記在這支手機的瀏覽器裡，大會廣播組按「已廣播」時，追蹤的隊伍或選手跳出出賽通知。
// 不是手機推播，要開著即時賽程頁面才看得到。
import { esc, icon } from './ui.js';
import { sideText } from './model.js';

const KEY = 'jdb-follow', SEEN = 'jdb-follow-seen';
const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) || d; } catch (e) { return d; } };
const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* 無痕模式存不了，這次開著時仍有效 */ } };
let follows = load(KEY, {}); // { key: 開始追蹤的時間 }
let seen = load(SEEN, []);   // 已經跳過通知的廣播 ts

/** 一邊的追蹤對象：團體賽是隊伍，單打是選手，雙打是整組 */
export function sideTargets(m, x) {
  if (!x || !x.name) return [];
  if (m.team) return [{ key: `t|${m.ev}|${x.name}`, label: `${m.ev} ${x.name}` }];
  const sc = String(x.school || '');
  return [{ key: `p|${sc}|${x.name}`, label: `${sc} ${x.name}`.trim() }];
}
const matchKeys = m => [m.A, m.B].flatMap(x => sideTargets(m, x).map(t => t.key));
export const isFollowed = k => !!follows[k];
export function toggleFollow(k) {
  if (follows[k]) delete follows[k]; else follows[k] = Date.now();
  save(KEY, follows);
}
export const followList = () => Object.keys(follows);
export const labelOf = k => { const [t, a, b] = k.split('|'); return t === 't' ? `${a} ${b}` : `${a} ${b}`.trim(); };

/** 追蹤按鈕 */
export const followBtn = t => `<button class="fbtn ${isFollowed(t.key) ? 'on' : ''}" data-follow="${esc(t.key)}" aria-pressed="${isFollowed(t.key)}">${icon(isFollowed(t.key) ? 'starOn' : 'star')}<span>${esc(t.label)}</span></button>`;

/** 找出要跳的出賽通知：已廣播、廣播時間晚於開始追蹤、30 分鐘內、還沒跳過 */
export function pendingNotes(calls, D) {
  const now = Date.now();
  return (calls || []).filter(c => c.done && now - c.done < 30 * 60000 && !seen.includes(c.ts)).map(c => {
    const m = D.byId.get(c.mid); if (!m) return null;
    const hitK = matchKeys(m).filter(k => follows[k] && follows[k] <= c.done);
    return hitK.length ? { c, m } : null;
  }).filter(Boolean);
}
export function markSeen(ts) { seen = seen.concat(ts).slice(-60); save(SEEN, seen); }

export function noteHtml(n) {
  const { c, m } = n;
  return `<div class="fnote" role="alert"><div class="fnh">${icon('speaker')}出賽通知</div>
    <div class="fnt"><b>${esc(m.ev)}</b>${esc(m.no)}　${esc(sideText(m.A, m.team))} <span class="vs">vs</span> ${esc(sideText(m.B, m.team))}</div>
    <div class="fnb">請到第 ${esc((c.tables || []).join('、'))} 桌比賽</div>
    <div class="row" style="justify-content:flex-end"><button class="btn" data-fseen="${c.ts}">收到</button></div></div>`;
}
