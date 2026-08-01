# -*- coding: utf-8 -*-
"""
Wealth Avatar（财富数字分身）服务。

把 Financial Twin 升级为"数字我"：聚合个人信息 / 财富状态 / 风险偏好 /
人生目标 / 历史决策 / 未来预测，落库为 WealthAvatar 行（按 user_id 幂等）。
"""
from __future__ import annotations

import json
from datetime import datetime, timezone

from sqlalchemy import select

from backend.financial.models import Asset, FinancialProfile
from backend.financial.twin_engine import WELCOME_MESSAGE, compute_twin
from backend.intelligence.ltm.service import KIND_LABELS, recall
from backend.personal_os.models import WealthAvatar
from backend.user.models import User


def _load_twin(user: User, db):
    profile = db.scalar(select(FinancialProfile).where(FinancialProfile.user_id == user.id))
    assets = list(db.scalars(select(Asset).where(Asset.user_id == user.id)).all())
    return compute_twin(profile, assets), profile


def _recall_occupation(db, user: User) -> str:
    """职业信息来自长期记忆（preference/life_stage 中 key 含 occupation/job/career）。"""
    for kind in ("preference", "life_stage"):
        for item in recall(db, user, kinds=(kind,), limit=20, mark_hit=False) or []:
            key = str(item.get("key", "")).lower()
            if any(w in key for w in ("occupation", "job", "career", "profession")):
                content = str(item.get("content", "")).strip()
                if content:
                    return content
    return ""


def _memory_groups(user: User, db: "object") -> dict:
    groups: dict[str, list[dict]] = {}
    for kind in KIND_LABELS:
        items = recall(db, user, kinds=(kind,), limit=20, mark_hit=False)
        if items:
            groups[kind] = items
    return groups


def build_avatar(user: User, db) -> dict:
    """构建（并落库）财富数字分身。无数据返回欢迎态。"""
    twin, profile = _load_twin(user, db)
    if not twin.get("hasData"):
        return {"hasData": False, "message": WELCOME_MESSAGE}

    # 个人信息摘要
    # 注意：FinancialProfile 不含 occupation 字段，职业只可能来自长期记忆（preference）。
    # 用 getattr 兜底，避免未来加字段时再改一次。
    age = profile.age if profile and profile.age else None
    occupation = getattr(profile, "occupation", None) or _recall_occupation(db, user) or "未填写"
    life_stage = (recall(db, user, kinds=("life_stage",), limit=1, mark_hit=False) or [{}])[0].get(
        "content", ""
    )
    profile_summary = f"年龄：{age if age else '未知'}\n职业：{occupation}\n人生阶段：{life_stage or '未归类'}"

    # 财富状态摘要
    financial_status = (
        f"净资产：¥{twin['netWorth']:,.0f}\n"
        f"财富健康分：{twin['healthScore']}\n"
        f"月度结余：¥{twin.get('momentsurplus', twin.get('surplus', 0.0)):,.0f}\n"
        f"储蓄率：{twin['savingsRate']:.1%}"
    )

    # 未来预测摘要
    proj = twin.get("projection") or []
    future_outlook = (
        "未来资产预测："
        + "；".join(f"{p['year']}年后约 ¥{p['value']:,.0f}" for p in proj)
        if proj
        else "暂无预测"
    )

    avatar = db.scalar(select(WealthAvatar).where(WealthAvatar.user_id == user.id))
    if avatar is None:
        avatar = WealthAvatar(user_id=user.id)
        db.add(avatar)
    avatar.profile_summary = profile_summary
    avatar.financial_status = financial_status
    avatar.life_stage = life_stage
    avatar.risk_preference = twin.get("riskLevel", "balanced")
    avatar.future_outlook = future_outlook
    avatar.updated_at = datetime.now(timezone.utc)
    db.commit()

    memories = _memory_groups(user, db)
    return {
        "hasData": True,
        "avatar": {
            "id": avatar.id,
            "avatarName": avatar.avatar_name,
            "profileSummary": avatar.profile_summary,
            "financialStatus": avatar.financial_status,
            "lifeStage": avatar.life_stage,
            "riskPreference": avatar.risk_preference,
            "futureOutlook": avatar.future_outlook,
            "updatedAt": avatar.updated_at.isoformat() if avatar.updated_at else None,
        },
        "twin": twin,
        "memories": memories,
        "future": proj,
    }


def rename_avatar(user: User, db, avatar_name: str) -> dict:
    avatar = db.scalar(select(WealthAvatar).where(WealthAvatar.user_id == user.id))
    if avatar is None:
        avatar = WealthAvatar(user_id=user.id)
        db.add(avatar)
    avatar.avatar_name = avatar_name[:120]
    avatar.updated_at = datetime.now(timezone.utc)
    db.commit()
    return {"id": avatar.id, "avatarName": avatar.avatar_name}
