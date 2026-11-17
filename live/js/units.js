// 簽到處的名單：和抽籤系統的簽到表同一套分區（只報個人賽、大專男團、大專女團、社會組）
import { signinSections } from '../../js/signin.js';
import { unitFromTeam } from '../../js/schools.js';
import { checkinKey } from './store.js';

/** 回傳 [{ code, title, team, rows: [{ label, key }] }] */
export function checkinSections(state) {
  const ev = {};
  (state.events || []).forEach(e => {
    if (e.groups) ev[e.name] = e.groups.flatMap(g => g.teams || []).filter(Boolean).map(n => ({ name: n, school: unitFromTeam(n) }));
    else ev[e.name] = Object.values(e.byPos || {}).filter(x => x && x.name).map(x => ({ name: x.name, school: x.school }));
  });
  return signinSections(ev).map(sec => ({ ...sec, rows: sec.rows.map(label => ({ label, key: checkinKey(`${sec.code}|${label}`) })) }));
}
/** 有團體賽但還沒勾「已簽到且領點單」的列 */
export function missingLineup(state, code) {
  const ci = state.checkin || {};
  return checkinSections(state).filter(x => x.team && (!code || x.code === code)).flatMap(x => x.rows.filter(r => !(ci[r.key] && ci[r.key].ok)).map(r => ({ ...r, note: (ci[r.key] || {}).note || '' })));
}
