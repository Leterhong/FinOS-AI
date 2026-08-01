# -*- coding: utf-8 -*-
"""
AI CFO Command Center 2.0（首页财富驾驶舱）聚合服务。

一次性聚合：今日财富状态 / AI 发现 / 行动中心 / 风险监控 / 快捷入口。
所有数据异步友好：无数据时各区块返回空结构，前端各自渲染骨架。
"""
from __future__ import annotations

from sqlalchemy import select

from backend.financial.models import Asset, FinancialProfile
from backend.financial.twin_engine import WELCOME_MESSAGE, compute_twin
from backend.intelligence.ltm.service import recall
from backend.intelligence.models import HealthScoreHistory, WealthStrategy
from backend.notification.models import Notification
from backend.user.models import User


def get_dashboard(user: User, db) -> dict:
    profile = db.scalar(select(FinancialProfile).where(FinancialProfile.user_id == user.id))
    assets = list(db.scalars(select(Asset).where(Asset.user_id == user.id)).all())
    twin = compute_twin(profile, assets)
    if not twin.get("hasData"):
        return {"hasData": False, "message": WELCOME_MESSAGE}

    # ---- 今日财富状态 ----
    prev_score = None
    last = db.scalar(
        select(HealthScoreHistory)
        .where(HealthScoreHistory.user_id == user.id)
        .order_by(HealthScoreHistory.created_at.desc())
    )
    if last:
        prev_score = last.total_score
    score_delta = (twin["healthScore"] - prev_score) if prev_score is not None else None

    today = {
        "netWorth": twin["netWorth"],
        "totalAssets": twin["totalAssets"],
        "healthScore": twin["healthScore"],
        "healthScoreDelta": score_delta,
        "savingsRate": twin["savingsRate"],
        "emergencyMonths": twin["emergencyMonths"],
        "riskLevel": twin["riskLevel"],
        "disclaimer": twin.get("disclaimer", ""),
    }

    # ---- AI 发现 ----
    changes = recall(db, user, kinds=("wealth_change",), limit=3, mark_hit=False)
    anomalies = list(
        db.scalars(
            select(Notification)
            .where(Notification.user_id == user.id, Notification.read.is_(False),
                   Notification.severity.in_(["warn", "critical"]))
            .order_by(Notification.created_at.desc())
            .limit(5)
        ).all()
    )
    ai_discover = {
        "recentChanges": [c["content"] for c in changes],
        "anomalies": [{"id": n.id, "title": n.title, "body": n.body, "severity": n.severity} for n in anomalies],
        "opportunities": _opportunities(db, user),
    }

    # ---- 行动中心 ----
    def _actions(horizon: str) -> list[str]:
        rows = list(
            db.scalars(
                select(WealthStrategy)
                .where(WealthStrategy.user_id == user.id, WealthStrategy.horizon == horizon)
                .order_by(WealthStrategy.created_at.desc())
                .limit(3)
            ).all()
        )
        out: list[str] = []
        for r in rows:
            try:
                acts = __import__("json").loads(r.actions)
                out.extend(acts if isinstance(acts, list) else [])
            except Exception:
                if r.title:
                    out.append(r.title)
        return out

    actions = {
        "week": _actions("short"),
        "months": _actions("mid"),
        "longTerm": [twin.get("goal")] if twin.get("goal") else _actions("long"),
    }

    # ---- 风险监控 ----
    risk_alerts: list[str] = []
    if twin["healthScore"] < 60:
        risk_alerts.append("财富健康分偏低，建议优化资产配置与储蓄率。")
    if twin.get("savingsRate", 0) < 0:
        risk_alerts.append("月度现金流为负，存在透支风险。")
    if twin.get("emergencyMonths") is not None and twin["emergencyMonths"] < 3:
        risk_alerts.append(f"应急储备仅覆盖 {twin['emergencyMonths']} 个月支出，建议补足至 3-6 个月。")

    return {
        "hasData": True,
        "today": today,
        "aiDiscover": ai_discover,
        "actions": actions,
        "riskAlerts": risk_alerts,
    }


def _opportunities(db, user: User) -> list[str]:
    decisions = recall(db, user, kinds=("decision",), limit=3, mark_hit=False)
    return [d["content"] for d in decisions] if decisions else ["暂无特别机会提醒。"]
