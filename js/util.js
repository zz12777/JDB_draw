// 共用小工具

const DIGITS = ['〇', '一', '二', '三', '四', '五', '六', '七', '八', '九'];

/**
 * 場次編號轉中文，規則同舊 Excel 公式：
 * 1-9：一..九；10-19：十、十一..十九；20-99：二十、二一..九九；
 * 100 以上逐位寫，0 寫〇（一〇一、一二七）。
 */
export function toCn(n) {
  n = Math.trunc(n);
  if (n <= 0) return String(n);
  if (n < 10) return DIGITS[n];
  if (n < 20) return '十' + (n === 10 ? '' : DIGITS[n - 10]);
  if (n < 100) {
    const t = Math.floor(n / 10), u = n % 10;
    return DIGITS[t] + (u === 0 ? '十' : DIGITS[u]);
  }
  return String(n).split('').map(d => DIGITS[+d]).join('');
}

/** 可重現的亂數（mulberry32） */
export function makeRng(seed) {
  let a = hashSeed(seed);
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(seed) {
  const s = String(seed);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function newSeed() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  const buf = new Uint32Array(6);
  globalThis.crypto.getRandomValues(buf);
  for (const v of buf) s += chars[v % chars.length];
  return s;
}

export function shuffle(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export function uid() {
  return Math.random().toString(36).slice(2, 10);
}
