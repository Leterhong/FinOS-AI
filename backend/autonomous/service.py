# -*- coding: utf-8 -*-
"""
backend/autonomous/service.py — Phase 7.4 编排门面 + AI 控制中心（需求十三）。

对外提供三件事：
    bootstrap()  为用户初始化默认自动化套餐（定时任务 / 长期计划 / 内置规则 / 快照基线）
    scan_now()   立即跑一轮：检测变化 → 发布事件 → 触发规则与工作流
    overview()   AI 控制中心数据：AI 正在关注什么 / 当前任务 / 最近行动 / 下一步
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.autonomous import action_center, cost_guard, event_bus
from backend.autonomous import notifications as notif_engine
from backend.autonomous.agents import preference as preference_agent
from backend.autonomous.models import (
    AutomationAction,
    AutomationPlan,
    AutomationRule,
    AutomationRun,
    AutomationScheduled,
    AutomationWorkflow,
)
from backend.autonomous.planner import service as planner_svc
from backend.autonomous.scheduler import service as scheduler_svc
from backend.autonomous.trigger import service as trigger_svc
from backend.autonomous.workflow import service as workflow_svc
from backend.intelligence.context import build_context
from backend.user.models import User

logger = logging.getLogger("finos.autonomous.service")

DISCLAIMER = "FinOS AI提供信息分析和辅助决策，不构成投资建议。"
WELCOME_MESSAGE = "欢迎创建你的财富数字分身"


# --------------------------------------------------------------------------- #
# 默认规则（对应需求三的示例场景）
# --------------------------------------------------------------------------- #
DEFAULT_RULES = [
    {
        "name": "收入骤降应急响应",
        "description": "月收入较上次快照下降 30% 以上时，立即通知并调度风险、现金流、策略三个方向的分析。",
        "conditions": [
            {"metric": "event_type", "op": "eq", "value": "income_change"},
            {"metric": "change_pct", "op": "drop_pct", "threshold": 30},
        ],
        "actions": [
            {
                "type": "create_notification",
                "params": {
                    "title": "收入大幅下降，AI 已启动应急分析",
                    "body": "{{event.summary}}｜AI 正在重算现金流与投资风险，稍后可在行动中心查看建议。",
                    "category": "risk",
                    "priority": "critical",
                },
            },
            {"type": "run_agent", "params": {"agent": "cashflow", "allowLlm": False}},
            {"type": "run_agent", "params": {"agent": "investment", "allowLlm": False}},
        ],
        "cooldown_seconds": 3600,
    },
    {
        "name": "资产异动提醒",
        "description": "总资产单次变化超过 10% 时推送提醒。",
        "conditions": [
            {"metric": "event_type", "op": "eq", "value": "asset_change"},
            {"metric": "change_pct", "op": "abs_change_gte", "threshold": 10},
        ],
        "actions": [
            {
                "type": "create_notification",
                "params": {
                    "title": "总资产出现明显变动",
                    "body": "{{event.summary}}",
                    "category": "wealth",
                    "priority": "high",
                },
            }
        ],
        "cooldown_seconds": 1800,
    },
    {
        "name": "支出异常跟进",
        "description": "月支出上升超过 20% 时生成一条待办，提示复核消费结构。",
        "conditions": [
            {"metric": "event_type", "op": "eq", "value": "expense_change"},
            {"metric": "change_pct", "op": "rise_pct", "threshold": 20},
        ],
        "actions": [
            {
                "type": "create_action_item",
                "params": {
                    "title": "复核本期支出上升原因",
                    "detail": "{{event.summary}}",
                    "category": "wealth",
                    "priority": "medium",
                    "dueInDays": 5,
                },
            }
        ],
        "cooldown_seconds": 86400,
    },
]


def ensure_default_rules(db: Session, user: User) -> list[AutomationRule]:
    existing = {
        r.name for r in db.scalars(select(AutomationRule).where(AutomationRule.user_id == user.id)).all()
    }
    created: list[AutomationRule] = []
    for spec in DEFAULT_RULES:
        if spec["name"] in existing:
            continue
        rule = AutomationRule(
            user_id=user.id,
            name=spec["name"],
            description=spec["description"],
            trigger_type="event",
            cooldown_seconds=spec.get("cooldown_seconds", 3600),
        )
        rule.set_conditions(spec["conditions"])
        rule.set_actions(spec["actions"])
        db.add(rule)
        created.append(rule)
    if created:
        db.commit()
    return created


def bootstrap(db: Session, user: User) -> dict:
    """初始化用户的自动化套餐（幂等，可重复调用）。"""
    rules = ensure_default_rules(db, user)
    schedules = scheduler_svc.ensure_defaults(db, user)
    plans = planner_svc.ensure_defaults(db, user)

    snapshot_created = False
    if event_bus.latest_snapshot(db, user.id) is None:
        event_bus.take_snapshot(db, user)
        snapshot_created = True

    trigger_svc.register_subscribers()
    return {
        "rulesCreated": len(rules),
        "schedulesCreated": len(schedules),
        "plansCreated": len(plans),
        "snapshotCreated": snapshot_created,
        "message": "自动化引擎已就绪",
    }


# --------------------------------------------------------------------------- #
# 立即扫描
# --------------------------------------------------------------------------- #
def scan_now(db: Session, user: User, *, run_workflows: bool = True) -> dict:
    """立即执行一轮事件检测，并触发规则与工作流。"""
    trigger_svc.register_subscribers()
    events = event_bus.scan_and_publish(db, user)

    workflow_results: list[dict] = []
    if run_workflows and events:
        for evt in events:
            workflow_results.extend(workflow_svc.run_workflows_for_event(db, user, evt.to_dict()))

    return {
        "eventsDetected": len(events),
        "events": [e.to_dict() for e in events],
        "workflowRuns": workflow_results,
        "scannedAt": datetime.now(timezone.utc).isoformat(),
        "message": "未检测到显著变化" if not events else f"检测到 {len(events)} 项变化并已处理",
    }


# --------------------------------------------------------------------------- #
# AI 控制中心（需求十三）
# --------------------------------------------------------------------------- #
def overview(db: Session, user: User) -> dict:
    ctx = build_context(db, user)
    now = datetime.now(timezone.utc)

    rules = list(db.scalars(select(AutomationRule).where(AutomationRule.user_id == user.id)).all())
    schedules = list(
        db.scalars(select(AutomationScheduled).where(AutomationScheduled.user_id == user.id)).all()
    )
    workflows = list(
        db.scalars(select(AutomationWorkflow).where(AutomationWorkflow.user_id == user.id)).all()
    )
    plans = list(db.scalars(select(AutomationPlan).where(AutomationPlan.user_id == user.id)).all())
    runs = list(
        db.scalars(
            select(AutomationRun)
            .where(AutomationRun.user_id == user.id)
            .order_by(AutomationRun.created_at.desc())
            .limit(10)
        ).all()
    )
    actions = action_center.list_actions(db, user, status="pending", limit=20)
    events = event_bus.list_events(db, user.id, limit=8)

    # AI 正在关注什么
    watching: list[dict] = []
    for p in plans:
        if not p.enabled:
            continue
        watching.append(
            {
                "kind": "plan",
                "title": p.name,
                "detail": p.last_summary or p.description or "等待首次巡检",
                "cadence": p.cadence,
                "nextRunAt": p.next_run_at.isoformat() if p.next_run_at else None,
            }
        )
    for r in rules:
        if not r.enabled:
            continue
        conds = "；".join(trigger_svc.describe_condition(c) for c in r.cond_list()) or "任意事件"
        watching.append(
            {
                "kind": "rule",
                "title": r.name,
                "detail": f"当 {conds}",
                "triggerCount": r.trigger_count,
                "lastTriggeredAt": r.last_triggered_at.isoformat() if r.last_triggered_at else None,
            }
        )

    # 当前 / 即将执行的任务
    upcoming = sorted(
        [s for s in schedules if s.enabled and s.next_run_at],
        key=lambda s: s.next_run_at,
    )[:5]
    current_tasks = [
        {
            "id": s.id,
            "name": s.name,
            "taskType": s.task_type,
            "taskTypeLabel": scheduler_svc.TASK_TYPES.get(s.task_type, s.task_type),
            "frequency": s.frequency,
            "nextRunAt": s.next_run_at.isoformat() if s.next_run_at else None,
            "dueInMinutes": int(
                max(
                    0,
                    (
                        (s.next_run_at if s.next_run_at.tzinfo else s.next_run_at.replace(tzinfo=timezone.utc))
                        - now
                    ).total_seconds()
                    // 60,
                )
            )
            if s.next_run_at
            else None,
        }
        for s in upcoming
    ]

    # 下一步建议
    next_steps = [
        {
            "id": a.id,
            "title": a.title,
            "priority": a.priority,
            "category": a.category,
            "detail": a.detail[:200],
        }
        for a in actions[:3]
    ]

    bias = preference_agent.notification_bias(db, user)
    enabled_rules = sum(1 for r in rules if r.enabled)
    enabled_schedules = sum(1 for s in schedules if s.enabled)
    enabled_plans = sum(1 for p in plans if p.enabled)

    return {
        "hasData": ctx.has_data,
        "message": WELCOME_MESSAGE if not ctx.has_data else "",
        "engine": {
            "running": True,
            "rules": {"total": len(rules), "enabled": enabled_rules},
            "schedules": {"total": len(schedules), "enabled": enabled_schedules},
            "workflows": {"total": len(workflows), "enabled": sum(1 for w in workflows if w.enabled)},
            "plans": {"total": len(plans), "enabled": enabled_plans},
            "subscribers": event_bus.subscriber_count(),
        },
        "watching": watching[:8],
        "currentTasks": current_tasks,
        "recentRuns": [
            {
                "id": r.id,
                "source": r.source,
                "name": r.name,
                "status": r.status,
                "tier": r.tier,
                "llmCalled": r.llm_called,
                "message": r.message,
                "createdAt": r.created_at.isoformat() if r.created_at else None,
            }
            for r in runs
        ],
        "recentEvents": [event_bus.serialize_record(e) for e in events],
        "nextSteps": next_steps,
        "actionStats": action_center.stats(db, user),
        "cost": cost_guard.summarize(db, user.id),
        "preferenceBias": bias,
        "generatedAt": now.isoformat(),
        "disclaimer": DISCLAIMER,
    }


def insights(db: Session, user: User, *, allow_llm: bool = False) -> dict:
    """一次性返回投资 + 现金流两个智能体的最新结论（控制中心用）。"""
    from backend.autonomous.agents import cashflow as cashflow_agent
    from backend.autonomous.agents import investment as investment_agent

    ctx = build_context(db, user)
    return {
        "investment": investment_agent.analyze(db, user, ctx, allow_llm=allow_llm),
        "cashflow": cashflow_agent.analyze(db, user, ctx, allow_llm=allow_llm),
        "disclaimer": DISCLAIMER,
    }


def pending_action_count(db: Session, user: User) -> int:
    return len(
        list(
            db.scalars(
                select(AutomationAction).where(
                    AutomationAction.user_id == user.id, AutomationAction.status == "pending"
                )
            ).all()
        )
    )


def notification_priority_label(severity: str) -> str:
    return {
        "critical": "紧急",
        "high": "重要",
        "medium": "一般",
        "low": "提示",
    }.get(notif_engine.normalize_priority(severity), "一般")
