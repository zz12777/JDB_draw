// 參賽者系統原型的資料存取。目前是示範模式：資料存在這個瀏覽器的 localStorage，
// 同一台電腦開兩個分頁（報名頁、管理頁）會互相同步。之後接資料庫時只換這個檔案。
import { defaultSettings, timelineFrom, uid, GROUPS, KIND } from './model.js';

const KEY = 'jdb-reg14-demo5';
let state = null;
const subs = new Set();

function load() {
  try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && s.settings && s.regs) return s; } catch (e) { /* 第一次開或資料壞掉 */ }
  return seed();
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* 無痕模式存不了，仍可在這個分頁試用 */ } }
export const getState = () => state;
export function update(fn) { const next = JSON.parse(JSON.stringify(state)); fn(next); state = next; save(); subs.forEach(f => f(state)); }
export function subscribe(fn) { subs.add(fn); }
export function resetDemo() { state = seed(); save(); subs.forEach(f => f(state)); }
addEventListener('storage', ev => { if (ev.key === KEY) { state = load(); subs.forEach(f => f(state)); } });

// ---------------- 示範資料（人名、信箱都是虛構的） ----------------
const SUR = '王李張劉陳楊黃趙吳周徐孫馬朱胡郭何林高羅鄭梁謝宋唐許韓馮鄧曹彭曾蕭田董袁潘蔡蔣余杜葉程魏蘇呂丁沈任姚盧傅鍾';
const GIV = '子宇家豪冠廷承恩柏翰宥辰品妤欣怡雅婷佳穎彥廷詠晴思妤孟哲俊宏韋傑芷涵語彤奕安竣凱沛珊巧芸宸瑋晨希';
let rnd = 7;
const rand = n => { rnd = (rnd * 9301 + 49297) % 233280; return Math.floor((rnd / 233280) * n); };
const person = () => SUR[rand(SUR.length)] + GIV[rand(GIV.length)] + GIV[rand(GIV.length)];
const UNITS = ['陽明交大', '清華大學', '臺灣大學', '成功大學', '中央大學', '政治大學', '中原大學', '逢甲大學', '中興大學', '臺北科大', '元智大學', '淡江大學', '輔仁大學', '東海大學'];
const CLUBS = ['竹風桌球', '新竹桌委', '風城球友', '青椒一日遊', '桌球人生'];

function seed() {
  rnd = 7;
  const now = Date.now(), day = 864e5;
  const st = { settings: defaultSettings(), regs: {}, seq: 0 };
  const s = st.settings;
  // 示範：第十四屆暫定 2027/12/4、12/5，期程照第十三屆的間隔推算；只有「開始報名」提前到今天以前，才能試用報名
  s.timeline = timelineFrom(s.dates[0]);
  s.timeline.open = new Date(now - 12 * day - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 11) + '12:00';
  // 示範名額縮小，才看得到額滿與候補（實際設定請看往年紀錄）
  Object.assign(s.events.男團, { quota: 16 }); Object.assign(s.events.社團, { quota: 4 }); Object.assign(s.events.男雙, { quota: 10 });
  let t = now - 11 * day;
  const add = (g, unit, i, plan, lead) => {
    t += rand(9) * 36e5 + 6e5;
    const id = uid(), contact = lead ? { ...lead.contact } : { name: person(), email: `contact${i}@example.com`, phone: rand(3) ? `09${String(10000000 + rand(89999999)).slice(0, 8)}` : '' };
    const r = { id, bid: lead ? lead.id : id, group: g, unit, contact, editors: rand(3) ? [] : [`coach${i}@example.com`], parking: lead ? 0 : rand(4), createdAt: t, updatedAt: t, entries: [], pays: [], log: [{ ts: t, by: contact.email, text: '送出報名' }], note: rand(5) ? '' : `要收據，抬頭 ${unit}桌球隊` };
    st.regs[id] = r;
    plan.forEach(([ev, n]) => {
      for (let k = 0; k < n; k++) {
        const e = { id: uid(), ev, ts: t + k, status: 'in', lineup: 'online' };
        if (KIND[ev] === 'team') Object.assign(e, { name: n > 1 || rand(2) ? `${unit}${'ABC'[k]}` : unit, coach: person(), leader: person(), captain: '', members: Array.from({ length: 5 + rand(3) }, person), lineup: rand(6) ? 'online' : 'paper' });
        else e.players = KIND[ev] === 'double' ? [person(), person()] : [person()];
        if (e.members) e.captain = e.members[0];
        r.entries.push(e);
      }
    });
    return r;
  };
  let i = 1;
  // 同校男子組、女子組一起送出，合併成一筆繳費
  UNITS.forEach((u, k) => { const m = add('M', u, i++, [['男團', k % 4 === 0 ? 2 : 1], ['男單', k % 3 === 0 ? 7 : 1 + rand(3)], ['男雙', rand(2)]]); if (k % 2 === 0) add('W', u, i, [['女團', 1], ['女單', 1 + rand(2)], ['女雙', rand(2)]], m); });
  CLUBS.forEach(c => add('S', c, i++, [['社團', 1]]));
  // 繳費：大約七成已回報匯款（完成報名），其中一部分總務已對帳
  const fee = { team: 2400, single: 300, double: 350 };
  Object.values(st.regs).filter(r => r.bid === r.id).forEach(r => {
    if (rand(10) >= 7) return;
    const regs = Object.values(st.regs).filter(x => x.bid === r.id);
    const sum = regs.reduce((a, x) => { const cnt = {}; return a + x.entries.reduce((b, e) => { cnt[e.ev] = (cnt[e.ev] || 0) + 1; return b + (e.ev === '男單' && cnt[e.ev] > 5 && x.unit !== '陽明交大' ? 0 : fee[KIND[e.ev]]); }, 0) + x.parking * s.parkingPrice; }, 0);
    const pt = r.createdAt + day * (1 + rand(3));
    r.pays.push({ amount: rand(8) ? sum : sum - 300, time: new Date(pt - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 16), last5: String(10000 + rand(89999)), ts: pt });
    if (rand(3)) r.fin = r.pays[0].amount === sum ? { state: 'received', at: pt + day, by: 'finance@example.com' } : { state: 'mismatch', note: '少 300 元，請補匯', at: pt + day, by: 'finance@example.com' };
  });
  return st;
}
state = load();
export { GROUPS };
