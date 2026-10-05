// 讀取上傳的表單回應：.xlsx（保留刪除線）或 .csv
// ExcelJS 由 index.html 從 CDN 載入，測試時可傳入

function cellInfo(cell) {
  const v = cell.value;
  if (v === null || v === undefined) return null;
  const whole = !!(cell.font && cell.font.strike);
  if (v && typeof v === 'object' && Array.isArray(v.richText)) {
    const t = v.richText.map(r => r.text).join('');
    const struck = [];
    let keep = '';
    for (const r of v.richText) {
      const s = whole || !!(r.font && r.font.strike);
      if (s) { if (r.text.trim()) struck.push(r.text.trim()); } else keep += r.text;
    }
    const allStruck = whole || keep.trim() === '';
    return { t, keep: allStruck ? '' : keep, strike: allStruck && t.trim() !== '', struck };
  }
  let t;
  if (v instanceof Date) t = v.toISOString();
  else if (typeof v === 'object' && 'result' in v) t = String(v.result ?? '');
  else if (typeof v === 'object' && 'text' in v) t = String(v.text);
  else t = String(v);
  return { t, keep: whole ? '' : t, strike: whole && t.trim() !== '', struck: whole ? [t] : [] };
}

export async function readXlsx(buffer, ExcelJSLib = globalThis.ExcelJS) {
  const wb = new ExcelJSLib.Workbook();
  await wb.xlsx.load(buffer);
  const ws = wb.worksheets[0];
  const rows = [];
  ws.eachRow({ includeEmpty: true }, (row, rowNumber) => {
    const arr = [];
    for (let c = 1; c <= ws.columnCount; c++) arr.push(cellInfo(row.getCell(c)));
    rows[rowNumber - 1] = arr;
  });
  for (let i = 0; i < rows.length; i++) if (!rows[i]) rows[i] = [];
  return rows;
}

/** 簡單的 CSV 解析（支援引號與換行），自動判斷 UTF-8 / Big5 */
export function readCsv(buffer) {
  const bytes = new Uint8Array(buffer);
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    text = new TextDecoder('big5').decode(bytes);
  }
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  const rows = [];
  let row = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else q = false;
      } else field += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (ch !== '\r') field += ch;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

export async function readFormFile(file) {
  const buf = await file.arrayBuffer();
  if (/\.csv$/i.test(file.name)) return readCsv(buf);
  if (/\.xlsx$/i.test(file.name)) return readXlsx(buf);
  throw new Error('只接受 .xlsx 或 .csv');
}

/** 讀出活頁簿所有工作表的值（合併儲存格只在左上角有值） */
export async function readWorkbookValues(buffer, ExcelJSLib = globalThis.ExcelJS) {
  const wb = new ExcelJSLib.Workbook();
  await wb.xlsx.load(buffer);
  return wb.worksheets.map(ws => {
    const rows = [];
    ws.eachRow({ includeEmpty: false }, (row, r) => {
      const arr = [];
      for (let c = 1; c <= Math.min(ws.columnCount, 30); c++) {
        const cell = row.getCell(c);
        let v = cell.isMerged && cell.master && cell.master.address !== cell.address ? null : cell.value;
        if (v && typeof v === 'object') {
          if (Array.isArray(v.richText)) v = v.richText.map(t => t.text).join('');
          else if ('result' in v) v = v.result;
          else if ('text' in v) v = v.text;
          else if (v instanceof Date) v = v.toISOString();
        }
        arr.push(v === undefined ? null : v);
      }
      rows[r - 1] = arr;
    });
    return { name: ws.name, rows };
  });
}
