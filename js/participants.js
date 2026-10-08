// 參賽名單 Word：照第十二屆「參賽名單」的版面
// 一、團體賽參賽名單：(一)大專男子組、(二)大專女子組、(三)社會團體組，每隊列隊名、領隊、教練、隊長、隊員
// 二、個人賽參賽名單：(一)大專男子組、(二)大專女子組，每校列教練、領隊、單打、雙打
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const FONT = '<w:rFonts w:ascii="標楷體" w:hAnsi="標楷體" w:eastAsia="標楷體" w:cs="標楷體"/>';
const run = (t, sz = 28, bold = false) => `<w:r><w:rPr>${FONT}${bold ? '<w:b/>' : ''}<w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/></w:rPr><w:t xml:space="preserve">${esc(t)}</w:t></w:r>`;
const para = (inner, { style, jc, after = 0, before = 0, pageBreak = false } = {}) =>
  `<w:p><w:pPr>${style ? `<w:pStyle w:val="${style}"/>` : ''}${pageBreak ? '<w:pageBreakBefore/>' : ''}<w:spacing w:before="${before}" w:after="${after}"/>${jc ? `<w:jc w:val="${jc}"/>` : ''}</w:pPr>${inner}</w:p>`;
const pad = n => String(n).padStart(2, '0');

/** 隊員欄整理成「甲/乙/丙」 */
export function memberList(text) {
  return String(text ?? '').split(/[\s,，、;；/／\n]+/).map(x => x.trim()).filter(Boolean).join('/');
}

// 表格欄寬（與範本相同，合計 9495）
const GRID = [945, 2190, 1500, 2145, 915, 1800];
const cell = (text, span = 1, sz = 28) => `<w:tc><w:tcPr>${span > 1 ? `<w:gridSpan w:val="${span}"/>` : ''}<w:tcBorders><w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/><w:right w:val="nil"/></w:tcBorders></w:tcPr>${para(run(text, sz))}</w:tc>`;
const row = (cells, h = 480) => `<w:tr><w:trPr><w:cantSplit/><w:trHeight w:val="${h}"/></w:trPr>${cells.join('')}</w:tr>`;
const table = rows => `<w:tbl><w:tblPr><w:tblW w:w="9495" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblBorders><w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/><w:right w:val="nil"/><w:insideH w:val="nil"/><w:insideV w:val="nil"/></w:tblBorders><w:tblCellMar><w:left w:w="57" w:type="dxa"/><w:right w:w="57" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${GRID.map(w => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>${rows.join('')}</w:tbl>${para('', { after: 200 })}`;

function teamTable(i, t) {
  return table([
    row([cell(`${pad(i)}.隊名：${t.name}`, 4), cell('領隊：', 1, 22), cell(t.leader || '', 1, 22)]),
    row([cell('教練：', 1, 22), cell(t.coach || '', 2, 22), cell('隊長：', 1, 22), cell(t.captain || '', 2, 22)], 400),
    row([cell('隊員：', 1, 22), cell(memberList(t.members), 5, 22)], 400),
  ]);
}
function schoolTable(i, s) {
  return table([
    row([cell(`${pad(i)}.校名：${s.school}`, 6)]),
    row([cell('教練：', 1, 22), cell(s.coach || '', 2, 22), cell('領隊：', 1, 22), cell(s.leader || '', 2, 22)], 400),
    row([cell('單打：', 1, 22), cell(s.singles.join(','), 5, 22)], 400),
    row([cell('雙打：', 1, 22), cell(s.doubles.join(','), 5, 22)], 400),
  ]);
}

/** 個人賽依學校整理（照名單順序，先出現的學校在前） */
function bySchool(singles, doubles) {
  const m = new Map();
  const get = e => {
    if (!m.has(e.school)) m.set(e.school, { school: e.school, coach: '', leader: '', singles: [], doubles: [] });
    const s = m.get(e.school);
    if (!s.coach && e.coach) s.coach = e.coach;
    if (!s.leader && e.leader) s.leader = e.leader;
    return s;
  };
  (singles || []).forEach(e => get(e).singles.push(e.name));
  (doubles || []).forEach(e => get(e).doubles.push(String(e.name).replace(/\s*[／]\s*/g, '/')));
  return [...m.values()];
}

/**
 * events: { 項目: [entry] }（名單校正後的正式名單）
 * title：賽事名稱；time：更新時間（Date）
 */
