# -*- coding: utf-8 -*-
"""
backend/autonomous/event_bus.py — Phase 7.4 需求三：事件驱动系统（Event Bus）。

监听维度：资产变化 / 收入变化 / 支出变化 / 目标变化 / 风险变化 / 市场异常。

工作方式：
  1. take_snapshot()  把当前财富快照落库，作为下次对比的基线；
  2. detect_changes() 用最新数据与上一份快照比对，超过阈值即产出事件；
  3. publish()        事件落库（审计）并同步分发给所有订阅者，
                      单个订阅者异常被隔离，绝不影响其它订阅者与主流程。

事件本身零 Token —— 全部由规则计算得出，符合需求十四的成本控制要求。
"""
from __future__ import annotations

import logging
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.autonomous import notifications as notif_engine
from backend.autonomous.models import AutomationEvent, AutomationSnapshot
from backend.intelligence.context import WealthContext, build_context
from backend.user.models import User

logger = logging.getLogger("finos.autonomous.event_bus")

# ---- 事件类型常量 ----
ASSET_CHANGE = "asset_change"
INCOME_CHANGE = "income_change"
EXPENSE_CHANGE = "expense_change"
GOAL_CHANGE = "goal_change"
RISK_CHANGE = "risk_change"
MARKET_ANOMALY = "market_anomaly"

EVENT_TYPES = (
    ASSET_CHANGE,
    INCOME_CHANGE,
    EXPENSE_CHANGE,
    GOAL_CHANGE,
    RISK_CHANGE,
    MARKET_ANOMALY,
)

EVENT_LABELS = {
    ASSET_CHANGE: "资产变化",
    INCOME_CHANGE: "收入变化",
    EXPENSE_CHANGE: "支出变化",
    GOAL_CHANGE: "目标进度变化",
    RISK_CHANGE: "风险偏好变化",
    MARKET_ANOMALY: "市场异常",
}

# 触发阈值（百分比）：低于此幅度视为噪音，不产生事件
CHANGE_THRESHOLD_PCT = 5.0


@dataclass
class Event:
    """内存中的事件对象（同时会持久化为 AutomationEvent）。"""

    event_type: str
    user_id: str
    metric: str = ""
    prev_value: float | None = None
    new_value: float | None = None
    change_pct: float | None = None
    severity: str = "low"
    summary: str = ""
    payload: dict[str, Any] = field(default_factory=dict)
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    record_id: str | None = None

    def to_dict(self) -> dict:
        return {
            "id": self.record_id,
            "eventType": self.event_type,
            "eventLabel": EVENT_LABELS.get(self.event_type, self.event_type),
            "metric": self.metric,
            "prevValue": self.prev_value,
            "newValue": self.new_value,
            "changePct": self.change_pct,
            "severity": self.severity,
            "summary": self.summary,
            "payload": self.payload,
            "createdAt": self.created_at.isoformat(),
        }


# --------------------------------------------------------------------------- #
# 订阅 / 发布
# --------------------------------------------------------------------------- #
Subscriber = Callable[[Session, User, Event], None]
_subscribers: dict[str, list[Subscriber]] = {}


def subscribe(event_type: str, handler: Subscriber) -> None:
    """订阅某类事件（`*` 表示全部）。重复注册同一函数会被忽略。"""
    bucket = _subscribers.setdefault(event_type, [])
    if handler not in bucket:
        bucket.append(handler)


def unsubscribe(event_type: str, handler: Subscriber) -> None:
    bucket = _subscribers.get(event_type) or []
    if handler in bucket:
        bucket.remove(handler)


def clear_subscribers() -> None:
    _subscribers.clear()


def subscriber_count() -> int:
    return sum(len(v) for v in _subscribers.values())


def publish(db: Session, user: User, event: Event, *, dispatch: bool = True) -> Event:
    """事件落库 + 分发。单个订阅者异常被隔离。"""
    record = AutomationEvent(
        user_id=user.id,
        event_type=event.event_type,
        metric=event.metric,
        prev_value=event.prev_value,
        new_value=event.new_value,
        change_pct=event.change_pct,
        severity=notif_engine.normalize_priority(event.severity),
        summary=event.summary,
    )
    db.add(record)
    db.commit()
    event.record_id = record.id

    if not dispatch:
        return event

    handlers = list(_subscribers.get(event.event_type, [])) + list(_subscribers.get("*", []))
    triggered: list[str] = []
    for handler in handlers:
        try:
            result = handler(db, user, event)
            if isinstance(result, list):
                triggered.extend(str(x) for x in result)
        except Exception:  # noqa: BLE001
            logger.exception("event_subscriber_failed: %s", event.event_type)
    if triggered:
        record.set_rule_ids(triggered)
        db.commit()
    return event


# --------------------------------------------------------------------------- #
# 快照与变化检测
# --------------------------------------------------------------------------- #
def _goal_progress(ctx: WealthContext) -> float:
    if not ctx.goal_amount or ctx.goal_amount <= 0:
        return 0.0
    return round(min(1.0, max(0.0, ctx.net_worth / ctx.goal_amount)), 4)


def latest_snapshot(db: Session, user_id: str) -> AutomationSnapshot | None:
    stmt = (
        select(AutomationSnapshot)
        .where(AutomationSnapshot.user_id == user_id)
        .order_by(AutomationSnapshot.created_at.desc())
        .limit(1)
    )
    return db.scalar(stmt)


