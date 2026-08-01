# -*- coding: utf-8 -*-
"""
backend/autonomous/notifications.py — Phase 7.4 需求四：主动提醒系统升级（Notification Engine）。

智能优先级四档：
    critical  立即提醒 —— 资产大幅缩水、现金流断裂风险、目标严重偏离
    high      重要提醒 —— 收入明显下降、集中度过高、支出异常
    medium    一般提醒 —— 常规波动、周期报告就绪
    low       低优先级 —— 信息同步、日常简报

兼容既有 severity 口径（info / warn / critical），读写两侧都做归一化，
旧数据不迁移也能按新优先级排序展示。

去重策略：同一 user + 同一去重键（默认 category + title）在冷却窗口内只推一条，
避免自动化反复触发把通知中心刷屏。
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.notification.models import Notification

# 优先级从高到低
PRIORITIES = ("critical", "high", "medium", "low")
PRIORITY_RANK = {p: i for i, p in enumerate(PRIORITIES)}

# 旧口径 → 新口径
_LEGACY_MAP = {"info": "low", "warn": "medium", "warning": "medium", "error": "high"}

# 各优先级默认去重冷却（秒）
_DEFAULT_COOLDOWN = {
    "critical": 30 * 60,
    "high": 2 * 3600,
    "medium": 6 * 3600,
    "low": 24 * 3600,
}

_ALLOWED_CATEGORIES = {"wealth", "risk", "goal", "ai", "system"}


def normalize_priority(value: str | None) -> str:
    """把任意 severity 归一化为 critical/high/medium/low。"""
    v = (value or "").strip().lower()
    if v in PRIORITY_RANK:
        return v
    return _LEGACY_MAP.get(v, "medium")


def priority_rank(value: str | None) -> int:
    return PRIORITY_RANK.get(normalize_priority(value), len(PRIORITIES))


def severity_from_change(change_pct: float, *, adverse: bool = True) -> str:
    """按变化幅度推导优先级（规则驱动，零 Token）。

    adverse=True 表示该变化对用户不利（下跌 / 支出上升）。
    """
    mag = abs(change_pct)
    if not adverse:
        # 有利变化最高只到 medium，避免打扰
        return "medium" if mag >= 30 else "low"
    if mag >= 30:
        return "critical"
    if mag >= 20:
        return "high"
    if mag >= 10:
        return "medium"
    return "low"


def _recent_duplicate(
    db: Session,
    user_id: str,
    title: str,
    category: str,
    cooldown_seconds: int,
) -> Notification | None:
    since = datetime.now(timezone.utc) - timedelta(seconds=max(0, cooldown_seconds))
    stmt = (
        select(Notification)
        .where(
            Notification.user_id == user_id,
            Notification.title == title[:200],
            Notification.category == category,
            Notification.created_at >= since,
        )
        .order_by(Notification.created_at.desc())
        .limit(1)
    )
    try:
        return db.scalar(stmt)
    except Exception:  # noqa: BLE001
        return None


def push(
    db: Session,
    user_id: str,
    *,
    title: str,
    body: str = "",
    category: str = "ai",
    priority: str = "medium",
    source: str = "autonomous",
    cooldown_seconds: int | None = None,
    commit: bool = True,
) -> tuple[Notification | None, bool]:
    """推送一条带优先级的主动提醒。

    返回 (通知对象, 是否新建)。命中去重时返回 (已有通知, False)。
    """
    prio = normalize_priority(priority)
    cat = category if category in _ALLOWED_CATEGORIES else "system"
    cd = _DEFAULT_COOLDOWN[prio] if cooldown_seconds is None else cooldown_seconds

    dup = _recent_duplicate(db, user_id, title, cat, cd)
    if dup is not None:
        return dup, False

    n = Notification(
        user_id=user_id,
        source=source,
        category=cat,
        severity=prio,
        title=title[:200],
        body=body,
    )
    db.add(n)
    if commit:
        db.commit()
    else:
        db.flush()
    return n, True


def sort_by_priority(items: list[Notification]) -> list[Notification]:
    """按 优先级 → 时间倒序 排序。"""
    return sorted(
        items,
        key=lambda n: (
            priority_rank(n.severity),
            -(n.created_at.timestamp() if n.created_at else 0),
        ),
    )