export async function participantsDocx(events, title, time, JSZipLib = globalThis.JSZip) {
  const sections = [];
  const teamParts = [['(一)大專男子組', events['男團']], ['(二)大專女子組', events['女團']], ['(三)社會團體組', events['社團']]]
    .filter(([, list]) => list && list.length);
  const indParts = [['(一)大專男子組', bySchool(events['男單'], events['男雙'])], ['(二)大專女子組', bySchool(events['女單'], events['女雙'])]]
    .filter(([, list]) => list.length);

  // 目錄（Word 開啟時會更新頁碼）
  sections.push(para(run('目錄', 36, true), { jc: 'center', after: 240 }));
  // 目錄先放好標題，Word 開啟時會補上頁碼（若沒有，在目錄上按右鍵選「更新功能變數」）
  const tocLines = [];
  if (teamParts.length) { tocLines.push(['TOC1', '團體賽參賽名單']); teamParts.forEach(([h]) => tocLines.push(['TOC2', h])); }
  if (indParts.length) { tocLines.push(['TOC1', '個人賽參賽名單']); indParts.forEach(([h]) => tocLines.push(['TOC2', h])); }
  const fld = (type, extra = '') => `<w:r><w:fldChar w:fldCharType="${type}"${extra}/></w:r>`;
  tocLines.forEach(([st, t], i) => {
    const begin = i === 0 ? `${fld('begin', ' w:dirty="true"')}<w:r><w:instrText xml:space="preserve"> TOC \\o "1-2" \\h \\z \\u </w:instrText></w:r>${fld('separate')}` : '';
    const end = i === tocLines.length - 1 ? fld('end') : '';
    sections.push(`<w:p><w:pPr><w:pStyle w:val="${st}"/></w:pPr>${begin}${run(t, st === 'TOC1' ? 28 : 24, st === 'TOC1')}${end}</w:p>`);
  });

  let first = true;
  if (teamParts.length) {
    sections.push(para(run('一、團體賽參賽名單', 36, true), { style: 'Heading1', jc: 'center', after: 200, pageBreak: true }));
    teamParts.forEach(([h, list], k) => {
      sections.push(para(run(h, 32, true), { style: 'Heading2', after: 120, pageBreak: k > 0 }));
      list.forEach((t, i) => sections.push(teamTable(i + 1, t)));
    });
    first = false;
  }
  if (indParts.length) {
    sections.push(para(run('二、個人賽參賽名單', 36, true), { style: 'Heading1', jc: 'center', after: 200, pageBreak: true }));
    indParts.forEach(([h, list], k) => {
      sections.push(para(run(h, 32, true), { style: 'Heading2', after: 120, pageBreak: k > 0 }));
      list.forEach((s, i) => sections.push(schoolTable(i + 1, s)));
    });
  }
  void first;

  const d = time || new Date();
  const stamp = `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
  const zip = new JSZipLib();
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
<Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>
<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>
<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>
</Types>`);
  zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`);
  zip.file('word/_rels/document.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>
<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>
<Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>
</Relationships>`);
  zip.file('word/settings.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:settings ${W}><w:updateFields w:val="true"/></w:settings>`);
  const heading = (id, name, sz, lvl) => `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${name}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:outlineLvl w:val="${lvl}"/></w:pPr><w:rPr><w:b/><w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/></w:rPr></w:style>`;
  const toc = (id, name, ind) => `<w:style w:type="paragraph" w:styleId="${id}"><w:name w:val="${name}"/><w:basedOn w:val="Normal"/><w:pPr><w:tabs><w:tab w:val="right" w:leader="dot" w:pos="9480"/></w:tabs><w:spacing w:after="80"/><w:ind w:left="${ind}"/></w:pPr><w:rPr><w:sz w:val="24"/></w:rPr></w:style>`;
  zip.file('word/styles.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles ${W}><w:docDefaults><w:rPrDefault><w:rPr>${FONT}<w:sz w:val="24"/><w:szCs w:val="24"/><w:lang w:val="en-US" w:eastAsia="zh-TW"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>
${heading('Heading1', 'heading 1', 36, 0)}${heading('Heading2', 'heading 2', 32, 1)}${toc('TOC1', 'toc 1', 0)}${toc('TOC2', 'toc 2', 240)}
</w:styles>`);
  zip.file('word/header1.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:hdr ${W}>${para(run('最近一次更新時間', 18), { jc: 'right' })}${para(run(stamp, 18), { jc: 'right' })}</w:hdr>`);
  zip.file('word/footer1.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:ftr ${W}><w:p><w:pPr><w:jc w:val="right"/></w:pPr><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r>${run('1', 20)}<w:r><w:fldChar w:fldCharType="end"/></w:r></w:p></w:ftr>`);
  zip.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document ${W}><w:body>${para(run(title || '', 24), { jc: 'center', after: 120 })}${sections.join('')}
<w:sectPr><w:headerReference w:type="default" r:id="rId3"/><w:footerReference w:type="default" r:id="rId4"/><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1200" w:bottom="1200" w:left="1200" w:header="600" w:footer="500" w:gutter="0"/></w:sectPr>
</w:body></w:document>`);
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
}
