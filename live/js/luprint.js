// 線上點單說明單（A4 黑白，每隊一張）：報到時發給隊伍，上面有項目隊名、QR code、填寫步驟、目前可填寫的信箱，
// 以及手寫新增信箱的空格。
import { esc } from './ui.js';

const URL_TEXT = 'nctu-ttc.tw/live/lineup';

const CSS = `
@page { size: A4; margin: 14mm 16mm; }
* { box-sizing: border-box; }
body { margin: 0; font-family: "Noto Sans TC", "Noto Sans CJK TC", "PingFang TC", "Microsoft JhengHei", sans-serif; color: #000; background: #fff; }
.sheet { width: 178mm; min-height: 265mm; margin: 0 auto; page-break-after: always; display: flex; flex-direction: column; }
.sheet:last-child { page-break-after: auto; }
.top { border: 2.5px solid #000; border-radius: 4mm; padding: 6mm 8mm; display: flex; align-items: baseline; gap: 8mm; }
.top .ev { font-size: 30pt; font-weight: 900; padding: 1mm 4mm; border: 2px solid #000; border-radius: 2mm; }
.top .team { font-size: 34pt; font-weight: 900; line-height: 1.15; }
.sub { margin: 4mm 0 0; font-size: 13pt; letter-spacing: 1px; }
.mid { display: flex; gap: 8mm; margin-top: 7mm; align-items: flex-start; }
.qr { width: 58mm; flex: none; text-align: center; }
.qr img { width: 58mm; height: 58mm; display: block; }
.qr .url { margin-top: 2mm; font-size: 12.5pt; font-weight: 700; letter-spacing: .3px; }
.steps { flex: 1; margin: 0; padding: 0; list-style: none; counter-reset: s; }
.steps li { counter-increment: s; position: relative; padding: 0 0 3.2mm 10mm; font-size: 12.5pt; line-height: 1.6; }
.steps li::before { content: counter(s); position: absolute; left: 0; top: .5mm; width: 7mm; height: 7mm; border: 1.6px solid #000; border-radius: 50%; font-size: 11pt; font-weight: 700; text-align: center; line-height: 6.4mm; }
.steps b { font-weight: 800; }
.warn { margin-top: 2mm; border: 2px solid #000; padding: 3mm 5mm; font-size: 13pt; font-weight: 800; text-align: center; }
h2 { font-size: 14pt; margin: 8mm 0 2mm; border-bottom: 2px solid #000; padding-bottom: 1.5mm; }
table { width: 100%; border-collapse: collapse; font-size: 12.5pt; }
td { border-bottom: 1px solid #000; padding: 2.6mm 2mm; height: 11mm; vertical-align: bottom; }
td.role { width: 28mm; font-weight: 700; white-space: nowrap; }
td.no { width: 9mm; text-align: center; }
.note { margin-top: 2.5mm; font-size: 10.5pt; line-height: 1.6; }
.foot { margin-top: auto; padding-top: 5mm; font-size: 10pt; display: flex; justify-content: space-between; border-top: 1px solid #000; }
@media screen { body { background: #e5e7eb; padding: 10mm 0; } .sheet { background: #fff; padding: 14mm 16mm; width: 210mm; min-height: 297mm; margin-bottom: 8mm; box-shadow: 0 2px 10px rgba(0,0,0,.15); } }
`;

/**
 * list：[{ ev: '男團', team: '陽明交大(綠)', owner: 'a@x.com', editors: ['b@y.com'] }]
 * qrSrc：QR code 圖片網址（live/img/lineup-qr.svg）
 */
export function lineupSheetsHtml(list, qrSrc, opt = {}) {
  const blanks = Math.max(1, (opt.rows || 6) - 0);
  const page = x => {
    const mails = [x.owner ? ['聯絡人', x.owner] : null, ...(x.editors || []).map(m => ['共同編輯', m])].filter(Boolean);
    const free = Math.max(2, blanks - mails.length);
    return `<section class="sheet">
  <div class="top"><span class="ev">${esc(x.ev)}</span><span class="team">${esc(x.team)}</span></div>
  <p class="sub">交大盃　團體賽線上點單</p>
  <div class="mid">
    <div class="qr"><img src="${esc(qrSrc)}" alt="線上點單 QR code"><div class="url">${URL_TEXT}</div></div>
    <ol class="steps">
      <li>用手機掃描 QR code，或輸入網址 <b style="white-space:nowrap">${URL_TEXT}</b>。從 LINE 開啟時，請按右下角「⋯」選擇「以瀏覽器開啟」。</li>
      <li>用下方<b>任一個信箱的 Google 帳號</b>登入。</li>
      <li>選擇場次，按「<b>填寫點單</b>」，每一點選擇出賽選手。</li>
      <li>全隊確認無誤後，按「<b>送出點單</b>」。請在各場表定時間前送出。</li>
    </ol>
  </div>
  <div class="warn">送出後就不能再修改，請確認無誤再送出</div>
  <h2>可以填寫點單的信箱</h2>
  <table><tbody>
    ${mails.map((r, i) => `<tr><td class="no">${i + 1}</td><td class="role">${r[0]}</td><td>${esc(r[1])}</td></tr>`).join('')}
    ${Array.from({ length: free }, (_, i) => `<tr><td class="no">${mails.length + i + 1}</td><td class="role"></td><td></td></tr>`).join('')}
  </tbody></table>
  <p class="note">需要新增信箱：聯絡人登入後可在「新增點單填寫權限」自行加入（最多 3 個共同編輯），或寫在上方空格交給簽到處登記。</p>
  <div class="foot"><span>交大盃</span><span>有任何問題請洽大會</span></div>
</section>`;
  };
  return `<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><title>線上點單說明</title><style>${CSS}</style></head><body>${list.map(page).join('')}</body></html>`;
}
