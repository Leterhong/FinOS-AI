# -*- coding: utf-8 -*-
"""
backend/autonomous/cost_guard.py — Phase 7.4 需求十四：成本控制。

继承 Phase 6.5 三级策略，用于所有「自动任务」：
    local  纯规则 / 缓存命中，零 Token
    light  模板化文本 + 极短提示，仅在 warn 级以上使用
    ai     完整 LLM 推理，仅 critical / high 且预算允许时使用

护栏三条：
  1. 自动任务默认从 local 起步，只有严重度足够才升档；
  2. 每用户每日 LLM 调用配额（默认 20 次），超额一律降级 local；
  3. 相同输入指纹在 TTL 内直接复用上次结论（缓存优先，避免无限耗 Token）。

任何 LLM 调用失败一律静默降级 local，绝不向上抛错阻断自动化。
"""
from __future__ import annotations

import hashlib
import json
import threading
import time
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from backend.autonomous.models import AutomationRun

# 每用户每日自动任务 LLM 调用上限
DAILY_LLM_BUDGET = 20
# 严重度 → 允许的最高档位
_SEVERITY_MAX_TIER = {
    "critical": "ai",
    "high": "ai",
    "medium": "light",
    "low": "local",
    # 兼容旧口径
    "warn": "light",
    "info": "local",
}
_TIER_RANK = {"local": 0, "light": 1, "ai": 2}

# 结论缓存（进程内，TTL 秒）
_CACHE_TTL = 6 * 3600
_cache: dict[str, tuple[float, Any]] = {}
_cache_lock = threading.Lock()


def fingerprint(payload: Any) -> str:
    """对输入做 sha256 指纹，作为缓存键（数据一变键就变，旧缓存天然失效）。"""
    raw = json.dumps(payload, ensure_ascii=False, sort_keys=True, default=str)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:32]


def cache_get(key: str) -> Any | None:
    with _cache_lock:
        item = _cache.get(key)
        if not item:
            return None
        ts, value = item
        if time.time() - ts > _CACHE_TTL:
            _cache.pop(key, None)
            return None
        return value


def cache_set(key: str, value: Any) -> None:
    with _cache_lock:
        _cache[key] = (time.time(), value)
        # 简易容量控制：超过 500 条清理最旧的一半
        if len(_cache) > 500:
            for k in sorted(_cache, key=lambda x: _cache[x][0])[:250]:
                _cache.pop(k, None)


def cache_clear() -> None:
    with _cache_lock:
        _cache.clear()


def llm_calls_today(db: Session, user_id: str) -> int:
    """统计今日已消耗的自动任务 LLM 调用次数。"""
    since = datetime.now(timezone.utc) - timedelta(days=1)
    stmt = (
        select(func.count())
        .select_from(AutomationRun)
        .where(
            AutomationRun.user_id == user_id,
            AutomationRun.llm_called.is_(True),
            AutomationRun.created_at >= since,
        )
    )
    try:
        return int(db.scalar(stmt) or 0)
    except Exception:  # noqa: BLE001
        return 0


def budget_left(db: Session, user_id: str) -> int:
    return max(0, DAILY_LLM_BUDGET - llm_calls_today(db, user_id))


def decide_tier(
    db: Session,
    user_id: str,
    *,
    severity: str = "low",
    requested: str = "local",
) -> tuple[str, str]:
    """决定本次自动任务实际可用的成本档位。

    返回 (tier, reason)。tier ∈ local/light/ai。
    """
    sev = (severity or "low").lower()
    cap = _SEVERITY_MAX_TIER.get(sev, "local")
    want = (requested or "local").lower()
    if want not in _TIER_RANK:
        want = "local"

    tier = want if _TIER_RANK[want] <= _TIER_RANK[cap] else cap
    reason = "按严重度限档" if tier != want else "按请求档位"

    if tier == "ai":
        if budget_left(db, user_id) <= 0:
            return "local", f"今日 LLM 预算已用尽（{DAILY_LLM_BUDGET} 次），降级为规则模式"
    return tier, reason


def summarize(db: Session, user_id: str) -> dict:
    """成本概览，供 AI 控制中心展示。"""
    used = llm_calls_today(db, user_id)
    since = datetime.now(timezone.utc) - timedelta(days=1)
    total = 0
    try:
        total = int(
            db.scalar(
                select(func.count())
                .select_from(AutomationRun)
                .where(AutomationRun.user_id == user_id, AutomationRun.created_at >= since)
            )
            or 0
        )
    except Exception:  # noqa: BLE001
        total = 0
    return {
        "dailyBudget": DAILY_LLM_BUDGET,
        "llmCallsToday": used,
        "budgetLeft": max(0, DAILY_LLM_BUDGET - used),
        "runsToday": total,
        "localRatio": round((total - used) / total, 3) if total else 1.0,
        "cacheEntries": len(_cache),
        "policy": "自动任务优先命中缓存与规则，仅高严重度且预算充足时才调用大模型",
    }
