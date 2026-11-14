// 示範資料（學校為實際校名，人名為隨機產生的假名）
import { emptyState } from './model.js';
import { splitSizes, defaultSections } from '../../js/bracket.js';
import { makeRng } from '../../js/util.js';

const SCHOOLS = ['陽明交大', '臺灣大學', '清華大學', '成功大學', '政治大學', '中央大學', '中興大學', '中正大學', '臺灣師大', '輔仁大學',
  '淡江大學', '東吳大學', '逢甲大學', '元智大學', '中原大學', '臺北科大', '臺灣科大', '東海大學', '長庚大學', '海洋大學'];
const SUR = '陳林黃張李王吳劉蔡楊許鄭謝郭洪曾邱廖賴徐周葉蘇莊呂江何蕭羅高';
const GIV = '承宇柏翰冠廷宥辰品睿子晴詠欣宜庭思妤語彤芷安家瑜怡君俊傑志明建宏雅婷佩珊淑芬';
const SOCIAL = ['竹風桌球', '光復校友隊', '風城快攻', '削球同好會', '週三夜練團', '十八尖山', '東門老將', '博愛街坊'];

export function demoState() {
  const rng = makeRng('JDB13');
  const pick = arr => arr[Math.floor(rng() * arr.length)];
  const person = () => pick(SUR) + pick(GIV) + pick(GIV);
  const s = emptyState();
  const teamEvent = (name, teams, sizes) => {
    const groups = []; let k = 0;
    sizes.forEach((n, i) => { groups.push({ letter: 'ABCDEFGH'[i], teams: teams.slice(k, k + n) }); k += n; });
    const rosters = {};
    teams.forEach(t => { rosters[t] = Array.from({ length: 7 }, person); });
    s.events.push({ name, kind: 'rr', groups, rosters, rank: {}, finalPos: {}, roll: {} });
  };
  const koEvent = (name, n, dbl) => {
    const byPos = {};
    for (let p = 1; p <= n; p++) byPos[p] = { school: pick(SCHOOLS), name: dbl ? `${person()}/${person()}` : person() };
    s.events.push({ name, kind: 'ko', sizes: n > 32 ? splitSizes(n, defaultSections(n)) : [n], byPos });
  };
  teamEvent('男團', SCHOOLS.slice(0, 14).map((x, i) => x + (i < 3 ? 'A' : '')), [3, 3, 4, 4]);
  teamEvent('女團', SCHOOLS.slice(2, 8), [3, 3]);
  teamEvent('社團', SOCIAL, [4, 4]);
  koEvent('男單', 22); koEvent('女單', 11); koEvent('男雙', 9, true); koEvent('女雙', 6, true);
  return s;
}
