import fs from 'fs';
import { createRequire } from 'module';
import * as B from '../js/bracket.js';
import { runDraw } from '../js/draw.js';
import { bracketWorkbook, orderWorkbook } from '../js/excel.js';
const ExcelJS = createRequire(process.env.NM + '/')('exceljs');
const order = JSON.parse(fs.readFileSync(process.env.D + '/order.json', 'utf8'));
const out = process.env.OUT;
const cases = [['女單', '女單', 'ko'], ['男雙', '男雙', 'ko'], ['男團', '男團', 'rr', 4], ['女團', '女團', 'rr', 3], ['女雙', '女雙', 'ko']];
for (const [ev, oev, kind, gs] of cases) {
  const list = order[oev].map(e => ({ ...e, name: String(e.name) }));
  const n = list.length;
  const st = kind === 'ko' ? B.buildKO(B.splitSizes(n, B.defaultSections(n))) : B.buildRR(B.groupSizes(n, B.defaultGroupCount(n, gs)));
  const a = runDraw(list, st, 'T' + ev);
  await bracketWorkbook(ev, st, list, a, ExcelJS).xlsx.writeFile(`${out}/${ev}_完成籤表.xlsx`);
  await bracketWorkbook(ev, st, null, null, ExcelJS).xlsx.writeFile(`${out}/${ev}_空白籤表.xlsx`);
  await orderWorkbook(ev, list, ExcelJS).xlsx.writeFile(`${out}/${ev}_抽籤順序表.xlsx`);
}
console.log('ok');
