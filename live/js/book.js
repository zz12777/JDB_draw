// 秩序冊：每頁轉成圖片放在 live/book/，目錄依秩序冊第 2 頁的頁碼
export const BOOK = {
  pages: 63, w: 1241, h: 1754,
  toc: [
    ['封面', 1], ['目錄', 2], ['一、大會組織', 3], ['二、競賽規程', 4], ['三、賽程時間表', 9],
    ['四、團體賽賽程表', 10, [['大專男子團體', 10], ['大專女子團體', 15], ['社會團體組', 18]]],
    ['五、個人賽賽程表', 21, [['大專男子單打', 21], ['大專男子雙打', 26], ['大專女子單打', 29], ['大專女子雙打', 34]]],
    ['六、團體賽參賽名單', 37, [['大專男子組', 37], ['大專女子組', 43], ['社會團體組', 48]]],
    ['七、個人賽參賽名單', 53, [['大專男子組', 53], ['大專女子組', 58]]],
    ['八、贊助商廣告頁', 63],
  ],
};
const src = n => `book/${String(n).padStart(2, '0')}.webp`;
export function bookHtml(open) {
  const item = ([t, p, sub]) => `<li><button data-bkgo="${p}"><span>${t}</span><span class="bkp">${p}</span></button>${sub ? `<ul>${sub.map(item).join('')}</ul>` : ''}</li>`;
  return `<div class="bkbar"><span class="bkcur" id="bkcur">1 / ${BOOK.pages}</span><button class="bkmenu" data-bkmenu aria-label="目錄" aria-expanded="${open}"><svg viewBox="0 0 16 16" width="20" height="20" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M2.5 4h11M2.5 8h11M2.5 12h11"/></svg></button>
    <nav class="bknav" ${open ? '' : 'hidden'}><ul>${BOOK.toc.map(item).join('')}</ul></nav></div>
    <div class="bkpages">${Array.from({ length: BOOK.pages }, (_, i) => `<img id="bk${i + 1}" data-pg="${i + 1}" src="${src(i + 1)}" width="${BOOK.w}" height="${BOOK.h}" loading="${i < 2 ? 'eager' : 'lazy'}" alt="第 ${i + 1} 頁">`).join('')}</div>`;
}
