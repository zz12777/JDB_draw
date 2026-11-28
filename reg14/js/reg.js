// 參賽者系統原型：報名者頁面（報名、名單修改、繳費回報、候補順位、共同管理、Q&A）
import { GROUPS, KIND, UNIT_WORD, PAY_TEXT, phase, quotaOf, waitRank, stOf, isCapped, feeOf, payState, paidSum, mine, entryName, fmtMoney, fmtTime, fmtDT, norm, uid } from './model.js';
import { getState, update, subscribe, resetDemo } from './store.js';
import { diffText, applyChange } from './changes.js';
import { esc, $, $$, icon, toast, header, demoBar } from './ui.js';

const ME_KEY = 'jdb-reg14-me';
let me = (() => { try { return localStorage.getItem(ME_KEY) || ''; } catch (e) { return ''; } })();
let view = 'home';  // home | wiz（新增報名）| edit（修改一個組別）
let wiz = null;     // 新增報名的步驟與內容
let edit = null;    // 修改名單的內容
const open = new Set(); // 展開修改紀錄的報名
let qaOpen = false;
const qaShow = new Set();

const REQ = '<span class="req">*</span>';
const LINEUP_NOTE = '本賽事使用線上點單，由聯絡人登入的信箱填寫，聯絡人可以新增其他共同編輯帳號。';

function render() {
  const st = getState(), s = st.settings;
  $('#top').innerHTML = header(s, '報名系統', me ? `<span class="who">${icon('user')}${esc(me)}</span><button class="btn ghost sm" data-out>登出</button>` : '');
  if (!me) { $('#main').innerHTML = demoBar() + loginView() + qaPanel(s); return; }
  const body = view === 'wiz' ? wizView(st) : view === 'edit' ? editView(st) : homeView(st);
  $('#main').innerHTML = demoBar('<button class="btn ghost sm" data-reset>重設示範資料</button>') + body + qaPanel(s);
}

// ---------------- 登入 ----------------
function loginView() {
  return `<div class="panel narrow center"><h2>交大盃報名系統</h2>
    <p class="muted small">用 Google 帳號登入後，可以報名、修改名單、回報匯款、查看候補順位。這個帳號也是之後線上點單的帳號。</p>
    <p class="small">示範模式沒有真的 Google 登入，請輸入任一信箱代替；輸入 <b>contact1@example.com</b> 可以看到已經報名的單位。</p>
    <div class="row" style="justify-content:center"><input id="me" type="email" placeholder="你的 Google 帳號信箱" style="width:min(320px,100%)"><button class="btn" data-login>登入</button></div></div>`;
}
/** 登入後：還沒報名過就直接進新增報名 */
function afterLogin() { const st = getState(); if (phase(st) === 'open' && !mine(st, me).length) startWiz(); else view = 'home'; }

// ---------------- Q&A ----------------
function qaPanel(s) {
  const qa = s.qa || [];
  const contact = `還有其他問題歡迎來信 <a href="mailto:${esc(s.contactMail)}">${esc(s.contactMail)}</a>，或<a href="${esc(s.fbUrl)}" target="_blank" rel="noopener">私訊臉書粉專</a>。`;
  return `<div class="panel qa"><button class="lnk" data-qa>${icon(qaOpen ? 'chevup' : 'chevdown')}報名 Q&amp;A</button>
    ${qaOpen ? `<div class="qal">${qa.map(x => `<div class="qai ${qaShow.has(x.id) ? 'on' : ''}"><button class="qaq" data-qaq="${x.id}">${icon(qaShow.has(x.id) ? 'chevup' : 'chevdown')}<span>${esc(x.q)}</span></button>${qaShow.has(x.id) ? `<div class="qaa">${esc(x.a).replace(/\n/g, '<br>')}</div>` : ''}</div>`).join('')}</div>
      <p class="small muted" style="margin:10px 0 0">${contact}</p>` : ''}</div>`;
}

