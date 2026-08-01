"""长期记忆 2.0（Phase 7.1 需求八）。

四类记忆：
- preference    用户偏好（风险偏好、投资倾向、表达偏好）
- life_stage    人生阶段（年龄段、婚育、职业阶段）
- decision      历史决策（做过哪些模拟、选了哪个方案）
- wealth_change 财富变化（净资产/健康分的显著变动）

设计要点：
1. 幂等：同 (user_id, kind, key) 覆盖更新，避免记忆无限膨胀。
2. 可召回：按 importance × 新鲜度 排序，供分析时注入上下文（需求八「历史目标自动被引用」）。
3. 隔离：所有读写强制 user_id 过滤。
4. 零 LLM：记忆写入与召回全部为结构化操作。
"""
from __future__ import annotations

import json
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.intelligence.context import WealthContext
from backend.intelligence.models import LongTermMemory
from backend.user.models import User

KIND_LABELS = {
    "preference": "偏好",
    "life_stage": "人生阶段",
    "decision": "历史决策",
    "wealth_change": "财富变化",
}


def remember(
    db: Session,
    user: User,
    kind: str,
    key: str,
    content: str,
    *,
    payload: dict | None = None,
    importance: float = 0.5,
) -> LongTermMemory:
    """写入/更新一条长期记忆（同 key 覆盖，幂等）。"""
    kind = kind if kind in KIND_LABELS else "preference"
    row = db.scalar(
        select(LongTermMemory).where(
            LongTermMemory.user_id == user.id,
            LongTermMemory.kind == kind,
            LongTermMemory.key == key,
        )
    )
    if row is None:
        row = LongTermMemory(user_id=user.id, kind=kind, key=key)
        db.add(row)
    row.content = content
    row.payload = json.dumps(payload or {}, ensure_ascii=False, default=str)
    row.importance = max(0.0, min(1.0, importance))
    row.updated_at = datetime.now(timezone.utc)
    db.commit()
    return row


def recall(
    db: Session,
    user: User,
    kinds: tuple[str, ...] | None = None,
    limit: int = 12,
    *,
    mark_hit: bool = True,
) -> list[dict]:
    """召回记忆：按重要度 + 更新时间排序。"""
    stmt = select(LongTermMemory).where(LongTermMemory.user_id == user.id)
    if kinds:
        stmt = stmt.where(LongTermMemory.kind.in_(list(kinds)))
    rows = list(
        db.scalars(
            stmt.order_by(LongTermMemory.importance.desc(), LongTermMemory.updated_at.desc()).limit(limit)
        ).all()
    )
    if mark_hit and rows:
        for r in rows:
            r.hit_count = (r.hit_count or 0) + 1
        db.commit()
    out = []
    for r in rows:
        try:
            payload = json.loads(r.payload)
        except (json.JSONDecodeError, TypeError):
            payload = {}
        out.append(
            {
                "id": r.id,
                "kind": r.kind,
                "kindLabel": KIND_LABELS.get(r.kind, r.kind),
                "key": r.key,
                "content": r.content,
                "payload": payload,
                "importance": r.importance,
                "hitCount": r.hit_count,
                "updatedAt": r.updated_at.isoformat() if r.updated_at else None,
            }
        )
    return out


def build_memory_context(db: Session, user: User, limit: int = 10) -> str:
    """把记忆拼成给分析/LLM 用的文本上下文。空则返回空串。"""
    items = recall(db, user, limit=limit)
    if not items:
        return ""
    lines = [f"- [{i['kindLabel']}] {i['content']}" for i in items]
    return "用户长期记忆：\n" + "\n".join(lines)


def sync_from_profile(db: Session, user: User, ctx: WealthContext) -> list[str]:
    """从财富上下文自动沉淀「偏好 / 人生阶段 / 目标」记忆（幂等）。"""
    written: list[str] = []
    if not ctx.has_data:
        return written

    remember(
        db, user, "preference", "risk_level",
        f"风险偏好为「{ctx.risk_level}」，对应参考年化收益假设 {ctx.base_annual_return:.1%}。",
        payload={"riskLevel": ctx.risk_level}, importance=0.8,
    )
    written.append("risk_level")

    if ctx.goal_text:
        remember(
            db, user, "preference", "wealth_goal",
            f"财富目标：{ctx.goal_text}" + (f"（解析金额 ¥{ctx.goal_amount:,.0f}）" if ctx.goal_amount else ""),
            payload={"goal": ctx.goal_text, "goalAmount": ctx.goal_amount}, importance=0.95,
        )
        written.append("wealth_goal")

    if ctx.age is not None:
        stage = _life_stage(int(ctx.age))
        remember(
            db, user, "life_stage", "age_stage",
            f"当前 {int(ctx.age)} 岁，处于「{stage}」阶段。",
            payload={"age": int(ctx.age), "stage": stage}, importance=0.7,
        )
        written.append("age_stage")
    return written


def _life_stage(age: int) -> str:
    if age < 26:
        return "职业起步期"
    if age < 36:
        return "财富积累期"
    if age < 46:
        return "家庭建设期"
    if age < 56:
        return "资产稳固期"
    if age < 65:
        return "退休准备期"
    return "退休期"


def capture_decision(db: Session, user: User, label: str, summary: str, payload: dict | None = None) -> None:
    """记录一次历史决策（模拟 / 方案选择），供后续分析引用。"""
    key = f"decision:{label}"
    remember(db, user, "decision", key, f"曾模拟「{label}」：{summary}", payload=payload, importance=0.6)


def capture_wealth_change(db: Session, user: User, ctx: WealthContext, score: dict | None = None) -> None:
    """记录财富变化：仅在与上次记录相比出现显著变动时写入，避免噪音。"""
    key = "net_worth_snapshot"
    row = db.scalar(
        select(LongTermMemory).where(
            LongTermMemory.user_id == user.id,
            LongTermMemory.kind == "wealth_change",
            LongTermMemory.key == key,
        )
    )
    prev = None
    if row is not None:
        try:
            prev = json.loads(row.payload).get("netWorth")
        except (json.JSONDecodeError, TypeError):
            prev = None

    current = ctx.net_worth
    if prev is not None and prev != 0:
        change = (current - prev) / abs(prev)
        if abs(change) < 0.05:
            return  # 变动不足 5%，不写记忆
        direction = "上升" if change > 0 else "下降"
        content = f"净资产由 ¥{prev:,.0f} {direction}至 ¥{current:,.0f}（{change:+.1%}）。"
    else:
        content = f"净资产记录为 ¥{current:,.0f}。"
    if score and score.get("hasData"):
        content += f" 当前财富健康分 {score['totalScore']}（{score['level']}）。"
    remember(
        db, user, "wealth_change", key, content,
        payload={"netWorth": current, "healthScore": (score or {}).get("totalScore")},
        importance=0.75,
    )


def delete_memory(db: Session, user: User, memory_id: str) -> bool:
    row = db.scalar(
        select(LongTermMemory).where(
            LongTermMemory.id == memory_id, LongTermMemory.user_id == user.id
        )
    )
    if row is None:
        return False
    db.delete(row)
    db.commit()
    return True
