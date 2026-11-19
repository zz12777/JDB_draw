// 簽到處的名單：和抽籤系統的簽到表同一套分區（只報個人賽、大專男團、大專女團、社會組）
import { signinSections, signinDocx, withParking } from '../../js/signin.js';
import { unitFromTeam } from '../../js/schools.js';
import { checkinKey } from './store.js';

/** 回傳 [{ code, title, team, rows: [{ label, unit, key, park }] }] */
/** 大會台匯入的籤表，整理成抽籤系統簽到表用的格式 */
export function signinEvents(state) {
  const ev = {};
  (state.events || []).forEach(e => {
    if (e.groups) ev[e.name] = e.groups.flatMap(g => g.teams || []).filter(Boolean).map(n => ({ name: n, school: unitFromTeam(n) }));
    else ev[e.name] = Object.values(e.byPos || {}).filter(x => x && x.name).map(x => ({ name: x.name, school: x.school }));
  });
  return ev;
}
/** 簽到表標題，例如「第十三屆TIBHAR交大盃」 */
export function signinTitle(state) {
  const t = String(state.annTitle || '').replace(/成績公告$/, '').trim();
  return t || `${state.edition || ''}${state.title || '交大盃'}`;
}
export const signinWord = state => signinDocx(signinEvents(state), signinTitle(state), { parking: state.parking });
export function checkinSections(state) {
  const ev = signinEvents(state);
  const secs = withParking(signinSections(ev), state.parking).sections;
  return secs.map(sec => ({ ...sec, rows: sec.rows.map(r => ({ ...r, key: checkinKey(`${sec.code}|${r.label}`) })) }));
}
/** 有團體賽但還沒勾「已簽到且領點單」的列 */
export function missingLineup(state, code) {
  const ci = state.checkin || {};
  return checkinSections(state).filter(x => x.team && (!code || x.code === code)).flatMap(x => x.rows.filter(r => !(ci[r.key] && ci[r.key].ok)).map(r => ({ ...r, note: (ci[r.key] || {}).note || '' })));
}
