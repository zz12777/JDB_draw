// 簽到表 Word：只報個人賽的學校、大專男子團體、大專女子團體、社會團體各一頁
// 欄位比照往年範本：學校單位、簽到欄、備註、停車證（備註留空現場手寫；停車證依資料庫的停車證張數填入）
import { unitFromTeam, looseKey } from './schools.js';

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const FONT = '<w:rFonts w:ascii="Microsoft JhengHei" w:hAnsi="Microsoft JhengHei" w:eastAsia="Microsoft JhengHei" w:cs="Microsoft JhengHei"/>';
const run = (t, sz, bold = false) => `<w:r><w:rPr>${FONT}${bold ? '<w:b/><w:bCs/>' : ''}<w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/></w:rPr><w:t xml:space="preserve">${esc(t)}</w:t></w:r>`;
const para = (inner, { jc = 'center', after = 0, pageBreak = false } = {}) =>
  `<w:p><w:pPr>${pageBreak ? '<w:pageBreakBefore/>' : ''}<w:spacing w:after="${after}"/><w:jc w:val="${jc}"/></w:pPr>${inner}</w:p>`;
const GRID = [4001, 2778, 2111, 1303];
const B = (bottom = 4) => `<w:tcBorders><w:top w:val="single" w:sz="4" w:color="000000"/><w:left w:val="single" w:sz="4" w:color="000000"/><w:bottom w:val="single" w:sz="${bottom}" w:color="000000"/><w:right w:val="single" w:sz="4" w:color="000000"/></w:tcBorders>`;
const cell = (t, w, sz, head) => `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/>${B(head ? 12 : 4)}<w:vAlign w:val="center"/></w:tcPr>${para(t ? run(t, sz) : '')}</w:tc>`;
const tr = (cells, h, head) => `<w:tr><w:trPr><w:cantSplit/>${head ? '<w:tblHeader/>' : ''}<w:trHeight w:val="${h}" w:hRule="atLeast"/></w:trPr>${cells}</w:tr>`;
function table(rows) {
  const head = tr(['學校單位', '簽到欄', '備註', '停車證'].map((t, i) => cell(t, GRID[i], 28, true)).join(''), 420, true);
  const body = rows.map(r => tr([r.label, '', '', r.park ? String(r.park) : ''].map((t, i) => cell(t, GRID[i], 28, false)).join(''), 620, false)).join('');
  return `<w:tbl><w:tblPr><w:tblW w:w="10193" w:type="dxa"/><w:jc w:val="center"/><w:tblLayout w:type="fixed"/><w:tblCellMar><w:left w:w="80" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${GRID.map(w => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>${head}${body}</w:tbl>`;
}

/** 同一單位的隊伍合成一列：中興大學 A、B；單一隊伍寫完整隊名 */
function teamRows(list) {
  const m = new Map();
  (list || []).forEach(e => {
    const name = String(e.name || '').trim();
    const unit = e.school || unitFromTeam(name) || name;
    if (!m.has(unit)) m.set(unit, []);
    m.get(unit).push(name);
  });
  return [...m.entries()].map(([unit, names]) => {
    if (names.length === 1) return { unit, label: names[0] };
    const suffix = names.map(n => (n.startsWith(unit) ? n.slice(unit.length).trim().replace(/^[(（](.*)[)）]$/, '$1') : ''));
    return { unit, label: suffix.every(Boolean) ? `${unit} ${suffix.join('、')}` : names.join('、') };
  });
}

/** 只報個人賽的學校：該性別沒有報團體賽的學校，依學校分列並註明男女 */
function indRows(events) {
  const teamSchools = g => new Set((events[g === '男' ? '男團' : '女團'] || []).map(e => e.school || unitFromTeam(e.name)));
  const order = [], has = new Map();
  ['男', '女'].forEach(g => {
    const skip = teamSchools(g);
    [...(events[`${g}單`] || []), ...(events[`${g}雙`] || [])].forEach(e => {
      String(e.school || '').split(/[\/／]/).map(s => s.trim()).filter(Boolean).forEach(s => {
        if (skip.has(s)) return;
        if (!has.has(s)) { has.set(s, new Set()); order.push(s); }
        has.get(s).add(g);
      });
    });
  });
  const rows = [];
  order.forEach(s => ['男', '女'].forEach(g => { if (has.get(s).has(g)) rows.push({ unit: s, label: `${s} (${g})` }); }));
  return { rows, schools: order.length };
}

/** 簽到表分區：[{ code, title, team, rows: [{ unit, label }] }] */
export function signinSections(events) {
  const out = [];
  const ind = indRows(events);
  if (ind.rows.length) out.push({ code: 'ind', title: `只報個人賽 ${ind.schools}校`, team: false, rows: ind.rows });
  const m = teamRows(events['男團']); if (m.length) out.push({ code: '男團', title: `大專男子團體組 ${m.length}組`, team: true, rows: m });
  const w = teamRows(events['女團']); if (w.length) out.push({ code: '女團', title: `大專女子團體組 ${w.length}組`, team: true, rows: w });
  const so = teamRows(events['社團']); if (so.length) out.push({ code: '社團', title: `社會團體組 ${so.length}隊`, team: true, rows: so });
  return out;
}

/**
 * 停車證張數：parking 是 { 單位: 張數 }。同一單位出現在好幾列時，只填在第一次出現的那一列，避免重複發證。
 * 會在每一列加上 park（張數）與 parkUnit（資料庫裡的單位名稱）
 */
export function withParking(sections, parking = {}) {
  const idx = new Map(Object.entries(parking || {}).filter(([, n]) => Number(n) > 0).map(([k, n]) => [looseKey(k), [k, Number(n)]]));
  const used = new Set();
  sections.forEach(sec => sec.rows.forEach(r => {
    const hit = idx.get(looseKey(r.unit));
    if (hit && !used.has(hit[0])) { r.park = hit[1]; r.parkUnit = hit[0]; used.add(hit[0]); }
  }));
  return { sections, unmatched: [...idx.values()].filter(([k]) => !used.has(k)) };
}
/** events: { 項目: [entry] }；title：例如「第十三屆TIBHAR交大盃」；opt.parking：{ 單位: 張數 } */
export async function signinDocx(events, title, opt = {}) {
  const JSZipLib = opt.JSZip || globalThis.JSZip;
  const parts = withParking(signinSections(events), opt.parking).sections.map(x => [`(${x.title})`, x.rows]);
  const body = parts.map(([sub, rows], i) =>
    para(run(`${title}簽到表`, 48, true), { pageBreak: i > 0 }) + para(run(sub, 24), { after: 120 }) + table(rows)).join('');
  const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
  const zip = new JSZipLib();
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`);
  zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`);
  zip.file('word/_rels/document.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
  zip.file('word/styles.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles ${W}><w:docDefaults><w:rPrDefault><w:rPr>${FONT}<w:sz w:val="24"/><w:szCs w:val="24"/><w:lang w:val="en-US" w:eastAsia="zh-TW"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style></w:styles>`);
  zip.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document ${W}><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720" w:header="500" w:footer="500" w:gutter="0"/></w:sectPr></w:body></w:document>`);
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}
