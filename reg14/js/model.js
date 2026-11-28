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

export const STATUS_TEXT = { ok: '正取', wait: '候補', unpaid: '待完成報名', out: '已退出' };
export const PAY_TEXT = { none: '尚未回報', reported: '已回報，待對帳', received: '已收到款項', mismatch: '金額不符' };

/** 第十三屆的設定（往年紀錄第一筆，也是預設值） */
export const T13 = {
  edition: '第十三屆', year: 2026, dates: ['2026-12-05', '2026-12-06'],
  events: {
    男團: { quota: 48, fee: 2400, min: 4, max: 9 }, 女團: { quota: 0, fee: 2400, min: 4, max: 9 }, 社團: { quota: 32, fee: 2400, min: 4, max: 9 },
    男單: { quota: 128, fee: 300, perUnit: 0, perUnitOk: 5 }, 女單: { quota: 0, fee: 300, perUnit: 0 },
    男雙: { quota: 64, fee: 350, perUnit: 0 }, 女雙: { quota: 0, fee: 350, perUnit: 0 },
  },
  parkingPrice: 50,
  timeline: { open: '2026-10-11T12:00', close: '2026-10-31T12:00', waitPayStart: '2026-11-01T00:00', waitPayEnd: '2026-11-07T12:00', waitMailStart: '2026-11-01', waitMailEnd: '2026-11-05', editClose: '2026-11-08T17:00', drawAt: '2026-11-11T19:00', publish: '2026-11-18' },
  notes: [
    '團體賽六人五點制（單、單、雙、單、單），不得兼點。',
    '大專男團限 48 隊、男單限 128 名、男雙限 64 組、社會組團體限 32 隊；大專女子組團體、單打、雙打無限制。',
    '名額依「匯款完成確認表單」填寫時間先後計算：提交報名表與確認匯款表單皆完成，才算完成報名。',
    '男單每校限正取 5 名、其餘備取（陽明交大不適用）；正取繳費截止未達 128 人，依序遞補各校備取，每輪每校一位。',
    '報名時只需支付正取費用，備取費用在遞補成功的通知信中說明。',
    '個人賽報名未滿 8 組則取消比賽並全額退費；未報名成功的隊伍全額退費；額滿在粉絲專頁公告。',
    '大專團體隊名限學校名稱加上一個編號字元（例：陽明交大A、陽明交大紅）；社會組隊名限 6 個字元以內。',
    '停車證一車一張、可停一日，每張 50 元，隨報名費一起匯款。',
    '10/11 12:00 開始報名；10/31 12:00 前完成報名與匯款確認；11/1 至 11/7 12:00 候補匯款；11/1 至 11/5 寄出候補成功與不成功信；名單修改截止 11/8 17:00；11/11 19:00 抽籤；11/18 公布。',
  ],
};
/** 依比賽第一天，照第十三屆的間隔推算報名與候補期程 */
export function timelineFrom(day1) {
  const base = Date.parse(`${T13.dates[0]}T00:00`), d = Date.parse(`${day1}T00:00`);
  if (Number.isNaN(d)) return null;
  const shift = v => { const t = Date.parse(v.length > 10 ? v : `${v}T00:00`) - base + d; const x = new Date(t - new Date().getTimezoneOffset() * 6e4).toISOString(); return v.length > 10 ? x.slice(0, 16) : x.slice(0, 10); };
  return Object.fromEntries(Object.entries(T13.timeline).map(([k, v]) => [k, shift(v)]));
}
export const TL_LABEL = { open: '開始報名', close: '報名與匯款確認截止', waitPayStart: '候補匯款開始', waitPayEnd: '候補匯款截止', waitMailStart: '開始寄候補信', waitMailEnd: '候補信寄完', editClose: '名單修改截止', drawAt: '抽籤', publish: '公布籤表' };

