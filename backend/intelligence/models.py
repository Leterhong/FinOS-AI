"""Phase 7.1 Wealth Intelligence 数据表（用户隔离，强制 user_id 外键 + 复合索引）。

五张新表：
- WealthPrediction   预测快照（1/5/10 年资产、现金流、退休资金、目标概率、Timeline）
- ScenarioSimulation 人生事件情景模拟（买房/换工作/创业/结婚/生育/退休/留学）
- WealthStrategy     财富策略（短期/中期/长期 + 方案 A/B/C）
- HealthScoreHistory 六维健康评分历史
- LongTermMemory     长期记忆 2.0（偏好/人生阶段/历史决策/财富变化）
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import (
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


class WealthPrediction(Base):
    """财富预测快照。payload 存完整预测 JSON（含 assumptions + timeline）。"""

    __tablename__ = "wealth_predictions"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(String(32), ForeignKey("users.id"), index=True, nullable=False)
    horizon_years: Mapped[int] = mapped_column(Integer, default=10)
    net_worth_1y: Mapped[float] = mapped_column(Float, default=0.0)
    net_worth_5y: Mapped[float] = mapped_column(Float, default=0.0)
    net_worth_10y: Mapped[float] = mapped_column(Float, default=0.0)
    retirement_gap: Mapped[float] = mapped_column(Float, default=0.0)  # 退休资金缺口（正=缺口）
    goal_probability: Mapped[float] = mapped_column(Float, default=0.0)  # 0-1
    assumptions: Mapped[str] = mapped_column(Text, default="{}")
    payload: Mapped[str] = mapped_column(Text, default="{}")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, index=True)

    __table_args__ = (Index("ix_wealth_predictions_user_created", "user_id", "created_at"),)


class ScenarioSimulation(Base):
    """人生事件情景模拟结果。baseline / scenario 均为 JSON 快照。"""

    __tablename__ = "scenario_simulations"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(String(32), ForeignKey("users.id"), index=True, nullable=False)
    event_type: Mapped[str] = mapped_column(String(40), default="custom", index=True)
    label: Mapped[str] = mapped_column(String(200), default="")
    params: Mapped[str] = mapped_column(Text, default="{}")
    baseline: Mapped[str] = mapped_column(Text, default="{}")
    scenario: Mapped[str] = mapped_column(Text, default="{}")
    impact: Mapped[str] = mapped_column(Text, default="{}")  # 差异（净值/现金流/健康分/达成概率）
    explanation: Mapped[str] = mapped_column(Text, default="")  # 原因/影响/建议 三段式
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, index=True)

    __table_args__ = (Index("ix_scenario_simulations_user_created", "user_id", "created_at"),)


class WealthStrategy(Base):
    """财富策略（短期 0-1 年 / 中期 1-5 年 / 长期 5 年以上）。"""

    __tablename__ = "wealth_strategies"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(String(32), ForeignKey("users.id"), index=True, nullable=False)
    horizon: Mapped[str] = mapped_column(String(20), default="short", index=True)  # short/mid/long
    plan_key: Mapped[str] = mapped_column(String(10), default="A", index=True)  # A/B/C 方案
    title: Mapped[str] = mapped_column(String(200), default="")
    actions: Mapped[str] = mapped_column(Text, default="[]")  # JSON 行动清单
    expected_effect: Mapped[str] = mapped_column(Text, default="{}")  # JSON 预期效果
    tier: Mapped[str] = mapped_column(String(10), default="local")  # local/ai
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, index=True)

    __table_args__ = (Index("ix_wealth_strategies_user_created", "user_id", "created_at"),)


class HealthScoreHistory(Base):
    """六维健康评分历史（资产/现金流/风险/目标/投资/保障）。"""

    __tablename__ = "health_score_history"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(String(32), ForeignKey("users.id"), index=True, nullable=False)
    total_score: Mapped[int] = mapped_column(Integer, default=0)
    asset_score: Mapped[int] = mapped_column(Integer, default=0)
    cashflow_score: Mapped[int] = mapped_column(Integer, default=0)
    risk_score: Mapped[int] = mapped_column(Integer, default=0)
    goal_score: Mapped[int] = mapped_column(Integer, default=0)
    investment_score: Mapped[int] = mapped_column(Integer, default=0)
    protection_score: Mapped[int] = mapped_column(Integer, default=0)
    detail: Mapped[str] = mapped_column(Text, default="{}")  # 每维度的原因/影响/建议
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, index=True)

    __table_args__ = (Index("ix_health_score_history_user_created", "user_id", "created_at"),)


class LongTermMemory(Base):
    """长期记忆 2.0：结构化、可召回、带权重与时效。

    kind: preference（偏好） / life_stage（人生阶段） / decision（历史决策） / wealth_change（财富变化）
    """

    __tablename__ = "long_term_memories"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(String(32), ForeignKey("users.id"), index=True, nullable=False)
    kind: Mapped[str] = mapped_column(String(30), default="preference", index=True)
    key: Mapped[str] = mapped_column(String(120), default="", index=True)  # 同 key 覆盖更新（幂等）
    content: Mapped[str] = mapped_column(Text, default="")
    payload: Mapped[str] = mapped_column(Text, default="{}")  # 结构化补充数据
    importance: Mapped[float] = mapped_column(Float, default=0.5)  # 0-1，召回排序权重
    hit_count: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, index=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)

    __table_args__ = (
        Index("ix_long_term_memories_user_kind", "user_id", "kind"),
        Index("ix_long_term_memories_user_key", "user_id", "key"),
    )
