// 交大盃籌辦首頁：只有管理員能看。管理員為兩個交大盃信箱，以及由它們加入、尚未到期的帳號。
import { FIREBASE, ADMINS } from '../live/js/config.js';
import { esc, icon, toast, sysNav } from '../live/js/ui.js';
import { refreshBrand } from '../live/js/brand.js';

const SDK = 'https://www.gstatic.com/firebasejs/10.12.2/';
const $ = s => document.querySelector(s);
const key = email => String(email || '').toLowerCase().replace(/\./g, ',');
// 網站根目錄（不論本頁放在哪一層）
const base = new URL('../', import.meta.url).href;
const URLS = {
  draw: `${base}draw/`,
  desk: `${base}live/desk.html`,
  ref: `${base}live/ref.html`,
  checkin: `${base}live/checkin.html`,
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
  if (st.base) off = db.onValue(db.ref(database, 'admins'), s => { st.list = s.val() || {}; render(); }, err => { st.error = /permission/i.test(err.message) ? '無法讀取管理員名單：資料庫規則尚未更新。請把 live/database.rules.json 的內容貼到 Firebase 的 Realtime Database 規則並發布。' : err.message; render(); });
  render();
});

const fmtDate = ts => { const d = new Date(ts); return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`; };
const link = (title, url, qr) => `<div class="lnk"><div><b>${title}</b><code>${esc(url)}</code></div>
  <div class="row" style="gap:6px">${qr ? `<button class="btn ghost sm" data-qr="${esc(url)}">QR code</button>` : ''}<button class="btn ghost sm" data-copy="${esc(url)}" title="複製網址" aria-label="複製網址">${icon('copy')}</button><a class="btn sm" href="${esc(url)}" target="_blank" rel="noopener">開啟</a></div></div>`;

function render() {
  $('#top').innerHTML = `<img src="${base}live/img/logo.png" alt="" data-brand><div><h1>交大盃</h1><div class="sub">首頁</div></div><span class="spacer"></span>
    <div class="top-actions">${st.admin ? sysNav('home', base) : ''}${st.user ? `<div class="top-group"><a href="#" data-signout title="${esc(st.user)}">登出</a></div>` : ''}</div>`;
  if (!st.ready) return;
  if (!st.admin) {
    $('#main').innerHTML = `<div class="login"><img src="${base}live/img/logo.png" alt="" data-brand><h2>交大盃</h2>
      ${st.user ? `<p style="color:var(--red)">${esc(st.user)} 沒有管理員權限，或權限已到期。</p><button class="btn ghost" data-signout>改用其他帳號</button>`
        : '<p>僅限管理員登入</p><button class="btn" data-signin>以 Google 帳號登入</button>'}</div>`;
    return;
  }
  $('#main').innerHTML = `
    <section class="hero"><img src="${base}live/img/logo.png" alt="" data-brand>
      <div><h2>交大盃籌辦資源</h2>
        ${st.until ? `<p>你的管理員權限到 ${fmtDate(st.until)} 為止。</p>` : ''}
        <div class="row" style="margin-top:12px"><label class="btn ghost">${icon('upload')}選擇圖片<input type="file" accept="image/*" hidden id="vf"></label></div></div></section>

    <div class="sys">
      <div class="panel"><span class="when">報名截止後到賽前</span><h2>${icon('bracket')}抽籤系統</h2>
        <ul>
          <li>上傳報名表單回應，整理各項目名單</li>
          <li>名單校正，統一校名寫法、檢查重複報名</li>
          <li>下載參賽名單 Word、重疊名單 Excel</li>
          <li>籤表規劃</li>
          <li>抽籤，同校盡量分開</li>
          <li>下載完成籤表 Excel，自動檢查同校相遇</li>
          <li>產生點單 Word 與 PDF</li>
          <li>估算並下載賽程時間表 Excel</li>
          <li>猛將資料庫可查詢歷屆名次</li>
        </ul>
        <p class="small muted">資料只存在使用中的電腦，換電腦前請先在系統內儲存專案檔。</p>
        <div class="links">${link('抽籤系統', URLS.draw)}</div></div>

      <div class="panel"><span class="when">比賽當日</span><h2>${icon('tables')}當日賽務系統</h2>
        <ul>
          <li>匯入最終籤表、參賽名單、賽程時間表</li>
          <li>輪次表產生，記錄前輪是否完賽、點單收發情形</li>
          <li>輸入桌次即記錄開打時間並產生廣播稿</li>
          <li>依紙本點單登錄排點</li>
          <li>裁判以手機記錄每局比分、回報未到</li>
          <li>大會核對後確認成績與排名</li>
          <li>包含球桌情形、決賽抽籤、可擔任裁判名單與次數</li>
          <li>成績公告</li>
          <li>即時賽程：賽程、時間表、成績公告、即時桌況</li>
        </ul>
        <p class="small muted">資料存在雲端資料庫，多台電腦與手機即時同步。大會台需以管理員帳號登入。</p>
        <div class="links">${link('大會台', URLS.desk)}${link('裁判紀錄區', URLS.ref)}${link('簽到處', URLS.checkin)}${link('即時賽程（給參賽者）', URLS.pub, true)}</div></div>
    </div>

    <div class="panel"><h2>流程</h2><div class="flow">
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

// ---------------- 視覺 ----------------
// 上傳圖片後，在圓形範圍內拖曳移動、調整大小，存成各頁的標誌與分頁圖示
const D = 300; // 編輯畫布大小
const cr = { img: null, zoom: 1, x: 0, y: 0, bg: '#ffffff', saved: null };
db.onValue(db.ref(database, 'branding'), s => { cr.saved = s.val(); if (!cr.img) render(); }, () => {});

/** 調整視覺的彈出視窗 */
function drawBrand() {
  let host = document.getElementById('vmodal');
  if (!host) { host = document.createElement('div'); host.id = 'vmodal'; document.body.appendChild(host); }
  if (!cr.img) { host.innerHTML = ''; return; }
  host.innerHTML = `<div class="modal-bg"><div class="modal" style="width:min(720px,100%)">
    <div class="row"><h2>調整視覺</h2><span class="spacer"></span><button class="btn ghost sm" data-vcancel aria-label="關閉" title="關閉">${icon('close')}</button></div>
    <div class="vis" style="margin-top:10px">
      <div class="vis-edit"><canvas id="cv" width="${D * 2}" height="${D * 2}" style="width:${D}px;height:${D}px" class="on"></canvas></div>
      <div class="vis-side">
        <label class="small">大小 <input type="range" id="vz" min="1" max="4" step="0.01" value="${cr.zoom}"></label>
        <label class="small">背景 <input type="color" id="vb" value="${cr.bg}"></label>
        <p class="small muted">在圓圈上拖曳可移動圖片。</p>
        <div class="vis-prev"><canvas id="p1" width="120" height="120"></canvas><span class="onblue"><canvas id="p2" width="88" height="88"></canvas></span><canvas id="p3" width="32" height="32"></canvas></div>
        <div class="row"><button class="btn" data-vsave>儲存並套用</button><button class="btn ghost" data-vcancel>取消</button></div>
      </div></div></div></div>`;
  paint();
}
function cover() { return D / Math.min(cr.img.width, cr.img.height); }
function clamp() {
  const s = cover() * cr.zoom, w = cr.img.width * s, h = cr.img.height * s;
  cr.x = Math.max(-(w - D) / 2, Math.min((w - D) / 2, cr.x));
  cr.y = Math.max(-(h - D) / 2, Math.min((h - D) / 2, cr.y));
}
/** 把目前的取景畫到 size 大小的圓形 */
function drawCrop(ctx, size, mask) {
  const k = size / D, s = cover() * cr.zoom * k;
  ctx.clearRect(0, 0, size, size);
  ctx.save();
  if (!mask) { ctx.beginPath(); ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2); ctx.clip(); }
  ctx.fillStyle = cr.bg; ctx.fillRect(0, 0, size, size);
  const w = cr.img.width * s, h = cr.img.height * s;
  ctx.drawImage(cr.img, size / 2 - w / 2 + cr.x * k, size / 2 - h / 2 + cr.y * k, w, h);
  ctx.restore();
  if (mask) { // 編輯畫面：圓圈外加深，看得到被裁掉的部分
    ctx.save(); ctx.fillStyle = 'rgba(20, 35, 59, .55)'; ctx.beginPath(); ctx.rect(0, 0, size, size); ctx.arc(size / 2, size / 2, size / 2 - 1, 0, Math.PI * 2, true); ctx.fill('evenodd');
    ctx.strokeStyle = '#f2b90c'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(size / 2, size / 2, size / 2 - 2, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
  }
}
function paint() {
  const cv = document.getElementById('cv'); if (!cv) return;
  drawCrop(cv.getContext('2d'), D * 2, true);
  ['p1', 'p2', 'p3'].forEach(id => { const c = document.getElementById(id); if (c) drawCrop(c.getContext('2d'), c.width, false); });
}
function exportImg(size, type) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  drawCrop(c.getContext('2d'), size, false);
  const v = c.toDataURL(type, 0.9);
  return v.startsWith(`data:${type}`) ? v : c.toDataURL('image/png');
}
let drag = null;
document.addEventListener('pointerdown', ev => { if (ev.target.id === 'cv' && cr.img) { drag = { x: ev.clientX, y: ev.clientY, ox: cr.x, oy: cr.y }; ev.target.setPointerCapture(ev.pointerId); } });
document.addEventListener('pointermove', ev => { if (!drag) return; cr.x = drag.ox + ev.clientX - drag.x; cr.y = drag.oy + ev.clientY - drag.y; clamp(); paint(); });
document.addEventListener('pointerup', () => { drag = null; });
document.addEventListener('input', ev => {
  if (ev.target.id === 'vz') { cr.zoom = Number(ev.target.value); clamp(); paint(); }
  if (ev.target.id === 'vb') { cr.bg = ev.target.value; paint(); }
});
document.addEventListener('change', ev => {
  if (ev.target.id !== 'vf' || !ev.target.files[0]) return;
  const img = new Image();
  const file = ev.target.files[0];
  ev.target.value = ''; // 同一個檔案可以再選一次
  img.onload = () => { cr.img = img; cr.zoom = 1; cr.x = 0; cr.y = 0; drawBrand(); };
  img.onerror = () => toast('無法讀取這張圖片');
  img.src = URL.createObjectURL(file);
});

