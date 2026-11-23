// 線上點單：各隊聯絡人用報名表上的信箱登入，替自己的隊伍填每一場的點單。
// 只能選隊伍名單上的人；大會台派桌後鎖定。聯絡人可以再加最多 3 個信箱一起填。
// 對手看不到；大會台派桌時自動帶入排點。
import { derive, EVENT_FULL, POINTS, fmtTime, sideText, matchTitle } from './model.js';
import { getState, subscribe, onAuth, auth, teamKey, mailKey } from './store.js';
import { esc, $, $$, icon, toast, header, lineName } from './ui.js';
import { slotOf } from './timetable.js';
import { me, onMe, signIn, signOut, watch, write, myKey } from './teamcloud.js';

const MAX_EDITORS = 3;
let teams = null;          // 我可以填的隊伍代號
let cur = null;            // 目前選的隊伍代號
let acl = null;            // 目前隊伍的權限表 {信箱代號: owner|editor}
let olu = {};              // 目前隊伍各場已送出的點單 {場次: {lu, by, ts}}
let open = null;           // 展開填寫的場次
let draft = {};            // 填到一半的點單 {場次: [...]}
const offs = [];

/** 隊伍代號拆回項目與隊名（以籤表為準） */
function teamInfo(key) {
  const s = getState();
  for (const e of s.events || []) for (const t of Object.keys(e.rosters || {})) if (teamKey(e.name, t) === key) return { ev: e.name, team: t, roster: [...new Set((e.rosters[t] || []).flat().filter(Boolean))] };
  // 名單還沒匯入時，從籤表的隊名找
  const D = derive(s);
  for (const m of D.byId.values()) if (m.team) for (const S of [m.A, m.B]) if (S && S.name && teamKey(m.ev, S.name) === key) return { ev: m.ev, team: S.name, roster: [] };
  const i = key.indexOf('|');
  return { ev: key.slice(0, i), team: key.slice(i + 1), roster: [] };
}

function render() {
  const s = getState();
  $('#top').innerHTML = header(s, '線上點單', [], { account: me.email ? `<a href="#" data-out title="${esc(me.email)}">登出</a>` : '' });
  const main = $('#main');
  if (!me.ready) { main.innerHTML = '<div class="panel"><p class="muted">連線中。</p></div>'; return; }
  if (!me.email) {
    main.innerHTML = `<div class="panel" style="text-align:center"><h2>線上點單</h2>
      <p>請用<b>報名表上填寫的聯絡人信箱</b>登入。<br>聯絡人可以再加入最多 3 個信箱一起填寫。</p>
      <button class="btn" data-in>以 Google 帳號登入</button>
      <p class="small muted" style="margin-top:12px">聯絡人信箱不是 Gmail 的話，可以用同一個信箱註冊 Google 帳號後登入。</p>
      ${me.error ? `<p class="small" style="color:var(--red)">${esc(me.error)}</p>` : ''}</div>`;
    return;
  }
  if (teams == null) { main.innerHTML = '<div class="panel"><p class="muted">讀取中。</p></div>'; return; }
  if (!teams.length) {
    main.innerHTML = `<div class="panel"><h2>沒有可填寫的隊伍</h2><p>${esc(me.email)} 沒有線上點單權限。</p>
      <p class="small muted">請改用報名表上的聯絡人信箱登入，或請聯絡人把這個信箱加入共同編輯。也可以照常繳交紙本點單。</p>
      <button class="btn ghost" data-out>改用其他帳號</button></div>`;
    return;
  }
  if (!cur || !teams.includes(cur)) { cur = teams[0]; listenTeam(); }
  const info = teamInfo(cur);
  const owner = acl && acl[myKey()] === 'owner';
  const pills = teams.length > 1 ? `<div class="pills" style="margin-bottom:12px">${teams.map(k => { const x = teamInfo(k); return `<button class="${k === cur ? 'on' : ''}" data-team="${esc(k)}">${esc(x.team)}<span class="small"> ${esc(x.ev)}</span></button>`; }).join('')}</div>` : '';
  const D = derive(s);
  const ms = [...D.byId.values()].filter(m => m.team && m.ev === info.ev && ((m.A && m.A.name === info.team) || (m.B && m.B.name === info.team)) && m.status !== 'done' && m.status !== 'reported'
      // 預賽各場一開始就能一起填；決賽要等對手確定才開放
      && (m.stage !== 'F' || (m.A && m.A.name && m.B && m.B.name)))
    .sort((a, b) => (a.stage === 'F') - (b.stage === 'F') || a.num - b.num);
  main.innerHTML = `${pills}<div class="panel"><div class="row"><h2 style="margin:0">${esc(info.team)}</h2><span class="chip">${esc(EVENT_FULL[info.ev] || info.ev)}</span></div>
      <p class="small muted" style="margin:6px 0 0">預賽各場可以一次填好；決賽在對手確定後才會出現。大會派桌後點單就會鎖定。對手看不到你們的點單。也可以照常繳交紙本點單。</p></div>
    ${ms.length ? ms.map(m => matchCard(m, info)).join('') : '<div class="panel"><p class="muted">目前沒有需要填寫點單的場次。</p></div>'}
    ${editorsPanel(owner)}`;
}

