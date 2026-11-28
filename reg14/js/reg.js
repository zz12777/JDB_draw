// 參賽者系統原型：報名者頁面（報名、名單修改、繳費回報、候補順位、共同管理、Q&A）
import { GROUPS, EVENTS, KIND, UNIT_WORD, PAY_TEXT, TL_LABEL, phase, quotaOf, waitRank, stOf, isCapped, feeOf, payState, paidSum, leadOf, batchRegs, mine, entryName, nameWidth, fmtMoney, fmtTime, fmtDT, norm, uid } from './model.js';
import { getState, update, subscribe, resetDemo } from './store.js';
import { applyChange } from './changes.js';
import { esc, $, $$, icon, toast, header, demoBar } from './ui.js';

const ME_KEY = 'jdb-reg14-me';
let me = (() => { try { return localStorage.getItem(ME_KEY) || ''; } catch (e) { return ''; } })();
let view = 'home';  // home | wiz（新增報名）| edit（修改一個組別）
let wiz = null;     // 新增報名的步驟與內容
let edit = null;    // 修改名單的內容
const open = new Set(); // 展開「共同管理與修改紀錄」的報名
const payOpen = new Set(); // 已回報後再回報一筆
let pop = '';       // 彈出視窗：info 賽務資訊 / qa 報名 Q&A
let qaQ = '';
const qaShow = new Set();

const REQ = '<span class="req">*</span>';
const NOTE_LABEL = '<span>備註<span class="hint">（若需收據請備註抬頭與統編，收據僅提供隊章）</span></span>';

function render() {
  const st = getState(), s = st.settings;
  const tools = `<button class="btn ghost sm" data-pop="info">${icon('info')}賽務資訊</button><button class="btn ghost sm" data-pop="qa">${icon('help')}Q&amp;A</button>`;
  $('#top').innerHTML = header(s, '報名系統', tools + (me ? `<span class="who">${icon('user')}<span>${esc(me)}</span></span><button class="btn ghost sm" data-out>登出</button>` : ''));
  drawPop(st);
  if (!me) { $('#main').innerHTML = demoBar() + loginView() + `<div class="panel">${infoHtml(st)}</div>`; return; }
  const body = view === 'wiz' ? wizView(st) : view === 'edit' ? editView(st) : homeView(st);
  $('#main').innerHTML = demoBar('<button class="btn ghost sm" data-reset>重設示範資料</button>') + body;
}

// ---------------- 登入 ----------------
function loginView() {
  return `<div class="panel narrow center"><h2>交大盃報名系統</h2>
    <p class="small">示範模式沒有真的 Google 登入，請輸入任一信箱代替；輸入 <b>contact1@example.com</b> 可以看到已經報名的單位。</p>
    <div class="row" style="justify-content:center"><input id="me" type="email" placeholder="你的 Google 帳號信箱" style="width:min(320px,100%)"><button class="btn" data-login>登入</button></div></div>`;
}
/** 登入後：還沒報名過就直接進新增報名 */
function afterLogin() { const st = getState(); if (phase(st) === 'open' && !mine(st, me).length) startWiz(); else view = 'home'; }

