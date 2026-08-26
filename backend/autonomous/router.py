# -*- coding: utf-8 -*-
"""
backend/autonomous/router.py — Phase 7.4 智能自动化 + AI 主动服务系统 REST 路由。

前缀 /autonomous。所有端点强制 user_id 隔离（经 get_current_user）。
覆盖：AI 控制中心 / 引导初始化 / 立即扫描 / 洞察 / 规则 / 定时任务 / 工作流 /
Webhook / 运行记录 / 行动中心 / 长期计划 / 市场数据 / 事件 / 偏好学习 / 成本控制。
"""
from __future__ import annotations

import json
import urllib.request
from datetime import datetime, timezone
from typing import Any, Literal
from urllib.error import URLError

from fastapi import APIRouter, Body, Depends, Query  # noqa: F401
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.core import get_current_user, ok
from backend.core.response import fail
from backend.database import get_db
from backend.intelligence.context import build_context
from backend.user.models import User

from backend.autonomous import action_center, cost_guard, event_bus, service as auto_svc
from backend.autonomous.agents import cashflow as cashflow_agent
from backend.autonomous.agents import investment as investment_agent
from backend.autonomous.agents import preference as preference_agent
from backend.autonomous.market.manager import get_manager
from backend.autonomous.models import (
    AutomationAction,
    AutomationPlan,
    AutomationRule,
    AutomationRun,
    AutomationScheduled,
    AutomationWebhook,
    AutomationWorkflow,
)
from backend.autonomous.planner import service as planner_svc
from backend.autonomous.scheduler import service as scheduler_svc
from backend.autonomous.trigger import service as trigger_svc
from backend.autonomous.workflow import service as workflow_svc

router = APIRouter(prefix="/autonomous", tags=["autonomous"])  # type: ignore[name-defined]


# --------------------------------------------------------------------------- #
# 视图序列化
# --------------------------------------------------------------------------- #
def _rule_view(r: AutomationRule) -> dict:
    return {
        "id": r.id,
        "name": r.name,
        "description": r.description,
        "enabled": r.enabled,
        "triggerType": r.trigger_type,
        "conditions": r.cond_list(),
        "actions": r.action_list(),
        "tier": r.tier,
        "cooldownSeconds": r.cooldown_seconds,
        "triggerCount": r.trigger_count,
        "lastTriggeredAt": r.last_triggered_at.isoformat() if r.last_triggered_at else None,
        "createdAt": r.created_at.isoformat() if r.created_at else None,
    }


def _workflow_view(w: AutomationWorkflow) -> dict:
    return {
        "id": w.id,
        "name": w.name,
        "description": w.description,
        "enabled": w.enabled,
        "steps": w.step_list(),
        "tier": w.tier,
        "runCount": w.run_count,
        "lastRunAt": w.last_run_at.isoformat() if w.last_run_at else None,
        "createdAt": w.created_at.isoformat() if w.created_at else None,
    }


def _webhook_view(w: AutomationWebhook) -> dict:
    return {
        "id": w.id,
        "name": w.name,
        "url": w.url,
        "method": w.method,
        "headers": w.header_dict(),
        "enabled": w.enabled,
        "events": w.event_list(),
        "callCount": w.call_count,
        "lastCalledAt": w.last_called_at.isoformat() if w.last_called_at else None,
        "lastStatus": w.last_status,
        "createdAt": w.created_at.isoformat() if w.created_at else None,
    }


def _run_view(r: AutomationRun) -> dict:
    return {
        "id": r.id,
        "source": r.source,
        "sourceId": r.source_id,
        "name": r.name,
        "status": r.status,
        "tier": r.tier,
        "llmCalled": r.llm_called,
        "tokensUsed": r.tokens_used,
        "message": r.message,
        "createdAt": r.created_at.isoformat() if r.created_at else None,
    }


def _owned(db: Session, user: User, model: Any, rid: str) -> Any:
    return db.scalar(select(model).where(model.id == rid, model.user_id == user.id))


# --------------------------------------------------------------------------- #
# 请求体
# --------------------------------------------------------------------------- #
class RuleCreate(BaseModel):
    name: str
    description: str = ""
    triggerType: str = "event"
    conditions: list[dict] = []
    actions: list[dict] = []
    tier: str = "local"
    cooldownSeconds: int = 3600


class RuleUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    enabled: bool | None = None
    triggerType: str | None = None
    conditions: list[dict] | None = None
    actions: list[dict] | None = None
    tier: str | None = None
    cooldownSeconds: int | None = None


