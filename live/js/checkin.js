// 簽到處：不用登入。有團體賽的隊伍勾「已簽到且領點單」，只報個人賽的勾「已簽到」，備註寫給大會看。
import { fmtTime } from './model.js';
import { getState, subscribe, onAuth, auth, setCheckin } from './store.js';
import { esc, $, icon, header, toast } from './ui.js';
import { checkinSections, signinWord, signinTitle } from './units.js';

let q = '', onlyTodo = false, pending = false;

function render() {
  const s = getState();
  $('#top').innerHTML = header(s, '簽到處', []);
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
        const word = sec.team ? '已簽到且領點單' : '已簽到';
        return `<div class="ckr ${x.ok ? 'ok' : ''}"><div class="ckn">${esc(r.label)}</div>
          <button class="ckb" data-ck="${esc(r.key)}" aria-pressed="${x.ok ? 'true' : 'false'}"><span class="box">${x.ok ? icon('check') : ''}</span>${word}${x.ok && x.t ? `<span class="ckt">${fmtTime(x.t)}</span>` : ''}</button>
          <input type="text" class="ckm" data-note="${esc(r.key)}" value="${esc(x.note || '')}" placeholder="備註"></div>`;
      }).join('')}</div></div>`;
  }).join('');
  $('#main').innerHTML = `<div class="panel"><div class="row"><label class="sbox" style="flex:1;min-width:200px">${icon('search')}<input id="q" class="search" type="search" placeholder="學校或隊名" value="${esc(q)}"></label>
      <div class="pills"><button class="${onlyTodo ? '' : 'on'}" data-todo="0">全部</button><button class="${onlyTodo ? 'on' : ''}" data-todo="1">未簽到</button></div>
      <span class="small muted">已簽到 ${done} / ${all.length}</span>
      <button class="btn ghost sm" data-dlsign>${icon('download')}下載簽到表 Word</button></div>
      <p class="small muted" style="margin:8px 0 0">名單來自大會台匯入的最新籤表，大會台重新匯入後，這裡和簽到表會自動更新。</p></div>
    ${body || '<div class="panel"><p class="small muted" style="text-align:center">沒有符合的名單。</p></div>'}`;
}

// 有人在打備註時先不重畫，離開輸入框後再更新
const typing = () => { const a = document.activeElement; return a && a.matches && a.matches('input.ckm, #q'); };
function refresh() { if (typing()) { pending = true; return; } pending = false; render(); }
subscribe(refresh);
onAuth(refresh);

document.addEventListener('click', ev => {
  const b = ev.target.closest('[data-ck],[data-todo],[data-dlsign]');
  if (!b) return;
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