// ---------------- 賽務資訊、Q&A ----------------
const WD = '日一二三四五六';
const dayText = d => { const x = new Date(`${d}T00:00`); return Number.isNaN(+x) ? d : `${x.getFullYear()}/${x.getMonth() + 1}/${x.getDate()}（${WD[x.getDay()]}）`; };
function infoHtml(st) {
  const s = st.settings, t = s.timeline || {};
  const md = v => fmtDT(v);
  const tl = [['open'], ['close'], ['waitPayStart', 'waitPayEnd', '候補匯款'], ['waitMailStart', 'waitMailEnd', '寄候補信'], ['editClose'], ['drawAt'], ['publish']];
  const lim = ev => { const c = s.events[ev], k = KIND[ev], a = []; if (k === 'team' && c.max) a.push(`每隊最多 ${c.max} 人`); if (c.nameMax) a.push(`隊名 ${c.nameMax} 字以內`); if (c.perUnitOk) a.push(`每校正取 ${c.perUnitOk} 名${s.hostUnit ? `（${esc(s.hostUnit)}不限）` : ''}`); if (c.perUnit) a.push(`每單位最多 ${c.perUnit} ${UNIT_WORD[k]}`); return a.join('、'); };
  return `<h2>${esc(s.edition)}${esc(s.title)}</h2>
    <div class="info"><div><h3>比賽日期</h3><p>${s.dates.filter(Boolean).map(dayText).join('、')}</p>
      <h3>報名期程</h3><table class="list small"><tbody>${tl.map(([a, b, l]) => `<tr><td>${l || TL_LABEL[a]}</td><td>${md(t[a])}${b ? ` 至 ${md(t[b])}` : ''}</td></tr>`).join('')}</tbody></table></div>
    <div><h3>項目與費用</h3><table class="list small"><thead><tr><th>項目</th><th class="r">名額</th><th class="r">報名費</th><th>限制</th></tr></thead><tbody>${EVENTS.map(ev => { const c = s.events[ev]; return `<tr><td class="nowrap"><span class="evt k-${KIND[ev]}">${ev}</span></td><td class="r nowrap">${c.quota ? `${c.quota} ${UNIT_WORD[KIND[ev]]}` : '不限'}</td><td class="r nowrap">${c.fee} 元／${UNIT_WORD[KIND[ev]]}</td><td>${lim(ev)}</td></tr>`; }).join('')}</tbody></table>
      <ul class="small rules"><li>單、雙打每人限報一項</li><li>停車證每張 ${s.parkingPrice} 元，可停一天</li><li>提交報名表並完成匯款回報，才算報名成功</li></ul></div></div>`;
}
const qaList = s => { const k = qaQ.trim(); return (s.qa || []).filter(x => !k || x.q.includes(k) || x.a.includes(k)); };
const qaItems = s => qaList(s).map(x => `<div class="qai ${qaShow.has(x.id) ? 'on' : ''}"><button class="qaq" data-qaq="${x.id}">${icon(qaShow.has(x.id) ? 'minus' : 'plus')}<span>${esc(x.q)}</span></button>${qaShow.has(x.id) ? `<div class="qaa">${esc(x.a).replace(/\n/g, '<br>')}</div>` : ''}</div>`).join('') || '<p class="muted small">找不到相關問題</p>';
function drawPop(st) {
  const host = $('#modal'), s = st.settings;
  if (!pop) { host.hidden = true; host.innerHTML = ''; return; }
  host.hidden = false;
  const x = `<button class="btn ghost sm px" data-pop="" aria-label="關閉">${icon('close')}</button>`;
  const contact = `其他問題請來信 <a href="mailto:${esc(s.contactMail)}">${esc(s.contactMail)}</a>，或<a href="${esc(s.fbUrl)}" target="_blank" rel="noopener">私訊臉書粉專</a>。`;
  host.innerHTML = `<div class="modal-bg"><div class="modal pop">${x}${pop === 'info' ? infoHtml(st)
    : `<h2>報名 Q&amp;A</h2><label class="sbox">${icon('search')}<input id="qaq" type="search" placeholder="搜尋問題" value="${esc(qaQ)}"></label><div class="qal">${qaItems(s)}</div><p class="small muted" style="margin:12px 0 0">${contact}</p>`}</div></div>`;
}