// ---------------- 首頁 ----------------
function homeView(st) {
  const s = st.settings, ph = phase(st);
  const list = mine(st, me);
  const t = s.timeline;
  const period = `報名期間 ${fmtDT(t.open)} 至 ${fmtDT(t.close)}，名單修改截止 ${fmtDT(t.editClose)}`;
  const rule = '<p class="small" style="margin:6px 0 0">提交報名表並完成匯款回報，才算報名成功；有名額限制的項目依完成匯款回報的時間先後計算。</p>';
  const banner = ph === 'open' ? `<div class="panel"><div class="row"><h2 style="margin:0">報名中</h2><span class="muted small">${period}</span><span class="spacer"></span><button class="btn" data-new>${icon('plus')}新增報名</button></div>${rule}</div>`
    : `<div class="panel"><h2 style="margin:0 0 4px">${ph === 'before' ? '尚未開放報名' : '報名已截止'}</h2><p class="muted small" style="margin:0">${period}${ph === 'edit' ? '。名單修改截止前仍可修改名單。' : ph === 'closed' ? '。名單需要修改請送出異動申請，由大會審核。' : ''}</p></div>`;
  return banner + (list.length ? list.map(r => regCard(st, r, ph)).join('') : `<div class="panel"><p class="muted">這個帳號還沒有報名資料。${ph === 'open' ? '按「新增報名」開始。' : ''}</p></div>`);
}
function statusCell(st, e) {
  const k = stOf(st, e);
  if (k === 'wait') return `<span class="st wait">${isCapped(st, e) ? '備取' : '候補'}第 ${waitRank(st, e)} 位</span>${isCapped(st, e) ? `<div class="small muted">每校正取 ${st.settings.events[e.ev].perUnitOk} 名，其餘備取</div>` : ''}`;
  if (k === 'out') return '<span class="st out">已退出</span>';
  if (k === 'unpaid') return '<span class="st unpaid">待完成報名</span><div class="small muted">完成匯款回報才算報名成功</div>';
  return `<span class="st ok">正取</span>${e.promotedAt ? `<div class="small" style="color:var(--red)">已遞補，請於 ${esc(fmtDT(e.payDue))} 前完成匯款</div>` : ''}`;
}
function entryRow(st, e) {
  const team = KIND[e.ev] === 'team';
  return `<tr class="${e.status === 'out' ? 'dim' : ''}"><td class="nowrap"><b>${e.ev}</b></td><td>${esc(entryName(e))}${team ? `<div class="small muted">教練 ${esc(e.coach || '－')}　領隊 ${esc(e.leader || '－')}　隊長 ${esc(e.captain || '－')}</div><div class="small">${esc((e.members || []).join('、'))}</div>` : ''}</td>
    <td class="nowrap">${statusCell(st, e)}</td></tr>`;
}
function regCard(st, r, ph) {
  const s = st.settings, f = feeOf(st, r), ps = payState(r);
  const owner = norm(r.contact.email) === norm(me);
  const pend = (r.reqs || []).filter(q => q.status === 'pending');
  const done = (r.reqs || []).filter(q => q.status !== 'pending').slice(-3);
  const shown = r.entries.filter(e => e.status !== 'out' || open.has(r.id));
  return `<div class="panel reg"><div class="row"><span class="gtag">${GROUPS[r.group].name}</span><h2 style="margin:0">${esc(r.unit)}</h2><span class="muted small">聯絡人 ${esc(r.contact.name)}　${esc(r.contact.email)}${r.contact.phone ? `　${esc(r.contact.phone)}` : ''}</span><span class="spacer"></span>
      ${ph !== 'before' ? `<button class="btn ghost sm" data-edit="${r.id}">${icon('edit')}${ph === 'closed' ? '申請異動' : '修改名單'}</button>` : ''}</div>
    <table class="list ent"><thead><tr><th>項目</th><th>隊名／選手</th><th>狀態</th></tr></thead><tbody>${shown.map(e => entryRow(st, e)).join('')}</tbody></table>
    ${r.entries.some(e => KIND[e.ev] === 'team') ? `<p class="small muted" style="margin:6px 0 0">${LINEUP_NOTE}</p>` : ''}
    ${pend.length ? `<div class="note"><b>異動申請審核中</b>${pend.map(q => `<div class="small">${fmtTime(q.ts)}　${esc(q.text)}</div>`).join('')}</div>` : ''}
    ${done.length ? `<div class="small muted" style="margin-top:6px">${done.map(q => `${fmtTime(q.decidedAt)} 異動申請${q.status === 'approved' ? '已核准' : '未核准'}：${esc(q.text)}${q.reply ? `（${esc(q.reply)}）` : ''}`).join('<br>')}</div>` : ''}
    <div class="cols">
      <div><h3>${icon('money')}應繳金額</h3>
        <table class="list fee"><tbody>${f.items.map(x => `<tr><td>${x.label}</td><td class="r">${x.n} ${x.unit} × ${x.price.toLocaleString('en-US')}</td><td class="r">${x.sum.toLocaleString('en-US')}</td></tr>`).join('')}
          <tr class="tot"><td>合計</td><td></td><td class="r">${fmtMoney(f.total)}</td></tr></tbody></table>
        <div class="row small" style="margin-top:6px">${icon('car')}停車證<button class="btn ghost sm" data-park="${r.id}|-1" ${r.parking ? '' : 'disabled'}>－</button><b>${r.parking || 0}</b> 張<button class="btn ghost sm" data-park="${r.id}|1">＋</button><span class="muted">${parkNote(s)}，加購自動併入應繳</span></div>
        ${r.entries.some(e => stOf(st, e) === 'wait') ? '<p class="small muted" style="margin:6px 0 0">候補、備取的項目不用先繳費，遞補成功的通知信會說明繳費方式；未報名成功全額退費。</p>' : ''}
      </div>
      <div><h3>${icon('check')}繳費與對帳</h3>
        <div class="row"><span class="pay ${ps}">${PAY_TEXT[ps]}</span>${r.fin && r.fin.at ? `<span class="small muted">最後對帳 ${fmtTime(r.fin.at)}</span>` : ''}</div>
        ${ps === 'mismatch' && r.fin.note ? `<p class="small" style="color:var(--red);margin:6px 0 0">大會備註：${esc(r.fin.note)}</p>` : ''}
        ${(r.pays || []).length ? `<table class="list small" style="margin-top:6px"><tbody>${r.pays.map(p => `<tr><td>${esc(fmtDT(p.time))}</td><td class="r">${fmtMoney(p.amount)}</td><td>後五碼 ${esc(p.last5)}</td></tr>`).join('')}</tbody></table><p class="small muted" style="margin:4px 0">已回報合計 ${fmtMoney(paidSum(r))}${paidSum(r) !== f.total ? `，與應繳相差 ${fmtMoney(f.total - paidSum(r))}` : ''}</p>` : ''}
        <p class="small muted" style="margin:6px 0">匯款帳號：${esc(s.bank.name)}（${esc(s.bank.code)}）${esc(s.bank.account)}</p>
        <div class="payform"><input type="number" min="1" placeholder="匯款金額" data-pa="${r.id}"><input type="datetime-local" data-pt="${r.id}"><input inputmode="numeric" maxlength="5" placeholder="帳號後五碼" data-pl="${r.id}"><button class="btn sm" data-pay="${r.id}">回報匯款</button></div>
      </div>
    </div>
    <div class="cols">
      <div><h3>${icon('user')}共同管理</h3><p class="small muted" style="margin:0 0 6px">加入的帳號可以一起修改名單、回報匯款、填線上點單。</p>
        <div class="chips">${(r.editors || []).map(m => `<span class="chip">${esc(m)}${owner ? `<button class="x" data-ed-del="${r.id}|${esc(m)}" aria-label="移除">${icon('close')}</button>` : ''}</span>`).join('') || '<span class="small muted">尚未加入</span>'}</div>
        <div class="row" style="margin-top:6px"><input type="email" placeholder="對方的 Google 帳號信箱" data-ed-new="${r.id}" style="flex:1;min-width:180px"><button class="btn ghost sm" data-ed-add="${r.id}">${icon('plus')}加入</button></div></div>
      <div><h3><button class="lnk" data-log="${r.id}">${icon(open.has(r.id) ? 'chevup' : 'chevdown')}修改紀錄（${r.log.length}）</button></h3>
        ${open.has(r.id) ? `<div class="small log">${r.log.slice().reverse().map(l => `<div>${fmtTime(l.ts)}　${esc(l.by)}　${esc(l.text)}</div>`).join('')}</div>` : ''}</div>
    </div></div>`;
}
const parkNote = s => `每張 ${s.parkingPrice} 元，可停一天`;