function matchCard(m, info) {
  const side = m.A && m.A.name === info.team ? 'a' : 'b';
  const opp = side === 'a' ? m.B : m.A;
  const sub = olu[m.id];
  const locked = !!m.rec.start;
  const slot = slotOf(getState().sched, m);
  const official = m.rec.lineup && m.rec.lineup[side];
  const head = `<div class="row"><b>${esc(matchTitle(m))}</b>${m.group ? `<span class="muted small">${esc(m.group)} 組</span>` : ''}<span class="spacer"></span>${slot ? `<span class="small muted">表定 ${esc(slot.s)}</span>` : ''}</div>
    <div style="margin:4px 0">對手：${esc(sideText(opp, true)) || '<span class="muted">待定</span>'}</div>`;
  const status = locked ? `<span class="chip">${icon('lock')}已鎖定</span>` : sub ? `<span class="chip playing">${icon('check')}已送出 ${fmtTime(sub.ts)}</span>` : '<span class="chip">尚未填寫</span>';
  if (locked) {
    const l = official || (sub && sub.lu);
    return `<div class="panel">${head}<div class="row">${status}<span class="small muted">大會已派桌，點單以大會登錄為準。</span></div>${l ? lineupView(l) : ''}</div>`;
  }
  if (open !== m.id) {
    return `<div class="panel">${head}<div class="row">${status}<span class="spacer"></span><button class="btn ${sub ? 'ghost' : ''} sm" data-open="${esc(m.id)}">${icon('edit')}${sub ? '修改點單' : '填寫點單'}</button></div>
      ${sub ? lineupView(sub.lu) + `<p class="small muted" style="margin:4px 0 0">${esc(sub.by || '')} 送出</p>` : ''}</div>`;
  }
  const l = draft[m.id] || (sub && sub.lu) || [];
  const r = info.roster;
  const sel = (i, j, v) => r.length
    ? `<select data-lu="${i}|${j}"><option value="">選擇選手</option>${r.map(n => `<option ${n === v ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select>`
    : `<input type="text" data-lu="${i}|${j}" value="${esc(v || '')}" placeholder="姓名">`;
  return `<div class="panel">${head}${status}
    <div class="luform">${POINTS.map((p, i) => `<div class="lurow"><span class="lul">第${'一二三四五'[i]}點<small>${p.dbl ? '雙打' : '單打'}</small></span>
      <span class="luin">${p.dbl ? sel(i, 0, (l[i] || [])[0]) + sel(i, 1, (l[i] || [])[1]) : sel(i, null, l[i])}</span></div>`).join('')}</div>
    <p class="small" id="lu-warn" style="color:var(--red);min-height:18px;margin:6px 0"></p>
    <div class="row"><button class="btn" data-send="${esc(m.id)}">${icon('check')}送出點單</button><button class="btn plain" data-cancel>取消</button></div>
    ${r.length ? '' : '<p class="small muted">大會尚未匯入此隊名單，請直接輸入姓名。</p>'}</div>`;
}
const lineupView = l => `<table class="list luview"><tbody>${POINTS.map((p, i) => `<tr><td class="muted small nowrap">第${'一二三四五'[i]}點 ${p.dbl ? '雙' : '單'}</td><td>${esc(lineName(l, i)) || '<span class="muted">未填</span>'}</td></tr>`).join('')}</tbody></table>`;

function editorsPanel(owner) {
  const list = Object.entries(acl || {});
  const ed = list.filter(([, v]) => v === 'editor').map(([k]) => k.replace(/,/g, '.'));
  const own = list.filter(([, v]) => v === 'owner').map(([k]) => k.replace(/,/g, '.'));
  return `<div class="panel"><h2>可以填寫點單的信箱</h2>
    <table class="list"><tbody>${own.map(e => `<tr><td>${esc(e)}</td><td class="small muted">聯絡人</td><td></td></tr>`).join('')}
    ${ed.map(e => `<tr><td>${esc(e)}</td><td class="small muted">共同編輯</td><td style="text-align:right">${owner ? `<button class="btn plain sm" data-rmed="${esc(e)}">移除</button>` : ''}</td></tr>`).join('')}</tbody></table>
    ${owner ? (ed.length < MAX_EDITORS ? `<div class="row" style="margin-top:8px"><input type="email" id="ed-new" placeholder="輸入 Google 帳號信箱" style="flex:1;min-width:200px"><button class="btn ghost sm" data-added>${icon('plus')}加入共同編輯</button></div>
      <p class="small muted">最多 ${MAX_EDITORS} 個，加入後對方用該信箱登入就能一起填寫。</p>` : `<p class="small muted">已達 ${MAX_EDITORS} 個上限。</p>`) : '<p class="small muted">共同編輯由聯絡人管理。</p>'}</div>`;
}

function readForm() {
  const v = el => (el ? el.value.trim() : '');
  return POINTS.map((p, i) => (p.dbl ? [0, 1].map(j => v($(`[data-lu="${i}|${j}"]`))) : v($(`[data-lu="${i}|null"]`))));
}
function check(l) {
  const flat = l.flat();
  if (flat.some(x => !x)) return '每一點都要填選手';
  // 和大會台排點相同：同一位選手不能排兩點
  const dup = flat.filter((n, i) => flat.indexOf(n) !== i);
  return dup.length ? `${[...new Set(dup)].join('、')} 重複排點` : '';
}

function listenTeam() {
  while (offs.length > 1) offs.pop()();
  acl = null; olu = {};
  const key = cur;
  offs.push(watch(`teamacl/${key}`, v => { if (cur === key) { acl = v || {}; render(); } }));
  // 每一場的點單分開讀：沒有權限的場次不會影響其他場
  const D = derive(getState());
  const info = teamInfo(key);
  [...D.byId.values()].filter(m => m.team && m.ev === info.ev && ((m.A && m.A.name === info.team) || (m.B && m.B.name === info.team))).forEach(m => {
    offs.push(watch(`olu/${m.id}/${key}`, v => { if (cur !== key) return; try { const x = v ? JSON.parse(v) : null; if (x) olu[m.id] = x; else delete olu[m.id]; } catch (e) { /* 格式錯誤略過 */ } render(); }));
  });
}

onMe(() => {
  offs.splice(0).forEach(f => f());
  teams = null; cur = null; acl = null; olu = {};
  if (me.email) offs.push(watch(`myteams/${myKey()}`, v => { teams = Object.keys(v || {}); render(); }));
  render();
});
let lastSig = '';
subscribe(() => {
  // 籤表更新（例如晉級決賽）時，重新讀這隊的場次
  const D = derive(getState());
  const sig = [...D.byId.values()].filter(m => m.team).map(m => `${m.id}:${m.A && m.A.name}:${m.B && m.B.name}`).join(',');
  if (cur && sig !== lastSig) { lastSig = sig; listenTeam(); }
  lastSig = sig;
  const a = document.activeElement;
  if (a && a.matches && a.matches('[data-lu], #ed-new')) return;
  render();
});
onAuth(() => render());

document.addEventListener('click', async ev => {
  const t = ev.target.closest('button, a[data-out]'); if (!t) return;
  const d = t.dataset;
  if ('in' in d) signIn();
  else if ('out' in d) { ev.preventDefault(); signOut(); }
  else if (d.team) { cur = d.team; open = null; listenTeam(); render(); }
  else if (d.open) { open = d.open; render(); }
  else if ('cancel' in d) { if (open) delete draft[open]; open = null; render(); }
  else if (d.send) {
    const l = readForm(), w = check(l);
    $('#lu-warn').textContent = w;
    if (w) return;
    try {
      await write({ [`olu/${d.send}/${cur}`]: JSON.stringify({ lu: l, by: me.email, ts: Date.now() }) });
      delete draft[d.send]; open = null; toast('點單已送出'); render();
    } catch (err) { toast(/permission|PERMISSION/i.test(String(err)) ? '這一場已鎖定或沒有權限，請交紙本點單給大會' : `送出失敗：${err.message || err}`); }
  }
  else if ('added' in d) {
    const e = $('#ed-new').value.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) { toast('請輸入正確的信箱'); return; }
    const k = mailKey(e);
    if ((acl || {})[k]) { toast('這個信箱已經可以填寫'); return; }
    if (Object.values(acl || {}).filter(v => v === 'editor').length >= MAX_EDITORS) { toast(`最多 ${MAX_EDITORS} 個`); return; }
    try { await write({ [`teamacl/${cur}/${k}`]: 'editor', [`myteams/${k}/${cur}`]: true }); toast('已加入'); } catch (err) { toast(`加入失敗：${err.message || err}`); }
  }
  else if (d.rmed) {
    const k = mailKey(d.rmed);
    try { await write({ [`teamacl/${cur}/${k}`]: null, [`myteams/${k}/${cur}`]: null }); toast('已移除'); } catch (err) { toast(`移除失敗：${err.message || err}`); }
  }
});
// 填到一半的內容先記著，資料更新重畫時不會不見；重複的選手標紅
document.addEventListener('change', ev => {
  if (!ev.target.dataset.lu || !open) return;
  draft[open] = readForm();
  const els = $$('[data-lu]'), w = check(draft[open]);
  const warn = $('#lu-warn'); if (warn) warn.textContent = draft[open].flat().some(x => !x) ? '' : w;
  els.forEach(el => el.classList.remove('bad'));
});
render();
