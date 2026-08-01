/**
 * 日期归一化 —— 把各种来源的日期字符串统一为 ISO yyyy-mm-dd。
 * 纯函数，客户端 / 服务端共享。
 */

/** 解析日期字符串为 ISO yyyy-mm-dd，失败返回 null */
export function parseDate(input?: string): string | null {
  if (!input) return null;
  const s = input.trim();
  if (!s) return null;

  // yyyy-mm-dd / yyyy/mm/dd / yyyy.mm.dd / yyyymmdd
  let m = s.match(/^(\d{4})[-/.]?(\d{1,2})[-/.]?(\d{1,2})/);
  if (m) {
    return toIso(Number(m[1]), Number(m[2]), Number(m[3]));
  }

  // 中文：2026年3月5日
  m = s.match(/^(\d{4})年(\d{1,2})月(\d{1,2})日?/);
  if (m) {
    return toIso(Number(m[1]), Number(m[2]), Number(m[3]));
  }

  // dd/mm/yyyy 或 mm/dd/yyyy —— 优先按 dd/mm（国内 & 欧洲常见），
  // 若首段 > 12 则必为日
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    const year = Number(m[3]);
    if (a > 12) return toIso(year, b, a); // dd/mm/yyyy
    if (b > 12) return toIso(year, a, b); // mm/dd/yyyy
    return toIso(year, b, a); // 默认 dd/mm/yyyy
  }

  // 兜底：交给 Date 解析
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) {
    return toIso(d.getFullYear(), d.getMonth() + 1, d.getDate());
  }

  return null;
}

function toIso(y: number, mo: number, d: number): string | null {
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const mm = String(mo).padStart(2, "0");
  const dd = String(d).padStart(2, "0");
  return `${y}-${mm}-${dd}`;
}

/** 取 yyyy-mm */
export function monthOf(iso: string): string {
  return iso.slice(0, 7);
}
