import fs from 'fs';
import { createRequire } from 'module';
import { readWorkbookValues } from '../js/reader.js';
import { parseFinalBracket } from '../js/finalparse.js';
const ExcelJS = createRequire(process.env.NM + '/')('exceljs');
const files = process.argv.slice(2);
for (const f of files) {
  const ev = f.split('/').pop().match(/(男單|女單|男雙|女雙|男團|女團|社團)/)[1];
  try {
    const r = parseFinalBracket(await readWorkbookValues(fs.readFileSync(f), ExcelJS), ev);
    const sample = [...r.byPos.entries()].slice(0, 3).map(([p, x]) => `${p}:${x.school}/${x.name}`).join(' ');
    console.log(ev, r.info, r.warnings.join('；'), '|', sample, '| 場次', r.st.kind === 'ko' ? r.st.matches.length : r.st.matchCount);
  } catch (e) { console.log(ev, 'ERR', e.message); }
}
