import fs from 'fs';
import * as B from '../js/bracket.js';
import { runDraw, checkDraw } from '../js/draw.js';
const data = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const cfg = { 男單: ['ko'], 女單: ['ko'], 男雙: ['ko'], 女雙: ['ko'], 男團: ['rr', 4], 女團: ['rr', 3], 社會組: ['rr', 4] };
for (const [ev, list] of Object.entries(data)) {
  const [kind, gsz] = cfg[ev];
  const n = list.length;
  const st = kind === 'ko' ? B.buildKO(B.splitSizes(n, B.defaultSections(n)))
    : B.buildRR(B.groupSizes(n, B.defaultGroupCount(n, gsz)));
  let warnTotal = 0, firstSame = 0;
  for (let t = 0; t < 200; t++) {
    const a = runDraw(list, st, ev + t);
    const r = checkDraw(list, st, a);
    if (r.errors.length) { console.log(ev, 'ERR', r.errors); process.exit(1); }
    warnTotal += r.warnings.length;
    firstSame += r.warnings.filter(w => w.includes('同校對戰')).length;
    if (t === 0 && r.warnings.length) console.log(ev, 'sample warnings:', r.warnings.slice(0, 4));
  }
  console.log(ev, n, kind === 'ko' ? st.sections.map(s => s.size).join('/') : st.groups.length + '組', '200次平均警告', (warnTotal / 200).toFixed(2), '首場同校', firstSame);
}