// ---------------- 首頁：每次送出一張卡（同一筆繳費） ----------------
function homeView(st) {
  const s = st.settings, ph = phase(st), t = s.timeline;
  const leads = [...new Set(mine(st, me).map(r => leadOf(st, r)))].sort((a, b) => b.createdAt - a.createdAt);
  const title = { open: '報名中', before: '尚未開放報名', edit: '報名已截止', closed: '名單修改已截止' }[ph];
  const head = `<div class="panel"><div class="row"><h2 style="margin:0">${title}</h2><span class="muted small">報名期間 ${fmtDT(t.open)} 至 ${fmtDT(t.close)}，名單修改截止 ${fmtDT(t.editClose)}</span><span class="spacer"></span>${ph === 'open' ? `<button class="btn" data-new>${icon('plus')}${leads.length ? '新增其他報名' : '新增報名'}</button>` : ''}</div></div>`;
  return head + (leads.length ? leads.map(l => billCard(st, l, ph)).join('') : '<div class="panel"><p class="muted">這個帳號還沒有報名資料。</p></div>');
}
/** 依項目列出名單；tagFn 回傳每筆後面的狀態標籤 */
function roster(entries, tagFn = () => '') {
  return EVENTS.filter(ev => entries.some(e => e.ev === ev)).map(ev => {
    const list = entries.filter(e => e.ev === ev), team = KIND[ev] === 'team';
    return `<div class="rv"><div><span class="evt k-${KIND[ev]}">${ev}</span></div><div class="rvl">${list.map(e => (team
      ? `<div class="rvt"><b>${esc(e.name)}</b>${tagFn(e)}${e.coach || e.leader || e.captain ? `<div class="small muted">${[['教練', e.coach], ['領隊', e.leader], ['隊長', e.captain]].filter(x => x[1]).map(x => `${x[0]} ${esc(x[1])}`).join('　')}</div>` : ''}<div class="small">${esc((e.members || []).join('、'))}</div></div>`
      : `<span class="rvp">${esc(entryName(e))}${tagFn(e)}</span>`)).join('')}</div></div>`;
  }).join('');
}
function stTag(st, e) {
  const k = stOf(st, e);
  if (k === 'wait') return `<span class="st wait">${isCapped(st, e) ? '備取' : '候補'}第 ${waitRank(st, e)} 位</span>`;
  if (k === 'ok') return '<span class="st ok">正取</span>';
  return '';
}
const TIPS = `<ul class="tips"><li>請依<b>應匯款金額</b>匯款，再填寫上方的<b>匯款回報</b>。</li><li><b>提交報名表並完成匯款回報，才算報名成功</b>；有名額限制的項目依完成匯款回報的時間先後計算。</li><li>候補、備取的項目<b>不用先繳費</b>，遞補成功會寄信通知。</li></ul>`;
function billCard(st, l, ph) {
  const s = st.settings, regs = batchRegs(st, l), f = feeOf(st, l), ps = payState(st, l), paid = paidSum(st, l);
  const stage = ps === 'received' ? 3 : ps === 'none' ? 1 : 2;
  const prog = `<ol class="prog">${['送出報名', '完成匯款回報', '款項收到＆報名成功'].map((x, i) => `<li class="${i < stage ? 'done' : i === stage ? 'now' : ''}${i === 1 && ps === 'mismatch' ? ' warn' : ''}"><span>${i < stage ? icon('check') : i + 1}</span>${x}</li>`).join('')}</ol>`;
  const promoted = regs.flatMap(r => r.entries.filter(e => e.promotedAt && e.status !== 'out'));
  const form = `<div class="payform"><label>匯款金額<input type="number" min="1" data-pa="${l.id}" value="${ps === 'none' ? f.total : Math.max(0, f.total - paid) || ''}"></label><label>匯款時間<input type="datetime-local" data-pt="${l.id}"></label><label>帳號末五碼<input inputmode="numeric" maxlength="5" data-pl="${l.id}"></label><button class="btn" data-pay="${l.id}">送出匯款回報</button></div>`;
  let pay;
  if (ps === 'received') pay = `<p class="okmsg">${icon('check')}款項已收到，報名成功</p>`;
  else if (ps === 'reported' && !payOpen.has(l.id)) pay = `<p>已回報匯款 <b>${fmtMoney(paid)}</b>，等待大會確認款項。<button class="lnk sm" data-payagain="${l.id}">再回報一筆</button></p>`;
  else pay = `${ps === 'mismatch' ? `<p class="warnmsg">大會備註：${esc((l.fin && l.fin.note) || '金額不符')}</p>` : ''}
      <div class="due"><span>應匯款金額</span><b>${fmtMoney(ps === 'none' ? f.total : f.total - paid)}</b>${ps !== 'none' ? `<span class="small muted">應繳 ${fmtMoney(f.total)}，已回報 ${fmtMoney(paid)}</span>` : ''}</div>
      <p class="small muted" style="margin:2px 0 10px">${f.items.map(x => `${x.label} ${x.n} ${x.unit}`).join('、')}</p>
      <p class="acct">收款帳號　${esc(s.bank.name)}（${esc(s.bank.code)}）<b>${esc(s.bank.account)}</b></p>${form}${ps === 'none' ? TIPS : ''}`;
  const groups = regs.map(r => `<div class="grp"><div class="row"><span class="gtag">${GROUPS[r.group].name}</span><b>${esc(r.unit)}</b><span class="spacer"></span>${ph === 'open' || ph === 'edit' ? `<button class="btn ghost sm" data-edit="${r.id}">${icon('edit')}修改名單</button>` : ''}</div>
      ${roster(r.entries.filter(e => e.status !== 'out'), e => stTag(st, e))}</div>`).join('');
  const owner = norm(l.contact.email) === norm(me), eds = l.editors || [], logs = regs.flatMap(r => r.log).sort((a, b) => b.ts - a.ts);
  const more = open.has(l.id) ? `<div class="cols"><div><h3>${icon('user')}共同管理</h3><p class="small muted" style="margin:0 0 6px">可以一起修改名單、回報匯款、填線上點單。</p>
      <div class="chips">${eds.map(m => `<span class="chip">${esc(m)}${owner ? `<button class="x" data-ed-del="${l.id}|${esc(m)}" aria-label="移除">${icon('close')}</button>` : ''}</span>`).join('') || '<span class="small muted">尚未加入</span>'}</div>
      <div class="row" style="margin-top:6px"><input type="email" placeholder="對方的 Google 帳號信箱" data-ed-new="${l.id}" style="flex:1;min-width:180px"><button class="btn ghost sm" data-ed-add="${l.id}">${icon('plus')}加入</button></div></div>
      <div><h3>${icon('list')}修改紀錄</h3><div class="small log">${logs.map(x => `<div>${fmtTime(x.ts)}　${esc(x.by)}　${esc(x.text)}</div>`).join('')}</div></div></div>` : '';
  return `<div class="panel bill">${prog}<div class="paybox">${pay}</div>
    ${promoted.length && ps !== 'received' ? `<p class="warnmsg">${promoted.map(e => `${e.ev} ${esc(entryName(e))} 已遞補成功，請於 ${esc(fmtDT(e.payDue))} 前匯款`).join('<br>')}</p>` : ''}
    <h3 class="sec">報名內容</h3>${groups}
    <div class="row small foot">${icon('car')}停車證<button class="btn ghost sm" data-park="${l.id}|-1" ${l.parking ? '' : 'disabled'}>－</button><b>${l.parking || 0}</b> 張<button class="btn ghost sm" data-park="${l.id}|1">＋</button><span class="muted">${parkNote(s)}</span>
      ${l.note ? `<span class="muted" style="margin-left:12px">備註</span>${esc(l.note)}` : ''}<span class="spacer"></span><button class="lnk sm" data-log="${l.id}">${icon(open.has(l.id) ? 'chevup' : 'chevdown')}共同管理與修改紀錄</button></div>
    ${more}</div>`;
}
const parkNote = s => `（每張 ${s.parkingPrice} 元，可停一天）`;

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
    return `<div class="ebox" data-eid="${e.id}"><div class="row">${tag(e)}<span class="spacer"></span><button class="btn ghost sm danger" data-del-entry="${e.id}">${icon('trash')}${r && r.entries.some(x => x.id === e.id) ? '退出' : '移除'}</button></div>
      <div class="grid4"><label><span>隊名${REQ}</span><input data-f="name" value="${esc(e.name)}" placeholder="${d.group === 'S' ? `${c.nameMax || 6} 字以內` : `${esc(d.unit || '陽明交大')}A`}"></label><label>教練<input data-f="coach" value="${esc(e.coach)}"></label><label>領隊<input data-f="leader" value="${esc(e.leader)}"></label><label>隊長<input data-f="captain" value="${esc(e.captain)}"></label></div>
      <div class="small muted" style="margin-top:4px">隊員${REQ}</div>
      <div class="mems">${mem.map((m, i) => `<input data-f="m${i}" value="${esc(m)}" placeholder="隊員 ${i + 1}">`).join('')}${mem.length < c.max ? `<button class="btn ghost sm addone" data-add-mem="${e.id}" title="再加一位">${icon('plus')}</button>` : ''}</div></div>`;
  };
  const indRow = (e, k) => `<div class="ebox row" data-eid="${e.id}">${e.players.map((p, i) => `<input data-f="p${i}" value="${esc(p)}" placeholder="${e.players.length > 1 ? `選手 ${i + 1}` : '選手姓名'}" style="width:130px">`).join(e.players.length > 1 ? '<span class="muted">/</span>' : '')}${tag(e)}<span class="spacer"></span>${k || (r && r.entries.some(x => x.id === e.id)) ? `<button class="btn ghost sm danger" data-del-entry="${e.id}" aria-label="移除">${icon('trash')}</button>` : ''}</div>`;
  const evBlock = ev => {
    const c = s.events[ev], list = d.entries.filter(e => e.ev === ev), q = quotaOf(st, ev), team = KIND[ev] === 'team', u = UNIT_WORD[KIND[ev]];
    const max = team ? 0 : c.perUnit || 99, can = team || list.length < max;
    return `<div class="evcard k-${KIND[ev]}"><div class="row"><span class="evt k-${KIND[ev]}">${ev}</span>${q.full ? '<span class="avail full">已額滿，將列入候補</span>' : ''}</div>
      ${list.map((e, k) => (team ? teamBox(e, k) : indRow(e, k))).join('')}
      ${can ? `<button class="btn ghost sm" data-add-entry="${ev}">${icon('plus')}${team ? (list.length ? '再報名一隊' : '報名一隊') : `再加一${u}`}</button>` : `<span class="small muted">已達每單位上限 ${max} ${u}</span>`}</div>`;
  };
  return `<label style="max-width:320px"><span>${d.group === 'S' ? '隊伍單位' : '學校'}${REQ}</span><input data-top="unit" value="${esc(d.unit)}" ${r ? 'disabled' : ''}></label>
    <div class="evcards">${GROUPS[d.group].events.map(evBlock).join('')}</div>`;
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
      if (!e.members.some(x => !x) && e.members.length < (getState().settings.events[e.ev].max || 9)) e.members.push('');
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
      if (d.group === 'S' && c.nameMax && nameWidth(e.name) > c.nameMax) return `${e.ev}：隊名限 ${c.nameMax} 個中文字以內，英文、數字兩個算一個字`;
      if (d.group !== 'S' && (!e.name.startsWith(d.unit) || [...e.name].length > [...d.unit].length + 1)) return `${e.ev}：隊名為學校名稱加上一個字，例如${d.unit}A`;
      if (!e.members.length) return `${e.ev} ${e.name}：請填寫隊員`;
      if ((c.min && e.members.length < c.min) || (c.max && e.members.length > c.max)) return `${e.ev} ${e.name}：隊員${c.min ? ` ${c.min}～` : '最多 '}${c.max} 人，目前 ${e.members.length} 人`;
      const dup = e.members.find((x, i) => e.members.indexOf(x) !== i); if (dup) return `${e.ev} ${e.name}：隊員 ${dup} 重複`;
    } else if (e.players.some(p => !p)) return `${e.ev}：雙打兩位選手都要填`;
  }
  // 個人賽：單、雙打每人限報一項（含同校其他人送出的報名）
  const seen = new Map(), add = (n, ev) => { if (!seen.has(n)) seen.set(n, []); seen.get(n).push(ev); };
  list.filter(e => KIND[e.ev] !== 'team').forEach(e => e.players.forEach(p => add(p, e.ev)));
  Object.values(st.regs).filter(r => r.id !== d.rid && r.group === d.group && r.unit === d.unit).forEach(r => r.entries.filter(e => e.status !== 'out' && KIND[e.ev] !== 'team').forEach(e => e.players.forEach(p => add(p, e.ev))));
  for (const [n, evs] of seen) if (evs.length > 1) return `${n} 已報名${evs[0]}，單、雙打每人限報一項`;
  return '';
}

