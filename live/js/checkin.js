// 簽到處：管理員登入後使用。各隊勾「已簽到」，有團體賽的隊伍同時領點單；備註寫給大會看。
import { fmtTime, derive } from './model.js';
import { getState, subscribe, onAuth, auth, setCheckin, writePaths, teamKey, mailKey, parseMails, ownerUpdates, editorUpdates } from './store.js';
import { esc, $, icon, header, toast } from './ui.js';
import { checkinSections, signinWord, signinTitle } from './units.js';
import { lineupSheetsHtml } from './luprint.js';

let q = '', onlyTodo = false, pending = false;
let dlg = null; // 彈出視窗：{ kind: 'lu' | 'note', key, ev, names, team }

function render() {
  const s = getState();
  $('#top').innerHTML = header(s, '簽到處', [], { account: auth.cloud && auth.user ? `<a href="#" data-signout title="${esc(auth.user)}">登出</a>` : '' });
  if (auth.cloud && !auth.isAdmin) {
    $('#main').innerHTML = !auth.ready ? `<div class="panel"><p class="muted">${auth.error ? esc(auth.error) : '連線中。'}</p></div>`
      : `<div class="panel" style="max-width:480px;margin:40px auto;text-align:center"><h2>簽到處登入</h2>
        ${auth.user ? `<p class="small" style="color:var(--red)">${esc(auth.user)} 沒有權限。</p><button class="btn ghost" data-signout>改用其他帳號</button>` : '<button class="btn" data-signin>以 Google 帳號登入</button>'}
        ${auth.error ? `<p class="small" style="color:var(--red)">${esc(auth.error)}</p>` : ''}</div>`;
    return;
  }
  const secs = checkinSections(s);
  const ci = s.checkin || {};
  const all = secs.flatMap(x => x.rows);
  const done = all.filter(r => ci[r.key] && ci[r.key].ok).length;
  if (!secs.length) {
    $('#main').innerHTML = `<div class="panel"><p class="muted">${auth.loaded ? '大會台還沒有匯入籤表，匯入後這裡會出現簽到名單。' : '讀取中。'}</p>${auth.error ? `<p class="small" style="color:var(--red)">${esc(auth.error)}</p>` : ''}</div>`;
    return;
  }
  const key = q.trim();
  const body = secs.map(sec => {
    const rows = sec.rows.filter(r => (!key || r.label.includes(key)) && (!onlyTodo || !(ci[r.key] && ci[r.key].ok)));
    if (!rows.length) return '';
    const n = sec.rows.filter(r => ci[r.key] && ci[r.key].ok).length;
    return `<div class="panel"><div class="row"><h2 style="margin:0">${esc(sec.title)}</h2><span class="spacer"></span><span class="small muted">${n} / ${sec.rows.length}</span></div>
      <div class="ckl">${rows.map(r => {
        const x = ci[r.key] || {};
        const paper = Object.keys(x.paper || {}).filter(n => x.paper[n]);
        return `<div class="ckr ${x.ok ? 'ok' : ''}"><div class="ckn">${esc(r.label)}${r.park ? `<span class="ckp" title="停車證張數">停車證 ${r.park} 張</span>` : ''}${r.rcpt ? `<span class="ckp rc">${esc(r.rcpt)}</span>` : ''}${paper.map(n => `<span class="ckpaper">${(r.names || []).length > 1 ? `${esc(n)} ` : ''}使用紙本點單</span>`).join('')}
            ${x.note ? `<div class="cknote">${esc(x.note)}</div>` : ''}</div>
          <div class="ckact"><button class="ckb" data-ck="${esc(r.key)}" aria-pressed="${x.ok ? 'true' : 'false'}"><span class="box">${x.ok ? icon('check') : ''}</span>已簽到${x.ok && x.t ? `<span class="ckt">${fmtTime(x.t)}</span>` : ''}</button>
            ${sec.team ? `<button class="btn ghost sm" data-luopen="${esc(r.key)}" data-ev="${esc(sec.code)}">${icon('list')}點單權限</button>` : ''}
            <button class="btn ghost sm ${x.note ? 'on' : ''}" data-noteopen="${esc(r.key)}" title="備註" aria-label="備註">${icon('edit')}</button></div></div>`;
      }).join('')}</div></div>`;
  }).join('');
  $('#main').innerHTML = `<div class="panel"><div class="row"><label class="sbox" style="flex:1;min-width:200px">${icon('search')}<input id="q" class="search" type="search" placeholder="學校或隊名" value="${esc(q)}"></label>
      <div class="pills"><button class="${onlyTodo ? '' : 'on'}" data-todo="0">全部</button><button class="${onlyTodo ? 'on' : ''}" data-todo="1">未簽到</button></div>
      <span class="small muted">已簽到 ${done} / ${all.length}</span>
      <button class="btn ghost sm" data-dlsign>${icon('download')}下載簽到表 Word</button>
      <button class="btn ghost sm" data-luprint>${icon('print')}列印線上點單說明（全部隊伍）</button></div>
      <ul class="small muted" style="margin:8px 0 0;padding-left:20px"><li>資料以大會台匯入的各項目完成籤表為基準。大會台重新匯入後，簽到名單與簽到表會自動更新。</li><li>可以按 Ctrl+F（Mac 為 ⌘+F）搜尋學校。</li></ul></div>
    ${body || '<div class="panel"><p class="small muted" style="text-align:center">沒有符合的名單。</p></div>'}`;
}

