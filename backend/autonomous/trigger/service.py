# -*- coding: utf-8 -*-
"""
backend/autonomous/trigger/service.py — Phase 7.4 需求一/三：触发器（Trigger）。

职责：把「事件」翻译成「要不要执行某条规则」，包含三部分：
    1. 条件 DSL 求值（纯规则，零 Token）
    2. 冷却窗口控制（同一规则在 cooldown_seconds 内不重复触发）
    3. 规则匹配 → 调用 executor 执行动作链 → 落 AutomationRun 审计

条件 DSL 形如：
    {"metric": "income_change_pct", "op": "lte", "threshold": -30}
    {"metric": "event_type",        "op": "eq",  "value": "income_change"}
    {"metric": "equity_ratio",      "op": "gt",  "threshold": 0.6}

支持的比较符：eq / ne / gt / gte / lt / lte / drop_pct / rise_pct / abs_change_gte / in / contains
多条件默认「全部满足（all）」，可在规则里设 match="any" 改为任一满足。
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.autonomous import event_bus
from backend.autonomous.executor.service import execute_actions
from backend.autonomous.models import AutomationRule, AutomationRun
from backend.intelligence.context import WealthContext, build_context
from backend.user.models import User

logger = logging.getLogger("finos.autonomous.trigger")

OPERATORS = (
    "eq",
    "ne",
    "gt",
    "gte",
    "lt",
    "lte",
    "drop_pct",
    "rise_pct",
    "abs_change_gte",
    "in",
    "contains",
)

METRIC_LABELS = {
    "event_type": "事件类型",
    "severity": "严重度",
    "change_pct": "变化幅度(%)",
    "total_assets": "总资产",
    "monthly_income": "月收入",
    "monthly_expense": "月支出",
    "monthly_surplus": "月结余",
    "savings_rate": "储蓄率",
    "equity_ratio": "权益仓位",
    "cash_ratio": "现金占比",
    "goal_progress": "目标进度",
    "risk_level": "风险偏好",
    "emergency_months": "应急金月数",
}


# --------------------------------------------------------------------------- #
# 指标解析
# --------------------------------------------------------------------------- #
def build_metrics(ctx: WealthContext, event: event_bus.Event | None = None) -> dict[str, Any]:
    alloc = ctx.allocation_pct
    equity = sum(v for k, v in alloc.items() if k in {"stock", "fund", "crypto"})
    metrics: dict[str, Any] = {
        "total_assets": round(float(ctx.total_assets or 0.0), 2),
        "net_worth": ctx.net_worth,
        "monthly_income": round(float(ctx.monthly_income or 0.0), 2),
        "monthly_expense": round(float(ctx.monthly_expense or 0.0), 2),
        "monthly_surplus": ctx.monthly_surplus,
        "savings_rate": ctx.savings_rate,
        "equity_ratio": round(equity, 4),
        "cash_ratio": round(alloc.get("cash", 0.0), 4),
        "risk_level": ctx.risk_level,
        "emergency_months": ctx.emergency_months,
        "goal_progress": (
            round(min(1.0, ctx.net_worth / ctx.goal_amount), 4)
            if ctx.goal_amount and ctx.goal_amount > 0
            else 0.0
        ),
    }
    if event is not None:
        metrics.update(
            {
                "event_type": event.event_type,
                "severity": event.severity,
                "metric": event.metric,
                "change_pct": event.change_pct,
                "prev_value": event.prev_value,
                "new_value": event.new_value,
                # 语义别名，便于用户写规则
                "income_change_pct": event.change_pct if event.metric == "monthly_income" else None,
                "expense_change_pct": event.change_pct if event.metric == "monthly_expense" else None,
                "asset_change_pct": event.change_pct if event.metric == "total_assets" else None,
            }
        )
    return metrics


# --------------------------------------------------------------------------- #
# 条件求值
# --------------------------------------------------------------------------- #
def _as_float(v: Any) -> float | None:
    try:
        if v is None or isinstance(v, bool):
            return None
        return float(v)
    except (TypeError, ValueError):
        return None


def evaluate_condition(cond: dict, metrics: dict) -> bool:
    if not isinstance(cond, dict):
        return False
    metric = str(cond.get("metric") or "")
    op = str(cond.get("op") or "eq").lower()
    expected = cond.get("value", cond.get("threshold"))
    actual = metrics.get(metric)

    if op == "eq":
        return str(actual) == str(expected)
    if op == "ne":
        return str(actual) != str(expected)
    if op == "in":
        return actual in (expected if isinstance(expected, (list, tuple, set)) else [expected])
    if op == "contains":
        return str(expected) in str(actual or "")

    a, e = _as_float(actual), _as_float(expected)
    if a is None or e is None:
        return False
    if op == "gt":
        return a > e
    if op == "gte":
        return a >= e
    if op == "lt":
        return a < e
    if op == "lte":
        return a <= e
    if op == "drop_pct":
        # 下降幅度达到 e%（actual 为负的变化率）
        return a <= -abs(e)
    if op == "rise_pct":
        return a >= abs(e)
    if op == "abs_change_gte":
        return abs(a) >= abs(e)
    return False


def evaluate_conditions(conditions: list[dict], metrics: dict, match: str = "all") -> bool:
    conds = [c for c in (conditions or []) if isinstance(c, dict)]
    if not conds:
        return True  # 无条件 = 事件到达即触发
    results = [evaluate_condition(c, metrics) for c in conds]
    return any(results) if str(match).lower() == "any" else all(results)


def describe_condition(cond: dict) -> str:
    metric = METRIC_LABELS.get(str(cond.get("metric")), str(cond.get("metric")))
    op = str(cond.get("op") or "eq")
    val = cond.get("value", cond.get("threshold"))
    op_text = {
        "eq": "等于",
        "ne": "不等于",
        "gt": "大于",
        "gte": "不低于",
        "lt": "小于",
        "lte": "不高于",
        "drop_pct": "下降超过",
        "rise_pct": "上升超过",
        "abs_change_gte": "变动幅度不低于",
        "in": "属于",
        "contains": "包含",
    }.get(op, op)
    suffix = "%" if op in ("drop_pct", "rise_pct", "abs_change_gte") else ""
    return f"{metric} {op_text} {val}{suffix}"


# --------------------------------------------------------------------------- #
# 冷却
# --------------------------------------------------------------------------- #
def in_cooldown(rule: AutomationRule, now: datetime | None = None) -> bool:
    if not rule.last_triggered_at or not rule.cooldown_seconds:
        return False
    now = now or datetime.now(timezone.utc)
    last = rule.last_triggered_at
    if last.tzinfo is None:
        last = last.replace(tzinfo=timezone.utc)
    return now < last + timedelta(seconds=int(rule.cooldown_seconds))


# --------------------------------------------------------------------------- #
# 规则执行
# --------------------------------------------------------------------------- #
def run_rule(
    db: Session,
    user: User,
    rule: AutomationRule,
    context: dict | None = None,
    *,
    respect_cooldown: bool = True,
) -> dict:
    """执行一条规则的动作链，并记录运行审计。"""
    context = dict(context or {})
    context["sourceId"] = rule.id
    now = datetime.now(timezone.utc)

    if respect_cooldown and in_cooldown(rule, now):
        run = AutomationRun(
            user_id=user.id,
            source="rule",
            source_id=rule.id,
            name=rule.name,
            status="skipped",
            tier=rule.tier,
            message="处于冷却窗口内，本次跳过",
        )
        db.add(run)
        db.commit()
        return {"ruleId": rule.id, "status": "skipped", "reason": "cooldown", "runId": run.id, "actions": []}

    results = execute_actions(db, user, rule.action_list(), context)
    failed = [r for r in results if r.get("status") == "failed"]
    llm_called = any(
        bool((r.get("result") or {}).get("llmCalled")) for r in results if isinstance(r.get("result"), dict)
    )
    status = "success" if not failed else ("failed" if len(failed) == len(results) else "success")

    rule.last_triggered_at = now
    rule.trigger_count = (rule.trigger_count or 0) + 1

    run = AutomationRun(
        user_id=user.id,
        source="rule",
        source_id=rule.id,
        name=rule.name,
        status=status,
        tier=rule.tier,
        llm_called=llm_called,
        message=f"执行 {len(results)} 个动作，失败 {len(failed)} 个"
        + (f"：{failed[0].get('result', {}).get('error', '')}" if failed else ""),
    )
    db.add(run)
    db.commit()
    return {"ruleId": rule.id, "status": status, "runId": run.id, "actions": results}


def match_rules(db: Session, user: User, event: event_bus.Event, ctx: WealthContext | None = None) -> list[AutomationRule]:
    """找出该事件应触发的规则。"""
    ctx = ctx or build_context(db, user)
    metrics = build_metrics(ctx, event)
    rules = list(
        db.scalars(
            select(AutomationRule).where(
                AutomationRule.user_id == user.id,
                AutomationRule.enabled.is_(True),
                AutomationRule.trigger_type == "event",
            )
        ).all()
    )
    matched: list[AutomationRule] = []
    for rule in rules:
        conds = rule.cond_list()
        # 规则可通过 conditions 里的 event_type 条件限定事件；未限定则响应全部事件
        if not evaluate_conditions(conds, metrics, match="all"):
            continue
        matched.append(rule)
    return matched


def on_event(db: Session, user: User, event: event_bus.Event) -> list[str]:
    """event_bus 订阅回调：匹配规则并执行，返回被触发的规则 id 列表。"""
    triggered: list[str] = []
    try:
        ctx = build_context(db, user)
        for rule in match_rules(db, user, event, ctx):
            outcome = run_rule(db, user, rule, {"event": event.to_dict()})
            if outcome.get("status") != "skipped":
                triggered.append(rule.id)
    except Exception:  # noqa: BLE001
        logger.exception("trigger_on_event_failed")
    return triggered


_registered = False


def register_subscribers() -> None:
    """把触发器挂到事件总线上（幂等）。"""
    global _registered
    if _registered:
        return
    event_bus.subscribe("*", on_event)
    _registered = True
