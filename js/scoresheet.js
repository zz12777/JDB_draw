// 點單（比賽紀錄表）：產生 Word (.docx)，版面比照「3_點單」的空白點單與完成點單
import { EVENT_TYPE } from './parse.js';
import { buildKO } from './bracket.js';

export const DEFAULT_TITLE = '第十三屆TIBHAR交大盃全國大專校院桌球錦標賽';
const TEAM_SUBTITLE = { 男團: '大專男子團體組 出賽名單', 女團: '大專女子團體組 出賽名單', 社團: '社會團體組 出賽名單' };

// ---------------- 場次資料 ----------------

/**
 * 個人賽：每場一張。籤號／校名／姓名：第一場是籤位上的人，之後是「X勝」。
 * byPos: Map(籤號 -> {school, name})
 */
export function koSheets(st, byPos) {
  return st.matches.map(m => {
    const side = c => {
      if (c.kind === 'leaf') {
        const e = byPos.get(c.pos);
        return { num: String(c.pos), school: e ? e.school : '', name: e ? e.name : '' };
      }
      return { num: '', school: '', name: `${c.label}勝` };
    };
    return { label: m.label, a: side(m.children[0]), b: side(m.children[1]) };
  });
}

/** 團體賽：預賽每場一張，場次「(一)」，籤位「A1」；可加決賽（每組取前二，場次「決(一)」） */
export function rrSheets(st, byPos, withFinal) {
  const out = [];
  const all = [];
  st.groups.forEach(g => g.matches.forEach(m => all.push({ g, m })));
  all.sort((x, y) => x.m.num - y.m.num);
  for (const { g, m } of all) {
    const side = k => {
      const e = byPos.get(g.startPos + k - 1);
      return { slot: `${g.letter}${k}`, team: e ? e.name : '' };
    };
    out.push({ label: `(${m.label})`, a: side(m.a), b: side(m.b) });
  }
  const n = st.groups.length * 2;
  if (withFinal && n >= 2 && n <= 32) {
    const ko = buildKO([n]);
    ko.matches.forEach(m => {
      const side = c => (c.kind === 'leaf' ? { slot: String(c.pos), team: '' } : { slot: `決(${c.label})勝`, team: '' });
      out.push({ label: `決(${m.label})`, a: side(m.children[0]), b: side(m.children[1]) });
    });
  }
  return out;
}

// ---------------- docx 基本元件 ----------------

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const FONT = '<w:rFonts w:ascii="DFKai-SB" w:hAnsi="DFKai-SB" w:eastAsia="標楷體" w:cs="DFKai-SB"/>';

function run(text, { size = 22, bold = false, underline = false } = {}) {
  return `<w:r><w:rPr>${FONT}${bold ? '<w:b/>' : ''}${underline ? '<w:u w:val="single"/>' : ''}<w:sz w:val="${size}"/><w:szCs w:val="${size}"/></w:rPr><w:t xml:space="preserve">${esc(text)}</w:t></w:r>`;
}

function para(runs, { align, line, exact = false, before = 0, after = 0, pageBreakBefore = false, borderBottom = false, keepNext = false } = {}) {
  const ppr = [
    keepNext ? '<w:keepNext/>' : '',
    pageBreakBefore ? '<w:pageBreakBefore/>' : '',
    borderBottom ? '<w:pBdr><w:bottom w:val="single" w:sz="8" w:space="1" w:color="000000"/></w:pBdr>' : '',
    `<w:spacing w:before="${before}" w:after="${after}"${line ? ` w:line="${line}" w:lineRule="${exact ? 'exact' : 'auto'}"` : ''}/>`,
    '<w:snapToGrid w:val="0"/>',
    align ? `<w:jc w:val="${align}"/>` : '',
  ].join('');
  return `<w:p><w:pPr>${ppr}</w:pPr>${Array.isArray(runs) ? runs.join('') : runs}</w:p>`;
}

