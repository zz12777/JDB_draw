// 表單回應解析（沿用第十屆 Google 表單格式）
import { extractSchool, normalizeTeamName, unitFromTeam, normalizeText } from './schools.js';
import { uid } from './util.js';

export const EVENTS = {
  men: ['男團', '男單', '男雙'],
  women: ['女團', '女單', '女雙'],
  social: ['社團'],
};
export const ALL_EVENTS = ['男團', '男單', '男雙', '女團', '女單', '女雙', '社團'];
export const EVENT_TYPE = {
  男團: 'team', 女團: 'team', 社團: 'team',
  男單: 'single', 女單: 'single', 男雙: 'double', 女雙: 'double',
};
export const KIND_LABEL = { men: '男子組', women: '女子組', social: '社會組' };

const JUNK = /^(無|没有|沒有|x|X|-|－|—|na|n\/a|none|0)$/i;
const CJK = /[㐀-鿿]/;

const clean = v => (v === null || v === undefined) ? '' : String(v).replace(/\r/g, '').trim();

function isTimestamp(v) {
  if (v instanceof Date) return true;
  if (typeof v === 'number') return v > 30000;
  return /\d{4}[\/\-.]\d{1,2}[\/\-.]\d{1,2}/.test(clean(v));
}

function findCol(headers, re, exclude) {
  return headers.findIndex(h => re.test(h) && !(exclude && exclude.test(h)));
}

/** 判斷是哪一組的表單 */
export function detectKind(headers) {
  const h = headers.join('|');
  if (/男單|男雙/.test(h)) return 'men';
  if (/女單|女雙/.test(h)) return 'women';
  if (/隊名/.test(h)) return 'social';
  return null;
}

/** 切單打名單 */
export function splitNames(text) {
  const t = clean(text);
  if (!t || JUNK.test(t)) return [];
  const out = [];
  for (let part of t.split(/[,，、;；\/／\n|]+/)) {
    part = part.trim();
    if (!part) continue;
    // 中文名之間只用空白隔開
    if (CJK.test(part) && /\s/.test(part)) {
      part.split(/\s+/).forEach(p => p && out.push(p));
    } else out.push(part.replace(/\s+/g, ' '));
  }
  return out.filter(n => !JUNK.test(n));
}

/** 切雙打名單，每組兩人 */
export function splitPairs(text) {
  const t = clean(text);
  if (!t || JUNK.test(t)) return [];
  const pairs = [];
  for (let part of t.split(/[,，、;；\n]+/)) {
    part = part.trim();
    if (!part) continue;
    const ppl = part.split(/\s*[\/／&＆+＋]\s*/).map(s => s.trim()).filter(Boolean);
    if (ppl.length === 2) pairs.push({ a: ppl[0], b: ppl[1], ok: true, raw: part });
    else if (ppl.length === 1 && CJK.test(part) && /\s/.test(part) && part.split(/\s+/).length === 2) {
      const [a, b] = part.split(/\s+/);
      pairs.push({ a, b, ok: true, raw: part });
    } else pairs.push({ a: part, b: '', ok: false, raw: part });
  }
  return pairs;
}

/**
 * 格子可以是一般值，或讀 xlsx 時帶格式的物件：
 * { t: 原文字, keep: 去掉刪除線後的文字, strike: 整格刪除線, struck: [被劃掉的文字] }
 */
const isRich = c => c && typeof c === 'object' && !(c instanceof Date) && 'keep' in c;
const rawOf = c => (isRich(c) ? c.t : c);
const keepOf = c => (isRich(c) ? c.keep : c);

