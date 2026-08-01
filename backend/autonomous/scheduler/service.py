# -*- coding: utf-8 -*-
"""
backend/autonomous/scheduler/service.py — Phase 7.4 需求二：AI 任务调度系统。

四类任务：
    每日任务  daily    —— 财富日报、异常检测
    每周任务  weekly   —— 现金流分析、投资组合复检
    每月任务  monthly  —— 月度财富报告、目标进度评估
    事件任务  event    —— 由 Event Bus 触发，不占用定时槽位
另有 once（单次），执行后自动停用。

时间基准统一为 UTC，next_run_at 由 compute_next_run() 计算并持久化，
守护线程只需扫描 next_run_at <= now 的任务，避免任何漂移与重复执行。
"""
from __future__ import annotations

import calendar
import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.autonomous.models import AutomationRun, AutomationScheduled
from backend.user.models import User

logger = logging.getLogger("finos.autonomous.scheduler")

FREQUENCIES = ("daily", "weekly", "monthly", "event", "once")

TASK_TYPES = {
    "daily_briefing": "每日财富日报",
    "weekly_summary": "每周现金流总结",
    "monthly_report": "月度财富报告",
    "yearly_report": "年度财富报告",
    "investment_review": "投资组合复检",
    "cashflow_review": "现金流复检",
    "preference_learning": "用户偏好学习",
    "event_scan": "财富变化扫描",
}

# 新用户默认自动化套餐（对应需求二示例：每日日报 / 每周现金流 / 每月财富报告）
DEFAULT_SCHEDULES = [
    {"name": "每日财富日报", "frequency": "daily", "task_type": "daily_briefing", "hour": 8},
    {"name": "每周现金流分析", "frequency": "weekly", "task_type": "weekly_summary", "hour": 9, "weekday": 0},
    {"name": "每月财富报告", "frequency": "monthly", "task_type": "monthly_report", "hour": 9, "day_of_month": 1},
    {"name": "财富变化扫描", "frequency": "daily", "task_type": "event_scan", "hour": 7},
]


# --------------------------------------------------------------------------- #
# 下次运行时间
# --------------------------------------------------------------------------- #
def compute_next_run(
    frequency: str,
    *,
    hour: int = 8,
    weekday: int = 0,
    day_of_month: int = 1,
    base: datetime | None = None,
) -> datetime | None:
    now = (base or datetime.now(timezone.utc)).astimezone(timezone.utc)
    hour = max(0, min(23, int(hour or 0)))
    freq = (frequency or "daily").lower()

    if freq == "event":
        return None
    if freq == "once":
        return now + timedelta(minutes=1)

    candidate = now.replace(hour=hour, minute=0, second=0, microsecond=0)

    if freq == "daily":
        return candidate if candidate > now else candidate + timedelta(days=1)

    if freq == "weekly":
        target = max(0, min(6, int(weekday or 0)))
        delta = (target - candidate.weekday()) % 7
        candidate = candidate + timedelta(days=delta)
        return candidate if candidate > now else candidate + timedelta(days=7)

    if freq == "monthly":
        dom = max(1, min(31, int(day_of_month or 1)))
        year, month = now.year, now.month
        day = min(dom, calendar.monthrange(year, month)[1])
        candidate = now.replace(day=day, hour=hour, minute=0, second=0, microsecond=0)
        if candidate <= now:
            month += 1
            if month > 12:
                month, year = 1, year + 1
            day = min(dom, calendar.monthrange(year, month)[1])
            candidate = candidate.replace(year=year, month=month, day=day)
        return candidate

    return candidate + timedelta(days=1)


def refresh_next_run(task: AutomationScheduled, base: datetime | None = None) -> None:
    task.next_run_at = compute_next_run(
        task.frequency,
        hour=task.hour,
        weekday=task.weekday,
        day_of_month=task.day_of_month,
        base=base,
    )


# --------------------------------------------------------------------------- #
# 默认套餐
# --------------------------------------------------------------------------- #
def ensure_defaults(db: Session, user: User) -> list[AutomationScheduled]:
    """为用户创建默认定时任务（幂等：按 task_type 判重）。"""
    existing = {
        t.task_type
        for t in db.scalars(
            select(AutomationScheduled).where(AutomationScheduled.user_id == user.id)
        ).all()
    }
    created: list[AutomationScheduled] = []
    for spec in DEFAULT_SCHEDULES:
        if spec["task_type"] in existing:
            continue
        task = AutomationScheduled(
            user_id=user.id,
            name=spec["name"],
            frequency=spec["frequency"],
            task_type=spec["task_type"],
            hour=spec.get("hour", 8),
            weekday=spec.get("weekday", 0),
            day_of_month=spec.get("day_of_month", 1),
        )
        refresh_next_run(task)
        db.add(task)
        created.append(task)
    if created:
        db.commit()
    return created