// ---------------- 公開頁 QR code ----------------
function qrCanvas(url, size) {
  const qr = window.qrcode(0, 'M'); qr.addData(url); qr.make();
  const n = qr.getModuleCount(), quiet = 4, cell = Math.floor(size / (n + quiet * 2));
  const c = document.createElement('canvas'); c.width = c.height = cell * (n + quiet * 2);
  const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.fillStyle = '#14233b';
  for (let r = 0; r < n; r++) for (let k = 0; k < n; k++) if (qr.isDark(r, k)) g.fillRect((k + quiet) * cell, (r + quiet) * cell, cell, cell);
  return c;
}
function showQr(url) {
  let host = document.getElementById('vmodal');
  if (!host) { host = document.createElement('div'); host.id = 'vmodal'; document.body.appendChild(host); }
  if (!window.qrcode) { toast('QR code 元件載入失敗，請重新整理'); return; }
  const png = qrCanvas(url, 1024).toDataURL('image/png');
  host.innerHTML = `<div class="modal-bg"><div class="modal" style="width:min(420px,100%);text-align:center">
    <div class="row"><h2>即時賽程 QR code</h2><span class="spacer"></span><button class="btn ghost sm" data-qrclose aria-label="關閉" title="關閉">${icon('close')}</button></div>
    <img src="${png}" alt="" style="width:260px;height:260px;margin:12px auto 6px;display:block">
    <p class="small muted" style="word-break:break-all">${esc(url)}</p>
    <a class="btn" href="${png}" download="交大盃即時賽程QRcode.png">${icon('download')}下載圖片</a></div></div>`;
}

