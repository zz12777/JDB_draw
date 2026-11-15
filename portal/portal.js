// 交大盃籌辦首頁：只有管理員能看。管理員為兩個交大盃信箱，以及由它們加入、尚未到期的帳號。
import { FIREBASE, ADMINS } from '../live/js/config.js';
import { esc, icon, toast } from '../live/js/ui.js';

const SDK = 'https://www.gstatic.com/firebasejs/10.12.2/';
const $ = s => document.querySelector(s);
const key = email => String(email || '').toLowerCase().replace(/\./g, ',');
const base = new URL('../', location.href).href;
const URLS = {
  draw: base,
  desk: `${base}live/desk.html`,
  ref: `${base}live/ref.html`,
  pub: `${base}live/`,
};
const st = { ready: false, user: null, base: false, admin: false, until: null, list: {}, error: '' };

const [{ initializeApp }, db, au] = await Promise.all([import(`${SDK}firebase-app.js`), import(`${SDK}firebase-database.js`), import(`${SDK}firebase-auth.js`)]);
const app = initializeApp(FIREBASE);
const database = db.getDatabase(app);
const auth = au.getAuth(app);
let off = null;

au.onAuthStateChanged(auth, async user => {
  st.ready = true; st.user = user ? user.email : null; st.error = '';
  st.base = !!user && ADMINS.includes(user.email);
  st.admin = st.base; st.until = null;
  if (off) { off(); off = null; }
  if (user && !st.base) {
    try { const v = (await db.get(db.ref(database, `admins/${key(user.email)}`))).val(); if (v && v.until > Date.now()) { st.admin = true; st.until = v.until; } } catch (e) { /* 沒有權限 */ }
  }
  if (st.base) off = db.onValue(db.ref(database, 'admins'), s => { st.list = s.val() || {}; render(); }, err => { st.error = err.message; render(); });
  render();
});

