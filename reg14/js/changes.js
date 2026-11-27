// 名單修改：比較修改前後、套用修改（截止前報名者自己改；截止後由大會審核異動申請後套用）
import { KIND, entryName, newStatus, uid } from './model.js';

const listText = a => (a || []).filter(Boolean).join('、');
const FIELDS = [['name', '隊名'], ['coach', '教練'], ['leader', '領隊'], ['captain', '隊長']];

/** 修改內容的文字說明（每行一件事） */
export function diffText(r, chg) {
  const next = chg.entries;
  const out = [];
  const old = (r.entries || []).filter(e => e.status !== 'out');
  const byId = new Map(old.map(e => [e.id, e]));
  next.forEach(n => {
    const o = byId.get(n.id);
    if (!o) { out.push(`新增 ${n.ev} ${entryName(n)}`); return; }
    byId.delete(n.id);
    if (KIND[n.ev] === 'team') {
      FIELDS.forEach(([k, l]) => { if ((o[k] || '') !== (n[k] || '')) out.push(`${n.ev} ${o.name}：${l} ${o[k] || '（空白）'} 改為 ${n[k] || '（空白）'}`); });
      const add = (n.members || []).filter(x => !(o.members || []).includes(x)), del = (o.members || []).filter(x => !(n.members || []).includes(x));
      if (add.length || del.length) out.push(`${n.ev} ${n.name}：隊員${del.length ? ` 移除 ${listText(del)}` : ''}${add.length ? ` 新增 ${listText(add)}` : ''}`);
      if ((o.lineup || 'online') !== (n.lineup || 'online')) out.push(`${n.ev} ${n.name}：點單方式改為${n.lineup === 'paper' ? '紙本' : '線上'}`);
    } else if (entryName(o) !== entryName(n)) out.push(`${n.ev} ${entryName(o)} 改為 ${entryName(n)}`);
  });
  byId.forEach(o => out.push(`退出 ${o.ev} ${entryName(o)}`));
  if (chg.parking != null && (r.parking || 0) !== chg.parking) out.push(`停車證 ${r.parking || 0} 張改為 ${chg.parking} 張`);
  return out;
}

/**
 * chg = { entries: 修改後還在的項目, parking: 停車證張數 }，套用到 st.regs[rid]：新增的項目依名額正取或候補；拿掉的項目標為退出（保留紀錄）。
 * 回傳說明文字，並寫進報名的修改紀錄。
 */
export function applyChange(st, rid, chg, by, extra = {}) {
  const r = st.regs[rid], next = chg.entries;
  const lines = diffText(r, chg);
  const keep = new Set(next.map(n => n.id));
  r.entries.forEach(e => { if (e.status !== 'out' && !keep.has(e.id)) { e.status = 'out'; e.outAt = Date.now(); } });
  next.forEach(n => {
    const o = r.entries.find(e => e.id === n.id);
    if (o) { Object.assign(o, n, { status: o.status, ts: o.ts }); return; }
    r.entries.push({ ...n, id: n.id || uid(), ts: Date.now(), status: newStatus(st, n.ev) });
  });
  if (chg.parking != null) r.parking = chg.parking;
  Object.assign(r, extra);
  r.updatedAt = Date.now();
  if (lines.length) r.log.push({ ts: Date.now(), by, text: lines.join('；') });
  return lines;
}