// ---------------- 新增報名（逐步） ----------------
function startWiz() { wiz = { step: 'contact', contact: { name: '', email: me, phone: '' }, groups: [], cur: null, parking: 0, note: '' }; view = 'wiz'; }
const leftGroups = () => Object.keys(GROUPS).filter(g => !wiz.groups.some(x => x.group === g));
const gCards = gs => gs.map(g => `<button class="gopt" data-gpick="${g}"><b>${GROUPS[g].name}</b><span class="small muted">${GROUPS[g].events.join('、')}</span></button>`).join('');
function wizView(st) {
  const s = st.settings, w = wiz;
  let body = '';
  if (w.step === 'contact') {
    body = `<h3>聯絡人</h3><div class="grid4"><label><span>聯絡人姓名${REQ}</span><input data-c="name" value="${esc(w.contact.name)}"></label><label><span>聯絡人 email${REQ}</span><input value="${esc(w.contact.email)}" disabled></label><label>手機<input data-c="phone" value="${esc(w.contact.phone)}" inputmode="tel"></label></div>
      <p class="small muted"><b>聯絡人 email</b> 預設擁有隊伍<b>點單填寫權限</b>，也可以加入其他共同編輯的帳號。</p>
      <div class="row">${mine(st, me).length ? `<button class="btn ghost" data-wcancel>${icon('close')}取消</button>` : ''}<span class="spacer"></span><button class="btn" data-wnext="contact">下一步</button></div>`;
  } else if (w.step === 'pick') {
    body = `<h3>我要報名</h3><div class="gpick">${gCards(leftGroups())}</div><div class="row"><button class="btn ghost" data-wback>上一步</button></div>`;
  } else if (w.step === 'fill') {
    body = `<h3>${GROUPS[w.cur.group].name}</h3>${groupForm(st, w.cur, null)}
      <div class="row" style="margin-top:12px"><button class="btn ghost" data-wback>上一步</button><span class="spacer"></span><button class="btn" data-wnext="fill">下一步</button></div>`;
  } else if (w.step === 'more') {
    body = `<h3>還要報名其他組別嗎？</h3><div class="gpick">${gCards(leftGroups())}<button class="gopt" data-wnone><b>不用</b></button></div>`;
  } else if (w.step === 'review') {
    // 每校正取上限以外的直接備取，不計入應繳
    const capped = new Set();
    w.groups.forEach(x => { const n = {}; x.entries.forEach(e => { const c = s.events[e.ev]; n[e.ev] = (n[e.ev] || 0) + 1; if (c.perUnitOk && x.unit !== s.hostUnit && n[e.ev] > c.perUnitOk) capped.add(e.id); }); });
    const tmp = { id: '_new', entries: [], parking: w.parking };
    w.groups.forEach(x => tmp.entries.push(...x.entries.map(e => ({ ...e, status: capped.has(e.id) ? 'out' : 'in' }))));
    const f = feeOf(st, tmp);
    const tag = e => (capped.has(e.id) ? '<span class="st wait">備取</span>' : quotaOf(st, e.ev).full ? '<span class="st wait">已額滿，列入候補</span>' : '');
    const cnt = EVENTS.map(ev => { const n = tmp.entries.filter(e => e.ev === ev).length; return n ? `<span class="evt k-${KIND[ev]}">${ev} ${n} ${UNIT_WORD[KIND[ev]]}</span>` : ''; }).join('');
    body = `<h3>請確認報名內容</h3><div class="cnts">${cnt}</div>
      <p class="small">聯絡人 ${esc(w.contact.name)}　${esc(w.contact.email)}${w.contact.phone ? `　${esc(w.contact.phone)}` : ''}<button class="btn ghost sm" data-wgo="contact" style="margin-left:8px">${icon('edit')}修改</button></p>
      ${w.groups.map((x, i) => `<div class="grp"><div class="row"><span class="gtag">${GROUPS[x.group].name}</span><b>${esc(x.unit)}</b><span class="spacer"></span><button class="btn ghost sm" data-wedit="${i}">${icon('edit')}修改</button><button class="btn ghost sm danger" data-wdel="${i}" aria-label="刪除">${icon('trash')}</button></div>${roster(x.entries, tag)}</div>`).join('')}
      ${leftGroups().length ? `<button class="btn ghost sm" data-wmore>${icon('plus')}報名其他組別</button>` : ''}
      <div class="row" style="margin-top:14px">${icon('car')}停車證<input type="number" min="0" max="20" data-wpark value="${w.parking}" style="width:70px">張<span class="small muted">${parkNote(s)}</span></div>
      <label style="margin-top:10px">${NOTE_LABEL}<textarea data-wnote rows="2">${esc(w.note)}</textarea></label>
      <table class="list fee" style="max-width:420px;margin-top:8px"><tbody>${f.items.map(x => `<tr><td>${x.label}</td><td class="r">${x.n} ${x.unit} × ${x.price.toLocaleString('en-US')}</td><td class="r">${x.sum.toLocaleString('en-US')}</td></tr>`).join('')}<tr class="tot"><td>應繳合計</td><td></td><td class="r">${fmtMoney(f.total)}</td></tr></tbody></table>
      <div class="row" style="margin-top:12px"><button class="btn ghost" data-wback>上一步</button><span class="spacer"></span><button class="btn" data-wsubmit>${icon('check')}確認送出</button></div>`;
  }
  return `<div class="panel">${body}</div>`;
}
function wizNext(step) {
  const st = getState(), w = wiz;
  if (step === 'contact') {
    w.contact.name = $('[data-c="name"]').value.trim(); w.contact.phone = $('[data-c="phone"]').value.trim();
    if (!w.contact.name) return toast('請填寫聯絡人姓名');
    w.step = w.groups.length ? 'review' : 'pick';
  } else if (step === 'fill') {
    readGroup(w.cur);
    const err = checkGroup(st, w.cur); if (err) return toast(err);
    const g = { group: w.cur.group, unit: w.cur.unit, entries: cleaned(w.cur) };
    if (w.curIdx >= 0) w.groups[w.curIdx] = g; else w.groups.push(g);
    const back = w.curIdx >= 0; w.cur = null;
    w.step = back || !leftGroups().length ? 'review' : 'more';
  }
  render(); scrollTo(0, 0);
}
function pickGroup(g) {
  const w = wiz, prevUnit = (w.groups.find(x => x.group !== 'S') || {}).unit || '';
  w.cur = blankGroup(g, g === 'S' ? '' : prevUnit); w.curIdx = -1; w.step = 'fill';
  render(); scrollTo(0, 0);
}
function wizBack() {
  const w = wiz;
  if (w.step === 'pick') w.step = w.groups.length ? 'review' : 'contact';
  else if (w.step === 'fill') { readGroup(w.cur); w.step = w.curIdx >= 0 ? 'review' : w.groups.length ? 'more' : 'pick'; }
  else if (w.step === 'review') w.step = leftGroups().length ? 'more' : 'contact';
  render(); scrollTo(0, 0);
}
function wizSubmit() {
  const w = wiz, p = $('[data-wpark]'); if (p) w.parking = Math.max(0, Number(p.value) || 0);
  if (!w.groups.length) return toast('還沒有填任何組別');
  update(n => {
    let bid = '';
    w.groups.forEach((g, i) => {
      const id = uid(), now = Date.now(); bid = bid || id;
      n.regs[id] = { id, bid, group: g.group, unit: g.unit, contact: { ...w.contact }, editors: [], parking: 0, note: w.note.trim(), createdAt: now + i, updatedAt: now, entries: [], pays: [], log: [] };
      applyChange(n, id, { entries: g.entries, parking: i === 0 ? w.parking : 0 }, me);
      n.regs[id].log = [{ ts: now, by: me, text: `送出報名（${GROUPS[g.group].name}）` }];
    });
  });
  wiz = null; view = 'home'; render(); scrollTo(0, 0);
  toast('已送出報名');
}