/** 解析一張表單回應（第一列為標題） */
export function parseResponses(rows, aliases = {}) {
  const headers = (rows[0] || []).map(h => clean(rawOf(h)).replace(/\s+/g, ''));
  const kind = detectKind(headers);
  if (!kind) throw new Error('看不出是哪一組的表單（找不到 男單、女單 或 隊名 欄位）');

  const col = {
    time: findCol(headers, /時間戳記/),
    email: findCol(headers, /^電子郵件/),
    single: findCol(headers, /單參賽名單/),
    double: findCol(headers, /雙參賽名單/),
    singleWait: findCol(headers, /單候補/),
    unit: findCol(headers, /單位名稱|校名及隊伍名稱/),
    contact: findCol(headers, /聯絡人姓名/),
  };
  // 隊名與隊員名單成對；隊員欄標「候補」者為候補隊伍
  const teamCols = [];
  headers.forEach((h, i) => {
    if (!/^隊名/.test(h)) return;
    let m = -1;
    for (let j = i + 1; j < headers.length && !/^隊名/.test(headers[j]); j++) {
      if (/^隊員/.test(headers[j])) { m = j; break; }
    }
    teamCols.push({ name: i, members: m, waitlist: m >= 0 && /候補/.test(headers[m]) });
  });

  const responses = [];
  rows.slice(1).forEach((rawRow, i) => {
    if (!rawRow || !isTimestamp(rawOf(rawRow[col.time]))) return; // 工作人員備註列
    const filled = rawRow.filter(c => clean(rawOf(c)) !== '');
    const struckCells = filled.filter(c => isRich(c) && c.strike).length;
    const rowStruck = filled.length > 0 && struckCells / filled.length >= 0.5;
    const partial = [];
    rawRow.forEach((c, j) => {
      if (isRich(c) && !c.strike && c.struck && c.struck.length && !rowStruck) {
        partial.push(`${headers[j]}劃掉「${c.struck.join('、')}」`);
      }
    });
    const row = rawRow.map(c => (rowStruck ? rawOf(c) : keepOf(c)));
    const get = c => (c >= 0 ? clean(row[c]) : '');
    const r = {
      rowNo: i + 2, include: !rowStruck, struck: rowStruck,
      time: row[col.time] instanceof Date ? row[col.time].toISOString() : get(col.time),
      email: get(col.email).toLowerCase(),
      contact: get(col.contact),
      unitRaw: get(col.unit),
      teams: [], singles: [], singlesWait: [], doubles: [], notes: [],
    };
    if (rowStruck) r.notes.push('整列有刪除線，預設不採用');
    partial.forEach(p => r.notes.push(p + '，已拿掉'));
    for (const tc of teamCols) {
      const raw = get(tc.name);
      if (!raw || JUNK.test(raw)) continue;
      if (/[\/／]/.test(raw)) { r.notes.push(`隊名欄填了「${raw}」，已略過`); continue; }
      if (tc.members >= 0 && !get(tc.members)) {
        r.notes.push(`「${raw}」沒有隊員名單，視為只報個人賽，未列入團體賽`);
        continue;
      }
      let name = raw;
      const tokens = raw.split(/\s+/).filter(Boolean);
      if (tokens.length > 1 && tokens.every(t => extractSchool(t))) {
        name = tokens[tokens.length - 1];
        r.notes.push(`隊名「${raw}」視為改名，採用「${name}」`);
      }
      r.teams.push({
        name: kind === 'social' ? normalizeText(name) : normalizeTeamName(name, aliases),
        raw, members: get(tc.members), waitlist: tc.waitlist,
      });
    }
    r.singles = splitNames(get(col.single));
    r.singlesWait = splitNames(get(col.singleWait));
    r.doubles = splitPairs(get(col.double));
    r.doubles.filter(p => !p.ok).forEach(p => r.notes.push(`雙打「${p.raw}」不是兩人`));

    // 學校 / 單位
    if (kind === 'social') {
      const u = r.unitRaw && !/[,，、]/.test(r.unitRaw) ? r.unitRaw : '';
      r.school = u ? unitFromTeam(u, aliases) : (r.teams[0] ? unitFromTeam(r.teams[0].name, aliases) : '');
    } else {
      r.school = (r.teams[0] && extractSchool(r.teams[0].name, aliases)) || extractSchool(r.unitRaw, aliases) || '';
      if (!r.school) r.notes.push('抓不到校名，請手動填寫');
    }
    responses.push(r);
  });

  // 同一信箱多筆
  const byEmail = new Map();
  responses.forEach(r => { if (r.include && r.email) byEmail.set(r.email, (byEmail.get(r.email) || 0) + 1); });
  responses.forEach(r => {
    if (r.include && r.email && byEmail.get(r.email) > 1) r.notes.push('同一信箱有多筆回應，可能是更新，請確認');
  });

  return { kind, responses };
}

/**
 * 把回應轉成各項目名單（相同的人或隊自動合併）。
 * 回傳 { events: {項目: [entry]}, waitlist: {項目: [entry]} }
 */
export function buildEntries(kind, responses, aliases = {}) {
  const [teamEv, singleEv, doubleEv] = EVENTS[kind];
  const events = {}, waitlist = {};
  EVENTS[kind].forEach(e => { events[e] = []; waitlist[e] = []; });
  const seen = new Map();

  const add = (ev, list, entry, key) => {
    const k = ev + '|' + key;
    if (seen.has(k)) {
      const first = seen.get(k);
      if (!first.flags.includes('重複報名已合併')) first.flags.push('重複報名已合併');
      return;
    }
    seen.set(k, entry);
    list.push(entry);
  };
  const mk = (school, name, src, extra = {}) => ({ id: uid(), school, name, seed: '', src, flags: [], ...extra });

  for (const r of responses.filter(x => x.include)) {
    for (const t of r.teams) {
      const school = kind === 'social' ? r.school : (extractSchool(t.name, aliases) || r.school);
      const target = t.waitlist ? waitlist[teamEv] : events[teamEv];
      add(teamEv, target, mk(school, t.name, r.rowNo, { members: t.members }), (t.waitlist ? 'W:' : '') + t.name);
    }
    if (singleEv) {
      r.singles.forEach(n => add(singleEv, events[singleEv], mk(r.school, n, r.rowNo), r.school + '|' + n));
      r.singlesWait.forEach(n => add(singleEv, waitlist[singleEv], mk(r.school, n, r.rowNo), 'W:' + r.school + '|' + n));
    }
    if (doubleEv) {
      r.doubles.forEach(p => {
        const name = p.ok ? `${p.a}/${p.b}` : p.raw;
        const e = mk(r.school, name, r.rowNo);
        if (!p.ok) e.flags.push('不是兩人');
        add(doubleEv, events[doubleEv], e, r.school + '|' + [p.a, p.b].sort().join('/'));
      });
    }
  }
  // 同項目同名不同校
  for (const ev of Object.keys(events)) {
    const byName = new Map();
    events[ev].forEach(e => {
      if (!byName.has(e.name)) byName.set(e.name, []);
      byName.get(e.name).push(e);
    });
    byName.forEach(list => {
      if (list.length > 1) list.forEach(e => e.flags.push('同名出現多次'));
    });
    events[ev].forEach(e => { if (!e.school) e.flags.push('缺校名'); });
  }
  return { events, waitlist };
}
