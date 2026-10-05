// 校名正規化

const ABBR = [
  [/^.*學校財團法人/, ''],
  [/^(國立|私立|市立)/, ''],
  [/^宏國/, ''],
  [/台/g, '臺'],
  [/科技大學/g, '科大'],
  [/商業大學/g, '商大'],
  [/教育大學/g, '教大'],
  [/醫學大學/g, '醫大'],
  [/醫藥大學/g, '醫大'],
  [/師範大學/g, '師大'],
  [/體育大學/g, '體大'],
  [/藝術大學/g, '藝大'],
  [/警察專科學校/g, '警專'],
  [/醫(護|事)?(管理)?專科學校/g, '醫專'],
  [/[ 　]+/g, ''],
];

/** 預設別名（正規化後 → 慣用名稱），可在網頁上增修 */
export const DEFAULT_ALIASES = {
  '臺北教大': '國北教大',
};

const SUFFIX = /^(.+?(大學|科大|醫大|商大|教大|師大|體大|藝大|警專|醫專|學院|高中|高工|高商|高職|國中|國小))/;

export function normalizeText(s) {
  let t = String(s ?? '').trim()
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0));
  for (const [re, to] of ABBR) t = t.replace(re, to);
  return t;
}

/** 從隊名或單位名稱抓出校名；抓不到回傳 null */
export function extractSchool(raw, aliases = {}) {
  const t = normalizeText(raw);
  const m = t.match(SUFFIX);
  if (!m) return null;
  return applyAlias(m[1], aliases);
}

export function applyAlias(name, aliases = {}) {
  const all = { ...DEFAULT_ALIASES, ...aliases };
  let n = name;
  for (let i = 0; i < 5 && all[n] && all[n] !== n; i++) n = all[n];
  return n;
}

/** 隊名正規化：前段校名照校名規則，後段保留 */
export function normalizeTeamName(raw, aliases = {}) {
  const t = normalizeText(raw);
  const m = t.match(SUFFIX);
  if (!m) return t;
  return applyAlias(m[1], aliases) + t.slice(m[1].length);
}

/** 社會組單位：有校名用校名，否則去掉尾端的隊伍代號（A、B、紅、藍…） */
export function unitFromTeam(raw, aliases = {}) {
  const s = extractSchool(raw, aliases);
  if (s) return s;
  return normalizeText(raw).replace(/[A-Za-zＡ-Ｚａ-ｚ0-9０-９]$/, '') || normalizeText(raw);
}

/** 比對用的鍵：拿掉大學、科大等字，用來提示疑似同校 */
export function looseKey(name) {
  return normalizeText(name).replace(/(大學|科大|大)$/, '');
}
