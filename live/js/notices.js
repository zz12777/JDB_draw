// 大會注意事項：依賽程時間表推算每個要提醒的時間點，每一屆換時間表也能直接套用。
// 輸入 sched.slots（timetable.js 的格式），輸出依時間排序的提醒。
const TEAM = ['男團', '女團', '社團'];
const IND = ['男單', '女單', '男雙', '女雙'];
const NAME = { 男團: '大專男團', 女團: '大專女團', 社團: '社會組', 男單: '男單', 女單: '女單', 男雙: '男雙', 女雙: '女雙' };
const ORDER = ['男單', '女單', '男雙', '女雙', '男團', '女團', '社團'];
const toMin = t => { const [h, m] = String(t).split(':').map(Number); return h * 60 + m; };
const toTime = n => `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
const join = list => list.map(e => NAME[e]).join('、');
const range = x => (x.f ? `決${x.from}${x.to !== x.from ? `-${x.to}` : ''}` : `第 ${x.from}${x.to !== x.from ? `~${x.to}` : ''} 場`);

/**
 * kind：prep 準備、call 叫場或廣播、lineup 點單、draw 抽籤、award 頒獎、info 叫場原則
 * 回傳 [{ d, day, t: 'HH:MM', kind, text }]
 */
export function buildNotices(raw) {
  if (!raw || !raw.length) return [];
  // 合併儲存格或同一項目跨兩欄會讀到重複的格子：同一天同項目同場次範圍只留最早的一格
  const seen = new Map();
  raw.slice().sort((a, b) => a.d - b.d || a.s.localeCompare(b.s)).forEach(x => {
    const k = [x.d, x.ev, !!x.f, !!x.draw, x.from, x.to].join('|');
    const o = seen.get(k);
    if (!o) seen.set(k, { ...x }); else if (x.e > o.e) o.e = x.e;
  });
  const slots = [...seen.values()];
  const out = [];
  const add = (d, day, min, kind, text) => out.push({ d, day, t: toTime(min), min, kind, text, seq: out.length });
  const days = [...new Set(slots.map(x => x.d))].sort((a, b) => a - b);

  days.forEach((d, di) => {
    const ss = slots.filter(x => x.d === d);
    const day = ss[0].day;
    const starts = [...new Set(ss.map(x => x.s))].sort();
    const first = toMin(starts[0]);
    add(d, day, first - 10, 'prep', '清場，準備叫第一輪');
    add(d, day, first - 5, 'call', '開始叫第一輪');
    // 比賽期間定時看 Firebase 用量（免費方案超過上限整個系統會停）
    add(d, day, first - 30, 'prep', '查看 Firebase 用量（連線、下載量），之後每 1～2 小時看一次');
    // 每天最後一個時段結束：下載備份檔
    const lastEnd = Math.max(...ss.map(x => toMin(x.e)));
    add(d, day, lastEnd, 'prep', '下載當日備份：資料設定 > 備份與還原 > 下載備份檔，存到大會電腦與雲端硬碟');

    // 每個時段開始：廣播這個時段的場次
    starts.forEach(st => {
      const here = ss.filter(x => x.s === st && !x.draw);
      if (!here.length) return;
      const evs = ORDER.filter(e => here.some(x => x.ev === e));
      add(d, day, toMin(st), 'call', `廣播本時段場次：${evs.map(e => here.filter(x => x.ev === e).map(x => `${NAME[e]}${range(x)}`).join('、')).join('，')}`);
      // 叫場原則：個人賽和團體預賽重疊以個人賽為主；團體決賽和團體預賽重疊以決賽為主
      const hasInd = here.some(x => IND.includes(x.ev));
      const teamPre = here.filter(x => TEAM.includes(x.ev) && !x.f);
      const teamFin = here.filter(x => TEAM.includes(x.ev) && x.f);
      const startPre = teamPre.filter(x => !ss.some(y => y.ev === x.ev && !y.f && !y.draw && y.s < st));
      if (startPre.length && hasInd) add(d, day, toMin(st), 'info', '個人賽與團體賽同時進行，叫場以個人賽為主');
      if (startPre.length && teamFin.length) add(d, day, toMin(st), 'info', '團體決賽與團體預賽同時進行，叫場以決賽為主');
    });

    // 團體預賽：開打前 30 分鐘催點單，前 10 分鐘收齊
    const preAt = new Map();
    TEAM.forEach(e => {
      const pre = ss.filter(x => x.ev === e && !x.f && !x.draw).sort((a, b) => a.s.localeCompare(b.s));
      if (pre.length) preAt.set(pre[0].s, (preAt.get(pre[0].s) || []).concat(e));
    });
    preAt.forEach((evs, st) => {
      add(d, day, toMin(st) - 30, 'lineup', `催交${join(evs)}預賽點單`);
      add(d, day, toMin(st) - 10, 'lineup', `${join(evs)}預賽點單收齊`);
    });

    // 團體決賽抽籤：前 1 小時準備，抽完馬上發決賽點單；決賽開打前 10 分鐘收齊
    const draws = ss.filter(x => x.draw);
    const drawStarts = [...new Set(draws.map(x => x.s))].sort();
    drawStarts.forEach(st => {
      const evs = TEAM.filter(e => draws.some(x => x.s === st && x.ev === e));
      const end = draws.find(x => x.s === st).e;
      add(d, day, toMin(st) - 60, 'prep', `準備${join(evs)}決賽抽籤`);
      // 抽籤前最後一輪：兩個大專團體都在打時，女團先叫，錯開抽籤
      const last = ss.filter(x => !x.draw && x.e <= st && TEAM.includes(x.ev) && !x.f);
      const lastSt = last.map(x => x.s).sort().pop();
      if (lastSt && evs.includes('男團') && evs.includes('女團') && last.some(x => x.s === lastSt && x.ev === '女團')) add(d, day, toMin(lastSt), 'info', '抽籤前最後一輪：女團先叫，錯開抽籤');
      add(d, day, toMin(st), 'draw', `${join(evs)}決賽抽籤`);
      add(d, day, toMin(end), 'lineup', `抽籤完成，馬上發${join(evs)}決賽點單`);
      // 同一天同時間的決賽點單提醒合併成一行
      const later = new Map();
      evs.forEach(e => {
        const fin = slots.filter(x => x.ev === e && x.f).sort((a, b) => a.d - b.d || a.s.localeCompare(b.s))[0];
        if (!fin) return;
        const push = (fd, fday, min, text) => { const k = `${fd}|${min}|${text}`; const o = later.get(k) || { fd, fday, min, text, evs: [] }; o.evs.push(e); later.set(k, o); };
        if (fin.d !== d) {
          const fd = slots.filter(x => x.d === fin.d);
          push(fin.d, fd[0].day, toMin([...new Set(fd.map(x => x.s))].sort()[0]) - 30, '廣播{}各隊領決賽點單');
          push(fin.d, fin.day, toMin(fin.s) - 10, '{}決賽點單收齊');
        } else if (toMin(fin.s) - 10 >= toMin(end)) push(d, day, toMin(fin.s) - 10, '{}決賽點單收齊');
        else push(d, day, toMin(end), '{}決賽點單收齊後即開打');
      });
      later.forEach(o => add(o.fd, o.fday, o.min, 'lineup', o.text.replace('{}', join(o.evs))));
    });

    // 第一個時段同時有男團、女團決賽：先叫男團，空桌再拆給女團
    const f0 = ss.filter(x => x.s === starts[0] && x.f);
    if (f0.some(x => x.ev === '男團') && f0.some(x => x.ev === '女團')) add(d, day, first, 'info', '先叫男團，男團打完的空桌再拆給女團');

    // 頒獎：個人賽決賽開打時準備個人賽頒獎；大專團體、社會組最後一場開打時準備頒獎
    const indLast = ss.filter(x => IND.includes(x.ev) && !x.draw).map(x => x.s).sort().pop();
    if (indLast) add(d, day, toMin(indLast), 'award', '個人賽決賽開打，準備個人賽頒獎');
    const finLast = evs => {
      const fins = evs.map(e => slots.filter(x => x.ev === e && x.f).sort((a, b) => b.to - a.to)[0]).filter(x => x && x.d === d);
      return fins.length ? fins.map(x => x.s).sort().pop() : null;
    };
    const uni = finLast(['男團', '女團']);
    if (uni) add(d, day, toMin(uni), 'award', '大專團體決賽最後一場開打，準備大專組頒獎');
    const soc = finLast(['社團']);
    if (soc) add(d, day, toMin(soc), 'award', '社會組決賽最後一場開打，準備社會組頒獎');

    // 最後一天倒數第二個時段：開始撤桌、場地復原
    if (di === days.length - 1 && starts.length > 2) add(d, day, toMin(starts[starts.length - 2]), 'prep', '開始撤用不到的球桌，場地復原');
  });

  const rank = { prep: 0, lineup: 1, draw: 2, award: 3, call: 4, info: 5 };
  return out.sort((a, b) => a.d - b.d || a.min - b.min || rank[a.kind] - rank[b.kind] || a.seq - b.seq);
}

export const KIND_NAME = { prep: '準備', call: '叫場', lineup: '點單', draw: '抽籤', award: '頒獎', info: '原則' };
/** 不綁時間的叫場原則，印在注意事項最後 */
export const RULES = [
  '叫團體賽的原則：同一輪中，已交點單、可以打的就先叫。',
  '團賽同一循環的兩場盡量一起叫。',
  '每個時段開始時廣播目前要進行的場次。',
  '進度落後時間表超過 1 小時，可以先請各隊派代表到大會台協調。',
  '裁判分頁出現紅色「裁判更換確認」時，確認接手記分的是大會派去的裁判；不是的話馬上到該桌處理，並更換裁判密碼。',
  '比賽期間每 1～2 小時查看 Firebase 用量（連線、下載量），超過要注意的數字時請關掉不用的大會台分頁並聯絡系統負責人。',
  '各隊應於預定比賽時間前 1 小時到場。',
];

const escH = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
/** 可列印的大會注意事項時間表（完整 HTML） */
export function noticesHtml(title, list, dayLabel = (d, day) => day) {
  const days = [...new Set(list.map(x => x.d))];
  const body = days.map(d => {
    const rows = list.filter(x => x.d === d);
    return `<section><h2>${escH(dayLabel(d, rows[0].day))}</h2><table><thead><tr><th class="t">時間</th><th class="k">類別</th><th>事項</th><th class="c">完成</th></tr></thead><tbody>
      ${rows.map(x => `<tr class="${x.kind}"><td class="t">${x.t}</td><td class="k"><span class="tag ${x.kind}">${KIND_NAME[x.kind]}</span></td><td>${escH(x.text)}</td><td class="c"><span class="box"></span></td></tr>`).join('')}
      </tbody></table></section>`;
  }).join('');
  return `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><title>${escH(title)}</title>