/** 預設設定（每年在管理頁修改，不必改程式） */
export function defaultSettings() {
  return {
    title: '交大盃', edition: '第十四屆',
    dates: ['2027-12-04', '2027-12-05'],
    timeline: timelineFrom('2027-12-04'),
    bank: { name: '（示範）○○銀行 ○○分行', code: '000', account: '0000-000-000000' },
    parkingPrice: T13.parkingPrice,
    contactMail: 'nctuttc@gmail.com',
    fbUrl: 'https://www.facebook.com/p/%E4%BA%A4%E5%A4%A7%E7%9B%83%E5%85%A8%E5%9C%8B%E5%A4%A7%E5%B0%88%E6%A0%A1%E9%99%A2%E6%A1%8C%E7%90%83%E9%8C%A6%E6%A8%99%E8%B3%BD-100054286609627/',
    qa: QA,
    basis: 'report',
    hostUnit: '陽明交大',
    payDays: 3,
    events: JSON.parse(JSON.stringify(T13.events)),
    admins: ['admin@example.com'],
    finance: ['finance@example.com'],
    history: [JSON.parse(JSON.stringify(T13))],
  };
}
const QA = [
  { id: 'q1', q: '怎樣才算報名成功？', a: '送出報名表，並在報名頁按「回報匯款」完成匯款確認，兩個都完成才算報名成功。有名額限制的項目，依完成匯款確認的時間先後計算。' },
  { id: 'q2', q: '報名費怎麼繳？', a: '送出報名後，報名頁會顯示應繳金額與匯款帳號。匯款後請按「回報匯款」，填寫金額、時間與帳號後五碼，總務對帳後會顯示「已收到款項」。' },
  { id: 'q3', q: '額滿了還可以報名嗎？', a: '可以，額滿後會列入候補，報名頁看得到候補順位。候補成功會寄信通知，遞補後再匯款；未報名成功的隊伍全額退費。' },
  { id: 'q4', q: '報名截止後要改名單怎麼辦？', a: '名單修改截止前可以自己修改。截止後請在報名頁按「申請異動」，大會審核通過後才會更新。' },
  { id: 'q5', q: '停車證怎麼申請？', a: '開車進入陽明交大校園需要停車證，一車一張、可停一日，每張 50 元。報名時填寫張數，隨報名費一起匯款。' },
];

export const uid = () => Math.random().toString(36).slice(2, 10);
export const norm = e => String(e || '').trim().toLowerCase();

/** 報名期間：before 尚未開始 / open 報名中 / edit 報名截止但還能改名單 / closed 名單修改也截止 */
export function phase(st, now = Date.now()) {
  const t = st.settings.timeline || {};
  const o = Date.parse(t.open), c = Date.parse(t.close), e = Date.parse(t.editClose || t.close);
  return now < o ? 'before' : now <= c ? 'open' : now <= e ? 'edit' : 'closed';
}

/** 一個項目的所有報名（含所屬報名單位） */
export function entriesOf(st, ev) {
  const out = [];
  Object.values(st.regs || {}).forEach(r => (r.entries || []).forEach(e => { if (e.ev === ev) out.push({ r, e }); }));
  return out.sort((a, b) => a.e.ts - b.e.ts);
}

/**
 * 正取、候補：每次依目前資料算出來（不存在資料裡），規則：
 * 1. 完成報名的時間：依設定的計算方式（送出報名／回報匯款／總務確認），還沒完成的是「待完成」。
 * 2. 每校正取上限（例如男單 5 名，主辦學校不適用）：超過的直接備取。
 * 3. 已遞補的先占名額，其餘依完成時間先後，額滿的列入候補。
 * 4. 有每校正取上限的項目，候補順序每輪每校一位；其他依完成時間。
 */
