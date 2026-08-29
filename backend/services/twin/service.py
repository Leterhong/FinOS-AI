"""Twin 服务（Phase 7.0.2 需求二/三）：计算 + 持久化快照历史。

compute_and_save(db, user) → 调 backend.financial.twin_engine 计算，
写入 financial_twins 表（net_worth/cash_flow/risk_score/health_score/goal_progress/snapshot），
返回最新 Twin 状态 + 历史快照列表。无数据返回欢迎状态（绝不伪造）。
"""
from __future__ import annotations

import json
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.financial.models import Asset, FinancialProfile
from backend.financial.twin_engine import WELCOME_MESSAGE, compute_twin
from backend.services.models import FinancialTwin
from backend.user.models import User


def _risk_score(allocation_pct: dict) -> float:
    """风险暴露评分（0-100）：集中度 + 负债占比越高风险越大。"""
    top = max(allocation_pct.values(), default=0.0)
    concentration = max(0.0, top - 0.5) * 100  # 超 50% 单一资产开始计风险
    # allocation_pct 由 twin_engine 计算，负债以正数占比表示（此前误加负号恒为 0）。
    liability_pct = max(0.0, allocation_pct.get("liability", 0.0))
    debt_risk = min(liability_pct, 1.0) * 40
    return round(min(100.0, concentration + debt_risk), 2)


def compute_and_save(db: Session, user: User) -> dict:
    profile = db.scalar(select(FinancialProfile).where(FinancialProfile.user_id == user.id))
    assets = list(db.scalars(select(Asset).where(Asset.user_id == user.id)))
    twin = compute_twin(profile, assets)
    if not twin.get("hasData"):
        return {**twin, "history": []}

    risk_score = _risk_score(twin.get("allocation", {}))
    goal_progress = _goal_progress(twin, profile)
    # 快照必须包含 riskScore/goalProgress：monitor 变化检测依赖与上一快照对比，
    # 此前这两个键只存在于返回值，导致对比基准恒为 0、每次运行都误报。
    snapshot_payload = {
        **twin,
        "riskScore": risk_score,
        "goalProgress": goal_progress,
    }
    snapshot = FinancialTwin(
        user_id=user.id,
        net_worth=twin.get("netWorth", 0.0),
        cash_flow=twin.get("monthlySurplus", 0.0),
        risk_score=risk_score,
        health_score=twin.get("healthScore", 0),
        goal_progress=goal_progress,
        snapshot=json.dumps(snapshot_payload, ensure_ascii=False, default=str),
    )
    db.add(snapshot)
    _prune_history(db, user.id)
    db.commit()
    return {**twin, "riskScore": risk_score, "goalProgress": goal_progress, "history": history(db, user)}


_MAX_TWIN_SNAPSHOTS = 50


def _prune_history(db: Session, user_id: str) -> None:
    """只保留最近 N 条快照，防止每次监控都插行的表无限膨胀。"""
    ids = db.scalars(
        select(FinancialTwin.id)
        .where(FinancialTwin.user_id == user_id)
        .order_by(FinancialTwin.created_at.desc(), FinancialTwin.id.desc())
        .offset(_MAX_TWIN_SNAPSHOTS)
        .limit(500)
    ).all()
    if ids:
        from sqlalchemy import delete

        db.execute(delete(FinancialTwin).where(FinancialTwin.id.in_(ids)))


def _goal_progress(twin: dict, profile: FinancialProfile | None) -> float:
    """目标完成度：以净资产对比用户自设目标金额。

    统一使用 intelligence/context.parse_goal_amount：排除「50岁/10年」等
    时间与年龄表述、支持「亿」单位——此前本地正则会把「50岁退休」解析成
    目标 50 元、进度 100%。
    """
    if not profile or not profile.goal:
        return 0.0
    from backend.intelligence.context import parse_goal_amount

    target = parse_goal_amount(profile.goal)
    if not target or target <= 0:
        return 0.0
    return round(min(1.0, max(0.0, twin.get("netWorth", 0.0) / target)), 4)


def get_latest(db: Session, user: User) -> dict:
    row = db.scalar(
        select(FinancialTwin)
        .where(FinancialTwin.user_id == user.id)
        .order_by(FinancialTwin.created_at.desc())
    )
    if row is None:
        profile = db.scalar(select(FinancialProfile).where(FinancialProfile.user_id == user.id))
        assets = list(db.scalars(select(Asset).where(Asset.user_id == user.id)))
        if profile is None and not assets:
            return {"hasData": False, "message": WELCOME_MESSAGE, "history": []}
        return {**compute_twin(profile, assets), "history": []}
    try:
        twin = json.loads(row.snapshot)
    except (json.JSONDecodeError, TypeError):
        twin = {}
    twin.update(
        {
            "riskScore": row.risk_score,
            "goalProgress": row.goal_progress,
            "snapshotId": row.id,
            "computedAt": row.created_at.isoformat() if row.created_at else None,
        }
    )
    return twin


def history(db: Session, user: User, limit: int = 20) -> list[dict]:
    rows = db.scalars(
        select(FinancialTwin)
        .where(FinancialTwin.user_id == user.id)
        .order_by(FinancialTwin.created_at.desc())
        .limit(limit)
    ).all()
    return [
        {
            "snapshotId": r.id,
            "netWorth": r.net_worth,
            "cashFlow": r.cash_flow,
            "riskScore": r.risk_score,
            "healthScore": r.health_score,
            "goalProgress": r.goal_progress,
            "createdAt": r.created_at.isoformat() if r.created_at else None,
        }
        for r in rows
    ]