def take_snapshot(
    db: Session,
    user: User,
    ctx: WealthContext | None = None,
    *,
    commit: bool = True,
) -> AutomationSnapshot:
    """把当前财富状态落为快照基线。"""
    ctx = ctx or build_context(db, user)
    snap = AutomationSnapshot(
        user_id=user.id,
        total_assets=round(float(ctx.total_assets or 0.0), 2),
        monthly_income=round(float(ctx.monthly_income or 0.0), 2),
        monthly_expense=round(float(ctx.monthly_expense or 0.0), 2),
        risk_level=ctx.risk_level or "balanced",
        goal_progress=_goal_progress(ctx),
    )
    db.add(snap)
    if commit:
        db.commit()
    else:
        db.flush()
    return snap


def _pct(prev: float, new: float) -> float | None:
    if prev is None or new is None:
        return None
    if abs(prev) < 1e-9:
        return None if abs(new) < 1e-9 else 100.0
    return round((new - prev) / abs(prev) * 100.0, 2)


def detect_changes(
    db: Session,
    user: User,
    ctx: WealthContext | None = None,
    *,
    threshold_pct: float = CHANGE_THRESHOLD_PCT,
) -> list[Event]:
    """与最近一次快照对比，产出变化事件列表（不含发布动作）。"""
    ctx = ctx or build_context(db, user)
    prev = latest_snapshot(db, user.id)
    events: list[Event] = []
    if prev is None:
        return events

    checks = (
        (ASSET_CHANGE, "total_assets", "总资产", float(prev.total_assets or 0.0), float(ctx.total_assets or 0.0), True),
        (INCOME_CHANGE, "monthly_income", "月收入", float(prev.monthly_income or 0.0), float(ctx.monthly_income or 0.0), True),
        (EXPENSE_CHANGE, "monthly_expense", "月支出", float(prev.monthly_expense or 0.0), float(ctx.monthly_expense or 0.0), False),
    )
    for etype, metric, label, old, new, drop_is_bad in checks:
        pct = _pct(old, new)
        if pct is None or abs(pct) < threshold_pct:
            continue
        # 资产/收入下跌不利；支出上涨不利
        adverse = (pct < 0) if drop_is_bad else (pct > 0)
        severity = notif_engine.severity_from_change(pct, adverse=adverse)
        direction = "上升" if pct > 0 else "下降"
        events.append(
            Event(
                event_type=etype,
                user_id=user.id,
                metric=metric,
                prev_value=round(old, 2),
                new_value=round(new, 2),
                change_pct=pct,
                severity=severity,
                summary=f"{label}从 ¥{old:,.0f} {direction}至 ¥{new:,.0f}（{pct:+.1f}%）",
                payload={"label": label, "adverse": adverse},
            )
        )

    # 目标进度变化
    new_goal = _goal_progress(ctx)
    old_goal = float(prev.goal_progress or 0.0)
    goal_delta = round((new_goal - old_goal) * 100, 2)
    if abs(goal_delta) >= threshold_pct:
        events.append(
            Event(
                event_type=GOAL_CHANGE,
                user_id=user.id,
                metric="goal_progress",
                prev_value=round(old_goal * 100, 2),
                new_value=round(new_goal * 100, 2),
                change_pct=goal_delta,
                severity=notif_engine.severity_from_change(goal_delta, adverse=goal_delta < 0),
                summary=f"目标进度由 {old_goal * 100:.1f}% 变为 {new_goal * 100:.1f}%（{goal_delta:+.1f} 个百分点）",
                payload={"label": "目标进度"},
            )
        )

    # 风险偏好变化（离散值）
    if (ctx.risk_level or "balanced") != (prev.risk_level or "balanced"):
        events.append(
            Event(
                event_type=RISK_CHANGE,
                user_id=user.id,
                metric="risk_level",
                severity="medium",
                summary=f"风险偏好由 {prev.risk_level} 调整为 {ctx.risk_level}",
                payload={"prev": prev.risk_level, "new": ctx.risk_level},
            )
        )
    return events


def scan_and_publish(db: Session, user: User, *, dispatch: bool = True) -> list[Event]:
    """完整的一轮事件扫描：检测 → 发布 → 更新快照基线。"""
    ctx = build_context(db, user)
    events = detect_changes(db, user, ctx)
    for evt in events:
        publish(db, user, evt, dispatch=dispatch)
    take_snapshot(db, user, ctx)
    return events


def list_events(db: Session, user_id: str, limit: int = 50) -> list[AutomationEvent]:
    stmt = (
        select(AutomationEvent)
        .where(AutomationEvent.user_id == user_id)
        .order_by(AutomationEvent.created_at.desc())
        .limit(limit)
    )
    return list(db.scalars(stmt).all())


def serialize_record(e: AutomationEvent) -> dict:
    return {
        "id": e.id,
        "eventType": e.event_type,
        "eventLabel": EVENT_LABELS.get(e.event_type, e.event_type),
        "metric": e.metric,
        "prevValue": e.prev_value,
        "newValue": e.new_value,
        "changePct": e.change_pct,
        "severity": e.severity,
        "summary": e.summary,
        "triggeredRuleIds": e.rule_ids(),
        "createdAt": e.created_at.isoformat() if e.created_at else None,
    }