const cache = new WeakMap();
export function doneAt(st, r, e) {
  const b = st.settings.basis;
  if (b === 'submit') return e.ts;
  if (b === 'received') return r.fin && r.fin.state === 'received' ? r.fin.at : null;
  return (r.pays || []).length ? r.pays[0].ts : null;
}
function calc(st) {
  if (cache.has(st)) return cache.get(st);
  const out = { st: new Map(), rank: new Map(), q: {} };
  EVENTS.forEach(ev => {
    const c = st.settings.events[ev] || {}, open = c.quota ? Math.max(0, c.quota - (c.reserved || 0)) : Infinity;
    const list = entriesOf(st, ev).filter(x => x.e.status !== 'out');
    const capped = new Set();
    if (c.perUnitOk) {
      const by = new Map();
      list.forEach(x => { if (x.r.unit === st.settings.hostUnit) return; const k = x.r.id; by.set(k, (by.get(k) || 0) + 1); if (by.get(k) > c.perUnitOk) capped.add(x.e.id); });
    }
    let ok = 0;
    list.filter(x => x.e.promotedAt).forEach(x => { out.st.set(x.e.id, 'ok'); ok++; });
    const rest = list.filter(x => !x.e.promotedAt).map(x => ({ ...x, t: doneAt(st, x.r, x.e) }));
    const wait = [];
    rest.filter(x => x.t != null && !capped.has(x.e.id)).sort((a, b) => a.t - b.t || a.e.ts - b.e.ts).forEach(x => {
      if (ok < open) { out.st.set(x.e.id, 'ok'); ok++; } else { out.st.set(x.e.id, 'wait'); wait.push(x); }
    });
    rest.filter(x => x.t == null && !capped.has(x.e.id)).forEach(x => out.st.set(x.e.id, 'unpaid'));
    rest.filter(x => capped.has(x.e.id)).forEach(x => { out.st.set(x.e.id, 'wait'); x.capped = true; wait.push(x); });
    // 候補順序
    let order;
    if (c.perUnitOk) {
      const keyT = x => x.t ?? doneAt(st, x.r, x.e) ?? x.e.ts;
      const groups = new Map();
      wait.slice().sort((a, b) => keyT(a) - keyT(b) || a.e.ts - b.e.ts).forEach(x => { if (!groups.has(x.r.unit)) groups.set(x.r.unit, []); groups.get(x.r.unit).push(x); });
      order = [];
      for (let round = 0; order.length < wait.length; round++) groups.forEach(g => { if (g[round]) order.push(g[round]); });
    } else order = wait.slice().sort((a, b) => (a.t ?? a.e.ts) - (b.t ?? b.e.ts));
    order.forEach((x, i) => out.rank.set(x.e.id, i + 1));
    out.q[ev] = { quota: c.quota || 0, reserved: c.reserved || 0, open, ok, wait: order.length, unpaid: rest.filter(x => out.st.get(x.e.id) === 'unpaid').length, left: open === Infinity ? Infinity : Math.max(0, open - ok), full: ok >= open, waitList: order };
  });
  cache.set(st, out);
  return out;
}
/** 一筆報名項目的狀態：ok 正取 / wait 候補 / unpaid 待完成報名 / out 已退出 */
export const stOf = (st, e) => (e.status === 'out' ? 'out' : calc(st).st.get(e.id) || 'unpaid');
export const quotaOf = (st, ev) => calc(st).q[ev];
export const waitRank = (st, e) => calc(st).rank.get(e.id) || 0;
export const isCapped = (st, e) => !!(calc(st).q[e.ev].waitList.find(x => x.e.id === e.id) || {}).capped;

/** 應繳金額：正取與待完成的項目加上停車證；候補（含備取）不計，遞補後再繳 */
export function feeOf(st, r) {
  const items = [];
  EVENTS.forEach(ev => {
    const n = (r.entries || []).filter(e => e.ev === ev && ['ok', 'unpaid'].includes(stOf(st, e))).length;
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


export const entryName = e => (KIND[e.ev] === 'team' ? e.name : (e.players || []).filter(Boolean).join('/'));
export const fmtMoney = n => `NT$ ${Number(n || 0).toLocaleString('en-US')}`;
export function fmtTime(ts) {
  if (!ts) return '';
  const d = new Date(ts), p = n => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
export function fmtDT(s) { if (/^\d{4}-\d{2}-\d{2}$/.test(s || '')) { const [y, m, dd] = s.split('-'); return `${y}/${Number(m)}/${Number(dd)}`; } const d = new Date(s); return Number.isNaN(+d) ? s : `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; }