// ---------------- 修改名單（一個組別） ----------------
function startEdit(r) {
  const entries = JSON.parse(JSON.stringify(r.entries.filter(e => e.status !== 'out')));
  GROUPS[r.group].events.filter(ev => KIND[ev] !== 'team' && !entries.some(e => e.ev === ev)).forEach(ev => entries.push(blankInd(ev)));
  edit = { rid: r.id, group: r.group, unit: r.unit, entries, note: r.note || '' };
  view = 'edit';
}
function editView(st) {
  const r = st.regs[edit.rid];
  return `<div class="panel"><div class="row"><span class="gtag">${GROUPS[r.group].name}</span><h2 style="margin:0">修改名單</h2><span class="spacer"></span><button class="btn ghost sm" data-ecancel>${icon('close')}取消</button></div>
    ${groupForm(st, edit, r)}
    <label style="margin-top:12px">${NOTE_LABEL}<textarea data-enote rows="2">${esc(edit.note)}</textarea></label>
    <div class="row" style="margin-top:12px"><span class="spacer"></span><button class="btn" data-esave>${icon('check')}儲存修改</button></div></div>`;
}
function editSave() {
  readGroup(edit);
  const st = getState(), err = checkGroup(st, edit); if (err) return toast(err);
  if (phase(st) !== 'open' && phase(st) !== 'edit') { toast('名單修改已截止'); edit = null; view = 'home'; render(); return; }
  const chg = { entries: cleaned(edit) }, note = edit.note.trim();
  let lines = [];
  update(n => { const r = n.regs[edit.rid]; lines = applyChange(n, edit.rid, chg, me); if ((r.note || '') !== note) { r.note = note; r.log.push({ ts: Date.now(), by: me, text: `備註改為「${note}」` }); lines.push('備註'); } });
  toast(lines.length ? '已儲存修改' : '沒有修改');
  edit = null; view = 'home'; render();
}

