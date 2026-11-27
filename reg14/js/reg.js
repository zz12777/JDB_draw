// 參賽者系統原型：報名者頁面（報名、名單修改、繳費回報、候補順位、共同管理）
import { GROUPS, KIND, UNIT_WORD, STATUS_TEXT, PAY_TEXT, phase, quotaOf, waitRank, feeOf, payState, paidSum, mine, entryName, fmtMoney, fmtTime, fmtDT, norm, uid } from './model.js';
import { getState, update, subscribe, resetDemo } from './store.js';
import { diffText, applyChange } from './changes.js';
import { esc, $, $$, icon, toast, header, demoBar } from './ui.js';

const ME_KEY = 'jdb-reg14-me';
let me = (() => { try { return localStorage.getItem(ME_KEY) || ''; } catch (e) { return ''; } })();
let view = { kind: 'home' }; // home | form（新增或修改）
let draft = null;            // 表單內容
const open = new Set();      // 展開修改紀錄的報名

const s0 = () => getState().settings;

function render() {
  const st = getState(), s = st.settings;
  $('#top').innerHTML = header(s, '報名系統', me ? `<span class="who">${icon('user')}${esc(me)}</span><button class="btn ghost sm" data-out>登出</button>` : '');
  if (!me) { $('#main').innerHTML = demoBar() + loginView(); return; }
  $('#main').innerHTML = demoBar('<button class="btn ghost sm" data-reset>重設示範資料</button>') + (view.kind === 'form' ? formView(st) : homeView(st));
}

// ---------------- 登入 ----------------
function loginView() {
  return `<div class="panel narrow center"><h2>交大盃報名系統</h2>
    <p class="muted small">用 Google 帳號登入後，可以報名、修改名單、回報匯款、查看候補順位。這個帳號也是之後線上點單的帳號。</p>
    <p class="small">示範模式沒有真的 Google 登入，請輸入任一信箱代替；輸入 <b>contact1@example.com</b> 可以看到已經報名的單位。</p>
    <div class="row" style="justify-content:center"><input id="me" type="email" placeholder="你的 Google 帳號信箱" style="width:min(320px,100%)"><button class="btn" data-login>登入</button></div></div>`;
}

// ---------------- 首頁 ----------------
function availChips(st, evs) {
  return evs.map(ev => { const q = quotaOf(st, ev); return `<span class="avail ${q.full ? 'full' : q.left <= 2 ? 'low' : ''}"><b>${ev}</b>${q.full ? '已額滿，報名將列入候補' : `剩 ${q.left} ${UNIT_WORD[KIND[ev]]}`}</span>`; }).join('');
}
function homeView(st) {
  const s = st.settings, ph = phase(st);
  const list = mine(st, me);
  const period = `報名期間 ${fmtDT(s.open)} 至 ${fmtDT(s.close)}`;
  const banner = ph === 'open' ? `<div class="panel"><div class="row"><h2 style="margin:0">報名中</h2><span class="muted small">${period}</span><span class="spacer"></span><button class="btn" data-new>${icon('plus')}新增報名</button></div>
      <div class="avails">${availChips(st, Object.values(GROUPS).flatMap(g => g.events))}</div></div>`
    : `<div class="panel"><h2 style="margin:0 0 4px">${ph === 'before' ? '尚未開放報名' : '報名已截止'}</h2><p class="muted small" style="margin:0">${period}${ph === 'closed' ? '。名單需要修改請送出異動申請，由大會審核。' : ''}</p></div>`;
  return banner + (list.length ? list.map(r => regCard(st, r, ph)).join('') : `<div class="panel"><p class="muted">這個帳號還沒有報名資料。${ph === 'open' ? '按「新增報名」開始。' : ''}</p></div>`);
}

