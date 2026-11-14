// 讀參賽名單 Word（.docx）：取出團體賽各隊隊員
// 支援兩種版面：一隊一個表格（「01.隊名：○○」「隊員：甲/乙/丙」），或一列一隊（標題列有「隊名」「隊員」）

const textOf = xml => (xml.match(/<w:t[^>]*>[^<]*<\/w:t>/g) || []).map(t => t.replace(/<[^>]+>/g, '')).join('')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").trim();
const splitMembers = s => String(s).split(/[\/／、,，;；\s]+/).map(x => x.trim()).filter(Boolean);
const cleanTeam = s => String(s).replace(/^\s*\d+\s*[.．、]\s*/, '').trim();

function eventOf(heading) {
  if (/社會/.test(heading)) return '社團';
  if (/女/.test(heading)) return '女團';
  if (/男/.test(heading)) return '男團';
  return null;
}

/** documentXml: word/document.xml 的內容。回傳 { 男團: { 隊名: [隊員] }, 女團: {...}, 社團: {...} } */
export function parseRosterXml(documentXml) {
  const out = {};
  const body = documentXml.slice(documentXml.indexOf('<w:body'));
  const re = /<w:tbl>[\s\S]*?<\/w:tbl>|<w:p[ >][\s\S]*?<\/w:p>/g;
  let team = false, ev = null, m;
  while ((m = re.exec(body))) {
    const s = m[0];
    if (!s.startsWith('<w:tbl>')) {
      const t = textOf(s);
      if (!t) continue;
      if (/個人賽/.test(t)) team = false;
      else if (/團體賽/.test(t)) team = true;
      if (team && eventOf(t) && t.length < 20) ev = eventOf(t);
      continue;
    }
    if (!team || !ev) continue;
    const rows = (s.match(/<w:tr[ >][\s\S]*?<\/w:tr>/g) || []).map(r => (r.match(/<w:tc>[\s\S]*?<\/w:tc>/g) || []).map(textOf));
    const add = (name, members) => { name = cleanTeam(name); if (name) (out[ev] = out[ev] || {})[name] = splitMembers(members); };
    const head = rows[0] || [];
    const ci = head.findIndex(c => /^隊名$/.test(c)), mi = head.findIndex(c => /^隊員$/.test(c));
    if (ci >= 0 && mi >= 0) { rows.slice(1).forEach(r => add(r[ci] || '', r[mi] || '')); continue; }
    let name = '';
    rows.forEach(r => r.forEach((c, i) => {
      const a = c.match(/隊名\s*[:：]\s*(.*)$/);
      if (a) name = a[1] || r[i + 1] || '';
      const b = c.match(/^隊員\s*[:：]\s*(.*)$/);
      if (b && name) { add(name, b[1] || r[i + 1] || ''); name = ''; }
    }));
  }
  return out;
}

/** file: 使用者選的 .docx 檔 */
export async function readRosterDocx(file, JSZipLib = globalThis.JSZip) {
  const zip = await JSZipLib.loadAsync(await file.arrayBuffer());
  const f = zip.file('word/document.xml');
  if (!f) throw new Error('不是 Word 檔（.docx）');
  return parseRosterXml(await f.async('string'));
}