// ---------------- 線上點單說明單 ----------------
/** 一隊的說明單資料：項目、隊名、聯絡人與共同編輯 */
const sheetD = { s: null, d: null };
function sheetOf(s, ev, team) {
  const acl = (s.teamacl || {})[teamKey(ev, team)] || {};
  const list = role => Object.entries(acl).filter(([, v]) => v === role).map(([k]) => k.replace(/,/g, '.'));
  // 籤表上的組別與編號，例如 A-2
  if (sheetD.s !== s) { sheetD.s = s; sheetD.d = derive(s); }
  const e = sheetD.d.events.find(x => x.name === ev);
  const g = e && (e.groups || []).find(x => x.teams.includes(team));
  const pos = g ? `${g.letter}-${g.teams.indexOf(team) + 1}` : '';
  return { ev, team, pos, owner: list('owner')[0] || '', editors: [...list('owner').slice(1), ...list('editor')] };
}
function printSheets(list) {
  if (!list.length) { toast('沒有團體賽隊伍'); return; }
  const w = window.open('', '_blank');
  if (!w) { toast('瀏覽器擋住了新視窗，請允許彈出視窗後再按一次'); return; }
  w.document.write('<p style="font-family:sans-serif;padding:20px">產生中…</p>');
  // QR code 直接嵌入頁面，列印時不會因為圖片還沒載入而空白
  fetch('img/lineup-qr.svg').then(r => r.text()).then(svg => {
    w.document.open(); w.document.write(lineupSheetsHtml(list, `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`)); w.document.close();
    setTimeout(() => w.print(), 500);
  }).catch(() => { w.close(); toast('QR code 載入失敗，請再試一次'); });
}