function statusCell(st, e) {
  if (e.status === 'wait') return `<span class="st wait">候補第 ${waitRank(st, e)} 位</span>`;
  if (e.status === 'out') return '<span class="st out">已退出</span>';
  return `<span class="st ok">正取</span>${e.promotedAt ? `<div class="small" style="color:var(--red)">已遞補，請於 ${esc(fmtDT(e.payDue))} 前完成匯款</div>` : ''}`;
}
function entryRow(st, e) {
  const team = KIND[e.ev] === 'team';
  return `<tr class="${e.status === 'out' ? 'dim' : ''}"><td class="nowrap"><b>${e.ev}</b></td><td>${esc(entryName(e))}${team ? `<div class="small muted">教練 ${esc(e.coach || '－')}　領隊 ${esc(e.leader || '－')}　隊長 ${esc(e.captain || '－')}</div><div class="small">${esc((e.members || []).join('、'))}</div>` : ''}</td>
    <td class="nowrap small">${team ? (e.lineup === 'paper' ? '紙本點單' : '線上點單') : ''}</td><td class="nowrap">${statusCell(st, e)}</td></tr>`;
}
function regCard(st, r, ph) {
  const s = st.settings, f = feeOf(st, r), ps = payState(r);
  const owner = norm(r.contact.email) === norm(me);
  const pend = (r.reqs || []).filter(q => q.status === 'pending');
  const done = (r.reqs || []).filter(q => q.status !== 'pending').slice(-3);
  const shown = r.entries.filter(e => e.status !== 'out' || open.has(r.id));
  return `<div class="panel reg"><div class="row"><span class="gtag">${GROUPS[r.group].name}</span><h2 style="margin:0">${esc(r.unit)}</h2><span class="muted small">聯絡人 ${esc(r.contact.name)}　${esc(r.contact.email)}${r.contact.phone ? `　${esc(r.contact.phone)}` : ''}</span><span class="spacer"></span>
      ${ph !== 'before' ? `<button class="btn ghost sm" data-edit="${r.id}">${icon('edit')}${ph === 'open' ? '修改名單' : '申請異動'}</button>` : ''}</div>
    <table class="list ent"><thead><tr><th>項目</th><th>隊名／選手</th><th>點單</th><th>狀態</th></tr></thead><tbody>${shown.map(e => entryRow(st, e)).join('')}</tbody></table>
    ${pend.length ? `<div class="note"><b>異動申請審核中</b>${pend.map(q => `<div class="small">${fmtTime(q.ts)}　${esc(q.text)}</div>`).join('')}</div>` : ''}
    ${done.length ? `<div class="small muted" style="margin-top:6px">${done.map(q => `${fmtTime(q.decidedAt)} 異動申請${q.status === 'approved' ? '已核准' : '未核准'}：${esc(q.text)}${q.reply ? `（${esc(q.reply)}）` : ''}`).join('<br>')}</div>` : ''}
    <div class="cols">
      <div><h3>${icon('money')}應繳金額</h3>
        <table class="list fee"><tbody>${f.items.map(x => `<tr><td>${x.label}</td><td class="r">${x.n} ${x.unit} × ${x.price.toLocaleString('en-US')}</td><td class="r">${x.sum.toLocaleString('en-US')}</td></tr>`).join('')}
          <tr class="tot"><td>合計</td><td></td><td class="r">${fmtMoney(f.total)}</td></tr></tbody></table>
        <div class="row small" style="margin-top:6px">${icon('car')}停車證<button class="btn ghost sm" data-park="${r.id}|-1" ${r.parking ? '' : 'disabled'}>－</button><b>${r.parking || 0}</b> 張<button class="btn ghost sm" data-park="${r.id}|1">＋</button><span class="muted">每張 ${s.parkingPrice} 元，加購自動併入應繳</span></div>
        ${r.entries.some(e => e.status === 'wait') ? '<p class="small muted" style="margin:6px 0 0">候補的項目不用先繳費，遞補後再匯款。</p>' : ''}
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

// ---------------- 報名表單（新增或修改） ----------------
const blank = ev => (KIND[ev] === 'team' ? { id: uid(), ev, name: '', coach: '', leader: '', captain: '', members: [], lineup: 'online' } : { id: uid(), ev, players: KIND[ev] === 'double' ? ['', ''] : [''] });
function startNew(g) {
  draft = { mode: 'new', group: g || 'M', unit: '', contact: { name: '', email: me, phone: '' }, parking: 0, entries: [], agree: false };
}
function startEdit(r) {
  draft = { mode: 'edit', rid: r.id, group: r.group, unit: r.unit, contact: { ...r.contact }, parking: r.parking || 0, entries: JSON.parse(JSON.stringify(r.entries.filter(e => e.status !== 'out'))), agree: true };
}
function formView(st) {
  const s = st.settings, d = draft, ph = phase(st);
  const r = d.rid ? st.regs[d.rid] : null;
  const evs = GROUPS[d.group].events;
  const teamBox = e => `<div class="ebox" data-eid="${e.id}"><div class="row"><b>${e.ev}</b>${statusTag(st, e)}<span class="spacer"></span><button class="btn ghost sm danger" data-del-entry="${e.id}">${icon('trash')}${r && r.entries.some(x => x.id === e.id) ? '退出' : '移除'}</button></div>
      <div class="grid4"><label>隊名<input data-f="name" value="${esc(e.name)}" placeholder="例：${esc(d.unit || '陽明交大')}A"></label><label>教練<input data-f="coach" value="${esc(e.coach)}"></label><label>領隊<input data-f="leader" value="${esc(e.leader)}"></label><label>隊長<input data-f="captain" value="${esc(e.captain)}"></label></div>
      <label>隊員（${s.events[e.ev].min}～${s.events[e.ev].max} 人，空白或換行分開）<textarea data-f="members" rows="2">${esc((e.members || []).join(' '))}</textarea></label>
      <div class="row small">點單方式<label class="radio"><input type="radio" name="lu-${e.id}" data-f="lineup" value="online" ${e.lineup !== 'paper' ? 'checked' : ''}>線上</label><label class="radio"><input type="radio" name="lu-${e.id}" data-f="lineup" value="paper" ${e.lineup === 'paper' ? 'checked' : ''}>紙本</label></div></div>`;
  const indBox = e => `<div class="ebox row" data-eid="${e.id}"><b>${e.ev}</b>${e.players.map((p, i) => `<input data-f="p${i}" value="${esc(p)}" placeholder="${e.players.length > 1 ? `選手 ${i + 1}` : '選手姓名'}" style="width:120px">`).join(e.players.length > 1 ? '<span class="muted">/</span>' : '')}${statusTag(st, e)}<span class="spacer"></span><button class="btn ghost sm danger" data-del-entry="${e.id}">${icon('trash')}</button></div>`;
  const evBlock = ev => {
    const c = s.events[ev], list = d.entries.filter(e => e.ev === ev), q = quotaOf(st, ev);
    const limit = KIND[ev] !== 'team' && c.perUnit ? `每單位最多 ${c.perUnit} ${UNIT_WORD[KIND[ev]]}` : '';
    const atLimit = KIND[ev] !== 'team' && c.perUnit && list.length >= c.perUnit;
    return `<div class="evb"><div class="row"><h3 style="margin:0">${ev}</h3><span class="small muted">報名費每${UNIT_WORD[KIND[ev]]} ${c.fee} 元${limit ? `，${limit}` : ''}</span><span class="avail ${q.full ? 'full' : ''}">${q.full ? '已額滿，報名將列入候補' : `剩 ${q.left} ${UNIT_WORD[KIND[ev]]}`}</span></div>
      ${list.map(e => (KIND[ev] === 'team' ? teamBox(e) : indBox(e))).join('')}
      <button class="btn ghost sm" data-add-entry="${ev}" ${atLimit ? 'disabled' : ''}>${icon('plus')}新增${KIND[ev] === 'team' ? '一隊' : KIND[ev] === 'double' ? '一組' : '一位'}</button>${atLimit ? '<span class="small muted">　已達每單位上限</span>' : ''}</div>`;
  };
  const after = d.mode === 'edit' && ph === 'closed';
  return `<div class="panel"><div class="row"><h2 style="margin:0">${d.mode === 'new' ? '新增報名' : after ? '申請名單異動' : '修改名單'}</h2><span class="spacer"></span><button class="btn ghost sm" data-cancel>${icon('close')}取消</button></div>
    ${after ? '<p class="note small">報名已截止，送出後由大會審核，核准後才會更新名單。</p>' : ''}
    ${d.mode === 'new' ? `<div class="row" style="margin:8px 0">組別${Object.entries(GROUPS).map(([k, g]) => `<label class="radio"><input type="radio" name="grp" value="${k}" data-grp ${d.group === k ? 'checked' : ''}>${g.name}</label>`).join('')}</div>` : `<p class="small muted">${GROUPS[d.group].name}</p>`}
    <div class="grid4"><label>${d.group === 'S' ? '隊伍單位' : '學校'}<input data-top="unit" value="${esc(d.unit)}" ${d.mode === 'edit' ? 'disabled' : ''}></label><label>聯絡人姓名<input data-top="cname" value="${esc(d.contact.name)}"></label>
      <label>聯絡人 email<input value="${esc(d.contact.email)}" disabled></label><label>手機（選填）<input data-top="phone" value="${esc(d.contact.phone)}" inputmode="tel"></label></div>
    ${evs.map(evBlock).join('')}
    <div class="row" style="margin-top:10px">${icon('car')}停車證<input type="number" min="0" max="20" data-top="parking" value="${d.parking}" style="width:70px">張<span class="small muted">每張 ${s.parkingPrice} 元</span></div>
    ${d.mode === 'new' ? `<label class="radio" style="margin-top:12px"><input type="checkbox" data-agree ${d.agree ? 'checked' : ''}>我已閱讀個資使用說明：只收比賽與對帳必要的資料，比賽結束兩個月後刪除；匯款明細只有總召、總務看得到。</label>` : ''}
    <div class="row" style="margin-top:12px"><span class="spacer"></span><button class="btn" data-submit>${icon('check')}${d.mode === 'new' ? '送出報名' : after ? '送出異動申請' : '儲存修改'}</button></div></div>`;
}
function statusTag(st, e) {
  const r = draft.rid ? st.regs[draft.rid] : null, o = r && r.entries.find(x => x.id === e.id);
  if (!o) return '';
  return o.status === 'wait' ? `<span class="st wait">候補第 ${waitRank(st, o)} 位</span>` : '<span class="st ok">正取</span>';
}

/** 表單輸入存回 draft */
function readForm() {
  if (!draft) return;
  const t = k => { const el = $(`[data-top="${k}"]`); return el ? el.value : null; };
  if (t('unit') != null && draft.mode === 'new') draft.unit = t('unit').trim();
  if (t('cname') != null) draft.contact.name = t('cname').trim();
  if (t('phone') != null) draft.contact.phone = t('phone').trim();
  if (t('parking') != null) draft.parking = Math.max(0, Number(t('parking')) || 0);
  const ag = $('[data-agree]'); if (ag) draft.agree = ag.checked;
  $$('[data-eid]').forEach(box => {
    const e = draft.entries.find(x => x.id === box.dataset.eid); if (!e) return;
    $$('[data-f]', box).forEach(inp => {
      const f = inp.dataset.f;
      if (f === 'members') e.members = inp.value.split(/[\s,，、]+/).filter(Boolean);
      else if (f === 'lineup') { if (inp.checked) e.lineup = inp.value; }
      else if (/^p\d$/.test(f)) e.players[Number(f[1])] = inp.value.trim();
      else e[f] = inp.value.trim();
    });
  });
}
function validate(st) {
  const s = st.settings, d = draft;
  if (!d.unit) return '請填寫學校或單位';
  if (!d.contact.name) return '請填寫聯絡人姓名';
  if (!d.entries.length) return '請至少報名一個項目';
  for (const e of d.entries) {
    if (KIND[e.ev] === 'team') {
      if (!e.name) return `${e.ev}：請填寫隊名`;
      const c = s.events[e.ev];
      if (e.members.length < c.min || e.members.length > c.max) return `${e.ev} ${e.name}：隊員要 ${c.min}～${c.max} 人，目前 ${e.members.length} 人`;
    } else if (e.players.some(p => !p)) return `${e.ev}：請填寫選手姓名`;
  }
  for (const ev of GROUPS[d.group].events) {
    const c = s.events[ev], n = d.entries.filter(e => e.ev === ev).length;
    if (KIND[ev] !== 'team' && c.perUnit && n > c.perUnit) return `${ev} 每單位最多 ${c.perUnit} ${UNIT_WORD[KIND[ev]]}`;
  }
  if (d.mode === 'new' && !d.agree) return '請勾選已閱讀個資使用說明';
  return '';
}
function submit() {
  readForm();
  const st = getState(), err = validate(st);
  if (err) { toast(err); return; }
  const d = draft, chg = { entries: d.entries.map(e => ({ ...e })), parking: d.parking };
  if (d.mode === 'new') {
    update(n => {
      const id = uid(), now = Date.now();
      n.regs[id] = { id, group: d.group, unit: d.unit, contact: d.contact, editors: [], parking: 0, createdAt: now, updatedAt: now, entries: [], pays: [], log: [], reqs: [] };
      applyChange(n, id, chg, me);
      n.regs[id].log = [{ ts: now, by: me, text: '送出報名' }];
    });
    toast('已送出報名，請依應繳金額匯款後回報');
  } else if (phase(st) === 'closed') {
    const lines = diffText(st.regs[d.rid], chg);
    if (!lines.length) { toast('沒有修改'); return; }
    update(n => { n.regs[d.rid].reqs.push({ id: uid(), ts: Date.now(), by: me, status: 'pending', text: lines.join('；'), change: chg, contact: d.contact }); });
    toast('已送出異動申請，大會審核後會更新');
  } else {
    let lines = [];
    update(n => { lines = applyChange(n, d.rid, chg, me, { contact: d.contact }); });
    const waits = getState().regs[d.rid].entries.filter(e => e.status === 'wait' && !st.regs[d.rid].entries.some(o => o.id === e.id));
    toast(lines.length ? (waits.length ? `已儲存，${waits.map(e => e.ev).join('、')} 已額滿，新增的列入候補` : '已儲存修改') : '沒有修改');
  }
  view = { kind: 'home' }; draft = null; render();
}

// ---------------- 事件 ----------------
document.addEventListener('click', ev => {
  const b = ev.target.closest('button'); if (!b) return;
  const d = b.dataset;
  if ('login' in d) { const v = $('#me').value.trim(); if (!/^\S+@\S+\.\S+$/.test(v)) { toast('請輸入信箱'); return; } me = v; try { localStorage.setItem(ME_KEY, me); } catch (e) { /* 無痕 */ } render(); }
  else if ('out' in d) { me = ''; try { localStorage.removeItem(ME_KEY); } catch (e) { /* 無痕 */ } view = { kind: 'home' }; render(); }
  else if ('reset' in d) { if (confirm('重設示範資料？你在示範模式輸入的內容會清掉。')) { resetDemo(); view = { kind: 'home' }; toast('已重設示範資料'); } }
  else if ('new' in d) { startNew('M'); view = { kind: 'form' }; render(); scrollTo(0, 0); }
  else if (d.edit) { startEdit(getState().regs[d.edit]); view = { kind: 'form' }; render(); scrollTo(0, 0); }
  else if ('cancel' in d) { view = { kind: 'home' }; draft = null; render(); }
  else if (d.addEntry) { readForm(); draft.entries.push(blank(d.addEntry)); render(); }
  else if (d.delEntry) { readForm(); draft.entries = draft.entries.filter(e => e.id !== d.delEntry); render(); }
  else if ('submit' in d) submit();
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
  if (ev.target.matches('[data-grp]') && draft) { readForm(); draft.group = ev.target.value; draft.entries = []; render(); }
});
document.addEventListener('keydown', ev => { if (ev.key === 'Enter' && ev.target.id === 'me') $('[data-login]').click(); });
// 表單打字時不要被其他分頁的資料更新重畫打斷
subscribe(() => { if (view.kind !== 'form') render(); });
render();
