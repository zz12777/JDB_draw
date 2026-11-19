// 抽籤系統的登入限制：只有管理員（兩個交大盃信箱，或由它們加入且未到期的帳號）能使用。
// 抽籤資料仍只存在這台電腦的瀏覽器，不會上傳；只有步驟 8 的停車證張數會同步到資料庫。
import { FIREBASE, ADMINS, ROOT } from '../live/js/config.js';

const SDK = 'https://www.gstatic.com/firebasejs/10.12.2/';
const gate = document.getElementById('gate');
const who = document.getElementById('who');
const show = html => { gate.hidden = false; gate.querySelector('.gate-body').innerHTML = html; };

try {
  const [{ initializeApp }, db, au] = await Promise.all([import(`${SDK}firebase-app.js`), import(`${SDK}firebase-database.js`), import(`${SDK}firebase-auth.js`)]);
  const app = initializeApp(FIREBASE);
  const auth = au.getAuth(app);
  const key = e => String(e || '').toLowerCase().replace(/\./g, ',');
  au.onAuthStateChanged(auth, async user => {
    let ok = !!user && ADMINS.includes(user.email);
    if (user && !ok) {
      try { const v = (await db.get(db.ref(db.getDatabase(app), `admins/${key(user.email)}`))).val(); ok = !!v && v.until > Date.now(); } catch (e) { ok = false; }
    }
    if (ok) {
      gate.hidden = true;
      // 步驟 8 的停車證：同步到資料庫，簽到處和大會台會讀到（抽籤資料本身仍只存在這台電腦）
      const ref = db.ref(db.getDatabase(app), `${ROOT}/parking`);
      window.__drawCloud = {
        saveParking: obj => db.set(ref, JSON.stringify(obj)),
        loadParking: async () => { const v = (await db.get(ref)).val(); try { return v ? JSON.parse(v) : {}; } catch (e) { return {}; } },
      };
      who.innerHTML = `<button class="btn ghost" id="btn-signout" title="${user.email.replace(/[<>&"]/g, '')}">登出</button>`;
      return;
    }
    who.innerHTML = '';
    show(user
      ? `<p class="gate-err">${user.email.replace(/[<>&]/g, '')} 沒有管理員權限，或權限已到期。</p><button class="btn ghost" id="btn-signout">改用其他帳號</button>`
      : '<p>僅限管理員登入</p><button class="btn" id="btn-signin">以 Google 帳號登入</button>');
  });
  document.addEventListener('click', ev => {
    if (ev.target.closest('#btn-signin')) au.signInWithPopup(auth, new au.GoogleAuthProvider()).catch(err => show(`<p class="gate-err">登入失敗：${err.message}</p><button class="btn" id="btn-signin">再試一次</button>`));
    if (ev.target.closest('#btn-signout')) au.signOut(auth);
  });
} catch (err) {
  show(`<p class="gate-err">無法連線登入服務，請確認網路後重新整理。</p>`);
}