// ---------------- 彈出視窗 ----------------
function drawDlg() {
  let host = $('#dlg');
  if (!host) { host = document.createElement('div'); host.id = 'dlg'; document.body.append(host); }
  if (!dlg) { host.innerHTML = ''; return; }
  // 重畫時保留還沒送出的輸入
  const keep = ['downer', 'deditor', 'dnote'].map(id => { const el = document.getElementById(id); return [id, el ? el.value : null]; });
  setTimeout(() => keep.forEach(([id, v]) => { const el = document.getElementById(id); if (el && v != null && !el.value) el.value = v; }));
  const s = getState(), ci = (s.checkin || {})[dlg.key] || {};
  if (dlg.kind === 'note') {
    host.innerHTML = `<div class="modal-bg"><div class="modal" style="width:min(460px,100%)"><div class="row"><h2 style="margin:0">備註</h2><span class="spacer"></span><button class="btn ghost sm" data-dclose aria-label="關閉">${icon('close')}</button></div>
      <p class="small muted">${esc(dlg.label)}。寫給大會看，大會台即時看得到。</p>
      <textarea id="dnote" rows="4" style="width:100%">${esc(ci.note || '')}</textarea>
      <div class="row" style="justify-content:flex-end;margin-top:10px"><button class="btn" data-dnote>${icon('check')}儲存</button></div></div></div>`;
    setTimeout(() => { const t = $('#dnote'); if (t) t.focus(); });
    return;
  }
  const acl = s.teamacl || {}, key = teamKey(dlg.ev, dlg.team);
  const list = role => Object.entries(acl[key] || {}).filter(([, v]) => v === role).map(([k]) => k.replace(/,/g, '.'));
  const own = list('owner'), eds = list('editor'), paper = !!(ci.paper || {})[dlg.team];
  const many = dlg.names.length > 1;
  host.innerHTML = `<div class="modal-bg"><div class="modal" style="width:min(520px,100%)"><div class="row"><h2 style="margin:0">點單權限</h2><span class="spacer"></span><button class="btn ghost sm" data-dclose aria-label="關閉">${icon('close')}</button></div>
    ${many ? `<div class="pills" style="margin:8px 0">${dlg.names.map(n => `<button class="${n === dlg.team ? 'on' : ''}" data-dteam="${esc(n)}">${esc(n)}</button>`).join('')}</div>` : `<p style="margin:6px 0"><b>${esc(dlg.team)}</b></p>`}
    <table class="list"><tbody>
      <tr><td class="nowrap muted small">聯絡人</td><td>${own.length ? own.map(esc).join('<br>') : '<span class="muted">未設定</span>'}</td></tr>
      <tr><td class="nowrap muted small">共同編輯</td><td>${eds.length ? eds.map(esc).join('<br>') : '<span class="muted">無</span>'}</td></tr></tbody></table>
    <div class="row" style="justify-content:flex-end;margin-top:6px"><button class="btn ghost sm" data-luprint1>${icon('print')}列印這隊的點單說明</button></div>
    <p style="margin:12px 0 6px"><b>聯絡人今天會在場負責填點單嗎？</b></p>
    <div class="dform"><label class="small" for="downer">更新聯絡人（取代原本的聯絡人，可以新增其他帳號一起編輯點單）</label>
      <div class="row"><input type="email" id="downer" placeholder="Google 帳號" style="flex:1;min-width:200px"><button class="btn sm" data-downer>取代聯絡人</button></div></div>
    <div class="dform"><label class="small" for="deditor">加入共同編輯（可以填點單，不能新增其他帳號）</label>
      <div class="row"><input type="email" id="deditor" placeholder="Google 帳號" style="flex:1;min-width:200px"><button class="btn ghost sm" data-deditor>${icon('plus')}加入</button></div></div>
    ${many ? `<label class="dall"><input type="checkbox" id="dall" ${dlg.all ? 'checked' : ''}>套用到同單位全部 ${dlg.names.length} 隊</label>` : ''}
    <div class="dpaper"><label style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="dpaper" ${paper ? 'checked' : ''}><b>使用紙本點單</b></label></div>
  </div></div>`;
}
const dlgTeams = () => (dlg.all ? dlg.names : [dlg.team]);
function aclWrite(kind) {
  const inp = $(kind === 'owner' ? '#downer' : '#deditor'), mails = parseMails(inp.value);
  if (!mails.length) { toast('請輸入正確的信箱'); return; }
  const acl = getState().teamacl || {}, up = {};
  dlgTeams().forEach(n => Object.assign(up, (kind === 'owner' ? ownerUpdates : editorUpdates)(acl, teamKey(dlg.ev, n), kind === 'owner' ? mails : mails)));
  if (!Object.keys(up).length) { toast('這個信箱已經可以填寫'); return; }
  const typed = inp.value; inp.value = '';
  writePaths(up).then(() => { toast(kind === 'owner' ? '已更新聯絡人' : '已加入共同編輯'); drawDlg(); }).catch(err => { const el = $(kind === 'owner' ? '#downer' : '#deditor'); if (el) el.value = typed; toast(`更新失敗：${err.message || err}`); });
}

