import fs from 'fs';
import { createRequire } from 'module';
import * as B from '../js/bracket.js';
import { runDraw } from '../js/draw.js';
import { scoresheetDocx } from '../js/scoresheet.js';
const req = createRequire(process.env.NM + '/');
const JSZip = req('jszip');
const order = JSON.parse(fs.readFileSync(process.env.D + '/order.json', 'utf8'));
for (const [ev, oev, kind, gs] of [['男單', '男單', 'ko'], ['男雙', '男雙', 'ko'], ['男團', '男團', 'rr', 4]]) {
  const list = order[oev].map(e => ({ ...e, name: String(e.name) }));
  const n = list.length;
  const st = kind === 'ko' ? B.buildKO(B.splitSizes(n, B.defaultSections(n))) : B.buildRR(B.groupSizes(n, B.defaultGroupCount(n, gs)));
  const a = runDraw(list, st, 'T');
  const byPos = new Map(list.map(e => [a[e.id], e]));
  const blob = await scoresheetDocx({ event: ev, st, byPos }, JSZip);
  fs.writeFileSync(`${process.env.OUT}/${ev}點單.docx`, Buffer.from(await blob.arrayBuffer()));
}
console.log('ok');