/** 表格。rows: [{h, cells:[{w, span, vm:'restart'|'continue', paras, valign}]}] */
function table(grid, rows, borderSize = 4) {
  const b = `w:val="single" w:sz="${borderSize}" w:space="0" w:color="000000"`;
  const tblPr = `<w:tblPr><w:tblW w:w="${grid.reduce((a, x) => a + x, 0)}" w:type="dxa"/><w:jc w:val="center"/>
    <w:tblBorders><w:top ${b}/><w:left ${b}/><w:bottom ${b}/><w:right ${b}/><w:insideH ${b}/><w:insideV ${b}/></w:tblBorders>
    <w:tblLayout w:type="fixed"/><w:tblCellMar><w:left w:w="40" w:type="dxa"/><w:right w:w="40" w:type="dxa"/></w:tblCellMar></w:tblPr>`;
  const tblGrid = `<w:tblGrid>${grid.map(w => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>`;
  let col = 0;
  const trs = rows.map(r => {
    col = 0;
    const tcs = r.cells.map(c => {
      const span = c.span || 1;
      const w = grid.slice(col, col + span).reduce((a, x) => a + x, 0);
      col += span;
      const tcPr = `<w:tcPr><w:tcW w:w="${w}" w:type="dxa"/>${span > 1 ? `<w:gridSpan w:val="${span}"/>` : ''}${c.vm ? `<w:vMerge${c.vm === 'restart' ? ' w:val="restart"' : ''}/>` : ''}<w:vAlign w:val="${c.valign || 'center'}"/></w:tcPr>`;
      const ps = c.paras && c.paras.length ? c.paras.join('') : para(run(''), { align: 'center' });
      return `<w:tc>${tcPr}${ps}</w:tc>`;
    }).join('');
    return `<w:tr><w:trPr><w:cantSplit/>${r.h ? `<w:trHeight w:val="${r.h}" w:hRule="exact"/>` : ''}</w:trPr>${tcs}</w:tr>`;
  }).join('');
  return `<w:tbl>${tblPr}${tblGrid}${trs}</w:tbl>`;
}

const cp = (text, size = 22, opt = {}) => para(run(text, { size, bold: opt.bold }), { align: opt.align || 'center' });
/** 直書：每個字一行 */
const vertical = (text, size) => [...String(text || '')].map(ch => para(run(ch, { size }), { align: 'center' }));

// ---------------- 個人賽點單 ----------------

const KO_GRID = [992, 2408, 567, 482, 1701, 482, 567, 2409, 992];

function koHalf(title, event, sheet, { first, divider }) {
  const s = sheet || { label: '', a: { num: '', school: '', name: '' }, b: { num: '', school: '', name: '' } };
  const nameParas = side => {
    const ps = [];
    if (side.num) ps.push(cp(side.num, 24));
    const names = EVENT_TYPE[event] === 'double' && side.name.includes('/') ? side.name.split('/') : [side.name];
    names.forEach(n => ps.push(cp(n, 40)));
    return ps;
  };
  const rows = [
    { h: 317, cells: [{ paras: [cp('校名')] }, { paras: [cp('姓名')] }, { span: 5, paras: [cp('比賽紀錄')] }, { paras: [cp('姓名')] }, { paras: [cp('校名')] }] },
    { h: 700, cells: [
      { vm: 'restart', paras: vertical(s.a.school, 36) }, { vm: 'restart', paras: nameParas(s.a) },
      { paras: [cp('勝', 20), cp('局', 20)] }, { paras: [cp('局', 20), cp('數', 20)] }, { paras: [cp('比數')] },
      { paras: [cp('局', 20), cp('數', 20)] }, { paras: [cp('勝', 20), cp('局', 20)] },
      { vm: 'restart', paras: nameParas(s.b) }, { vm: 'restart', paras: vertical(s.b.school, 36) }] },
  ];
  for (let g = 1; g <= 5; g++) {
    rows.push({ h: 470, cells: [
      { vm: 'continue' }, { vm: 'continue' },
      { vm: g === 1 ? 'restart' : 'continue' }, { paras: [cp(String(g))] }, { paras: [cp('：')] }, { paras: [cp(String(g))] },
      { vm: g === 1 ? 'restart' : 'continue' }, { vm: 'continue' }, { vm: 'continue' }] });
  }
  const blank = n => ' '.repeat(n);
  return [
    para(run(title, { size: 24 }), { align: 'center', pageBreakBefore: first, line: 380, exact: true, keepNext: true }),
    para(run('比賽紀錄表', { size: 24 }), { align: 'center', line: 380, exact: true, keepNext: true }),
    para([run('項目:( ', { size: 22 }), run(event, { size: 22 }), run(' ) ( ', { size: 22 }), run(s.label || blank(6), { size: 22 }), run(' ) 場次', { size: 22 })], { line: 440, exact: true, keepNext: true }),
    table(KO_GRID, rows),
    para([run('比賽結果：', { size: 22 }), run(blank(12), { size: 22, underline: true }), run('。', { size: 22 })], { line: 440, exact: true, before: 120 }),
    para([run('勝方選手簽名：', { size: 22 }), run(blank(22), { size: 22, underline: true }), run('。', { size: 22 })], { line: 440, exact: true }),
    para(run('裁判簽名：', { size: 22 }), { line: 440, exact: true, borderBottom: divider, after: divider ? 240 : 0 }),
  ].join('');
}