# --------------------------------------------------------------------------- #
# 执行
# --------------------------------------------------------------------------- #
def _execute_task_body(db: Session, user: User, task: AutomationScheduled) -> tuple[str, bool, str]:
    """返回 (message, llm_called, status)。"""
    from backend.autonomous import event_bus
    from backend.autonomous import reports
    from backend.autonomous.agents import cashflow as cashflow_agent
    from backend.autonomous.agents import investment as investment_agent
    from backend.autonomous.agents import preference as preference_agent

    params = task.param_dict()
    allow_llm = bool(params.get("allowLlm", True))
    ttype = task.task_type

    if ttype == "daily_briefing":
        r = reports.generate(db, user, "daily", allow_llm=allow_llm)
        return ("每日简报已生成" if r.get("hasData") is not False else "暂无数据，跳过日报"), False, "success"

    if ttype == "weekly_summary":
        r = reports.generate(db, user, "weekly", allow_llm=allow_llm)
        return ("每周总结已生成" if r.get("hasData") else "暂无数据，跳过周报"), False, "success"

    if ttype == "monthly_report":
        r = reports.generate(db, user, "monthly", allow_llm=allow_llm)
        return ("月度报告已生成" if r.get("hasData") is not False else "暂无数据，跳过月报"), bool(r.get("llmCalled")), "success"

    if ttype == "yearly_report":
        r = reports.generate(db, user, "yearly", allow_llm=allow_llm)
        return ("年度报告已生成" if r.get("hasData") is not False else "暂无数据，跳过年报"), bool(r.get("llmCalled")), "success"

    if ttype == "investment_review":
        r = investment_agent.analyze(db, user, allow_llm=allow_llm)
        return f"投资复检完成，发现 {len(r.get('findings') or [])} 项待关注", bool(r.get("llmCalled")), "success"

    if ttype == "cashflow_review":
        r = cashflow_agent.analyze(db, user, allow_llm=allow_llm)
        return f"现金流复检完成，发现 {len(r.get('findings') or [])} 项待关注", bool(r.get("llmCalled")), "success"

    if ttype == "preference_learning":
        preference_agent.learn(db, user)
        return "用户偏好学习完成", False, "success"

    if ttype == "event_scan":
        events = event_bus.scan_and_publish(db, user)
        return f"财富变化扫描完成，产生 {len(events)} 个事件", False, "success"

    return f"未知任务类型：{ttype}", False, "failed"


def run_scheduled_task(
    db: Session,
    user: User,
    task: AutomationScheduled,
    *,
    force: bool = False,
) -> dict:
    """执行一条定时任务并推进 next_run_at。"""
    now = datetime.now(timezone.utc)
    if not task.enabled and not force:
        # 需求验收第 5 项：关闭 Agent 后不再执行
        return {"taskId": task.id, "status": "skipped", "reason": "任务已停用", "ranAt": now.isoformat()}

    try:
        message, llm_called, status = _execute_task_body(db, user, task)
    except Exception as exc:  # noqa: BLE001
        logger.exception("scheduled_task_failed: %s", task.task_type)
        try:
            db.rollback()
        except Exception:  # noqa: BLE001
            pass
        message, llm_called, status = f"执行失败：{exc}"[:300], False, "failed"

    task.last_run_at = now
    task.run_count = (task.run_count or 0) + 1
    if task.frequency == "once":
        task.enabled = False
        task.next_run_at = None
    else:
        refresh_next_run(task, base=now)

    run = AutomationRun(
        user_id=user.id,
        source="scheduled",
        source_id=task.id,
        name=task.name,
        status=status,
        tier=task.tier,
        llm_called=llm_called,
        message=message,
    )
    db.add(run)
    db.commit()

    return {
        "taskId": task.id,
        "taskType": task.task_type,
        "status": status,
        "message": message,
        "runId": run.id,
        "ranAt": now.isoformat(),
        "nextRunAt": task.next_run_at.isoformat() if task.next_run_at else None,
    }


def due_tasks(db: Session, limit: int = 20, now: datetime | None = None) -> list[AutomationScheduled]:
    """全局扫描到期任务（跨用户，供守护线程调用）。"""
    now = now or datetime.now(timezone.utc)
    stmt = (
        select(AutomationScheduled)
        .where(
            AutomationScheduled.enabled.is_(True),
            AutomationScheduled.next_run_at.is_not(None),
            AutomationScheduled.next_run_at <= now,
        )
        .order_by(AutomationScheduled.next_run_at.asc())
        .limit(limit)
    )
    return list(db.scalars(stmt).all())


def tick(db: Session, limit: int = 20) -> list[dict]:
    """守护线程的一次心跳：执行所有到期任务。"""
    results: list[dict] = []
    for task in due_tasks(db, limit=limit):
        user = db.get(User, task.user_id)
        if user is None:
            task.enabled = False
            db.commit()
            continue
        try:
            results.append(run_scheduled_task(db, user, task))
        except Exception:  # noqa: BLE001
            logger.exception("scheduler_tick_failed: %s", task.id)
            try:
                db.rollback()
            except Exception:  # noqa: BLE001
                pass
    return results


def serialize(task: AutomationScheduled) -> dict:
    return {
        "id": task.id,
        "name": task.name,
        "enabled": task.enabled,
        "frequency": task.frequency,
        "taskType": task.task_type,
        "taskTypeLabel": TASK_TYPES.get(task.task_type, task.task_type),
        "hour": task.hour,
        "weekday": task.weekday,
        "dayOfMonth": task.day_of_month,
        "params": task.param_dict(),
        "tier": task.tier,
        "runCount": task.run_count,
        "lastRunAt": task.last_run_at.isoformat() if task.last_run_at else None,
        "nextRunAt": task.next_run_at.isoformat() if task.next_run_at else None,
        "createdAt": task.created_at.isoformat() if task.created_at else None,
    }