document.addEventListener('click', async ev => {
  const t = ev.target.closest('button, a[data-signout]');
  if (!t) return;
  const d = t.dataset;
  if (d.qr) { showQr(d.qr); return; }
  if ('qrclose' in d) { document.getElementById('vmodal').innerHTML = ''; return; }
  if ('vcancel' in d) { cr.img = null; drawBrand(); return; }
  if ('vsave' in d) {
    const b = { logo: exportImg(360, 'image/webp'), icon: exportImg(64, 'image/png') };
    try { await db.set(db.ref(database, 'branding'), b); cr.img = null; refreshBrand(b); drawBrand(); render(); toast('新版視覺已套用'); }
    catch (err) { toast(/permission/i.test(err.message) ? '儲存失敗：資料庫規則尚未更新' : `儲存失敗：${err.message}`); }
    return;
  }
  if ('vreset' in d) { try { await db.remove(db.ref(database, 'branding')); refreshBrand(null); location.reload(); } catch (err) { toast(`失敗：${err.message}`); } return; }
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
    catch (err) { toast(/permission/i.test(err.message) ? '加入失敗：資料庫規則尚未更新，請先發布新版規則' : `加入失敗：${err.message}`); }
  } else if (d.extend) {
    const v = st.list[d.extend]; const until = Math.max(v.until, Date.now()) + 30 * 864e5;
    try { await db.update(db.ref(database, `admins/${d.extend}`), { until }); toast(`已延長至 ${fmtDate(until)}`); } catch (err) { toast(`失敗：${err.message}`); }
  } else if (d.remove) {
    try { await db.remove(db.ref(database, `admins/${d.remove}`)); toast('已移除'); } catch (err) { toast(`失敗：${err.message}`); }
  }
});
render();