// ---------------- 組別名單表單（新增報名與修改名單共用） ----------------
const blankTeam = ev => ({ id: uid(), ev, name: '', coach: '', leader: '', captain: '', members: [''], lineup: 'online' });
const blankInd = ev => ({ id: uid(), ev, players: KIND[ev] === 'double' ? ['', ''] : [''] });
/** 一個組別的空白名單：個人賽先給一格 */
const blankGroup = (g, unit) => ({ group: g, unit: unit || '', entries: GROUPS[g].events.filter(ev => KIND[ev] !== 'team').map(blankInd) });

function groupForm(st, d, r) {
  const s = st.settings;
  const tag = e => { const o = r && r.entries.find(x => x.id === e.id); if (!o) return ''; const k = stOf(st, o); return k === 'wait' ? `<span class="st wait">${isCapped(st, o) ? '備取' : '候補'}第 ${waitRank(st, o)} 位</span>` : k === 'unpaid' ? '<span class="st unpaid">待完成報名</span>' : '<span class="st ok">正取</span>'; };
  const teamBox = (e, k) => {
    const c = s.events[e.ev], mem = e.members.length ? e.members : [''];
    return `<div class="ebox" data-eid="${e.id}"><div class="row"><b>${e.ev}　第 ${k + 1} 隊</b>${tag(e)}<span class="spacer"></span><button class="btn ghost sm danger" data-del-entry="${e.id}">${icon('trash')}${r && r.entries.some(x => x.id === e.id) ? '退出' : '移除'}</button></div>
      <div class="grid4"><label><span>隊名${REQ}</span><input data-f="name" value="${esc(e.name)}" placeholder="例：${esc(d.unit || '陽明交大')}A"></label><label>教練<input data-f="coach" value="${esc(e.coach)}"></label><label>領隊<input data-f="leader" value="${esc(e.leader)}"></label><label>隊長<input data-f="captain" value="${esc(e.captain)}"></label></div>
      <div class="small muted" style="margin-top:4px">隊員${REQ}（${c.min}～${c.max} 人）</div>
      <div class="mems">${mem.map((m, i) => `<input data-f="m${i}" value="${esc(m)}" placeholder="隊員 ${i + 1}">`).join('')}${mem.length < c.max ? `<button class="btn ghost sm addone" data-add-mem="${e.id}" title="再加一位">${icon('plus')}</button>` : ''}</div></div>`;
  };
  const indRow = (e, k) => `<div class="ebox row" data-eid="${e.id}"><span class="small muted" style="width:3.2em">第 ${k + 1} ${UNIT_WORD[KIND[e.ev]]}</span>${e.players.map((p, i) => `<input data-f="p${i}" value="${esc(p)}" placeholder="${e.players.length > 1 ? `選手 ${i + 1}` : '選手姓名'}" style="width:130px">`).join(e.players.length > 1 ? '<span class="muted">/</span>' : '')}${tag(e)}<span class="spacer"></span>${k || (r && r.entries.some(x => x.id === e.id)) ? `<button class="btn ghost sm danger" data-del-entry="${e.id}" aria-label="移除">${icon('trash')}</button>` : ''}</div>`;
  const evBlock = ev => {
    const c = s.events[ev], list = d.entries.filter(e => e.ev === ev), q = quotaOf(st, ev), team = KIND[ev] === 'team';
    const max = team ? 0 : c.perUnit || 99;
    const capNote = !team && c.perUnitOk && d.unit !== s.hostUnit ? `，每校正取 ${c.perUnitOk} ${UNIT_WORD[KIND[ev]]}、其餘備取` : '';
    const can = team || list.length < max;
    return `<div class="evb"><div class="row"><h3 style="margin:0">${ev}</h3><span class="small muted">報名費每${UNIT_WORD[KIND[ev]]} ${c.fee} 元${!team && c.perUnit ? `，每單位最多 ${c.perUnit} ${UNIT_WORD[KIND[ev]]}` : ''}${capNote}</span>${q.full ? '<span class="avail full">已額滿，報名將列入候補</span>' : ''}</div>
      ${list.map((e, k) => (team ? teamBox(e, k) : indRow(e, k))).join('')}
      ${can ? `<button class="btn ghost sm" data-add-entry="${ev}">${icon('plus')}${team ? (list.length ? '再報名一隊' : '報名一隊') : `再加一${UNIT_WORD[KIND[ev]]}`}</button>` : `<span class="small muted">已達每單位上限 ${max} ${UNIT_WORD[KIND[ev]]}</span>`}
      ${team && list.length ? `<p class="small muted" style="margin:6px 0 0">${LINEUP_NOTE}</p>` : ''}</div>`;
  };
  return `<label style="max-width:320px"><span>${d.group === 'S' ? '隊伍單位' : '學校'}${REQ}</span><input data-top="unit" value="${esc(d.unit)}" ${r ? 'disabled' : ''}></label>
    ${GROUPS[d.group].events.map(evBlock).join('')}`;
}
/** 表單輸入存回 d（d.entries 直接修改） */
function readGroup(d) {
  const u = $('[data-top="unit"]'); if (u && !u.disabled) d.unit = u.value.trim();
  $$('[data-eid]').forEach(box => {
    const e = d.entries.find(x => x.id === box.dataset.eid); if (!e) return;
    const oldCap = e.captain;
    if (e.members) e.members = [];
    $$('[data-f]', box).forEach(inp => {
      const f = inp.dataset.f, v = inp.value.trim();
      if (/^m\d+$/.test(f)) e.members[Number(f.slice(1))] = v;
      else if (/^p\d$/.test(f)) e.players[Number(f[1])] = v;
      else e[f] = v;
    });
    // 隊長填好後自動放進隊員（之後可以自己刪掉）
    if (e.members && e.captain && e.captain !== oldCap && !e.members.includes(e.captain)) {
      const i = oldCap ? e.members.indexOf(oldCap) : -1;
      if (i >= 0) e.members[i] = e.captain; else { const j = e.members.findIndex(x => !x); if (j === 0 && e.members.length === 1) e.members[0] = e.captain; else e.members.unshift(e.captain); }
    }
  });
}
/** 送出前：去掉沒填的個人賽空格、隊員空格 */
const cleaned = d => d.entries.map(e => (e.members ? { ...e, members: e.members.filter(Boolean) } : { ...e })).filter(e => (KIND[e.ev] === 'team' ? e.name || e.members.length : e.players.some(Boolean)));
function checkGroup(st, d) {
  const s = st.settings;
  if (!d.unit) return `請填寫${d.group === 'S' ? '隊伍單位' : '學校'}`;
  const list = cleaned(d);
  if (!list.length) return '請至少報名一個項目';
  for (const e of list) {
    if (KIND[e.ev] === 'team') {
      const c = s.events[e.ev];
      if (!e.name) return `${e.ev}：請填寫隊名`;
      if (e.members.length < c.min || e.members.length > c.max) return `${e.ev} ${e.name}：隊員要 ${c.min}～${c.max} 人，目前 ${e.members.length} 人`;
    } else if (e.players.some(p => !p)) return `${e.ev}：雙打兩位選手都要填`;
  }
  return '';
}