// 有人在打備註時先不重畫，離開輸入框後再更新
const typing = () => { const a = document.activeElement; return a && a.matches && a.matches('#q, #dlg input[type=email], #dlg textarea'); };
function refresh() { if (typing()) { pending = true; return; } pending = false; render(); if (dlg) drawDlg(); }
subscribe(refresh);
onAuth(refresh);

document.addEventListener('click', ev => {
  if (ev.target.classList && ev.target.classList.contains('modal-bg')) { dlg = null; drawDlg(); return; }
  const b = ev.target.closest('[data-luprint],[data-luprint1],[data-ck],[data-todo],[data-dlsign],[data-signin],[data-signout],[data-luopen],[data-noteopen],[data-dclose],[data-dnote],[data-dteam],[data-downer],[data-deditor]');
  if (!b) return;
  const d = b.dataset;
  if (d.signin !== undefined) { auth.signIn && auth.signIn(); return; }
  if (d.signout !== undefined) { ev.preventDefault(); auth.signOut && auth.signOut(); return; }
  const rowOf = key => checkinSections(getState()).flatMap(x => x.rows.map(r => ({ ...r, ev: x.code }))).find(r => r.key === key);
  if (d.luprint !== undefined) { const s = getState(); printSheets(checkinSections(s).filter(x => x.team).flatMap(sec => sec.rows.flatMap(r => (r.names || [r.label]).map(n => sheetOf(s, sec.code, n))))); return; }
  if (d.luprint1 !== undefined) { printSheets([sheetOf(getState(), dlg.ev, dlg.team)]); return; }
  if (d.luopen) { const r = rowOf(d.luopen); const names = r.names || [r.label]; dlg = { kind: 'lu', key: r.key, ev: r.ev, names, team: names[0], label: r.label }; drawDlg(); return; }
  if (d.noteopen) { const r = rowOf(d.noteopen); dlg = { kind: 'note', key: r.key, label: r.label }; drawDlg(); return; }
  if (d.dclose !== undefined) { dlg = null; drawDlg(); refresh(); return; }
  if (d.dteam) { dlg.team = d.dteam; drawDlg(); return; }
  if (d.downer !== undefined) { aclWrite('owner'); return; }
  if (d.deditor !== undefined) { aclWrite('editor'); return; }
  if (d.dnote !== undefined) {
    const x = (getState().checkin || {})[dlg.key] || {}, v = $('#dnote').value.trim().slice(0, 200);
    setCheckin(dlg.key, { ...x, note: v }); dlg = null; drawDlg(); render(); toast('備註已儲存'); return;
  }
  if (b.dataset.dlsign !== undefined) { downloadSignin(); return; }
  if (b.dataset.todo) { onlyTodo = b.dataset.todo === '1'; render(); return; }
  const k = b.dataset.ck, x = (getState().checkin || {})[k] || {};
  setCheckin(k, { ...x, ok: !x.ok, t: Date.now() });
});
async function downloadSignin() {
  try {
    const s = getState();
    const blob = await signinWord(s);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `${signinTitle(s)}簽到表.docx`;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  } catch (err) { toast(`簽到表產生失敗：${err.message || err}`); }
}
document.addEventListener('change', ev => {
  if (ev.target.id === 'dall' && dlg) { dlg.all = ev.target.checked; return; }
  if (ev.target.id !== 'dpaper' || !dlg) return;
  const x = (getState().checkin || {})[dlg.key] || {}, paper = { ...(x.paper || {}) };
  dlgTeams().forEach(n => { if (ev.target.checked) paper[n] = true; else delete paper[n]; });
  setCheckin(dlg.key, { ...x, paper });
  toast(ev.target.checked ? '已註記使用紙本點單' : '已取消紙本點單');
});
document.addEventListener('input', ev => {
  if (ev.target.id !== 'q') return;
  q = ev.target.value;
  const pos = ev.target.selectionStart;
  render();
  const n = $('#q'); n.focus(); n.setSelectionRange(pos, pos);
});
document.addEventListener('focusout', () => setTimeout(() => { if (pending && !typing()) refresh(); }));
render();
