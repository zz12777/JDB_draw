// 資料存取：畫面只跟這個檔案要資料、改資料，實際存放的地方由下面三種連線方式負責。
//   雲端（大會台、裁判頁）：Firebase 即時連線，改動立刻同步到所有裝置
//   雲端（公開頁）：每隔幾秒抓一次有變動的場次，不佔即時連線名額
//   本機（網址加 ?local）：存在這台電腦的瀏覽器，示範與測試用
//
// 雲端的資料分成：pub/meta（賽事設定）、pub/events（籤表與名單）、pub/m/場次/欄位（每場的紀錄，
// 一個欄位一格，裁判與大會台同時改不同欄位不會互相蓋掉）、desk/…（只有大會台看得到）。
import { emptyState } from './model.js';
import { FIREBASE, ROOT, ADMINS, POLL_SECONDS } from './config.js';

const ROLE = document.documentElement.dataset.role || 'public';
export const LOCAL = new URLSearchParams(location.search).has('local') || !FIREBASE;
const listeners = new Set(), authListeners = new Set();
const raw = { meta: null, events: null, m: {}, pcalls: null, calls: null, staff: null, staffOrg: null, refOpt: null, receipt: null, dlu: null, olu: null, teamacl: null, nudge: null, refcode: null, refgen: null, notices: null, checkin: {}, parking: null };
let state = emptyState();
let remote = null;
export const auth = { cloud: !LOCAL, ready: LOCAL, user: null, isAdmin: LOCAL, error: '', loaded: false };

// ---------------- 狀態 <-> 資料庫格式 ----------------
const parse = (s, d) => { if (s == null) return d; try { const v = JSON.parse(s); return v == null ? d : v; } catch (e) { return d; } };
const clone = x => JSON.parse(JSON.stringify(x));
const META_KEYS = ['title', 'edition', 'tables', 'notice', 'rosterFile', 'rev', 'sched', 'annTitle', 'dates', 'podium'];
const games = g => (Array.isArray(g) ? g.slice(0, 5).map(x => (Array.isArray(x) ? [x[0] ?? '', x[1] ?? ''] : ['', ''])) : undefined);

function nodeToRec(node) {
  const rec = {};
  for (const k of Object.keys(node || {})) {
    if (k === 'u') continue;
    if (k === 'pts') {
      rec.pts = [];
      for (const i of Object.keys(node.pts || {})) {
        const p = {};
        for (const kk of Object.keys(node.pts[i] || {})) { const v = parse(node.pts[i][kk]); if (v !== undefined) p[kk] = kk === 'g' ? games(v) : v; }
        rec.pts[Number(i)] = p;
      }
      for (let i = 0; i < rec.pts.length; i++) if (!rec.pts[i]) rec.pts[i] = {};
    } else { const v = parse(node[k]); if (v !== undefined) rec[k] = k === 'g' ? games(v) : v; }
  }
  return rec;
}
function flatten(rec) {
  const out = {};
  for (const k of Object.keys(rec || {})) {
    const v = rec[k];
    if (v === undefined || v === null) continue;
    if (k === 'pts') (v || []).forEach((p, i) => { for (const kk of Object.keys(p || {})) if (p[kk] !== undefined && p[kk] !== null) out[`pts/${i}/${kk}`] = JSON.stringify(p[kk]); });
    else out[k] = JSON.stringify(v);
  }
  return out;
}
function recToNode(rec, ts) {
  const node = { u: ts };
  for (const [path, v] of Object.entries(flatten(rec))) {
    const parts = path.split('/'); let o = node;
    parts.slice(0, -1).forEach(p => { o = o[p] = o[p] || {}; });
    o[parts[parts.length - 1]] = v;
  }
  return node;
}
function assemble() {
  const meta = parse(raw.meta, {});
  const m = {};
  for (const id of Object.keys(raw.m || {})) m[id] = nodeToRec(raw.m[id]);
  state = { ...emptyState(), ...Object.fromEntries(META_KEYS.filter(k => meta[k] !== undefined).map(k => [k, meta[k]])),
    events: parse(raw.events, []), m, calls: parse(raw.calls, []), pcalls: parse(raw.pcalls, []), staff: parse(raw.staff, []), staffOrg: parse(raw.staffOrg, {}), refOpt: parse(raw.refOpt, {}), receipt: parse(raw.receipt, {}), dlu: parse(raw.dlu, {}),
    olu: Object.fromEntries(Object.entries(raw.olu || {}).map(([mid, t]) => [mid, Object.fromEntries(Object.entries(t || {}).map(([k, v]) => [k, parse(v, null)]).filter(([, v]) => v))])), teamacl: raw.teamacl || {}, nudge: raw.nudge || {}, refcode: raw.refcode ?? null, refgen: raw.refgen ?? null,
    notices: parse(raw.notices, {}), parking: parse(raw.parking, {}), checkin: Object.fromEntries(Object.entries(raw.checkin || {}).map(([k, v]) => [k, parse(v, {})])) };
}
const metaOf = s => JSON.stringify(Object.fromEntries(META_KEYS.map(k => [k, s[k] ?? null])));