// ---------------- 新增報名（逐步） ----------------
function startWiz() { wiz = { step: 'contact', contact: { name: '', email: me, phone: '' }, groups: [], cur: null, pick: null, parking: 0 }; view = 'wiz'; }
const usedGroups = () => wiz.groups.map(x => x.group);
function wizView(st) {
  const s = st.settings, w = wiz;
  const steps = [['contact', '聯絡人'], ['group', '組別與名單'], ['review', '確認送出']];
  const at = w.step === 'pick' || w.step === 'fill' || w.step === 'more' ? 'group' : w.step;
  const bar = `<div class="steps">${steps.map(([k, t], i) => `<span class="${k === at ? 'on' : steps.findIndex(x => x[0] === at) > i ? 'done' : ''}">${i + 1}. ${t}</span>`).join('')}</div>`;
  let body = '';
  if (w.step === 'contact') {
    body = `<h3>聯絡人</h3><div class="grid4"><label><span>聯絡人姓名${REQ}</span><input data-c="name" value="${esc(w.contact.name)}"></label><label><span>聯絡人 email${REQ}</span><input value="${esc(w.contact.email)}" disabled></label><label>手機<input data-c="phone" value="${esc(w.contact.phone)}" inputmode="tel"></label></div>
      <p class="small muted">聯絡人 email 就是登入的 Google 帳號，之後用這個帳號填線上點單、回報匯款。</p>
      <div class="row"><span class="spacer"></span><button class="btn" data-wnext="contact">下一步</button></div>`;
  } else if (w.step === 'pick') {
    const left = Object.keys(GROUPS).filter(g => !usedGroups().includes(g));
    body = `<h3>選擇組別</h3><div class="gpick">${left.map(g => `<label class="gopt ${w.pick === g ? 'on' : ''}"><input type="radio" name="grp" value="${g}" data-grp ${w.pick === g ? 'checked' : ''}><b>${GROUPS[g].name}</b><span class="small muted">${GROUPS[g].events.join('、')}</span></label>`).join('')}</div>
      <div class="row"><button class="btn ghost" data-wback>上一步</button><span class="spacer"></span><button class="btn" data-wnext="pick">下一步</button></div>`;
  } else if (w.step === 'fill') {
    body = `<h3>${GROUPS[w.cur.group].name}</h3>${groupForm(st, w.cur, null)}
      <div class="row" style="margin-top:12px"><button class="btn ghost" data-wback>上一步</button><span class="spacer"></span><button class="btn" data-wnext="fill">下一步</button></div>`;
  } else if (w.step === 'more') {
    const left = Object.keys(GROUPS).filter(g => !usedGroups().includes(g));
    body = `<h3>要報名其他組別嗎？</h3><p class="small muted">已填：${wiz.groups.map(x => `${GROUPS[x.group].name}（${esc(x.unit)}）`).join('、')}</p>
      <div class="row">${left.length ? `<button class="btn ghost" data-wmore>${icon('plus')}報名其他組別</button>` : ''}<span class="spacer"></span><button class="btn" data-wnext="more">不用，下一步</button></div>`;
  } else if (w.step === 'review') {
    // 每校正取上限以外的直接備取，不計入應繳
    const capped = new Set();
    w.groups.forEach(x => { const n = {}; x.entries.forEach(e => { const c = s.events[e.ev]; n[e.ev] = (n[e.ev] || 0) + 1; if (c.perUnitOk && x.unit !== s.hostUnit && n[e.ev] > c.perUnitOk) capped.add(e.id); }); });
    const tmp = { entries: [], parking: w.parking };
    w.groups.forEach(x => tmp.entries.push(...x.entries.map(e => ({ ...e, status: capped.has(e.id) ? 'out' : 'in' }))));
    const f = feeOf(st, tmp);
    body = `<h3>請確認報名內容</h3>
      <p class="small">聯絡人 ${esc(w.contact.name)}　${esc(w.contact.email)}${w.contact.phone ? `　${esc(w.contact.phone)}` : ''}<button class="btn ghost sm" data-wgo="contact" style="margin-left:8px">${icon('edit')}修改</button></p>
      ${w.groups.map((x, i) => `<div class="ebox"><div class="row"><span class="gtag">${GROUPS[x.group].name}</span><b>${esc(x.unit)}</b><span class="spacer"></span><button class="btn ghost sm" data-wedit="${i}">${icon('edit')}修改</button><button class="btn ghost sm danger" data-wdel="${i}">${icon('trash')}</button></div>
        <table class="list small"><tbody>${x.entries.map(e => `<tr><td class="nowrap"><b>${e.ev}</b></td><td>${esc(entryName(e))}${e.members ? `<div class="muted">${e.coach ? `教練 ${esc(e.coach)}　` : ''}${e.leader ? `領隊 ${esc(e.leader)}　` : ''}${e.captain ? `隊長 ${esc(e.captain)}` : ''}</div><div>${esc(e.members.join('、'))}</div>` : ''}</td><td class="nowrap">${capped.has(e.id) ? '<span class="st wait">備取</span>' : quotaOf(st, e.ev).full ? '<span class="st wait">目前已額滿，將列入候補</span>' : ''}</td></tr>`).join('')}</tbody></table></div>`).join('')}
      <div class="row" style="margin-top:10px">${icon('car')}停車證<input type="number" min="0" max="20" data-wpark value="${w.parking}" style="width:70px">張<span class="small muted">${parkNote(s)}</span></div>
      <table class="list fee" style="max-width:420px;margin-top:8px"><tbody>${f.items.map(x => `<tr><td>${x.label}</td><td class="r">${x.n} ${x.unit} × ${x.price.toLocaleString('en-US')}</td><td class="r">${x.sum.toLocaleString('en-US')}</td></tr>`).join('')}<tr class="tot"><td>應繳合計</td><td></td><td class="r">${fmtMoney(f.total)}</td></tr></tbody></table>
      <p class="small">送出後請依應繳金額匯款，並回到報名頁按「回報匯款」。<b>提交報名表並完成匯款回報，才算報名成功</b>；有名額限制的項目依完成匯款回報的時間先後計算。</p>
      <p class="small muted">備取、候補的項目不計入應繳，遞補成功的通知信會說明繳費方式。</p>
      <div class="row"><button class="btn ghost" data-wback>上一步</button><span class="spacer"></span><button class="btn" data-wsubmit>${icon('check')}確認送出</button></div>`;
  }
  return `<div class="panel"><h2 style="margin:0 0 8px">新增報名</h2>${bar}${body}</div>`;
}
function wizNext(step) {
  const st = getState(), w = wiz;
  if (step === 'contact') {
    w.contact.name = $('[data-c="name"]').value.trim(); w.contact.phone = $('[data-c="phone"]').value.trim();
    if (!w.contact.name) return toast('請填寫聯絡人姓名');
    w.step = w.groups.length ? 'review' : 'pick';
  } else if (step === 'pick') {
    if (!w.pick) return toast('請選擇組別');
    const prevUnit = (w.groups.find(x => x.group !== 'S') || {}).unit || '';
    w.cur = blankGroup(w.pick, w.pick === 'S' ? '' : prevUnit); w.curIdx = -1; w.step = 'fill';
  } else if (step === 'fill') {
    readGroup(w.cur);
    const err = checkGroup(st, w.cur); if (err) return toast(err);
    const g = { group: w.cur.group, unit: w.cur.unit, entries: cleaned(w.cur) };
    if (w.curIdx >= 0) w.groups[w.curIdx] = g; else w.groups.push(g);
    w.cur = null; w.pick = null;
    w.step = w.curIdx >= 0 ? 'review' : 'more';
  } else if (step === 'more') w.step = 'review';
  render(); scrollTo(0, 0);
}
function wizBack() {
  const w = wiz;
  if (w.step === 'pick') w.step = w.groups.length ? 'more' : 'contact';
  else if (w.step === 'fill') { readGroup(w.cur); w.step = w.curIdx >= 0 ? 'review' : 'pick'; }
  else if (w.step === 'review') w.step = 'more';
  render(); scrollTo(0, 0);
}
function wizSubmit() {
  const w = wiz, p = $('[data-wpark]'); if (p) w.parking = Math.max(0, Number(p.value) || 0);
  if (!w.groups.length) return toast('還沒有填任何組別');
  update(n => {
    w.groups.forEach((g, i) => {
      const id = uid(), now = Date.now();
      n.regs[id] = { id, group: g.group, unit: g.unit, contact: { ...w.contact }, editors: [], parking: 0, createdAt: now, updatedAt: now, entries: [], pays: [], log: [], reqs: [] };
      applyChange(n, id, { entries: g.entries, parking: i === 0 ? w.parking : 0 }, me);
      n.regs[id].log = [{ ts: now, by: me, text: '送出報名' }];
    });
  });
  wiz = null; view = 'home'; render(); scrollTo(0, 0);
  toast('已送出報名，請依應繳金額匯款後回報');
}

