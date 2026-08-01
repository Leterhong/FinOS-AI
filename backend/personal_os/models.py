# -*- coding: utf-8 -*-
"""
Phase 7.3 FinOS AI Personal OS — 数据表。

新增 6 张表：
- WealthAvatar      财富数字分身（Financial Twin 升级为 Wealth Avatar）
- TimelineEvent     财富时间线节点（系统派生 + 用户自定义人生事件）
- KnowledgeItem     个人财富知识中心条目
- DecisionJournal   AI 决策记录（问题/分析/方案/用户选择）
- PlanVersion       方案历史版本（同一主题的 V1/V2...）
- DailyBriefing     每日财富日报（主动陪伴）

设计铁律（沿用全局）：强制 user_id 外键 + 复合索引；所有读写经 service 加 user_id 过滤。
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column

from backend.database.base import Base


def _uuid() -> str:
    return uuid.uuid4().hex


def _now() -> datetime:
    return datetime.now(timezone.utc)


class WealthAvatar(Base):
    """财富数字分身：用户财富世界的"数字我"。

    聚合：个人信息 / 财富状态 / 风险偏好 / 人生目标 / 历史决策 / 未来预测。
    """

    __tablename__ = "wealth_avatars"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(
        String(32), ForeignKey("users.id"), index=True, nullable=False
    )
    avatar_name: Mapped[str] = mapped_column(String(120), default="我的财富分身")
    profile_summary: Mapped[str] = mapped_column(Text, default="")  # 个人信息摘要（年龄/职业/人生阶段）
    financial_status: Mapped[str] = mapped_column(Text, default="")  # 财富状态摘要（净值/健康分/现金流）
    life_stage: Mapped[str] = mapped_column(String(40), default="")
    risk_preference: Mapped[str] = mapped_column(String(20), default="balanced")
    future_outlook: Mapped[str] = mapped_column(Text, default="")  # 未来预测摘要
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)

    __table_args__ = (Index("ix_wealth_avatars_user", "user_id"),)


class TimelineEvent(Base):
    """财富时间线节点。

    category: past / now / future
    source:   system（自动派生） / user（用户自定义） / ai（AI 生成）
    """

    __tablename__ = "timeline_events"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(
        String(32), ForeignKey("users.id"), index=True, nullable=False
    )
    title: Mapped[str] = mapped_column(String(200), default="")
    category: Mapped[str] = mapped_column(String(10), default="future", index=True)
    event_date: Mapped[str] = mapped_column(String(20), default="", index=True)  # "2026" / "2026-08" / ISO
    description: Mapped[str] = mapped_column(Text, default="")
    source: Mapped[str] = mapped_column(String(10), default="system")
    importance: Mapped[float] = mapped_column(Float, default=0.5)
    payload: Mapped[str] = mapped_column(Text, default="{}")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, index=True)

    __table_args__ = (Index("ix_timeline_events_user_created", "user_id", "created_at"),)


class KnowledgeItem(Base):
    """个人财富知识中心条目。

    source:  upload（用户上传） / ai（AI 生成） / report（历史报告）
    """

    __tablename__ = "knowledge_items"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(
        String(32), ForeignKey("users.id"), index=True, nullable=False
    )
    title: Mapped[str] = mapped_column(String(200), default="")
    content: Mapped[str] = mapped_column(Text, default="")
    source: Mapped[str] = mapped_column(String(20), default="upload", index=True)
    source_ref: Mapped[str] = mapped_column(String(32), default="")  # 关联 report id / 外部引用
    category: Mapped[str] = mapped_column(String(40), default="general", index=True)
    tags: Mapped[str] = mapped_column(Text, default="[]")  # JSON 数组
    favorite: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)

    __table_args__ = (Index("ix_knowledge_items_user_created", "user_id", "created_at"),)


class DecisionJournal(Base):
    """AI 决策记录：用户提问 → AI 分析 → 方案 → 用户选择，供未来复盘。"""

    __tablename__ = "decision_journals"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(
        String(32), ForeignKey("users.id"), index=True, nullable=False
    )
    question: Mapped[str] = mapped_column(Text, default="")
    analysis: Mapped[str] = mapped_column(Text, default="")  # AI 分析过程
    recommendation: Mapped[str] = mapped_column(Text, default="")  # 推荐方案
    chosen_plan: Mapped[str] = mapped_column(Text, default="")  # 用户最终选择
    alternatives: Mapped[str] = mapped_column(Text, default="")  # 备选方案
    payload: Mapped[str] = mapped_column(Text, default="{}")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, index=True)

    __table_args__ = (Index("ix_decision_journals_user_created", "user_id", "created_at"),)


class PlanVersion(Base):
    """方案历史版本：同一主题（退休/投资/现金流...）的 V1/V2... 演进。"""

    __tablename__ = "plan_versions"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(
        String(32), ForeignKey("users.id"), index=True, nullable=False
    )
    subject: Mapped[str] = mapped_column(String(40), default="general", index=True)  # retirement/investment/...
    version: Mapped[int] = mapped_column(Integer, default=1)
    title: Mapped[str] = mapped_column(String(200), default="")
    content: Mapped[str] = mapped_column(Text, default="")
    change_note: Mapped[str] = mapped_column(Text, default="")  # 相对上一版的变化
    payload: Mapped[str] = mapped_column(Text, default="{}")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, index=True)

    __table_args__ = (Index("ix_plan_versions_user_subject", "user_id", "subject"),)


class DailyBriefing(Base):
    """每日财富日报（主动陪伴系统核心产物）。"""

    __tablename__ = "daily_briefings"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(
        String(32), ForeignKey("users.id"), index=True, nullable=False
    )
    brief_date: Mapped[str] = mapped_column(String(12), default="", index=True)  # YYYY-MM-DD
    greeting: Mapped[str] = mapped_column(Text, default="")
    wealth_change: Mapped[str] = mapped_column(Text, default="")
    reminders: Mapped[str] = mapped_column(Text, default="")
    actions: Mapped[str] = mapped_column(Text, default="")
    tone: Mapped[str] = mapped_column(String(10), default="neutral")  # neutral/positive/warning
    payload: Mapped[str] = mapped_column(Text, default="{}")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, index=True)

    __table_args__ = (Index("ix_daily_briefings_user_date", "user_id", "brief_date"),)
