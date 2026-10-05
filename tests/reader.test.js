import fs from 'fs';
import { createRequire } from 'module';
import { readXlsx, readCsv } from '../js/reader.js';
import { parseResponses, buildEntries } from '../js/parse.js';
const require = createRequire(process.env.NM + '/');
const ExcelJS = require('exceljs');
const D = process.env.D;
for (const f of ['women.xlsx', 'social.xlsx', 'men.csv']) {
  const buf = fs.readFileSync(D + '/' + f);
  const rows = f.endsWith('.csv') ? readCsv(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length)) : await readXlsx(buf, ExcelJS);
  const { kind, responses } = parseResponses(rows);
  const { events } = buildEntries(kind, responses);
  console.log('=====', f, kind, '回應', responses.length, '採用', responses.filter(r => r.include).length);
  responses.filter(r => r.notes.some(n => /刪除線|劃掉/.test(n))).forEach(r => console.log('  列', r.rowNo, r.notes.filter(n => /刪除線|劃掉/.test(n)).join('；')));
  for (const [ev, list] of Object.entries(events)) console.log(' ', ev, list.length);
}
