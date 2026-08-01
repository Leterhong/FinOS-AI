/**
 * 相对时间格式化工具（Phase 5.6：Dashboard「数据更新时间」展示）。
 * 返回如「刚刚 / 3 分钟前 / 2 小时前 / 昨天 / 3 天前 / 2026-07-25」的中文文案。
 */
export function timeAgo(ts: number | null | undefined): string {
  if (!ts) return "尚未同步";
  const diff = Date.now() - ts;
  if (diff < 0) return "刚刚";
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return "刚刚";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} 分钟前`;
  const hour = Math.floor(min / 60);
  if (hour < 24) return `${hour} 小时前`;
  const day = Math.floor(hour / 24);
  if (day === 1) return "昨天";
  if (day < 7) return `${day} 天前`;
  if (day < 30) return `${Math.floor(day / 7)} 周前`;
  // 超过 30 天显示绝对日期
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}