// ---------------- 修改名單（一個組別） ----------------
function startEdit(r) {
  const entries = JSON.parse(JSON.stringify(r.entries.filter(e => e.status !== 'out')));
  GROUPS[r.group].events.filter(ev => KIND[ev] !== 'team' && !entries.some(e => e.ev === ev)).forEach(ev => entries.push(blankInd(ev)));
  edit = { rid: r.id, group: r.group, unit: r.unit, entries };
  view = 'edit';
}
function editView(st) {
  const r = st.regs[edit.rid], after = phase(st) === 'closed';
  return `<div class="panel"><div class="row"><span class="gtag">${GROUPS[r.group].name}</span><h2 style="margin:0">${after ? '申請名單異動' : '修改名單'}</h2><span class="spacer"></span><button class="btn ghost sm" data-ecancel>${icon('close')}取消</button></div>
    ${after ? '<p class="note small">報名已截止，送出後由大會審核，核准後才會更新名單。</p>' : ''}
    ${groupForm(st, edit, r)}
    <div class="row" style="margin-top:12px"><span class="spacer"></span><button class="btn" data-esave>${icon('check')}${after ? '送出異動申請' : '儲存修改'}</button></div></div>`;
}
function editSave() {
  readGroup(edit);
  const st = getState(), err = checkGroup(st, edit); if (err) return toast(err);
  const r = st.regs[edit.rid], chg = { entries: cleaned(edit) };
  if (phase(st) === 'closed') {
    const lines = diffText(r, chg); if (!lines.length) return toast('沒有修改');
    update(n => { n.regs[edit.rid].reqs.push({ id: uid(), ts: Date.now(), by: me, status: 'pending', text: lines.join('；'), change: chg }); });
    toast('已送出異動申請，大會審核後會更新');
  } else {
    let lines = [];
    update(n => { lines = applyChange(n, edit.rid, chg, me); });
    toast(lines.length ? '已儲存修改' : '沒有修改');
  }
  edit = null; view = 'home'; render();
}