// ---------------- 事件 ----------------
const cur = () => (view === 'wiz' ? wiz.cur : edit);
document.addEventListener('click', ev => {
  if (ev.target.classList.contains('modal-bg')) { pop = ''; qaQ = ''; drawPop(getState()); return; }
  const b = ev.target.closest('button'); if (!b) return;
  const d = b.dataset;
  if ('login' in d) { const v = $('#me').value.trim(); if (!/^\S+@\S+\.\S+$/.test(v)) { toast('請輸入信箱'); return; } me = v; try { localStorage.setItem(ME_KEY, me); } catch (e) { /* 無痕 */ } afterLogin(); render(); }
  else if ('out' in d) { me = ''; try { localStorage.removeItem(ME_KEY); } catch (e) { /* 無痕 */ } view = 'home'; wiz = null; edit = null; render(); }
  else if ('reset' in d) { if (confirm('重設示範資料？你在示範模式輸入的內容會清掉。')) { resetDemo(); view = 'home'; wiz = null; edit = null; toast('已重設示範資料'); } }
  else if ('pop' in d) { pop = d.pop; if (!pop) qaQ = ''; drawPop(getState()); if (pop === 'qa') { const q = $('#qaq'); if (q) q.focus(); } }
  else if (d.qaq) { qaShow.has(d.qaq) ? qaShow.delete(d.qaq) : qaShow.add(d.qaq); $('.qal').innerHTML = qaItems(getState().settings); }
  else if ('new' in d) { startWiz(); render(); scrollTo(0, 0); }
  else if (d.wnext) wizNext(d.wnext);
  else if ('wback' in d) wizBack();
  else if ('wmore' in d) { wiz.step = 'pick'; render(); scrollTo(0, 0); }
  else if (d.gpick) pickGroup(d.gpick);
  else if ('wnone' in d) { wiz.step = 'review'; render(); scrollTo(0, 0); }
  else if ('wcancel' in d) { wiz = null; view = 'home'; render(); }
  else if (d.payagain) { payOpen.add(d.payagain); render(); }
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
    if (!a || !t || !/^\d{5}$/.test(l5)) { toast('請填寫匯款金額、匯款時間與帳號末五碼'); return; }
    payOpen.delete(rid);
    update(n => { const r = n.regs[rid]; r.pays.push({ amount: a, time: t, last5: l5, ts: Date.now() }); if (r.fin && r.fin.state === 'mismatch') r.fin = { ...r.fin, state: '' }; r.log.push({ ts: Date.now(), by: me, text: `回報匯款 ${a} 元` }); });
    toast('已回報匯款，等待總務對帳');
  }
  else if (d.edAdd) { const inp = $(`[data-ed-new="${d.edAdd}"]`), v = inp.value.trim(); if (!/^\S+@\S+\.\S+$/.test(v)) { toast('請輸入信箱'); return; } update(n => { batchRegs(n, n.regs[d.edAdd]).forEach((r, i) => { if (!r.editors.some(x => norm(x) === norm(v))) { r.editors.push(v); if (!i) r.log.push({ ts: Date.now(), by: me, text: `加入共同管理 ${v}` }); } }); }); }
  else if (d.edDel) { const [rid, m] = d.edDel.split('|'); update(n => { batchRegs(n, n.regs[rid]).forEach((r, i) => { r.editors = r.editors.filter(x => x !== m); if (!i) r.log.push({ ts: Date.now(), by: me, text: `移除共同管理 ${m}` }); }); }); }
  else if (d.log) { open.has(d.log) ? open.delete(d.log) : open.add(d.log); render(); }
});
document.addEventListener('input', ev => {
  if (ev.target.id === 'qaq') { qaQ = ev.target.value; $('.qal').innerHTML = qaItems(getState().settings); }
  if (ev.target.matches('[data-wnote]') && wiz) wiz.note = ev.target.value;
  if (ev.target.matches('[data-enote]') && edit) edit.note = ev.target.value;
});
document.addEventListener('change', ev => {
  if (ev.target.matches('[data-f="captain"]') && cur()) { readGroup(cur()); render(); return; }
  if (ev.target.matches('[data-wpark]') && wiz) { wiz.parking = Math.max(0, Number(ev.target.value) || 0); render(); }
});
document.addEventListener('keydown', ev => {
  if (ev.key === 'Enter' && ev.target.id === 'me') $('[data-login]').click();
  if (ev.key === 'Escape' && pop) { pop = ''; qaQ = ''; drawPop(getState()); }
  // 隊員欄按 Enter：跳到下一格，最後一格就再加一格
  if (ev.key === 'Enter' && /^m\d+$/.test(ev.target.dataset.f || '')) { ev.preventDefault(); const box = ev.target.closest('[data-eid]'); const ins = $$('[data-f^="m"]', box); const i = ins.indexOf(ev.target); if (ins[i + 1]) ins[i + 1].focus(); else { const add = $('[data-add-mem]', box); if (add) add.click(); } }
});
// 填表時不要被其他分頁的資料更新重畫打斷
subscribe(() => { if (view === 'home') render(); });
if (me) afterLogin();
render();
