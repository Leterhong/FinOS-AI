import "server-only";

/**
 * 共享默认模型的按 IP 限流（进程内滑动窗口）。
 * 仅在被共享模型（服务端配置）服务时启用，避免匿名访客刷共用密钥。
 * 单实例部署下有效；多实例生产应改用 Redis 计数（当前 Docker 编排为单实例）。
 */

const WINDOW_MS = 60_000;
const hits = new Map<string, { count: number; resetAt: number }>();

/** 从请求头解析客户端 IP（部署于可信反向代理后）。 */
export function clientIpFromHeaders(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for") ?? "";
  const first = forwarded.split(",")[0]?.trim();
  return first || headers.get("x-real-ip") || "unknown";
}

/** 共享模型限流：返回 false 表示超过每分钟配额。 */
export function allowSharedModelCall(ip: string): boolean {
  const limit = Math.max(1, Number(process.env.AI_SHARED_RATE_LIMIT_PER_MINUTE ?? "20") || 20);
  const now = Date.now();
  const entry = hits.get(ip);
  if (!entry || entry.resetAt <= now) {
    hits.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  entry.count += 1;
  return entry.count <= limit;
}
