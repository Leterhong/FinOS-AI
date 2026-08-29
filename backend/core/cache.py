"""统一缓存层（Phase 7.0.4 七、Redis 缓存体系）。

策略：
- 优先使用 Redis（settings.redis_url）。
- Redis 不可用 / 未配置时，自动降级为进程内 LRU 缓存，保证开发环境零依赖可跑。
- 数据变化时通过 invalidate_prefix 主动清除缓存。

缓存键约定：
  twin:{user_id}             Financial Twin 结果
  report:{user_id}:{kind}    财富报告
  rag:{user_id}:{hash}       RAG 查询结果（hash 由查询文本生成）
  config:{user_id}           用户模型配置元信息
"""
from __future__ import annotations

import hashlib
import json
import threading
import time
from collections import OrderedDict, defaultdict, deque
from typing import Any, Callable, Optional

from backend.config import get_settings

settings = get_settings()


class _InMemoryCache:
    def __init__(self, maxsize: int = 2048) -> None:
        # value -> (expires_at_monotonic, payload)；TTL 与 Redis 模式语义一致。
        self._data: "OrderedDict[str, tuple[float, Any]]" = OrderedDict()
        self._maxsize = maxsize
        self._lock = threading.Lock()

    def get(self, key: str) -> Optional[Any]:
        with self._lock:
            item = self._data.get(key)
            if item is None:
                return None
            expires_at, value = item
            if expires_at is not None and time.monotonic() >= expires_at:
                del self._data[key]
                return None
            self._data.move_to_end(key)
            return value

    def set(self, key: str, value: Any, ttl: int = 300) -> None:
        with self._lock:
            expires_at = (time.monotonic() + ttl) if ttl and ttl > 0 else None
            self._data[key] = (expires_at, value)
            self._data.move_to_end(key)
            while len(self._data) > self._maxsize:
                self._data.popitem(last=False)

    def delete(self, key: str) -> None:
        with self._lock:
            self._data.pop(key, None)

    def delete_prefix(self, prefix: str) -> int:
        with self._lock:
            keys = [k for k in self._data if k.startswith(prefix)]
            for k in keys:
                self._data.pop(k, None)
            return len(keys)

    def clear(self) -> None:
        with self._lock:
            self._data.clear()


class Cache:
    def __init__(self) -> None:
        self._mode = "memory"
        self._redis = None
        self._connected = False
        self._mem = _InMemoryCache()
        self._rate: dict[str, deque] = defaultdict(deque)
        self._lock = threading.Lock()

    # --- 连接（懒加载，避免 import 时网络调用） ---
    def _ensure(self) -> None:
        if self._connected:
            return
        with self._lock:
            if self._connected:
                return
            try:
                import redis  # noqa: F401

                client = redis.Redis.from_url(
                    settings.redis_url,
                    socket_connect_timeout=1.0,
                    socket_timeout=1.0,
                )
                client.ping()
                self._redis = client
                self._mode = "redis"
            except Exception:
                self._redis = None
                self._mode = "memory"
            finally:
                self._connected = True

    @property
    def mode(self) -> str:
        self._ensure()
        return self._mode

    def get(self, key: str) -> Optional[Any]:
        self._ensure()
        if self._mode == "redis" and self._redis is not None:
            try:
                raw = self._redis.get(key)
                if raw is None:
                    return None
                return json.loads(raw)
            except Exception:
                return None
        return self._mem.get(key)

    def set(self, key: str, value: Any, ttl: int = 300) -> None:
        self._ensure()
        if self._mode == "redis" and self._redis is not None:
            try:
                self._redis.set(key, json.dumps(value, default=str), ex=ttl)
                return
            except Exception:
                pass
        self._mem.set(key, value, ttl)

    def delete(self, key: str) -> None:
        self._ensure()
        if self._mode == "redis" and self._redis is not None:
            try:
                self._redis.delete(key)
            except Exception:
                pass
        self._mem.delete(key)

    def hit(self, key: str, limit: int, window_seconds: int = 60) -> bool:
        """滑动窗口限流：窗口内第 limit+1 次命中返回 False。

        Redis 模式用 ZSET（多进程共享同一配额）；不可用时降级为进程内
        deque——fail-open 设计：Redis 异常时放行请求，限流绝不放大故障。
        """
        self._ensure()
        now = time.time()
        window_start = now - window_seconds
        if self._mode == "redis" and self._redis is not None:
            try:
                pipe = self._redis.pipeline()
                zset = f"ratelimit:{key}"
                pipe.zremrangebyscore(zset, "-inf", window_start)
                pipe.zadd(zset, {str(now): now})
                pipe.zcard(zset)
                pipe.expire(zset, window_seconds)
                _, _, count, _ = pipe.execute()
                return int(count) <= limit
            except Exception:
                # Redis 故障时放行（fail-open），降级逻辑交由内存路径兜底。
                pass
        with self._lock:
            bucket = self._rate[key]
            while bucket and bucket[0] <= window_start:
                bucket.popleft()
            if len(bucket) >= limit:
                return False
            bucket.append(now)
            if len(self._rate) > 10_000:
                for stale in [k for k, v in self._rate.items() if not v]:
                    del self._rate[stale]
            return True

    def invalidate_prefix(self, prefix: str) -> int:
        self._ensure()
        if self._mode == "redis" and self._redis is not None:
            try:
                count = 0
                for k in self._redis.scan_iter(match=f"{prefix}*"):
                    self._redis.delete(k)
                    count += 1
                return count
            except Exception:
                pass
        return self._mem.delete_prefix(prefix)

    # --- 便捷业务键 ---
    @staticmethod
    def twin_key(user_id: str) -> str:
        return f"twin:{user_id}"

    @staticmethod
    def report_key(user_id: str, kind: str) -> str:
        return f"report:{user_id}:{kind}"

    @staticmethod
    def rag_key(user_id: str, query: str) -> str:
        h = hashlib.sha256(query.encode("utf-8")).hexdigest()[:16]
        return f"rag:{user_id}:{h}"

    @staticmethod
    def config_key(user_id: str) -> str:
        return f"config:{user_id}"

    def cached(self, key: str, ttl: int, loader: Callable[[], Any]) -> Any:
        val = self.get(key)
        if val is not None:
            return val
        val = loader()
        if val is not None:
            self.set(key, val, ttl)
        return val


cache = Cache()


# --- 向后兼容：模块级函数（供既有路由使用） ---
def cache_get(key: str) -> Any:
    """读取缓存（兼容旧调用）。"""
    return cache.get(key)


def cache_set(key: str, value: Any, ttl_seconds: int = 300) -> None:
    """写入缓存（兼容旧调用，ttl 单位秒）。"""
    cache.set(key, value, ttl=ttl_seconds)


def cache_delete(key: str) -> None:
    """删除单个缓存键（兼容旧调用）。"""
    cache.delete(key)


def cache_invalidate_prefix(prefix: str) -> int:
    """按前缀清除缓存（兼容旧调用）。"""
    return cache.invalidate_prefix(prefix)