// ---------------- 事件 ----------------
const cur = () => (view === 'wiz' ? wiz.cur : edit);
document.addEventListener('click', ev => {
  const b = ev.target.closest('button'); if (!b) return;
  const d = b.dataset;
  if ('login' in d) { const v = $('#me').value.trim(); if (!/^\S+@\S+\.\S+$/.test(v)) { toast('請輸入信箱'); return; } me = v; try { localStorage.setItem(ME_KEY, me); } catch (e) { /* 無痕 */ } afterLogin(); render(); }
  else if ('out' in d) { me = ''; try { localStorage.removeItem(ME_KEY); } catch (e) { /* 無痕 */ } view = 'home'; wiz = null; edit = null; render(); }
  else if ('reset' in d) { if (confirm('重設示範資料？你在示範模式輸入的內容會清掉。')) { resetDemo(); view = 'home'; wiz = null; edit = null; toast('已重設示範資料'); } }
  else if ('qa' in d) { qaOpen = !qaOpen; render(); }
  else if (d.qaq) { qaShow.has(d.qaq) ? qaShow.delete(d.qaq) : qaShow.add(d.qaq); render(); }
  else if ('new' in d) { startWiz(); render(); scrollTo(0, 0); }
  else if (d.wnext) wizNext(d.wnext);
  else if ('wback' in d) wizBack();
  else if ('wmore' in d) { wiz.step = 'pick'; render(); scrollTo(0, 0); }
  else if (d.wgo) { wiz.step = d.wgo; render(); scrollTo(0, 0); }
  else if (d.wedit) { const i = Number(d.wedit), g = wiz.groups[i]; wiz.cur = { ...g, entries: JSON.parse(JSON.stringify(g.entries)) }; wiz.curIdx = i; wiz.step = 'fill'; render(); scrollTo(0, 0); }
  else if (d.wdel) { if (confirm('刪除這個組別的報名內容？')) { wiz.groups.splice(Number(d.wdel), 1); wiz.step = wiz.groups.length ? 'review' : 'pick'; render(); } }
  else if ('wsubmit' in d) wizSubmit();
  else if (d.edit) { startEdit(getState().regs[d.edit]); render(); scrollTo(0, 0); }
  else if ('ecancel' in d) { edit = null; view = 'home'; render(); }
  else if ('esave' in d) editSave();
  else if (d.addEntry) { const g = cur(); readGroup(g); g.entries.push(KIND[d.addEntry] === 'team' ? blankTeam(d.addEntry) : blankInd(d.addEntry)); render(); }
  else if (d.delEntry) { const g = cur(); readGroup(g); g.entries = g.entries.filter(e => e.id !== d.delEntry); render(); }
  else if (d.addMem) { const g = cur(); readGroup(g); const e = g.entries.find(x => x.id === d.addMem); e.members.push(''); render(); const box = $(`[data-eid="${d.addMem}"]`); const ins = $$('[data-f^="m"]', box); ins[ins.length - 1].focus(); }
  else if (d.park) { const [rid, k] = d.park.split('|'); update(n => { const r = n.regs[rid]; const v = Math.max(0, (r.parking || 0) + Number(k)); r.log.push({ ts: Date.now(), by: me, text: `停車證 ${r.parking || 0} 張改為 ${v} 張` }); r.parking = v; if (r.fin && r.fin.state === 'received') r.fin = { ...r.fin, state: 'mismatch', note: '停車證張數變更，請補匯差額' }; }); }
  else if (d.pay) {
    const rid = d.pay, a = Number($(`[data-pa="${rid}"]`).value), t = $(`[data-pt="${rid}"]`).value, l5 = $(`[data-pl="${rid}"]`).value.trim();
    if (!a || !t || !/^\d{5}$/.test(l5)) { toast('請填寫匯款金額、匯款時間與帳號後五碼'); return; }
    update(n => { const r = n.regs[rid]; r.pays.push({ amount: a, time: t, last5: l5, ts: Date.now() }); if (r.fin && r.fin.state === 'mismatch') r.fin = { ...r.fin, state: '' }; r.log.push({ ts: Date.now(), by: me, text: `回報匯款 ${a} 元` }); });
    toast('已回報匯款，等待總務對帳');
  }
  else if (d.edAdd) { const inp = $(`[data-ed-new="${d.edAdd}"]`), v = inp.value.trim(); if (!/^\S+@\S+\.\S+$/.test(v)) { toast('請輸入信箱'); return; } update(n => { const r = n.regs[d.edAdd]; if (!r.editors.some(x => norm(x) === norm(v))) { r.editors.push(v); r.log.push({ ts: Date.now(), by: me, text: `加入共同管理 ${v}` }); } }); }
  else if (d.edDel) { const [rid, m] = d.edDel.split('|'); update(n => { const r = n.regs[rid]; r.editors = r.editors.filter(x => x !== m); r.log.push({ ts: Date.now(), by: me, text: `移除共同管理 ${m}` }); }); }
  else if (d.log) { open.has(d.log) ? open.delete(d.log) : open.add(d.log); render(); }
});
document.addEventListener('change', ev => {
  if (ev.target.matches('[data-f="captain"]') && cur()) { readGroup(cur()); render(); return; }
  if (ev.target.matches('[data-grp]') && wiz) { wiz.pick = ev.target.value; render(); }
  if (ev.target.matches('[data-wpark]') && wiz) { wiz.parking = Math.max(0, Number(ev.target.value) || 0); render(); }
});
document.addEventListener('keydown', ev => {
  if (ev.key === 'Enter' && ev.target.id === 'me') $('[data-login]').click();
  // 隊員欄按 Enter：跳到下一格，最後一格就再加一格
  if (ev.key === 'Enter' && /^m\d+$/.test(ev.target.dataset.f || '')) { ev.preventDefault(); const box = ev.target.closest('[data-eid]'); const ins = $$('[data-f^="m"]', box); const i = ins.indexOf(ev.target); if (ins[i + 1]) ins[i + 1].focus(); else { const add = $('[data-add-mem]', box); if (add) add.click(); } }
});
// 填表時不要被其他分頁的資料更新重畫打斷
subscribe(() => { if (view === 'home') render(); });
if (me) afterLogin();
render();
