import "server-only";

/**
 * 共享默认模型的按 IP 限流。
 * 配置了 REDIS_URL 时用 Redis 固定窗口计数（多实例共享配额）；不可用时回退进程内计数。
 * 仅在被共享模型（服务端配置）服务时启用，避免匿名访客刷共用密钥。
 */

const WINDOW_MS = 60_000;
const memory = new Map<string, { count: number; resetAt: number }>();

type RedisLike = {
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number): Promise<unknown>;
  on(event: string, listener: () => void): unknown;
  connect(): Promise<unknown>;
};

let clientPromise: Promise<RedisLike | null> | null = null;

async function getClient(): Promise<RedisLike | null> {
  const url = process.env.REDIS_URL?.trim();
  if (!url) return null;
  if (!clientPromise) {
    clientPromise = (async () => {
      try {
        const { createClient } = await import("redis");
        const client = createClient({ url }) as unknown as RedisLike;
        client.on("error", () => undefined);
        await client.connect();
        return client;
      } catch {
        return null;
      }
    })();
  }
  return clientPromise;
}

/** 从请求头解析客户端 IP（部署于可信反向代理后）。 */
export function clientIpFromHeaders(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for") ?? "";
  const first = forwarded.split(",")[0]?.trim();
  return first || headers.get("x-real-ip") || "unknown";
}

function limitPerMinute(): number {
  return Math.max(1, Number(process.env.AI_SHARED_RATE_LIMIT_PER_MINUTE ?? "20") || 20);
}

/** 共享模型限流：返回 false 表示超过每分钟配额。 */
export async function allowSharedModelCall(ip: string): Promise<boolean> {
  const limit = limitPerMinute();
  const client = await getClient();
  if (client) {
    try {
      const bucket = Math.floor(Date.now() / WINDOW_MS);
      const key = `finos:shared-ai:${ip}:${bucket}`;
      const count = await client.incr(key);
      if (count === 1) await client.expire(key, Math.ceil(WINDOW_MS / 1000) + 5);
      return count <= limit;
    } catch {
      // 回退进程内计数
    }
  }
  const now = Date.now();
  const entry = memory.get(ip);
  if (!entry || entry.resetAt <= now) {
    memory.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  entry.count += 1;
  return entry.count <= limit;
}
