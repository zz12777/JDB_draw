// 簽到處：管理員登入後使用。各隊勾「已簽到」，有團體賽的隊伍同時領點單；備註寫給大會看。
import { fmtTime } from './model.js';
import { getState, subscribe, onAuth, auth, setCheckin, writePaths, teamKey, mailKey } from './store.js';
import { esc, $, icon, header, toast } from './ui.js';
import { checkinSections, signinWord, signinTitle } from './units.js';

let q = '', onlyTodo = false, pending = false;

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
        const word = '已簽到';
        return `<div class="ckr ${x.ok ? 'ok' : ''}"><div class="ckn">${esc(r.label)}${r.park ? `<span class="ckp" title="停車證張數">停車證 ${r.park} 張</span>` : ''}</div>
          <button class="ckb" data-ck="${esc(r.key)}" aria-pressed="${x.ok ? 'true' : 'false'}"><span class="box">${x.ok ? icon('check') : ''}</span>${word}${x.ok && x.t ? `<span class="ckt">${fmtTime(x.t)}</span>` : ''}</button>
          <input type="text" class="ckm" data-note="${esc(r.key)}" value="${esc(x.note || '')}" placeholder="備註">${sec.team ? mailRow(sec.code, r) : ''}</div>`;
      }).join('')}</div></div>`;
  }).join('');
  $('#main').innerHTML = `<div class="panel"><div class="row"><label class="sbox" style="flex:1;min-width:200px">${icon('search')}<input id="q" class="search" type="search" placeholder="學校或隊名" value="${esc(q)}"></label>
      <div class="pills"><button class="${onlyTodo ? '' : 'on'}" data-todo="0">全部</button><button class="${onlyTodo ? 'on' : ''}" data-todo="1">未簽到</button></div>
      <span class="small muted">已簽到 ${done} / ${all.length}</span>
      <button class="btn ghost sm" data-dlsign>${icon('download')}下載簽到表 Word</button></div>
      <p class="small muted" style="margin:8px 0 0">資料以大會台匯入的各項目完成籤表為基準。大會台重新匯入後，簽到名單與簽到表會自動更新。也可以按 Ctrl+F（Mac 為 ⌘+F）搜尋學校。</p></div>
    ${body || '<div class="panel"><p class="small muted" style="text-align:center">沒有符合的名單。</p></div>'}`;
}

/** 線上點單：隊伍要加入的信箱，加入後成為該隊共同編輯 */
function mailRow(ev, r) {
  const acl = getState().teamacl || {};
  const names = r.names || [r.label];
  const n = t => Object.keys(acl[teamKey(ev, t)] || {}).length;
  const all = names.map(t => teamKey(ev, t)).join(' ');
  return `<div class="ckmail"><span class="small muted nowrap">${icon('list')}填點單信箱</span>
    ${names.length > 1 ? `<select data-mteam="${esc(r.key)}"><option value="${esc(all)}">全部 ${names.length} 隊</option>${names.map(t => `<option value="${esc(teamKey(ev, t))}">${esc(t)}（${n(t)}）</option>`).join('')}</select>` : `<span class="small muted">${n(names[0])} 個</span>`}
    <input type="email" class="ckm" data-mail="${esc(r.key)}" data-tk="${esc(teamKey(ev, names[0]))}" placeholder="加入可填點單的信箱"><button class="btn ghost sm" data-addmail="${esc(r.key)}">${icon('plus')}加入</button></div>`;
}

// 有人在打備註時先不重畫，離開輸入框後再更新
const typing = () => { const a = document.activeElement; return a && a.matches && a.matches('input.ckm, #q, select[data-mteam]'); };
function refresh() { if (typing()) { pending = true; return; } pending = false; render(); }
subscribe(refresh);
onAuth(refresh);

document.addEventListener('click', ev => {
  const b = ev.target.closest('[data-ck],[data-todo],[data-dlsign],[data-signin],[data-signout],[data-addmail]');
  if (!b) return;
  if (b.dataset.signin !== undefined) { auth.signIn && auth.signIn(); return; }
  if (b.dataset.signout !== undefined) { ev.preventDefault(); auth.signOut && auth.signOut(); return; }
  if (b.dataset.addmail) {
    const inp = $(`[data-mail="${b.dataset.addmail}"]`), sel = $(`[data-mteam="${b.dataset.addmail}"]`);
    const tks = (sel ? sel.value : inp.dataset.tk).split(' ').filter(Boolean), e = inp.value.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) { toast('請輸入正確的信箱'); return; }
    const k = mailKey(e), acl = getState().teamacl || {}, up = {};
    tks.filter(tk => !(acl[tk] || {})[k]).forEach(tk => { up[`teamacl/${tk}/${k}`] = 'editor'; up[`myteams/${k}/${tk}`] = true; });
    if (!Object.keys(up).length) { toast('這個信箱已經可以填寫'); return; }
    writePaths(up).then(() => { inp.value = ''; toast(tks.length > 1 ? `已加入 ${tks.length} 隊，對方用這個信箱登入就能填點單` : '已加入，對方用這個信箱登入就能填點單'); refresh(); }).catch(err => toast(`加入失敗：${err.message || err}`));
    return;
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
  const t = ev.target;
  if (t.dataset.note === undefined) return;
  const k = t.dataset.note, x = (getState().checkin || {})[k] || {};
  if ((x.note || '') !== t.value.trim()) setCheckin(k, { ...x, note: t.value.trim().slice(0, 200) });
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
