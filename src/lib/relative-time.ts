/**
 * 相对时间展示：存量数据里可能保存着「刚刚」「从云端恢复」等非时间字符串
 * （或已是 ISO 时间戳），统一安全渲染——不可解析时原样返回。
 */
export function formatWhen(value: string | undefined | null): string {
  if (!value) return "—";
  const ts = Date.parse(value);
  if (Number.isNaN(ts)) return value;
  const diff = Date.now() - ts;
  if (diff < 0) return new Date(ts).toLocaleString("zh-CN");
  if (diff < 60_000) return "刚刚";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)} 天前`;
  return new Date(ts).toLocaleDateString("zh-CN");
}
