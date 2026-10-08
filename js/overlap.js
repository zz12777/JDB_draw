// 重疊名單：男團、女團裡有打個人賽的人；社團裡有打大專男團、女團的人

export const cleanName = s => String(s ?? '').replace(/[\s　]+/g, '').replace(/黄/g, '黃');

/** 隊員欄拆成名字 */
export function splitMembers(text) {
  return String(text ?? '')
    .replace(/[（(][^）)]*[）)]/g, ' ')
    .split(/[^㐀-鿿豈-﫿A-Za-z·．.]+/)
    .map(cleanName)
    .filter(x => x.length >= 2);
}

/**
 * events: { 項目: [entry] }，entry 有 school、name、members
 * 回傳 { 男團: [{ team, school, hits: [{ name, tag }] }], 女團: [...], 社團: [...] }
 */
export function computeOverlaps(events) {
  const out = {};
  const indexOf = (ev, splitDouble) => {
    const m = new Map(); // 姓名|學校 -> 雙打的那一組（甲/乙）
    (events[ev] || []).forEach(e => {
      const names = splitDouble ? String(e.name).split(/[/／、]/) : [e.name];
      const pair = names.map(cleanName).filter(Boolean).join('/');
      names.map(cleanName).filter(Boolean).forEach(n => m.set(`${n}|${e.school}`, pair));
    });
    return m;
  };
  [['男團', '男單', '男雙'], ['女團', '女單', '女雙']].forEach(([team, single, double]) => {
    if (!events[team] || !events[team].length) return;
    const si = indexOf(single, false), di = indexOf(double, true);
    out[team] = events[team].map(t => {
      const hits = [];
      splitMembers(t.members).forEach(n => {
        if (si.has(`${n}|${t.school}`)) hits.push({ name: n, tag: '單' });
        else if (di.has(`${n}|${t.school}`)) hits.push({ name: n, tag: '雙', pair: di.get(`${n}|${t.school}`) });
      });
      return { team: t.name, school: t.school, hits };
    });
  });
  if (events['社團'] && events['社團'].length) {
    const who = new Map(); // 姓名 -> [「男團 臺灣大學申」]
    ['男團', '女團'].forEach(ev => (events[ev] || []).forEach(t => {
      splitMembers(t.members).forEach(n => {
        if (!who.has(n)) who.set(n, []);
        who.get(n).push(`${ev} ${t.name}`);
      });
    }));
    out['社團'] = events['社團'].map(t => {
      const hits = [];
      splitMembers(t.members).forEach(n => { if (who.has(n)) hits.push({ name: n, tag: who.get(n).join('、') }); });
      return { team: t.name, school: t.school, hits };
    });
  }
  return out;
}

export const hitText = hits => hits.map(h => `${h.name}（${h.tag}）`).join('、');
/** 某一類（單、雙）的名字 */
// 雙打寫成一組一組（甲/乙），同一組的兩人都在隊上時只寫一次
export const namesOf = (hits, tag) => [...new Set(hits.filter(h => h.tag === tag).map(h => (tag === '雙' && h.pair ? h.pair : h.name)))].join('、');

/** 重疊名單 Excel：男團、女團、社團各一頁 */
export function overlapWorkbook(overlaps, ExcelJSLib = globalThis.ExcelJS) {
  const wb = new ExcelJSLib.Workbook();
  wb.creator = '交大盃抽籤系統';
  const head = row => {
    row.font = { bold: true };
    row.eachCell(c => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDCE6F1' } }; });
  };
  const fit = ws => ws.eachRow(r => r.eachCell(c => { c.alignment = { vertical: 'top', wrapText: true }; }));
  ['男團', '女團'].forEach(ev => {
    if (!overlaps[ev]) return;
    const ws = wb.addWorksheet(ev);
    ws.columns = [{ width: 18 }, { width: 40 }, { width: 40 }];
    head(ws.addRow(['隊名', '兼單打', '兼雙打']));
    overlaps[ev].forEach(o => ws.addRow([o.team, namesOf(o.hits, '單'), namesOf(o.hits, '雙')]));
    fit(ws);
    ws.views = [{ state: 'frozen', ySplit: 1 }];
  });
  if (overlaps['社團']) {
    const ws = wb.addWorksheet('社團');
    ws.columns = [{ width: 20 }, { width: 70 }];
    head(ws.addRow(['隊名', '兼大專團體']));
    overlaps['社團'].forEach(o => ws.addRow([o.team, o.hits.length ? hitText(o.hits) : '無大專組']));
    fit(ws);
    ws.views = [{ state: 'frozen', ySplit: 1 }];
  }
  return wb;
}