/** 個人賽：一頁兩張，上面是前半場次、下面是後半場次 */
export function koDocumentBody(title, event, sheets, blanks) {
  const items = [...sheets, ...Array(blanks).fill(null)];
  const half = Math.ceil(items.length / 2);
  let body = '';
  for (let i = 0; i < half; i++) {
    body += koHalf(title, event, items[i], { first: i > 0, divider: true });
    body += koHalf(title, event, items[half + i], { first: false, divider: false });
  }
  return body;
}

// ---------------- 團體賽點單（五點：單單雙單單） ----------------

const RR_GRID = [738, 1134, 758, 1315, 1316, 1315, 1315, 643, 1276, 713];
const POINTS = ['一', '二', '三', '四', '五'];

function rrPage(title, event, sheet, first) {
  const s = sheet || { label: '', a: { slot: '', team: '' }, b: { slot: '', team: '' } };
  const team = x => [x.slot, x.team].filter(Boolean).join(' ');
  const rows = [
    { h: 600, cells: [{ span: 10, paras: [cp(title, 40)] }] },
    { h: 500, cells: [{ span: 10, paras: [cp(TEAM_SUBTITLE[event] || `${event} 出賽名單`, 32)] }] },
    { h: 480, cells: [{ span: 2, paras: [cp('場次', 26, { bold: true })] }, { span: 3, paras: [cp(s.label, 26)] }, { span: 3, paras: [cp(s.label, 26)] }, { span: 2, paras: [cp('場次', 26, { bold: true })] }] },
    { h: 480, cells: [{ span: 2, paras: [cp('出賽隊伍', 26, { bold: true })] }, { span: 3, paras: [cp(team(s.a), 26)] }, { span: 3, paras: [cp(team(s.b), 26)] }, { span: 2, paras: [cp('出賽隊伍', 26, { bold: true })] }] },
    { h: 480, cells: [{ span: 2, paras: [cp('對戰隊伍', 26)] }, { span: 3, paras: [cp(team(s.b), 26)] }, { span: 3, paras: [cp(team(s.a), 26)] }, { span: 2, paras: [cp('對戰隊伍', 26)] }] },
    { h: 360, cells: [{ paras: [cp('點', 22)] }, { span: 2, paras: [cp('姓名', 22)] }, { paras: [cp('勝局數', 22)] }, { paras: [cp('比分', 22)] }, { paras: [cp('比分', 22)] }, { paras: [cp('勝局數', 22)] }, { span: 2, paras: [cp('姓名', 22)] }, { paras: [cp('點', 22)] }] },
  ];
  POINTS.forEach((p, pi) => {
    const doubles = pi === 2;
    const n = doubles ? 6 : 5;
    for (let k = 0; k < n; k++) {
      const vm = k === 0 ? 'restart' : 'continue';
      // 雙打：姓名欄上下各一人
      const nameVm = doubles ? (k === 0 || k === 3 ? 'restart' : 'continue') : vm;
      rows.push({ h: 380, cells: [
        { vm, paras: k === 0 ? vertical(`第${p}點`, 20) : undefined },
        { span: 2, vm: nameVm }, { vm },
        {}, {},
        { vm }, { span: 2, vm: nameVm },
        { vm, paras: k === 0 ? vertical(`第${p}點`, 20) : undefined },
      ] });
    }
  });
  rows.push({ h: 480, cells: [{ span: 3, paras: [cp('比賽結果', 24, { bold: true })] }, { span: 4, paras: [cp('：', 24)] }, { span: 3, paras: [cp('比賽結果', 24, { bold: true })] }] });
  rows.push({ h: 600, cells: [{ span: 5, valign: 'top', paras: [cp('裁判簽名：', 24, { align: 'left', bold: true })] }, { span: 5, valign: 'top', paras: [cp('勝隊簽名：', 24, { align: 'left', bold: true })] }] });
  return (first ? '' : para(run('', { size: 2 }), { pageBreakBefore: true, line: 20, exact: true })) + table(RR_GRID, rows, 12);
}