class ScheduleCreate(BaseModel):
    name: str
    frequency: str = "daily"
    taskType: str = "daily_briefing"
    hour: int = 8
    weekday: int = 0
    dayOfMonth: int = 1
    params: dict = {}
    tier: str = "local"
    enabled: bool = True


class ScheduleUpdate(BaseModel):
    name: str | None = None
    enabled: bool | None = None
    frequency: str | None = None
    taskType: str | None = None
    hour: int | None = None
    weekday: int | None = None
    dayOfMonth: int | None = None
    params: dict | None = None
    tier: str | None = None


class WorkflowCreate(BaseModel):
    name: str
    description: str = ""
    steps: list[dict] = []
    tier: str = "local"
    enabled: bool = True
    templateKey: str | None = None


class WorkflowUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    enabled: bool | None = None
    steps: list[dict] | None = None


class WebhookCreate(BaseModel):
    name: str
    url: str
    method: Literal["POST", "PUT", "PATCH"] = "POST"
    headers: dict = Field(default_factory=dict)
    events: list[str] = Field(default_factory=list)
    enabled: bool = True


class PlanCreate(BaseModel):
    name: str
    agentKind: str = "retirement"
    cadence: str = "weekly"
    description: str = ""
    params: dict = {}
    enabled: bool = True


class PlanUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    enabled: bool | None = None
    cadence: str | None = None
    params: dict | None = None


class ActionCreate(BaseModel):
    title: str
    detail: str = ""
    category: str = "wealth"
    priority: str = "medium"
    dueInDays: float | None = None


class ActionCompleteBody(BaseModel):
    feedback: dict | None = None


class ActionDismissBody(BaseModel):
    reason: str = ""


class ActionDeferBody(BaseModel):
    days: float = 7