<style>
@page { size: A4; margin: 0; }
* { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
body { font-family: "Noto Sans TC", "Microsoft JhengHei", sans-serif; color: #1b2a41; margin: 0; font-size: 12.5px; }
h1 { font-size: 20px; margin: 0 0 4px; color: #143d7a; }
.sub { color: #5b6b82; margin: 0 0 14px; font-size: 12px; }
h2 { font-size: 15px; color: #fff; background: #143d7a; padding: 5px 10px; margin: 16px 0 0; border-radius: 4px 4px 0 0; }
table { width: 100%; border-collapse: collapse; }
th { background: #e8eef8; color: #143d7a; text-align: left; font-weight: 600; padding: 5px 8px; border-bottom: 1px solid #c9d5e8; }
td { padding: 5px 8px; border-bottom: 1px solid #e3e8f0; vertical-align: top; }
tr { break-inside: avoid; }
.t { width: 52px; font-variant-numeric: tabular-nums; font-weight: 600; white-space: nowrap; }
.k { width: 46px; } .c { width: 36px; text-align: center; }
.box { display: inline-block; width: 13px; height: 13px; border: 1.3px solid #8a99b0; border-radius: 2px; }
.tag { display: inline-block; font-size: 11px; padding: 1px 6px; border-radius: 3px; border: 1px solid; white-space: nowrap; }
.tag.prep { color: #143d7a; border-color: #9fb4d6; background: #f2f6fc; }
.tag.call { color: #5b6b82; border-color: #d3dae5; }
.tag.lineup { color: #7a5600; border-color: #f0c64a; background: #fff6d6; font-weight: 600; }
.tag.draw { color: #fff; border-color: #143d7a; background: #143d7a; }
.tag.award { color: #7a5600; border-color: #e0b100; background: #ffe58a; }
.tag.info { color: #5b6b82; border-color: #d3dae5; background: #f5f7fa; }
tr.call td, tr.info td { color: #4a5a70; }
tr.lineup td:nth-child(3), tr.draw td:nth-child(3), tr.award td:nth-child(3) { font-weight: 600; }
.rules { margin-top: 16px; border: 1px solid #c9d5e8; border-radius: 4px; padding: 8px 12px; break-inside: avoid; }
.pbtn { position: fixed; top: 12px; right: 12px; background: #143d7a; color: #fff; border: 0; border-radius: 6px; padding: 8px 16px; font: inherit; font-size: 14px; cursor: pointer; }
@media print { .pbtn { display: none; } body { padding: 0 12mm; } }
/* 頁面邊界設為 0，瀏覽器就不會印出網址、日期那些頁首頁尾；上下留白改用每頁重複的表頭表尾 */
.pg { width: 100%; border-collapse: collapse; } .pg > thead > tr > td, .pg > tfoot > tr > td { height: 13mm; padding: 0; border: 0; } .pg > tbody > tr > td { padding: 0; border: 0; }
@media screen { .pg > thead, .pg > tfoot { display: none; } }
@media screen { body { max-width: 820px; margin: 24px auto; padding: 0 16px; } }
.rules h3 { margin: 0 0 4px; font-size: 13px; color: #143d7a; } .rules ol { margin: 0; padding-left: 20px; } .rules li { margin: 2px 0; }
</style></head><body><button class="pbtn" onclick="print()">列印</button><table class="pg"><thead><tr><td></td></tr></thead><tfoot><tr><td></td></tr></tfoot><tbody><tr><td><h1>${escH(title)}</h1><p class="sub">依賽程時間表推算，實際進度若有落差，以現場狀況調整。</p>${body}
<div class="rules"><h3>叫場原則</h3><ol>${RULES.map(r => `<li>${escH(r)}</li>`).join('')}</ol></div></td></tr></tbody></table></body></html>`;
}
