import "server-only";

/**
 * 幂等请求状态存储：多实例共享（Redis），未配置 Redis 时回退进程内。
 * - result：已完成结果，TTL 10 分钟；
 * - lock：在途认领，跨实例只允许一个执行者。
 */
export interface IdempotentResult {
  answer: string;
  model: string;
  latencyMs: number;
  skill?: { id: string; name: string };
  at: number;
}

const RESULT_TTL_SECONDS = 600;
const LOCK_TTL_MS = 660_000;

const memoryResults = new Map<string, IdempotentResult>();
const memoryPending = new Map<string, { promise: Promise<IdempotentResult | null>; resolve: (value: IdempotentResult | null) => void }>();

type RedisLike = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, options?: { NX?: boolean; EX?: number; PX?: number }): Promise<string | null>;
  del(key: string): Promise<number>;
  exists(key: string): Promise<number>;
  on(event: string, listener: (...args: unknown[]) => void): unknown;
  connect(): Promise<unknown>;
};

let clientPromise: Promise<RedisLike | null> | null = null;
let warned = false;

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
        if (!warned) {
          warned = true;
          console.warn("[idempotency] Redis 不可用，回退进程内幂等缓存（仅单实例生效）");
        }
        return null;
      }
    })();
  }
  return clientPromise;
}

function resolveMemory(id: string, value: IdempotentResult | null): void {
  const entry = memoryPending.get(id);
  if (entry) {
    entry.resolve(value);
    memoryPending.delete(id);
  }
}

export async function idemGet(id: string): Promise<IdempotentResult | null> {
  const client = await getClient();
  if (client) {
    const raw = await client.get(`idem:result:${id}`);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as IdempotentResult;
    } catch {
      return null;
    }
  }
  const value = memoryResults.get(id);
  if (!value) return null;
  if (Date.now() - value.at > RESULT_TTL_SECONDS * 1000) {
    memoryResults.delete(id);
    return null;
  }
  return value;
}

/** 认领执行权：返回 true 表示由本次请求执行，false 表示已有其它实例/请求在处理。 */
export async function idemClaim(id: string): Promise<boolean> {
  const client = await getClient();
  if (client) {
    const result = await client.set(`idem:lock:${id}`, "1", { NX: true, PX: LOCK_TTL_MS });
    return result === "OK";
  }
  if (memoryPending.has(id)) return false;
  let resolve: (value: IdempotentResult | null) => void = () => undefined;
  const promise = new Promise<IdempotentResult | null>((r) => { resolve = r; });
  memoryPending.set(id, { promise, resolve });
  return true;
}

/** 等待其它实例完成并返回结果；锁释放且无结果时返回 null。 */
export async function idemWait(id: string, timeoutMs = 600_000): Promise<IdempotentResult | null> {
  const client = await getClient();
  if (client) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const raw = await client.get(`idem:result:${id}`);
      if (raw) {
        try {
          return JSON.parse(raw) as IdempotentResult;
        } catch {
          return null;
        }
      }
      if (!(await client.exists(`idem:lock:${id}`))) return null;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    return null;
  }
  const entry = memoryPending.get(id);
  return entry ? entry.promise : null;
}

export async function idemStore(id: string, value: IdempotentResult): Promise<void> {
  const client = await getClient();
  if (client) {
    await client.set(`idem:result:${id}`, JSON.stringify(value), { EX: RESULT_TTL_SECONDS });
    await client.del(`idem:lock:${id}`);
    return;
  }
  memoryResults.set(id, value);
  resolveMemory(id, value);
}

/** 执行失败：释放锁并唤醒等待者（不写结果，允许后续重试重新认领）。 */
export async function idemRelease(id: string): Promise<void> {
  const client = await getClient();
  if (client) {
    await client.del(`idem:lock:${id}`);
    return;
  }
  resolveMemory(id, null);
}
