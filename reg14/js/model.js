// 參賽者系統（第十四屆起）原型：資料規則。示範模式資料只存在瀏覽器，不連比賽用的資料庫。

export const GROUPS = {
  M: { name: '大專男子組', events: ['男團', '男單', '男雙'] },
  W: { name: '大專女子組', events: ['女團', '女單', '女雙'] },
  S: { name: '社會組', events: ['社團'] },
};
export const EVENTS = ['男團', '女團', '社團', '男單', '女單', '男雙', '女雙'];
export const KIND = { 男團: 'team', 女團: 'team', 社團: 'team', 男單: 'single', 女單: 'single', 男雙: 'double', 女雙: 'double' };
export const UNIT_WORD = { team: '隊', single: '人', double: '組' };
export const groupOf = ev => Object.keys(GROUPS).find(g => GROUPS[g].events.includes(ev));

export const STATUS_TEXT = { ok: '正取', wait: '候補', out: '已退出' };
export const PAY_TEXT = { none: '尚未回報', reported: '已回報，待對帳', received: '已收到款項', mismatch: '金額不符' };

/** 預設設定（每年在管理頁修改，不必改程式） */
export function defaultSettings() {
  return {
    title: '交大盃', edition: '第十四屆',
    open: '2027-10-01T00:00', close: '2027-11-12T17:00',
    dates: ['2027-12-04', '2027-12-05'],
    bank: { name: '（示範）○○銀行 ○○分行', code: '000', account: '0000-000-000000' },
    parkingPrice: 50,
    contactMail: 'nctuttc@gmail.com',
    fbUrl: 'https://www.facebook.com/p/%E4%BA%A4%E5%A4%A7%E7%9B%83%E5%85%A8%E5%9C%8B%E5%A4%A7%E5%B0%88%E6%A0%A1%E9%99%A2%E6%A1%8C%E7%90%83%E9%8C%A6%E6%A8%99%E8%B3%BD-100054286609627/',
    qa: [
      { id: 'q1', q: '報名費怎麼繳？', a: '送出報名後，報名頁會顯示應繳金額與匯款帳號。匯款後請登入報名系統按「回報匯款」，填寫金額、時間與帳號後五碼，總務對帳後會顯示「已收到款項」。' },
      { id: 'q2', q: '額滿了還可以報名嗎？', a: '可以，額滿後送出的報名會列入候補，報名頁看得到候補順位。有名額釋出時大會依序遞補並寄信通知，遞補後再匯款。' },
      { id: 'q3', q: '報名截止後要改名單怎麼辦？', a: '截止前可以自己修改。截止後請在報名頁按「申請異動」，大會審核通過後才會更新。' },
      { id: 'q4', q: '停車證怎麼申請？', a: '報名時填寫張數，每張 50 元，可停一天。之後也可以在報名頁加購，金額會自動併入應繳。' },
    ],
    basis: 'submit',
    payDays: 3,
    events: {
      男團: { quota: 48, reserved: 2, fee: 2500, min: 4, max: 8 },
      女團: { quota: 24, reserved: 2, fee: 2000, min: 3, max: 6 },
      社團: { quota: 32, reserved: 0, fee: 2500, min: 4, max: 8 },
      男單: { quota: 128, reserved: 4, fee: 400, perUnit: 6 },
      女單: { quota: 64, reserved: 2, fee: 400, perUnit: 6 },
      男雙: { quota: 64, reserved: 2, fee: 600, perUnit: 3 },
      女雙: { quota: 32, reserved: 2, fee: 600, perUnit: 3 },
    },
    admins: ['admin@example.com'],
    finance: ['finance@example.com'],
  };
}

export const uid = () => Math.random().toString(36).slice(2, 10);
export const norm = e => String(e || '').trim().toLowerCase();

/** 報名期間：before / open / closed */
export function phase(st, now = Date.now()) {
  const o = Date.parse(st.settings.open), c = Date.parse(st.settings.close);
  return now < o ? 'before' : now > c ? 'closed' : 'open';
}

/** 一個項目的所有報名（含所屬報名單位） */
export function entriesOf(st, ev) {
  const out = [];
  Object.values(st.regs || {}).forEach(r => (r.entries || []).forEach(e => { if (e.ev === ev) out.push({ r, e }); }));
  return out.sort((a, b) => a.e.ts - b.e.ts);
}

/** 名額：開放名額 = 上限 - 主辦預留 */
export function quotaOf(st, ev) {
  const c = st.settings.events[ev] || {};
  const list = entriesOf(st, ev);
  const ok = list.filter(x => x.e.status === 'ok').length;
  const wait = list.filter(x => x.e.status === 'wait');
  const open = Math.max(0, (c.quota || 0) - (c.reserved || 0));
  return { quota: c.quota || 0, reserved: c.reserved || 0, open, ok, wait: wait.length, left: Math.max(0, open - ok), full: ok >= open, waitList: wait };
}

/** 候補順位：依進入候補的時間 */
export function waitRank(st, e) {
  if (e.status !== 'wait') return 0;
  return quotaOf(st, e.ev).waitList.findIndex(x => x.e.id === e.id) + 1;
}

/** 應繳金額：正取的項目加上停車證；候補與退出不計 */
export function feeOf(st, r) {
  const items = [];
  EVENTS.forEach(ev => {
    const n = (r.entries || []).filter(e => e.ev === ev && e.status === 'ok').length;
    if (n) items.push({ label: ev, n, unit: UNIT_WORD[KIND[ev]], price: st.settings.events[ev].fee, sum: n * st.settings.events[ev].fee });
  });
  if (r.parking) items.push({ label: '停車證', n: r.parking, unit: '張', price: st.settings.parkingPrice, sum: r.parking * st.settings.parkingPrice });
  return { items, total: items.reduce((a, x) => a + x.sum, 0) };
}

/** 繳費狀態 */
export function payState(r) {
  if (r.fin && r.fin.state) return r.fin.state;
  return (r.pays || []).length ? 'reported' : 'none';
}
export const paidSum = r => (r.pays || []).reduce((a, p) => a + Number(p.amount || 0), 0);

/** 報名者能管理的報名 */
export function mine(st, email) {
  const m = norm(email);
  return Object.values(st.regs || {}).filter(r => norm(r.contact.email) === m || (r.editors || []).some(x => norm(x) === m)).sort((a, b) => a.createdAt - b.createdAt);
}

/** 單位每項目已報名數（個人賽每單位上限用；不含退出） */
export const unitCount = (r, ev) => (r.entries || []).filter(e => e.ev === ev && e.status !== 'out').length;

/** 新報名的狀態：還有開放名額就正取，否則候補 */
export function newStatus(st, ev) { return quotaOf(st, ev).full ? 'wait' : 'ok'; }

export const entryName = e => (KIND[e.ev] === 'team' ? e.name : (e.players || []).filter(Boolean).join('/'));
export const fmtMoney = n => `NT$ ${Number(n || 0).toLocaleString('en-US')}`;
export function fmtTime(ts) {
  if (!ts) return '';
  const d = new Date(ts), p = n => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
export function fmtDT(s) { const d = new Date(s); return Number.isNaN(+d) ? s : `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; }
