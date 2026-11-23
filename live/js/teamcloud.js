// 線上點單：參賽隊伍登入與讀寫自己隊伍的資料。
// 公開的籤表與比賽資料由 store.js 定時抓；這裡只處理登入、權限（teamacl / myteams）與線上點單（olu）。
// 網址加 ?local 時改用這台電腦的瀏覽器資料，並用 ?as=信箱 假裝登入，示範與測試用。
import { FIREBASE, ROOT } from './config.js';
import { LOCAL, mailKey } from './store.js';

const SDK = 'https://www.gstatic.com/firebasejs/10.12.2/';
export const me = { ready: false, email: '', error: '' };
const meListeners = new Set();
export const onMe = fn => { meListeners.add(fn); fn(me); };
const emitMe = () => meListeners.forEach(fn => fn(me));

let api = null;

function localApi() {
  const KEY = 'jdb-live-tree';
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) { return {}; } };
  const at = (t, path) => path.split('/').reduce((o, p) => (o && typeof o === 'object' ? o[p] : undefined), t);
  const watchers = new Set();
  const fire = () => { const t = load(); watchers.forEach(w => w.cb(at(t, w.path) ?? null)); };
  window.addEventListener('storage', e => { if (e.key === KEY) fire(); });
  const as = new URLSearchParams(location.search).get('as') || '';
  Object.assign(me, { ready: true, email: as.toLowerCase() });
  return {
    watch(path, cb) { const w = { path, cb }; watchers.add(w); cb(at(load(), path) ?? null); return () => watchers.delete(w); },
    async write(up) {
      const t = load();
      for (const [path, v] of Object.entries(up)) {
        const parts = path.split('/'); let o = t;
        parts.slice(0, -1).forEach(p => { o = o[p] = (o[p] && typeof o[p] === 'object') ? o[p] : {}; });
        if (v === null) delete o[parts[parts.length - 1]]; else o[parts[parts.length - 1]] = v;
      }
      localStorage.setItem(KEY, JSON.stringify(t)); fire();
    },
    signIn() { const e = prompt('測試用信箱'); if (e) { me.email = e.toLowerCase(); emitMe(); } },
    signOut() { me.email = ''; emitMe(); },
  };
}

async function cloudApi() {
  const [{ initializeApp }, db, au] = await Promise.all([import(`${SDK}firebase-app.js`), import(`${SDK}firebase-database.js`), import(`${SDK}firebase-auth.js`)]);
  const app = initializeApp(FIREBASE, 'team');
  const database = db.getDatabase(app);
  const a = au.getAuth(app);
  au.onAuthStateChanged(a, user => { me.ready = true; me.email = user ? String(user.email || '').toLowerCase() : ''; me.error = ''; emitMe(); });
  return {
    watch(path, cb) { return db.onValue(db.ref(database, `${ROOT}/${path}`), s => cb(s.val()), err => { me.error = `讀取失敗：${err.message}`; emitMe(); cb(null); }); },
    write: up => db.update(db.ref(database, ROOT), up),
    signIn: () => au.signInWithPopup(a, new au.GoogleAuthProvider()).catch(err => { me.error = `登入失敗：${err.message}`; emitMe(); }),
    signOut: () => au.signOut(a),
  };
}

const ready = (LOCAL ? Promise.resolve(localApi()) : cloudApi()).then(x => { api = x; emitMe(); return x; })
  .catch(err => { me.ready = true; me.error = `無法連線資料庫：${err.message}`; emitMe(); });

export const signIn = () => ready.then(x => x && x.signIn());
export const signOut = () => ready.then(x => x && x.signOut());
export const watch = (path, cb) => { let off = null, dead = false; ready.then(x => { if (x && !dead) off = x.watch(path, cb); }); return () => { dead = true; if (off) off(); }; };
export const write = up => ready.then(x => { if (!x) throw new Error('尚未連線'); return x.write(up); });
export const myKey = () => mailKey(me.email);