export function rrDocumentBody(title, event, sheets, blanks) {
  const items = [...sheets, ...Array(blanks).fill(null)];
  return items.map((s, i) => rrPage(title, event, s, i === 0)).join('');
}

// ---------------- 打包 ----------------

export async function buildDocx(body, margins, JSZipLib = globalThis.JSZip) {
  const zip = new JSZipLib();
  const m = margins || { top: 680, bottom: 680, left: 567, right: 567 };
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`);
  zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`);
  zip.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}
<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="${m.top}" w:right="${m.right}" w:bottom="${m.bottom}" w:left="${m.left}" w:header="0" w:footer="0" w:gutter="0"/></w:sectPr>
</w:body></w:document>`);
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}

/** 對外：依項目產生點單 docx */
/** 從上傳籤表讀出的對戰清單產生個人賽點單資料 */
export function sheetsFromMatches(matches, byPos) {
  const side = x => {
    if (x.pos) {
      const e = byPos.get(x.pos);
      return { num: String(x.pos), school: e ? e.school : '', name: e ? e.name : '' };
    }
    return { num: '', school: '', name: `${x.ref}勝` };
  };
  return matches.map(m => ({ label: m.label, a: side(m.a), b: side(m.b) }));
}

export async function scoresheetDocx({ event, st, byPos, matches, title = DEFAULT_TITLE, blanks = 3, withFinal = true }, JSZipLib) {
  if (st.kind === 'ko') {
    const sheets = matches ? sheetsFromMatches(matches, byPos) : koSheets(st, byPos);
    return buildDocx(koDocumentBody(title, event, sheets, blanks), null, JSZipLib);
  }
  return buildDocx(rrDocumentBody(title, event, rrSheets(st, byPos, withFinal), blanks), { top: 720, bottom: 720, left: 720, right: 720 }, JSZipLib);
}

// ---------------- 列印版（存成 PDF） ----------------
// 與 Word 點單同版面的 HTML，在瀏覽器列印視窗選「另存為 PDF」。

const h = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const vtext = s => [...String(s || '')].map(h).join('<br>');

function koHalfHtml(title, event, s) {
  s = s || { label: '', a: { num: '', school: '', name: '' }, b: { num: '', school: '', name: '' } };
  const name = side => {
    const names = EVENT_TYPE[event] === 'double' && side.name.includes('/') ? side.name.split('/') : [side.name];
    return `${side.num ? `<div class="num">${h(side.num)}</div>` : ''}${names.map(n => `<div class="nm">${h(n)}</div>`).join('')}`;
  };
  let games = '';
  for (let g = 1; g <= 5; g++) {
    games += `<tr class="g">${g === 1 ? '<td rowspan="5"></td>' : ''}<td>${g}</td><td>：</td><td>${g}</td>${g === 1 ? '<td rowspan="5"></td>' : ''}</tr>`;
  }
  return `<div class="half">
    <div class="t1">${h(title)}</div><div class="t1">比賽紀錄表</div>
    <div class="item">項目:( ${h(event)} ) ( ${h(s.label) || '&emsp;&emsp;&emsp;'} ) 場次</div>
    <table class="ko">
      <colgroup><col style="width:9.4%"><col style="width:22.7%"><col style="width:5.3%"><col style="width:4.5%"><col style="width:16%"><col style="width:4.5%"><col style="width:5.3%"><col style="width:22.7%"><col style="width:9.4%"></colgroup>
      <tr class="hd"><td>校名</td><td>姓名</td><td colspan="5">比賽紀錄</td><td>姓名</td><td>校名</td></tr>
      <tr class="hd2"><td rowspan="6" class="sch">${vtext(s.a.school)}</td><td rowspan="6">${name(s.a)}</td>
        <td class="sm">勝<br>局</td><td class="sm">局<br>數</td><td>比數</td><td class="sm">局<br>數</td><td class="sm">勝<br>局</td>
        <td rowspan="6">${name(s.b)}</td><td rowspan="6" class="sch">${vtext(s.b.school)}</td></tr>
      ${games}
    </table>
    <div class="line">比賽結果：<u>&emsp;&emsp;&emsp;&emsp;&emsp;</u>。</div>
    <div class="line">勝方選手簽名：<u>&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;&emsp;</u>。</div>
    <div class="line">裁判簽名：</div>
  </div>`;
}

function rrPageHtml(title, event, s) {
  s = s || { label: '', a: { slot: '', team: '' }, b: { slot: '', team: '' } };
  const team = x => h([x.slot, x.team].filter(Boolean).join(' '));
  let pts = '';
  POINTS.forEach((p, pi) => {
    const n = pi === 2 ? 6 : 5;
    for (let k = 0; k < n; k++) {
      let row = '';
      if (k === 0) row += `<td rowspan="${n}" class="pt">第<br>${p}<br>點</td>`;
      if (pi === 2) { if (k === 0 || k === 3) row += '<td colspan="2" rowspan="3"></td>'; }
      else if (k === 0) row += `<td colspan="2" rowspan="${n}"></td>`;
      if (k === 0) row += `<td rowspan="${n}"></td>`;
      row += '<td></td><td></td>';
      if (k === 0) row += `<td rowspan="${n}"></td>`;
      if (pi === 2) { if (k === 0 || k === 3) row += '<td colspan="2" rowspan="3"></td>'; }
      else if (k === 0) row += `<td colspan="2" rowspan="${n}"></td>`;
      if (k === 0) row += `<td rowspan="${n}" class="pt">第<br>${p}<br>點</td>`;
      pts += `<tr class="p">${row}</tr>`;
    }
  });
  return `<div class="page">
    <table class="rr">
      <colgroup>${RR_GRID.map(w => `<col style="width:${(w / RR_GRID.reduce((a, x) => a + x, 0) * 100).toFixed(2)}%">`).join('')}</colgroup>
      <tr class="tt"><td colspan="10">${h(title)}</td></tr>
      <tr class="st"><td colspan="10">${h(TEAM_SUBTITLE[event] || `${event} 出賽名單`)}</td></tr>
      <tr class="r"><td colspan="2"><b>場次</b></td><td colspan="3">${h(s.label)}</td><td colspan="3">${h(s.label)}</td><td colspan="2"><b>場次</b></td></tr>
      <tr class="r"><td colspan="2"><b>出賽隊伍</b></td><td colspan="3">${team(s.a)}</td><td colspan="3">${team(s.b)}</td><td colspan="2"><b>出賽隊伍</b></td></tr>
      <tr class="r"><td colspan="2">對戰隊伍</td><td colspan="3">${team(s.b)}</td><td colspan="3">${team(s.a)}</td><td colspan="2">對戰隊伍</td></tr>
      <tr class="hd"><td>點</td><td colspan="2">姓名</td><td>勝局數</td><td>比分</td><td>比分</td><td>勝局數</td><td colspan="2">姓名</td><td>點</td></tr>
      ${pts}
      <tr class="r"><td colspan="3"><b>比賽結果</b></td><td colspan="4">：</td><td colspan="3"><b>比賽結果</b></td></tr>
      <tr class="sg"><td colspan="5"><b>裁判簽名：</b></td><td colspan="5"><b>勝隊簽名：</b></td></tr>
    </table>
  </div>`;
}

const PRINT_CSS = `
@page { size: A4; margin: 10mm; }
* { box-sizing: border-box; }
body { margin: 0; font-family: "DFKai-SB", "BiauKai", "標楷體", "Kaiti TC", serif; color: #000; }
.page { height: 276mm; overflow: hidden; page-break-after: always; break-after: page; }
.page:last-child { page-break-after: auto; break-after: auto; }
.half { height: 136mm; overflow: hidden; padding-top: 2mm; }
.half + .half { border-top: 1px solid #000; padding-top: 4mm; }
.t1 { text-align: center; font-size: 12pt; line-height: 1.6; }
.item, .line { font-size: 11pt; line-height: 2; }
table { width: 100%; border-collapse: collapse; table-layout: fixed; }
td { border: 1px solid #000; text-align: center; vertical-align: middle; padding: 0 1mm; font-size: 11pt; }
.ko .hd td { height: 6mm; }
.ko .hd2 td { height: 11mm; }
.ko .g td { height: 8.2mm; }
.ko .sch { font-size: 18pt; line-height: 1.2; }
.ko .sm { font-size: 10pt; line-height: 1.1; }
.ko .num { font-size: 12pt; }
.ko .nm { font-size: 20pt; }
.rr { border: 2px solid #000; }
.rr td { font-size: 13pt; }
.rr .tt td { height: 11mm; font-size: 20pt; }
.rr .st td { height: 9mm; font-size: 16pt; }
.rr .r td { height: 8.5mm; }
.rr .hd td { height: 6.5mm; font-size: 11pt; }
.rr .p td { height: 6.6mm; }
.rr .pt { font-size: 10pt; line-height: 1.2; }
.rr .sg td { height: 11mm; text-align: left; vertical-align: top; }
.tip { font-family: system-ui, sans-serif; background: #fff4e0; border-left: 3px solid #9a5b00; padding: 10px 14px; margin: 0 0 8mm; font-size: 14px; }
@media print { .tip { display: none; } }
`;

/** 列印版 HTML（整份文件） */
export function scoresheetHtml({ event, st, byPos, matches, title = DEFAULT_TITLE, blanks = 3, withFinal = true }) {
  let pages = '';
  if (st.kind === 'ko') {
    const sheets = matches ? sheetsFromMatches(matches, byPos) : koSheets(st, byPos);
    const items = [...sheets, ...Array(blanks).fill(null)];
    const half = Math.ceil(items.length / 2);
    for (let i = 0; i < half; i++) {
      pages += `<div class="page">${koHalfHtml(title, event, items[i])}${koHalfHtml(title, event, items[half + i])}</div>`;
    }
  } else {
    const items = [...rrSheets(st, byPos, withFinal), ...Array(blanks).fill(null)];
    pages = items.map(s => rrPageHtml(title, event, s)).join('');
  }
  return `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><title>${h(event)}點單</title><style>${PRINT_CSS}</style></head>
<body><div class="tip">列印視窗開啟後，目的地選「另存為 PDF」，紙張 A4、邊界「預設」、縮放 100%，取消勾選「頁首及頁尾」。點單需再經人工檢查。</div>${pages}
<script>window.addEventListener('load', () => setTimeout(() => window.print(), 300));</script></body></html>`;
}
