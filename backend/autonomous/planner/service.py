# -*- coding: utf-8 -*-
"""
backend/autonomous/planner/service.py — Phase 7.4 需求十一：Agent 长期运行能力。

让 Agent 不再是「问一次答一次」，而是持续跟踪目标：
    退休 Agent   每月检查一次退休资金缺口，缺口扩大即预警
    投资 Agent   每周检查一次组合结构与风险暴露
    现金流 Agent 每周检查一次收支健康
    风险 Agent   每月检查一次整体风险敞口

每次巡检都会与上一次结论对比：只有在「明显恶化」时才升级为高优先级提醒，
避免每周重复推送同样的话（同时也是成本控制的一部分）。
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.autonomous import notifications as notif_engine
from backend.autonomous.agents import cashflow as cashflow_agent
from backend.autonomous.agents import investment as investment_agent
from backend.autonomous.models import AutomationAction, AutomationPlan, AutomationRun
from backend.intelligence.context import build_context
from backend.intelligence.prediction.engine import retirement_projection
from backend.user.models import User

logger = logging.getLogger("finos.autonomous.planner")

AGENT_KINDS = {
    "retirement": "退休规划 Agent",
    "investment": "投资组合 Agent",
    "cashflow": "现金流 Agent",
    "risk": "风险控制 Agent",
}

CADENCES = {"weekly": 7, "monthly": 30, "quarterly": 91}

DEFAULT_PLANS = [
    {
        "name": "退休资金月度巡检",
        "agent_kind": "retirement",
        "cadence": "monthly",
        "description": "每月检查一次退休资金缺口，缺口扩大超过 10% 时主动预警。",
    },
    {
        "name": "投资组合周度巡检",
        "agent_kind": "investment",
        "cadence": "weekly",
        "description": "每周检查一次资产配置、风险暴露与集中度。",
    },
]


def next_run_from(cadence: str, base: datetime | None = None) -> datetime:
    days = CADENCES.get((cadence or "weekly").lower(), 7)
    return (base or datetime.now(timezone.utc)) + timedelta(days=days)


def ensure_defaults(db: Session, user: User) -> list[AutomationPlan]:
    """幂等创建默认长期计划（按 agent_kind 判重）。"""
    existing = {
        p.agent_kind
        for p in db.scalars(select(AutomationPlan).where(AutomationPlan.user_id == user.id)).all()
    }
    created: list[AutomationPlan] = []
    for spec in DEFAULT_PLANS:
        if spec["agent_kind"] in existing:
            continue
        plan = AutomationPlan(
            user_id=user.id,
            name=spec["name"],
            description=spec["description"],
            agent_kind=spec["agent_kind"],
            cadence=spec["cadence"],
            next_run_at=next_run_from(spec["cadence"]),
        )
        db.add(plan)
        created.append(plan)
    if created:
        db.commit()
    return created


# --------------------------------------------------------------------------- #
# 各类 Agent 的一次巡检
# --------------------------------------------------------------------------- #
def _check_retirement(db: Session, user: User, plan: AutomationPlan) -> dict:
    ctx = build_context(db, user)
    proj = retirement_projection(ctx)
    if not proj.get("available"):
        return {
            "severity": "low",
            "summary": proj.get("reason", "退休测算所需信息不足"),
            "metrics": {},
            "changed": False,
        }

    gap = float(proj.get("gap") or 0.0)
    prev = plan.param_dict().get("lastGap")
    severity = "low"
    changed = False
    if gap > 0:
        severity = "medium"
        if prev is not None:
            try:
                prev_f = float(prev)
                if prev_f > 0 and gap > prev_f * 1.1:
                    severity = "high"
                    changed = True
                elif gap < prev_f * 0.9:
                    changed = True
            except (TypeError, ValueError):
                pass
        else:
            changed = True

    params = plan.param_dict()
    params["lastGap"] = gap
    plan.set_params(params)

    if gap <= 0:
        summary = (
            f"按当前储蓄节奏，预计退休时可积累 ¥{proj.get('projectedCapital', 0):,.0f}，"
            f"已覆盖所需的 ¥{proj.get('requiredCapital', 0):,.0f}。"
        )
    else:
        summary = (
            f"退休资金缺口 ¥{gap:,.0f}（距退休 {proj.get('yearsToRetirement')} 年），"
            f"需每月额外储蓄约 ¥{proj.get('extraMonthlySavingNeeded', 0):,.0f}。"
        )
    return {"severity": severity, "summary": summary, "metrics": proj, "changed": changed}


def _check_investment(db: Session, user: User, plan: AutomationPlan) -> dict:
    result = investment_agent.analyze(db, user, allow_llm=False)
    findings = result.get("findings") or []
    prev_count = plan.param_dict().get("lastFindingCount")
    changed = prev_count is None or int(prev_count) != len(findings)
    params = plan.param_dict()
    params["lastFindingCount"] = len(findings)
    plan.set_params(params)
    summary = (
        f"投资组合巡检：发现 {len(findings)} 项待关注"
        + (f"，最重要的是「{findings[0].get('title')}」" if findings else "，结构健康")
    )
    return {"severity": result.get("severity", "low"), "summary": summary, "metrics": result.get("metrics", {}), "changed": changed}


def _check_cashflow(db: Session, user: User, plan: AutomationPlan) -> dict:
    result = cashflow_agent.analyze(db, user, allow_llm=False)
    findings = result.get("findings") or []
    prev_count = plan.param_dict().get("lastFindingCount")
    changed = prev_count is None or int(prev_count) != len(findings)
    params = plan.param_dict()
    params["lastFindingCount"] = len(findings)
    plan.set_params(params)
    summary = (
        f"现金流巡检：发现 {len(findings)} 项待关注"
        + (f"，最重要的是「{findings[0].get('title')}」" if findings else "，收支稳定")
    )
    return {"severity": result.get("severity", "low"), "summary": summary, "metrics": result.get("metrics", {}), "changed": changed}


def _check_risk(db: Session, user: User, plan: AutomationPlan) -> dict:
    ctx = build_context(db, user)
    inv = investment_agent.analyze(db, user, ctx, with_market=False, allow_llm=False)
    cf = cashflow_agent.analyze(db, user, ctx, allow_llm=False)
    risks = [f for f in (inv.get("findings") or []) + (cf.get("findings") or []) if f.get("level") in ("critical", "high")]
    prev_count = plan.param_dict().get("lastRiskCount")
    changed = prev_count is None or int(prev_count) != len(risks)
    params = plan.param_dict()
    params["lastRiskCount"] = len(risks)
    plan.set_params(params)
    severity = "critical" if any(r.get("level") == "critical" for r in risks) else ("high" if risks else "low")
    summary = f"风险巡检：{len(risks)} 项高风险敞口" + (f"，首要问题「{risks[0].get('title')}」" if risks else "，未见重大风险")
    return {"severity": severity, "summary": summary, "metrics": {"riskCount": len(risks)}, "changed": changed}


_CHECKERS = {
    "retirement": _check_retirement,
    "investment": _check_investment,
    "cashflow": _check_cashflow,
    "risk": _check_risk,
}


# --------------------------------------------------------------------------- #
# 执行
# --------------------------------------------------------------------------- #
def run_plan(db: Session, user: User, plan: AutomationPlan, *, force: bool = False) -> dict:
    now = datetime.now(timezone.utc)
    if not plan.enabled and not force:
        return {"planId": plan.id, "status": "skipped", "reason": "计划已停用", "ranAt": now.isoformat()}

    checker = _CHECKERS.get(plan.agent_kind)
    if checker is None:
        return {"planId": plan.id, "status": "failed", "reason": f"未知 Agent：{plan.agent_kind}"}

    try:
        outcome = checker(db, user, plan)
        status = "success"
    except Exception as exc:  # noqa: BLE001
        logger.exception("plan_run_failed: %s", plan.agent_kind)
        try:
            db.rollback()
        except Exception:  # noqa: BLE001
            pass
        outcome = {"severity": "low", "summary": f"巡检失败：{exc}"[:300], "metrics": {}, "changed": False}
        status = "failed"

    severity = outcome.get("severity", "low")
    plan.last_run_at = now
    plan.run_count = (plan.run_count or 0) + 1
    plan.last_summary = str(outcome.get("summary") or "")[:2000]
    plan.next_run_at = next_run_from(plan.cadence, now)

    # 仅在「结论变化」或「高严重度」时打扰用户
    notified = False
    if status == "success" and (outcome.get("changed") or severity in ("critical", "high")):
        notif_engine.push(
            db,
            user.id,
            title=f"{AGENT_KINDS.get(plan.agent_kind, plan.agent_kind)}巡检结果",
            body=plan.last_summary,
            category="risk" if plan.agent_kind in ("risk", "investment") else "wealth",
            priority=severity,
            source=f"autonomous.plan.{plan.agent_kind}",
            commit=False,
        )
        notified = True
        if severity in ("critical", "high"):
            db.add(
                AutomationAction(
                    user_id=user.id,
                    title=f"处理：{plan.last_summary[:120]}",
                    detail=plan.last_summary,
                    category="risk" if plan.agent_kind in ("risk", "investment") else "wealth",
                    priority=notif_engine.normalize_priority(severity),
                    source_id=plan.id,
                )
            )

    run = AutomationRun(
        user_id=user.id,
        source="agent",
        source_id=plan.id,
        name=plan.name,
        status=status,
        tier="local",
        llm_called=False,
        message=plan.last_summary,
    )
    db.add(run)
    db.commit()

    return {
        "planId": plan.id,
        "agentKind": plan.agent_kind,
        "status": status,
        "severity": severity,
        "summary": plan.last_summary,
        "metrics": outcome.get("metrics", {}),
        "notified": notified,
        "runId": run.id,
        "ranAt": now.isoformat(),
        "nextRunAt": plan.next_run_at.isoformat() if plan.next_run_at else None,
    }


def due_plans(db: Session, limit: int = 20, now: datetime | None = None) -> list[AutomationPlan]:
    now = now or datetime.now(timezone.utc)
    stmt = (
        select(AutomationPlan)
        .where(
            AutomationPlan.enabled.is_(True),
            AutomationPlan.next_run_at.is_not(None),
            AutomationPlan.next_run_at <= now,
        )
        .order_by(AutomationPlan.next_run_at.asc())
        .limit(limit)
    )
    return list(db.scalars(stmt).all())


def tick(db: Session, limit: int = 10) -> list[dict]:
    out: list[dict] = []
    for plan in due_plans(db, limit=limit):
        user = db.get(User, plan.user_id)
        if user is None:
            plan.enabled = False
            db.commit()
            continue
        try:
            out.append(run_plan(db, user, plan))
        except Exception:  # noqa: BLE001
            logger.exception("planner_tick_failed: %s", plan.id)
            try:
                db.rollback()
            except Exception:  # noqa: BLE001
                pass
    return out


def serialize(plan: AutomationPlan) -> dict:
    return {
        "id": plan.id,
        "name": plan.name,
        "description": plan.description,
        "enabled": plan.enabled,
        "agentKind": plan.agent_kind,
        "agentLabel": AGENT_KINDS.get(plan.agent_kind, plan.agent_kind),
        "cadence": plan.cadence,
        "runCount": plan.run_count,
        "lastSummary": plan.last_summary,
        "lastRunAt": plan.last_run_at.isoformat() if plan.last_run_at else None,
        "nextRunAt": plan.next_run_at.isoformat() if plan.next_run_at else None,
        "createdAt": plan.created_at.isoformat() if plan.created_at else None,
    }