const fmtDate = ts => { const d = new Date(ts); return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`; };
const link = (title, url) => `<div class="lnk"><div><b>${title}</b><code>${esc(url)}</code></div>
  <div class="row" style="gap:6px"><button class="btn ghost sm" data-copy="${esc(url)}" title="複製網址" aria-label="複製網址">${icon('copy')}</button><a class="btn sm" href="${esc(url)}" target="_blank" rel="noopener">開啟</a></div></div>`;

function render() {
  $('#top').innerHTML = `<img src="../live/img/logo.png" alt=""><div><h1>交大盃</h1><div class="sub">籌辦首頁</div></div><span class="spacer"></span>
    ${st.user ? `<a href="#" data-signout>登出 ${esc(st.user)}</a>` : ''}`;
  if (!st.ready) return;
  if (!st.admin) {
    $('#main').innerHTML = `<div class="login"><img src="../live/img/logo.png" alt=""><h2>交大盃籌辦首頁</h2>
      ${st.user ? `<p style="color:var(--red)">${esc(st.user)} 沒有管理員權限，或權限已到期。</p><button class="btn ghost" data-signout>改用其他帳號</button>`
        : '<p>僅限管理員登入</p><button class="btn" data-signin>以 Google 帳號登入</button>'}</div>`;
    return;
  }
  $('#main').innerHTML = `
    <section class="hero"><img src="../live/img/logo.png" alt="">
      <div><h2>交大盃籌辦資源</h2>
        <p>從報名截止到賽後公告，籌辦交大盃會用到的系統與資料都整理在這裡。</p>
        ${st.until ? `<p>你的管理員權限到 ${fmtDate(st.until)} 為止。</p>` : ''}</div></section>

    <div class="sys">
      <div class="panel"><span class="when">報名截止後到賽前</span><h2>${icon('bracket')}抽籤系統</h2>
        <ul>
          <li>上傳報名表單回應，自動整理各項目名單</li>
          <li>名單校正：統一校名寫法、檢查重複報名</li>
          <li>下載抽籤順序表、參賽名單 Word、重疊名單 Excel</li>
          <li>籤表規劃：個人賽分區人數、團體賽分組方式</li>
          <li>抽籤：同校盡量分開、種子固定籤位，可手動對調</li>
          <li>下載完成籤表 Excel，自動檢查同校相遇</li>
          <li>產生點單 Word 與 PDF</li>
          <li>估算並下載賽程時間表 Excel</li>
          <li>猛將資料庫：查詢歷屆名次</li>
        </ul>
        <p class="small muted">資料只存在使用中的電腦，換電腦前請先在系統內儲存專案檔。</p>
        <div class="links">${link('抽籤系統', URLS.draw)}</div></div>

      <div class="panel"><span class="when">比賽當日</span><h2>${icon('tables')}當日賽務系統</h2>
        <ul>
          <li>匯入最終籤表、參賽名單、賽程時間表</li>
          <li>輪次表：前輪完賽、點單收發、可開賽一目了然</li>
          <li>輸入桌次即開賽，記錄時間並產生廣播稿</li>
          <li>依紙本點單登錄排點，重複排點自動擋下</li>
          <li>裁判以手機記錄每局比分、回報未到</li>
          <li>大會核對後確認成績，自動晉級與排名</li>
          <li>球桌看板、決賽抽籤、裁判名單與擔任次數</li>
          <li>公布成績公告</li>
          <li>公開頁：賽程、時間表、成績公告、即時桌況</li>
        </ul>
        <p class="small muted">資料存在雲端資料庫，多台電腦與手機即時同步。大會台需以管理員帳號登入。</p>
        <div class="links">${link('大會台', URLS.desk)}${link('裁判記分', URLS.ref)}${link('公開頁（給參賽者）', URLS.pub)}</div></div>
    </div>

    <div class="panel"><h2>籌辦流程</h2><div class="flow">
      <div><b>報名截止</b><span>下載表單回應</span></div>
      <div><b>名單與抽籤</b><span>抽籤系統完成名單校正、規劃與抽籤</span></div>
      <div><b>賽前資料</b><span>完成籤表、點單、時間表、參賽名單</span></div>
      <div><b>比賽當日</b><span>當日賽務系統匯入資料後開始派桌</span></div>
      <div><b>賽後</b><span>公布成績，更新猛將資料庫</span></div>
    </div></div>

    <div class="panel"><h2>相關資源</h2><div class="res">
      <a href="https://docs.google.com/spreadsheets/d/1oXrar8-PJ2dkPQxfqPcpRjuZymbHljeCh486AXuX5Cc/edit?usp=sharing" target="_blank" rel="noopener"><b>猛將資料庫試算表</b><span>歷屆名次，請用交大盃信箱開啟編輯</span></a>
      <a href="https://forms.gle/2qHN331qs5mY14m78" target="_blank" rel="noopener"><b>問題回報與建議</b><span>系統問題或改進建議</span></a>
      <a href="https://console.firebase.google.com/project/nctu-ttc/overview" target="_blank" rel="noopener"><b>Firebase 主控台</b><span>當日系統的資料庫與登入設定</span></a>
      <a href="https://github.com/zz12777/JDB_draw" target="_blank" rel="noopener"><b>程式碼</b><span>GitHub 上的抽籤系統與當日系統</span></a>
    </div></div>

    ${st.base ? adminPanel() : ''}`;
}

function adminPanel() {
  const rows = Object.entries(st.list).sort((a, b) => a[1].until - b[1].until);
  const def = new Date(Date.now() + 30 * 864e5);
  const iso = `${def.getFullYear()}-${String(def.getMonth() + 1).padStart(2, '0')}-${String(def.getDate()).padStart(2, '0')}`;
  return `<div class="panel adm"><h2>管理員</h2>
    <p class="small muted">nctugtt@gmail.com 與 nctuttc@gmail.com 為常設管理員，可加入其他 Google 帳號並設定到期日。加入的管理員可以登入本頁與大會台，到期後自動失效。</p>
    <div class="row" style="margin-bottom:12px"><input type="email" id="ne" placeholder="Google 帳號信箱"><label class="small">到期日 <input type="date" id="nd" value="${iso}"></label><button class="btn" data-add>加入</button></div>
    ${st.error ? `<p class="small" style="color:var(--red)">${esc(st.error)}</p>` : ''}
    <table class="list"><thead><tr><th>信箱</th><th>到期日</th><th>加入者</th><th></th></tr></thead><tbody>
      ${ADMINS.map(e => `<tr><td>${esc(e)}</td><td class="exp">常設</td><td></td><td></td></tr>`).join('')}
      ${rows.map(([k, v]) => { const over = v.until <= Date.now();
        return `<tr><td>${esc(v.email)}</td><td class="exp ${over ? 'over' : ''}">${fmtDate(v.until)}${over ? '（已到期）' : ''}</td><td class="small muted">${esc(v.by || '')}</td>
          <td class="nowrap" style="text-align:right"><button class="btn ghost sm" data-extend="${esc(k)}">延長 30 天</button> <button class="btn ghost sm danger" data-remove="${esc(k)}">移除</button></td></tr>`; }).join('')}
    </tbody></table></div>`;
}

document.addEventListener('click', async ev => {
  const t = ev.target.closest('button, a[data-signout]');
  if (!t) return;
  const d = t.dataset;
  if ('signin' in d) au.signInWithPopup(auth, new au.GoogleAuthProvider()).catch(err => toast(`登入失敗：${err.message}`));
  else if ('signout' in d) { ev.preventDefault(); au.signOut(auth); }
  else if (d.copy) { try { await navigator.clipboard.writeText(d.copy); toast('已複製網址'); } catch (e) { toast('無法複製，請手動選取'); } }
  else if ('add' in d) {
    const email = $('#ne').value.trim().toLowerCase(), date = $('#nd').value;
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { toast('請輸入正確的信箱'); return; }
    if (ADMINS.includes(email)) { toast('這個帳號已經是常設管理員'); return; }
    if (!date) { toast('請選擇到期日'); return; }
    const until = new Date(`${date}T23:59:59`).getTime();
    if (until <= Date.now()) { toast('到期日要在今天之後'); return; }
    try { await db.set(db.ref(database, `admins/${key(email)}`), { email, until, by: st.user, at: Date.now() }); toast(`已加入 ${email}，到期日 ${fmtDate(until)}`); }
    catch (err) { toast(`加入失敗：${err.message}`); }
  } else if (d.extend) {
    const v = st.list[d.extend]; const until = Math.max(v.until, Date.now()) + 30 * 864e5;
    try { await db.update(db.ref(database, `admins/${d.extend}`), { until }); toast(`已延長至 ${fmtDate(until)}`); } catch (err) { toast(`失敗：${err.message}`); }
  } else if (d.remove) {
    try { await db.remove(db.ref(database, `admins/${d.remove}`)); toast('已移除'); } catch (err) { toast(`失敗：${err.message}`); }
  }
});
render();