export const getState = () => state;
export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function onAuth(fn) { authListeners.add(fn); return () => authListeners.delete(fn); }
function emit(local) { listeners.forEach(fn => fn(state, local)); }
function emitAuth() { authListeners.forEach(fn => fn(auth)); }

const bumpV = () => { try { remote.write({ 'pub/v': remote.stamp() }).catch(() => {}); } catch (e) { /* 公開頁不寫 */ } };
/** 修改資料：fn 直接改傳入的 state；只把有變動的部分寫回去 */
export function update(fn) {
  const before = state, next = clone(state);
  fn(next);
  const up = {};
  if (JSON.stringify(next.events) !== JSON.stringify(before.events)) { next.rev = Date.now(); up['pub/events'] = JSON.stringify(next.events); }
  if (metaOf(next) !== metaOf(before)) up['pub/meta'] = metaOf(next);
  if (JSON.stringify(next.calls || []) !== JSON.stringify(before.calls || [])) { up['desk/calls'] = JSON.stringify(next.calls || []); up['pub/calls'] = pubCalls(next.calls); }
  if (JSON.stringify(next.staff || []) !== JSON.stringify(before.staff || [])) up['desk/staff'] = JSON.stringify(next.staff || []);
  if (JSON.stringify(next.staffOrg || {}) !== JSON.stringify(before.staffOrg || {})) up['desk/staffOrg'] = JSON.stringify(next.staffOrg || {});
  if (JSON.stringify(next.refOpt || {}) !== JSON.stringify(before.refOpt || {})) up['desk/refOpt'] = JSON.stringify(next.refOpt || {});
  if (JSON.stringify(next.dlu || {}) !== JSON.stringify(before.dlu || {})) up['desk/lu'] = JSON.stringify(next.dlu || {});
  if (JSON.stringify(next.receipt || {}) !== JSON.stringify(before.receipt || {})) up['desk/receipt'] = JSON.stringify(next.receipt || {});
  if (JSON.stringify(next.notices || {}) !== JSON.stringify(before.notices || {})) up['desk/notices'] = JSON.stringify(next.notices || {});
  if (JSON.stringify(next.parking || {}) !== JSON.stringify(before.parking || {})) up.parking = JSON.stringify(next.parking || {});
  const ids = new Set([...Object.keys(before.m || {}), ...Object.keys(next.m || {})]);
  ids.forEach(id => {
    const a = flatten((before.m || {})[id]), b = flatten((next.m || {})[id]);
    let changed = false;
    new Set([...Object.keys(a), ...Object.keys(b)]).forEach(k => { if (a[k] !== b[k]) { up[`pub/m/${id}/${k}`] = b[k] === undefined ? null : b[k]; changed = true; } });
    if (changed) up[`pub/m/${id}/u`] = remote.stamp();
  });
  state = next;
  emit(true);
  // 公開資料有變動時，另外更新「變動標記」：即時賽程只要問這個小標記，有變才下載內容（分開寫，規則還沒更新也不影響主要資料）
  const pubChanged = Object.keys(up).some(k => k.startsWith('pub/'));
  if (Object.keys(up).length) remote.write(up).then(() => { if (pubChanged) bumpV(); }).catch(err => { auth.error = `寫入失敗：${err && err.message ? err.message : err}`; emitAuth(); });
}
export function updateMatch(id, fn) {
  update(s => { s.m[id] = s.m[id] || {}; fn(s.m[id], s); });
}
/** 整份換掉（還原備份、載入示範資料、清除） */
export function replaceState(s) {
  const next = { ...emptyState(), ...clone(s), rev: Date.now() };
  const tree = {};
  for (const id of Object.keys(next.m || {})) tree[id] = recToNode(next.m[id], remote.stamp());
  state = next;
  emit(true);
  remote.write({ 'pub/meta': metaOf(next), 'pub/events': JSON.stringify(next.events || []), 'pub/m': Object.keys(tree).length ? tree : null,
    'desk/calls': JSON.stringify(next.calls || []), 'pub/calls': pubCalls(next.calls), 'desk/staff': JSON.stringify(next.staff || []), 'desk/staffOrg': JSON.stringify(next.staffOrg || {}), 'desk/refOpt': JSON.stringify(next.refOpt || {}), 'desk/lu': JSON.stringify(next.dlu || {}), 'desk/receipt': JSON.stringify(next.receipt || {}),
    'desk/notices': JSON.stringify(next.notices || {}), checkin: null, parking: JSON.stringify(next.parking || {}) })
    .then(bumpV).catch(err => { auth.error = `寫入失敗：${err && err.message ? err.message : err}`; emitAuth(); });
}
/** 裁判密碼：裁判頁輸入密碼（正確才會成功）；本機測試直接比對 */
let refUnlockImpl = null;
export function refUnlock(code) {
  if (LOCAL) return String(code) === String(state.refcode || '') ? Promise.resolve() : Promise.reject(new Error('密碼錯誤'));
  if (!refUnlockImpl) return Promise.reject(new Error('尚未連線'));
  return refUnlockImpl(code);
}
/** 大會台設定或取消裁判密碼；refgen 讓裁判頁知道要重新輸入 */
export function setRefCode(code) {
  return remote.write(code ? { 'desk/refcode': String(code), 'pub/refgen': Date.now() } : { 'desk/refcode': null, 'pub/refgen': null }).then(bumpV);
}
/** 直接寫入資料庫的幾個位置（線上點單權限等不屬於畫面狀態的資料） */
export function writePaths(up) { return remote.write(up); }
/** 線上點單與權限用的隊伍代號：項目|隊名，去掉資料庫不允許的字元 */
export const teamKey = (ev, team) => `${ev}|${team}`.replace(/[.#$\[\]\/]/g, '_');
export const mailKey = email => String(email || '').trim().toLowerCase().replace(/\./g, ',');
const MAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
export const parseMails = text => [...new Set(String(text || '').split(/[\s,，;；\/]+/).map(x => x.trim().toLowerCase()).filter(x => MAIL_RE.test(x)))];
/** 取代某隊的聯絡人（聯絡人可以再增減共同編輯）；回傳要寫入的路徑 */
export function ownerUpdates(acl, key, emails) {
  const up = {}, cur = (acl || {})[key] || {};
  Object.entries(cur).forEach(([k, v]) => { if (v === 'owner') { up[`teamacl/${key}/${k}`] = null; up[`myteams/${k}/${key}`] = null; } });
  emails.forEach(e => { const k = mailKey(e); up[`teamacl/${key}/${k}`] = 'owner'; up[`myteams/${k}/${key}`] = true; });
  return up;
}
/** 加入共同編輯（不能再增減其他信箱）；已經在名單上的略過 */
export function editorUpdates(acl, key, emails) {
  const up = {}, cur = (acl || {})[key] || {};
  emails.forEach(e => { const k = mailKey(e); if (!cur[k]) { up[`teamacl/${key}/${k}`] = 'editor'; up[`myteams/${k}/${key}`] = true; } });
  return up;
}
/** 簽到處：一列一格，各台裝置同時勾不同列不會互相蓋掉 */
export const checkinKey = label => String(label || '').replace(/[.#$\[\]\/]/g, '_');
export function setCheckin(key, rec) {
  const before = state;
  state = { ...state, checkin: { ...(state.checkin || {}), [key]: rec } };
  emit(true);
  remote.write({ [`checkin/${key}`]: JSON.stringify(rec) }).catch(err => { state = before; auth.error = `寫入失敗：${err && err.message ? err.message : err}`; emitAuth(); emit(false); });
}
/** 即時賽程看得到的廣播：最近 20 則，只留時間、場次、桌次與廣播文字 */
function pubCalls(calls) { return JSON.stringify((calls || []).slice(-20).map(c => ({ ts: c.ts, mid: c.mid, tables: c.tables, text: c.text }))); }
function receive(part, value) {
  raw[part] = part === 'm' ? (value || {}) : value;
  // 大會台：即時賽程的廣播和大會台不一致時補寫一次（例如規則更新前的廣播）
  if (ROLE === 'desk' && auth.isAdmin && (part === 'calls' || part === 'pcalls') && raw.calls != null && raw.pcalls != null) {
    const want = pubCalls(parse(raw.calls, []));
    if (want !== raw.pcalls) remote.write({ 'pub/calls': want }).then(bumpV).catch(() => {});
  }
  auth.loaded = true;
  assemble();
  emit(false);
}

// ---------------- 本機 ----------------
function localRemote() {
  const KEY = 'jdb-live-tree';
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { return {}; } };
  const push = () => { const t = load(); const pub = t.pub || {}, desk = t.desk || {};
    raw.meta = pub.meta ?? null; raw.events = pub.events ?? null; raw.m = pub.m || {}; raw.pcalls = pub.calls ?? null; raw.calls = desk.calls ?? null; raw.staff = desk.staff ?? null; raw.staffOrg = desk.staffOrg ?? null; raw.refOpt = desk.refOpt ?? null; raw.dlu = desk.lu ?? null; raw.receipt = desk.receipt ?? null; raw.olu = t.olu || null; raw.teamacl = t.teamacl || null; raw.nudge = t.nudge || null; raw.refcode = desk.refcode ?? null; raw.refgen = pub.refgen ?? null; raw.notices = desk.notices ?? null; raw.checkin = t.checkin || {}; raw.parking = t.parking ?? null;
    auth.loaded = true; assemble(); };
  window.addEventListener('storage', e => { if (e.key === KEY) { push(); emit(false); } });
  push();
  return {
    stamp: () => Date.now(),
    async write(up) {
      const t = load();
      for (const [path, v] of Object.entries(up)) {
        const parts = path.split('/'); let o = t;
        parts.slice(0, -1).forEach(p => { o = o[p] = (o[p] && typeof o[p] === 'object') ? o[p] : {}; });
        if (v === null) delete o[parts[parts.length - 1]]; else o[parts[parts.length - 1]] = v;
      }
      localStorage.setItem(KEY, JSON.stringify(t));
      if (Object.keys(up).some(k => /^(olu|teamacl|nudge|desk\/refcode|pub\/refgen)/.test(k))) { push(); emit(false); }
    },
    async setHistory(key, v) { const h = this.history(); if (v == null) delete h[key]; else h[key] = v; localStorage.setItem('jdb-live-history', JSON.stringify(h)); },
    history() { try { return JSON.parse(localStorage.getItem('jdb-live-history') || '{}'); } catch (e) { return {}; } },
  };
}

/** 管理員名單的索引：信箱的點換成逗號（資料庫的索引不能有點） */
export const adminKey = email => String(email || '').toLowerCase().replace(/\./g, ',');

// ---------------- 雲端：即時連線（大會台、裁判頁） ----------------
const SDK = 'https://www.gstatic.com/firebasejs/10.12.2/';
async function sdkRemote() {
  const [{ initializeApp }, db, au] = await Promise.all([import(`${SDK}firebase-app.js`), import(`${SDK}firebase-database.js`), (ROLE === 'desk' || ROLE === 'checkin' || ROLE === 'ref') ? import(`${SDK}firebase-auth.js`) : Promise.resolve(null)]);
  const app = initializeApp(FIREBASE);
  const database = db.getDatabase(app);
  const at = p => db.ref(database, `${ROOT}/${p}`);
  const fail = err => { auth.error = `讀取失敗：${err.message}`; emitAuth(); };
  // 裁判紀錄區、簽到處：分頁切到背景超過 1 分鐘就先斷線，回到畫面再自動連上（不佔連線名額、不耗下載量）
  if (ROLE === 'ref' || ROLE === 'checkin') {
    let t = null;
    document.addEventListener('visibilitychange', () => {
      clearTimeout(t);
      if (document.hidden) t = setTimeout(() => db.goOffline(database), 60000); else db.goOnline(database);
    });
  }
  db.onValue(at('pub/meta'), s => receive('meta', s.val()), fail);
  db.onValue(at('pub/events'), s => receive('events', s.val()), fail);
  db.onValue(at('pub/m'), s => receive('m', s.val()), fail);
  if (ROLE === 'desk' || ROLE === 'checkin') db.onValue(at('parking'), s => receive('parking', s.val()), fail);
  if (ROLE === 'desk' || ROLE === 'ref') db.onValue(at('pub/refgen'), s => receive('refgen', s.val()), fail);
  // 裁判紀錄區：用匿名身分登入，輸入密碼後才能記分（大會台換密碼，舊的立刻失效）
  if (au && ROLE === 'ref') {
    const a = au.getAuth(app);
    let ready, uid = null; const waitUid = new Promise(r => { ready = r; });
    au.onAuthStateChanged(a, user => { if (user) { uid = user.uid; ready(uid); } else au.signInAnonymously(a).catch(err => { auth.error = `無法取得裁判身分：${err.message}`; emitAuth(); ready(null); }); });
    refUnlockImpl = async code => { const u = uid || await waitUid; if (!u) throw new Error('無法取得裁判身分'); await db.set(at(`refauth/${u}`), String(code)); };
  } else if (au) {
    const a = au.getAuth(app);
    let offs = [];
    au.onAuthStateChanged(a, async user => {
      auth.ready = true; auth.user = user ? user.email : null; auth.error = '';
      // 管理員：兩個交大盃信箱，或由它們加入且尚未到期的帳號
      auth.isAdmin = !!user && ADMINS.includes(user.email);
      auth.nick = !user ? '' : user.email === 'nctugtt@gmail.com' ? '女桌' : user.email === 'nctuttc@gmail.com' ? '交大盃' : '';
      if (user && !auth.isAdmin) {
        try { const v = (await db.get(db.ref(database, `admins/${adminKey(user.email)}`))).val(); auth.isAdmin = !!v && v.until > Date.now(); auth.nick = (v && v.name) || ''; } catch (e) { auth.isAdmin = false; }
      }
      offs.forEach(f => f()); offs = [];
      if (auth.isAdmin) offs = [db.onValue(at('desk/calls'), s => receive('calls', s.val()), fail), db.onValue(at('desk/staff'), s => receive('staff', s.val()), fail), db.onValue(at('desk/staffOrg'), s => receive('staffOrg', s.val()), fail), db.onValue(at('desk/refOpt'), s => receive('refOpt', s.val()), fail), db.onValue(at('desk/lu'), s => receive('dlu', s.val()), fail), db.onValue(at('desk/receipt'), s => receive('receipt', s.val()), fail), db.onValue(at('olu'), s => receive('olu', s.val()), fail), db.onValue(at('checkin'), s => receive('checkin', s.val() || {}), fail), db.onValue(at('teamacl'), s => receive('teamacl', s.val()), fail), db.onValue(at('nudge'), s => receive('nudge', s.val()), fail), db.onValue(at('desk/refcode'), s => receive('refcode', s.val()), fail), db.onValue(at('desk/notices'), s => receive('notices', s.val()), fail),
        db.onValue(at('pub/calls'), s => receive('pcalls', s.val() ?? ''), fail)];
      emitAuth();
    });
    auth.signIn = () => au.signInWithPopup(a, new au.GoogleAuthProvider()).catch(err => { auth.error = `登入失敗：${err.message}`; emitAuth(); });
    auth.signOut = () => au.signOut(a);
  }
  return {
    stamp: () => db.serverTimestamp(),
    write: up => db.update(db.ref(database, ROOT), up),
    setHistory: (key, v) => db.set(db.ref(database, `history/${key}`), v),
  };
}

// ---------------- 雲端：定時更新（公開頁，只讀） ----------------
function pollRemote() {
  const base = `${FIREBASE.databaseURL}/${ROOT}/pub`;
  const get = async path => { const r = await fetch(`${base}${path}`); if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); };
  let maxU = 0, rev = null, busy = false;
  const seen = node => { Object.values(node || {}).forEach(n => { if (n && typeof n.u === 'number' && n.u > maxU) maxU = n.u; }); };
  async function full() {
    const pub = (await get('.json')) || {};
    raw.meta = pub.meta ?? null; raw.events = pub.events ?? null; raw.m = pub.m || {}; raw.pcalls = pub.calls ?? null; raw.refgen = pub.refgen ?? null;
    maxU = 0; seen(raw.m); rev = parse(raw.meta, {}).rev ?? null;
    auth.loaded = true; assemble(); emit(false);
  }
  let lastV, sinceFull = 0;
  async function tick() {
    if (busy || document.hidden) return;
    busy = true;
    try {
      if (!auth.loaded) { lastV = await get('/v.json').catch(() => null); await full(); return; }
      // 先問變動標記（只有幾個位元組）；沒變就不用下載其他資料。每 10 分鐘仍完整檢查一次，避免漏掉
      const v = await get('/v.json').catch(() => null);
      sinceFull++;
      if (v != null && v === lastV && sinceFull < 40) { auth.error = ''; return; }
      lastV = v; sinceFull = 0;
      const meta = await get('/meta.json');
      if ((parse(meta, {}).rev ?? null) !== rev) { await full(); return; }
      if (meta !== raw.meta) { raw.meta = meta; assemble(); emit(false); }
      try { const c = await get('/calls.json'); if (c !== raw.pcalls) { raw.pcalls = c; assemble(); emit(false); } } catch (e) { /* 廣播讀不到不影響其他資料 */ }
      let changed;
      try { changed = await get(`/m.json?orderBy=%22u%22&startAt=${maxU + 1}`); } catch (e) { await full(); return; }
      if (changed && Object.keys(changed).length) { Object.assign(raw.m, changed); seen(changed); assemble(); emit(false); }
      auth.error = '';
    } catch (err) { auth.error = '連線中斷，稍後自動重試'; emitAuth(); } finally { busy = false; }
  }
  tick();
  setInterval(tick, POLL_SECONDS * 1000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
  return { stamp: () => Date.now(), write: async () => { throw new Error('公開頁不可修改資料'); } };
}

// ---------------- 歷屆名次（不分屆，放在資料庫最外層的 history） ----------------
/** 存一屆的名次；v 為 null 時刪除 */
export function saveHistory(key, v) {
  if (!remote.setHistory) return Promise.reject(new Error('尚未連線'));
  return remote.setHistory(key, v == null ? null : JSON.stringify(v));
}
/** 讀出資料庫裡所有屆的名次 */
export async function loadHistory() {
  if (LOCAL) return localRemote.cache ? localRemote.cache.history() : {};
  const r = await fetch(`${FIREBASE.databaseURL}/history.json`);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return (await r.json()) || {};
}

// 連線建立前先放一個暫存的，避免畫面一開始就呼叫 update 時出錯
remote = { stamp: () => Date.now(), write: async () => { throw new Error('尚未連線'); } };
if (LOCAL) remote = localRemote.cache = localRemote();
else if (ROLE === 'public' || ROLE === 'team') remote = pollRemote();
else sdkRemote().then(r => { remote = r; }).catch(err => { auth.error = `無法連線資料庫：${err.message}`; emitAuth(); });