# --------------------------------------------------------------------------- #
# 控制中心 / 引导 / 扫描 / 洞察 / 成本 / 事件
# --------------------------------------------------------------------------- #
@router.get("/overview")
def get_overview(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return ok(auto_svc.overview(db, user))


@router.post("/bootstrap")
def post_bootstrap(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return ok(auto_svc.bootstrap(db, user), "自动化引擎已初始化")


@router.post("/scan")
def post_scan(
    runWorkflows: bool = Query(True),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return ok(auto_svc.scan_now(db, user, run_workflows=runWorkflows))


@router.get("/insights")
def get_insights(
    allowLlm: bool = Query(False),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return ok(auto_svc.insights(db, user, allow_llm=allowLlm))


@router.get("/cost")
def get_cost(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return ok(cost_guard.summarize(db, user.id))


@router.get("/events")
def list_events(limit: int = Query(20, ge=1, le=200), user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return ok([event_bus.serialize_record(e) for e in event_bus.list_events(db, user.id, limit)])


# --------------------------------------------------------------------------- #
# 规则（触发器 DSL）
# --------------------------------------------------------------------------- #
@router.get("/rules")
def list_rules(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = list(
        db.scalars(
            select(AutomationRule).where(AutomationRule.user_id == user.id).order_by(AutomationRule.created_at.desc())
        ).all()
    )
    return ok([_rule_view(r) for r in rows])


@router.post("/rules")
def create_rule(body: RuleCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rule = AutomationRule(
        user_id=user.id,
        name=body.name[:120],
        description=body.description,
        enabled=True,
        trigger_type=body.triggerType,
        tier=body.tier,
        cooldown_seconds=body.cooldownSeconds,
    )
    rule.set_conditions(body.conditions)
    rule.set_actions(body.actions)
    db.add(rule)
    db.commit()
    return ok(_rule_view(rule), "已创建规则")


@router.put("/rules/{rule_id}")
def update_rule(rule_id: str, body: RuleUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rule = _owned(db, user, AutomationRule, rule_id)
    if rule is None:
        return fail("规则不存在", status_code=404)
    if body.name is not None:
        rule.name = body.name[:120]
    if body.description is not None:
        rule.description = body.description
    if body.enabled is not None:
        rule.enabled = body.enabled
    if body.triggerType is not None:
        rule.trigger_type = body.triggerType
    if body.tier is not None:
        rule.tier = body.tier
    if body.cooldownSeconds is not None:
        rule.cooldown_seconds = body.cooldownSeconds
    if body.conditions is not None:
        rule.set_conditions(body.conditions)
    if body.actions is not None:
        rule.set_actions(body.actions)
    db.commit()
    return ok(_rule_view(rule), "已更新")


@router.delete("/rules/{rule_id}")
def delete_rule(rule_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rule = _owned(db, user, AutomationRule, rule_id)
    if rule is None:
        return fail("规则不存在", status_code=404)
    db.delete(rule)
    db.commit()
    return ok(None, "已删除")


@router.post("/rules/{rule_id}/run")
def run_rule(rule_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rule = _owned(db, user, AutomationRule, rule_id)
    if rule is None:
        return fail("规则不存在", status_code=404)
    result = trigger_svc.run_rule(db, user, rule, None, respect_cooldown=False)
    return ok(result, "已触发规则")


# --------------------------------------------------------------------------- #
# 定时任务
# --------------------------------------------------------------------------- #
@router.get("/schedules")
def list_schedules(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = list(
        db.scalars(
            select(AutomationScheduled).where(AutomationScheduled.user_id == user.id).order_by(AutomationScheduled.created_at.desc())
        ).all()
    )
    return ok([scheduler_svc.serialize(s) for s in rows])


@router.post("/schedules")
def create_schedule(body: ScheduleCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    task = AutomationScheduled(
        user_id=user.id,
        name=body.name[:120],
        enabled=body.enabled,
        frequency=body.frequency,
        task_type=body.taskType,
        hour=body.hour,
        weekday=body.weekday,
        day_of_month=body.dayOfMonth,
        tier=body.tier,
    )
    task.set_params(body.params)
    scheduler_svc.refresh_next_run(task)
    db.add(task)
    db.commit()
    return ok(scheduler_svc.serialize(task), "已创建定时任务")


@router.put("/schedules/{schedule_id}")
def update_schedule(schedule_id: str, body: ScheduleUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    task = _owned(db, user, AutomationScheduled, schedule_id)
    if task is None:
        return fail("定时任务不存在", status_code=404)
    if body.name is not None:
        task.name = body.name[:120]
    if body.enabled is not None:
        task.enabled = body.enabled
    if body.frequency is not None:
        task.frequency = body.frequency
    if body.taskType is not None:
        task.task_type = body.taskType
    if body.hour is not None:
        task.hour = body.hour
    if body.weekday is not None:
        task.weekday = body.weekday
    if body.dayOfMonth is not None:
        task.day_of_month = body.dayOfMonth
    if body.tier is not None:
        task.tier = body.tier
    if body.params is not None:
        task.set_params(body.params)
    scheduler_svc.refresh_next_run(task)
    db.commit()
    return ok(scheduler_svc.serialize(task), "已更新")


@router.delete("/schedules/{schedule_id}")
def delete_schedule(schedule_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    task = _owned(db, user, AutomationScheduled, schedule_id)
    if task is None:
        return fail("定时任务不存在", status_code=404)
    db.delete(task)
    db.commit()
    return ok(None, "已删除")


@router.post("/schedules/{schedule_id}/run")
def run_schedule(schedule_id: str, force: bool = Query(False), user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    task = _owned(db, user, AutomationScheduled, schedule_id)
    if task is None:
        return fail("定时任务不存在", status_code=404)
    return ok(scheduler_svc.run_scheduled_task(db, user, task, force=force), "已执行")


# --------------------------------------------------------------------------- #
# 工作流
# --------------------------------------------------------------------------- #
@router.get("/workflows/templates")
def list_workflow_templates(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return ok(workflow_svc.list_templates())


@router.get("/workflows")
def list_workflows(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = list(
        db.scalars(
            select(AutomationWorkflow).where(AutomationWorkflow.user_id == user.id).order_by(AutomationWorkflow.created_at.desc())
        ).all()
    )
    return ok([_workflow_view(w) for w in rows])


@router.post("/workflows")
def create_workflow(body: WorkflowCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    steps = body.steps
    if body.templateKey:
        tpl = workflow_svc.get_template(body.templateKey)
        if tpl is None:
            return fail("工作流模板不存在", status_code=404)
        steps = tpl.get("steps", [])
        if not body.description:
            body.description = tpl.get("description", "")
        if not body.name or body.name == tpl.get("name"):
            body.name = tpl.get("name", body.name)
    wf = AutomationWorkflow(
        user_id=user.id,
        name=body.name[:120],
        description=body.description,
        enabled=body.enabled,
        tier=body.tier,
    )
    wf.set_steps(steps)
    db.add(wf)
    db.commit()
    return ok(_workflow_view(wf), "已创建工作流")


@router.put("/workflows/{workflow_id}")
def update_workflow(workflow_id: str, body: WorkflowUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    wf = _owned(db, user, AutomationWorkflow, workflow_id)
    if wf is None:
        return fail("工作流不存在", status_code=404)
    if body.name is not None:
        wf.name = body.name[:120]
    if body.description is not None:
        wf.description = body.description
    if body.enabled is not None:
        wf.enabled = body.enabled
    if body.steps is not None:
        wf.set_steps(body.steps)
    db.commit()
    return ok(_workflow_view(wf), "已更新")


@router.delete("/workflows/{workflow_id}")
def delete_workflow(workflow_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    wf = _owned(db, user, AutomationWorkflow, workflow_id)
    if wf is None:
        return fail("工作流不存在", status_code=404)
    db.delete(wf)
    db.commit()
    return ok(None, "已删除")


@router.post("/workflows/{workflow_id}/run")
def run_workflow(workflow_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    wf = _owned(db, user, AutomationWorkflow, workflow_id)
    if wf is None:
        return fail("工作流不存在", status_code=404)
    try:
        result = workflow_svc.run_workflow(db, user, wf, None, build_context(db, user))
    except Exception:  # noqa: BLE001
        return fail("工作流执行失败，请稍后重试", status_code=500)
    return ok(result, "已执行工作流")


# --------------------------------------------------------------------------- #
# Webhook
# --------------------------------------------------------------------------- #
@router.get("/webhooks")
def list_webhooks(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = list(
        db.scalars(
            select(AutomationWebhook).where(AutomationWebhook.user_id == user.id).order_by(AutomationWebhook.created_at.desc())
        ).all()
    )
    return ok([_webhook_view(w) for w in rows])


@router.post("/webhooks")
def create_webhook(body: WebhookCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    from backend.security.network import UnsafeOutboundUrl, validate_public_http_url
    try:
        safe_url = validate_public_http_url(body.url)
    except UnsafeOutboundUrl as exc:
        return fail(str(exc))
    wh = AutomationWebhook(
        user_id=user.id,
        name=body.name[:120],
        url=safe_url,
        method=body.method,
        enabled=body.enabled,
    )
    wh.set_headers(body.headers)
    wh.set_events(body.events)
    db.add(wh)
    db.commit()
    return ok(_webhook_view(wh), "已创建 Webhook")


@router.delete("/webhooks/{webhook_id}")
def delete_webhook(webhook_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    wh = _owned(db, user, AutomationWebhook, webhook_id)
    if wh is None:
        return fail("Webhook 不存在", status_code=404)
    db.delete(wh)
    db.commit()
    return ok(None, "已删除")


@router.post("/webhooks/{webhook_id}/test")
def test_webhook(webhook_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    wh = _owned(db, user, AutomationWebhook, webhook_id)
    if wh is None:
        return fail("Webhook 不存在", status_code=404)
    payload = json.dumps({"event": "test", "userId": user.id, "timestamp": datetime.now(timezone.utc).isoformat()}).encode("utf-8")
    headers = {"Content-Type": "application/json"}
    headers.update(wh.header_dict())
    req = urllib.request.Request(wh.url, data=payload, headers=headers, method=(wh.method or "POST").upper())
    status = None
    error = None
    try:
        from backend.security.network import open_public_url
        with open_public_url(req, timeout=10) as resp:
            status = resp.status
    except URLError as e:
        error = str(getattr(e, "reason", e))
    except Exception as e:  # noqa: BLE001
        error = type(e).__name__
    wh.last_called_at = datetime.now(timezone.utc)
    wh.last_status = status
    wh.call_count = (wh.call_count or 0) + 1
    db.commit()
    return ok({"status": status, "error": error}, "已发送测试请求" if status else f"测试失败：{error}")


# --------------------------------------------------------------------------- #
# 运行记录
# --------------------------------------------------------------------------- #
@router.get("/runs")
def list_runs(limit: int = Query(20, ge=1, le=200), user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = list(
        db.scalars(
            select(AutomationRun)
            .where(AutomationRun.user_id == user.id)
            .order_by(AutomationRun.created_at.desc())
            .limit(limit)
        ).all()
    )
    return ok([_run_view(r) for r in rows])


# --------------------------------------------------------------------------- #
# 行动中心（Action Center）
# --------------------------------------------------------------------------- #
@router.get("/actions")
def list_actions(
    status: str | None = Query(None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    rows = action_center.list_actions(db, user, status=status)
    return ok([action_center.serialize(a) for a in rows])


@router.post("/actions")
def create_action(body: ActionCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    item = action_center.create(
        db,
        user,
        title=body.title,
        detail=body.detail,
        category=body.category,
        priority=body.priority,
        due_in_days=body.dueInDays,
    )
    return ok(action_center.serialize(item), "已创建行动项")


@router.post("/actions/{action_id}/complete")
def complete_action(action_id: str, body: ActionCompleteBody | None = None, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    item = action_center.complete(db, user, action_id, (body.feedback if body else None))
    if item is None:
        return fail("行动项不存在", status_code=404)
    return ok(action_center.serialize(item), "已标记完成")


@router.post("/actions/{action_id}/dismiss")
def dismiss_action(action_id: str, body: ActionDismissBody | None = None, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    item = action_center.dismiss(db, user, action_id, (body.reason if body else ""))
    if item is None:
        return fail("行动项不存在", status_code=404)
    return ok(action_center.serialize(item), "已忽略")


@router.post("/actions/{action_id}/defer")
def defer_action(action_id: str, body: ActionDeferBody | None = None, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    days = body.days if body else 7
    item = action_center.defer(db, user, action_id, days)
    if item is None:
        return fail("行动项不存在", status_code=404)
    return ok(action_center.serialize(item), "已延期")


@router.post("/actions/{action_id}/reopen")
def reopen_action(action_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    item = action_center.reopen(db, user, action_id)
    if item is None:
        return fail("行动项不存在", status_code=404)
    return ok(action_center.serialize(item), "已重新打开")


@router.delete("/actions/{action_id}")
def delete_action(action_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not action_center.delete(db, user, action_id):
        return fail("行动项不存在", status_code=404)
    return ok(None, "已删除")


@router.get("/actions/stats")
def actions_stats(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return ok(action_center.stats(db, user))


# --------------------------------------------------------------------------- #
# 长期计划（长期运行 Agent）
# --------------------------------------------------------------------------- #
@router.get("/plans")
def list_plans(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = list(
        db.scalars(
            select(AutomationPlan).where(AutomationPlan.user_id == user.id).order_by(AutomationPlan.created_at.desc())
        ).all()
    )
    return ok([planner_svc.serialize(p) for p in rows])


@router.post("/plans")
def create_plan(body: PlanCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    plan = AutomationPlan(
        user_id=user.id,
        name=body.name[:120],
        description=body.description,
        enabled=body.enabled,
        agent_kind=body.agentKind,
        cadence=body.cadence,
        next_run_at=planner_svc.next_run_from(body.cadence),
    )
    plan.set_params(body.params)
    db.add(plan)
    db.commit()
    return ok(planner_svc.serialize(plan), "已创建长期计划")


@router.put("/plans/{plan_id}")
def update_plan(plan_id: str, body: PlanUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    plan = _owned(db, user, AutomationPlan, plan_id)
    if plan is None:
        return fail("计划不存在", status_code=404)
    if body.name is not None:
        plan.name = body.name[:120]
    if body.description is not None:
        plan.description = body.description
    if body.enabled is not None:
        plan.enabled = body.enabled
    if body.cadence is not None:
        plan.cadence = body.cadence
        plan.next_run_at = planner_svc.next_run_from(body.cadence)
    if body.params is not None:
        plan.set_params(body.params)
    db.commit()
    return ok(planner_svc.serialize(plan), "已更新")


@router.delete("/plans/{plan_id}")
def delete_plan(plan_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    plan = _owned(db, user, AutomationPlan, plan_id)
    if plan is None:
        return fail("计划不存在", status_code=404)
    db.delete(plan)
    db.commit()
    return ok(None, "已删除")


@router.post("/plans/{plan_id}/run")
def run_plan(plan_id: str, force: bool = Query(False), user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    plan = _owned(db, user, AutomationPlan, plan_id)
    if plan is None:
        return fail("计划不存在", status_code=404)
    return ok(planner_svc.run_plan(db, user, plan, force=force), "已执行巡检")


# --------------------------------------------------------------------------- #
# 偏好学习
# --------------------------------------------------------------------------- #
@router.get("/preferences")
def get_preferences(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return ok(preference_agent.get_profile(db, user))


@router.post("/preferences/learn")
def learn_preferences(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return ok(preference_agent.learn(db, user), "偏好学习完成")


@router.get("/preferences/bias")
def preferences_bias(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return ok(preference_agent.notification_bias(db, user))


# --------------------------------------------------------------------------- #
# 市场数据（需求六）
# --------------------------------------------------------------------------- #
@router.get("/market/price")
def market_price(
    symbol: str = Query(..., min_length=1),
    marketType: str = Query("stock"),
    force: bool = Query(False),
    ttl: int = Query(900, ge=30),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return ok(get_manager().get_price(db, user, symbol, marketType, ttl=ttl, force=force))


@router.get("/market/history")
def market_history(
    symbol: str = Query(..., min_length=1),
    days: int = Query(30, ge=1, le=365),
    marketType: str = Query("stock"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return ok(get_manager().get_history(db, user, symbol, days, marketType))


@router.get("/market/portfolio-change")
def market_portfolio_change(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return ok(get_manager().get_portfolio_change(db, user))
