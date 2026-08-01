# -*- coding: utf-8 -*-
"""
财富时间线 Wealth Timeline 服务。

聚合：过去（财富变化 / 用户自定义事件）、现在（健康状态）、未来（预测 / 目标 / 自定义事件）。
系统派生节点不可删除；用户自定义节点可删除。
"""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import select

from backend.financial.models import Asset, FinancialProfile
from backend.financial.twin_engine import WELCOME_MESSAGE, compute_twin
from backend.intelligence.ltm.service import recall
from backend.personal_os.models import TimelineEvent
from backend.user.models import User


def _serialize_event(e: TimelineEvent) -> dict:
    return {
        "id": e.id,
        "title": e.title,
        "category": e.category,
        "eventDate": e.event_date,
        "description": e.description,
        "source": e.source,
        "importance": e.importance,
        "deletable": e.source == "user",
    }


def build_timeline(user: User, db) -> dict:
    profile = db.scalar(select(FinancialProfile).where(FinancialProfile.user_id == user.id))
    assets = list(db.scalars(select(Asset).where(Asset.user_id == user.id)).all())
    twin = compute_twin(profile, assets)
    if not twin.get("hasData"):
        return {"hasData": False, "message": WELCOME_MESSAGE}

    now_year = datetime.now(timezone.utc).year

    # ---- 过去 ----
    past: list[dict] = []
    for m in recall(db, user, kinds=("wealth_change",), limit=10, mark_hit=False):
        ts = (m.get("updatedAt") or "")[:10]
        past.append(
            {
                "id": f"mem:{m['id']}",
                "title": m["content"],
                "eventDate": ts,
                "description": "由 AI 从财富变化自动记录",
                "source": "ai",
                "importance": m.get("importance", 0.5),
                "deletable": False,
            }
        )
    for e in db.scalars(
        select(TimelineEvent)
        .where(TimelineEvent.user_id == user.id, TimelineEvent.category == "past")
        .order_by(TimelineEvent.event_date)
    ).all():
        past.append(_serialize_event(e))

    # ---- 现在 ----
    now_nodes = [
        {
            "id": "now:health",
            "title": f"当前财富健康分 {twin['healthScore']}",
            "eventDate": str(now_year),
            "description": (
                f"净资产 ¥{twin['netWorth']:,.0f}；月度结余 ¥{twin.get('momentsurplus', 0):,.0f}；"
                f"储蓄率 {twin['savingsRate']:.1%}"
            ),
            "source": "system",
            "importance": 1.0,
            "deletable": False,
        }
    ]

    # ---- 未来 ----
    future: list[dict] = []
    for p in twin.get("projection") or []:
        yr = p.get("year")
        future.append(
            {
                "id": f"proj:{yr}",
                "title": f"{yr} 年后资产预测",
                "eventDate": str(now_year + int(yr)),
                "description": f"按风险偏好预测约 ¥{p['value']:,.0f}",
                "source": "ai",
                "importance": 0.8,
                "deletable": False,
            }
        )
    goal = twin.get("goal")
    if goal:
        future.append(
            {
                "id": "goal:main",
                "title": f"财富目标：{goal}",
                "eventDate": "目标",
                "description": "来自你的财富目标设定",
                "source": "system",
                "importance": 0.9,
                "deletable": False,
            }
        )
    for e in db.scalars(
        select(TimelineEvent)
        .where(TimelineEvent.user_id == user.id, TimelineEvent.category == "future")
        .order_by(TimelineEvent.event_date)
    ).all():
        future.append(_serialize_event(e))

    events = [
        _serialize_event(e)
        for e in db.scalars(
            select(TimelineEvent)
            .where(TimelineEvent.user_id == user.id)
            .order_by(TimelineEvent.event_date)
        ).all()
    ]

    return {
        "hasData": True,
        "past": past,
        "now": now_nodes,
        "future": future,
        "events": events,
    }


def add_event(user: User, db, title: str, category: str, event_date: str, description: str = "") -> dict:
    category = category if category in ("past", "now", "future") else "future"
    e = TimelineEvent(
        user_id=user.id,
        title=title[:200],
        category=category,
        event_date=event_date[:20],
        description=description,
        source="user",
        importance=0.6,
    )
    db.add(e)
    db.commit()
    return _serialize_event(e)


def delete_event(user: User, db, event_id: str) -> bool:
    e = db.scalar(
        select(TimelineEvent).where(TimelineEvent.id == event_id, TimelineEvent.user_id == user.id)
    )
    if e is None or e.source != "user":
        return False
    db.delete(e)
    db.commit()
    return True
