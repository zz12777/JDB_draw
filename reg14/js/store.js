// 參賽者系統原型的資料存取。目前是示範模式：資料存在這個瀏覽器的 localStorage，
// 同一台電腦開兩個分頁（報名頁、管理頁）會互相同步。之後接資料庫時只換這個檔案。
import { defaultSettings, uid, GROUPS, KIND, newStatus } from './model.js';

const KEY = 'jdb-reg14-demo2';
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
  // 示範：報名期間包含今天，名額設小一點才看得到額滿與候補
  const iso = t => new Date(t - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 16);
  s.open = iso(now - 12 * day); s.close = iso(now + 16 * day);
  Object.assign(s.events.男團, { quota: 22, reserved: 1 }); Object.assign(s.events.女團, { quota: 6, reserved: 1 }); Object.assign(s.events.社團, { quota: 4, reserved: 0 });
  Object.assign(s.events.男單, { quota: 32, reserved: 2 }); Object.assign(s.events.女單, { quota: 14, reserved: 1 });
  Object.assign(s.events.男雙, { quota: 10, reserved: 1 }); Object.assign(s.events.女雙, { quota: 6, reserved: 1 });
  let t = now - 11 * day;
  const add = (g, unit, i, plan) => {
    t += rand(9) * 36e5 + 6e5;
    const id = uid(), contact = { name: person(), email: `contact${i}@example.com`, phone: rand(3) ? `09${String(10000000 + rand(89999999)).slice(0, 8)}` : '' };
    const r = { id, group: g, unit, contact, editors: rand(3) ? [] : [`coach${i}@example.com`], parking: rand(4), createdAt: t, updatedAt: t, entries: [], pays: [], log: [{ ts: t, by: contact.email, text: '送出報名' }], reqs: [] };
    st.regs[id] = r;
    plan.forEach(([ev, n]) => {
      for (let k = 0; k < n; k++) {
        const e = { id: uid(), ev, ts: t + k, status: 'ok', lineup: 'online' };
        if (KIND[ev] === 'team') Object.assign(e, { name: n > 1 || rand(2) ? `${unit}${'ABC'[k]}` : unit, coach: person(), leader: person(), captain: '', members: Array.from({ length: 5 + rand(3) }, person), lineup: rand(6) ? 'online' : 'paper' });
        else e.players = KIND[ev] === 'double' ? [person(), person()] : [person()];
        if (e.members) e.captain = e.members[0];
        e.status = newStatus(st, ev);
        r.entries.push(e);
      }
    });
    // 繳費：大約一半已回報，其中一部分總務已對帳
    if (rand(10) < 6) {
      const pays = r.entries.filter(e => e.status === 'ok');
      if (pays.length) {
        const sum = pays.reduce((a, e) => a + s.events[e.ev].fee, 0) + r.parking * s.parkingPrice;
        r.pays.push({ amount: rand(8) ? sum : sum - 400, time: new Date(t + day).toISOString().slice(0, 16), last5: String(10000 + rand(89999)), ts: t + day });
        if (rand(3)) r.fin = r.pays[0].amount === sum ? { state: 'received', at: t + 2 * day, by: 'finance@example.com' } : { state: 'mismatch', note: '少 400 元，請補匯', at: t + 2 * day, by: 'finance@example.com' };
      }
    }
    return r;
  };
  let i = 1;
  UNITS.forEach((u, k) => { add('M', u, i++, [['男團', k % 4 === 0 ? 2 : 1], ['男單', 1 + rand(3)], ['男雙', rand(2)]]); if (k % 2 === 0) add('W', u, i++, [['女團', 1], ['女單', 1 + rand(2)], ['女雙', rand(2)]]); });
  CLUBS.forEach(c => add('S', c, i++, [['社團', 1]]));
  // 一筆截止後的異動申請（示範用）
  const r0 = Object.values(st.regs)[2], e0 = r0.entries.find(e => e.members);
  if (e0) { const nm = person(), members = e0.members.slice(); const old = members[1]; members[1] = nm;
    r0.reqs.push({ id: uid(), ts: now - 36e5, by: r0.contact.email, status: 'pending', text: `${e0.ev} ${e0.name}：隊員 ${old} 改為 ${nm}`, entryId: e0.id, patch: { members } }); }
  return st;
}
state = load();
export { GROUPS };
