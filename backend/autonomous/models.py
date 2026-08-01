# -*- coding: utf-8 -*-
"""
backend/autonomous/models.py — Phase 7.4 智能自动化 + AI 主动服务系统 数据模型。

全部表强制 user_id 隔离；created_at 带索引（复合索引 user_id+created_at）。
表名加 automation_ / autonomy_ 前缀，避免与既有 notifications / async_tasks 冲突。

表清单：
  automation_rules         自动化规则（触发器条件 + 动作链）
  automation_workflows     if/then 工作流
  automation_scheduled    定时任务（每日/每周/每月/事件/单次）
  automation_webhooks      出站 Webhook 配置
  automation_runs          Agent / 自动化运行记录
  automation_actions      Action Center 行动项（完成/忽略/延期 + 反馈）
  automation_market_cache 市场数据缓存（真实数据接口降级用）
  automation_preferences  用户偏好学习画像
  automation_plans        长期运行计划（退休/投资 Agent 周期巡检）
  automation_snapshots     财富快照（事件驱动对比基线）
  automation_events        事件总线审计（资产/收入/支出/目标/风险变化）
"""
from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import (
    Boolean,
    DateTime,
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


def _json_dumps(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, default=str)


# --------------------------------------------------------------------------- #
# 1. 自动化规则（触发器条件 DSL + 动作链）
# --------------------------------------------------------------------------- #
class AutomationRule(Base):
    __tablename__ = "automation_rules"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(String(32), ForeignKey("users.id"), index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="")
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    # 触发类型：event（事件驱动）/ schedule（定时）/ manual
    trigger_type: Mapped[str] = mapped_column(String(20), default="event", index=True)
    # 条件 DSL：{"metric":"income","op":"drop_pct","threshold":30,...}
    conditions: Mapped[str] = mapped_column(Text, default="[]")  # JSON list
    # 动作链：[{"type":"create_notification","params":{...}}, ...]
    actions: Mapped[str] = mapped_column(Text, default="[]")  # JSON list
    # 成本档位：local / light / ai（继承 Phase 6.5 成本控制）
    tier: Mapped[str] = mapped_column(String(10), default="local")
    # 冷却秒数，避免同一规则反复触发
    cooldown_seconds: Mapped[int] = mapped_column(Integer, default=3600)
    last_triggered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    trigger_count: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, index=True)

    __table_args__ = (Index("ix_auto_rules_user_created", "user_id", "created_at"),)

    # helpers
    def cond_list(self) -> list[dict]:
        try:
            return json.loads(self.conditions) if self.conditions else []
        except Exception:  # noqa: BLE001
            return []

    def action_list(self) -> list[dict]:
        try:
            return json.loads(self.actions) if self.actions else []
        except Exception:  # noqa: BLE001
            return []

    def set_conditions(self, val: Any) -> None:
        self.conditions = _json_dumps(val)

    def set_actions(self, val: Any) -> None:
        self.actions = _json_dumps(val)


# --------------------------------------------------------------------------- #
# 2. if/then 工作流
# --------------------------------------------------------------------------- #
class AutomationWorkflow(Base):
    __tablename__ = "automation_workflows"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(String(32), ForeignKey("users.id"), index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="")
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    # 节点链：[{"if":{"metric":...,"op":...,"threshold":...},"then":[{"type":...,"params":{}}]}]
    steps: Mapped[str] = mapped_column(Text, default="[]")  # JSON list
    tier: Mapped[str] = mapped_column(String(10), default="local")
    last_run_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    run_count: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, index=True)

    __table_args__ = (Index("ix_auto_wf_user_created", "user_id", "created_at"),)

    def step_list(self) -> list[dict]:
        try:
            return json.loads(self.steps) if self.steps else []
        except Exception:  # noqa: BLE001
            return []

    def set_steps(self, val: Any) -> None:
        self.steps = _json_dumps(val)


# --------------------------------------------------------------------------- #
# 3. 定时任务
# --------------------------------------------------------------------------- #
class AutomationScheduled(Base):
    __tablename__ = "automation_scheduled"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(String(32), ForeignKey("users.id"), index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    # 频率：daily / weekly / monthly / event / once
    frequency: Mapped[str] = mapped_column(String(20), default="daily", index=True)
    # 任务类型：daily_briefing / weekly_summary / monthly_report / yearly_report / custom
    task_type: Mapped[str] = mapped_column(String(40), default="daily_briefing")
    # 执行参数（JSON）
    params: Mapped[str] = mapped_column(Text, default="{}")
    # cron 风格字段（周几 0-6 / 每月几号 / 小时）
    hour: Mapped[int] = mapped_column(Integer, default=8)
    weekday: Mapped[int] = mapped_column(Integer, default=1)  # 0=Monday
    day_of_month: Mapped[int] = mapped_column(Integer, default=1)
    # 上次 / 下次运行时间
    last_run_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    next_run_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    run_count: Mapped[int] = mapped_column(Integer, default=0)
    tier: Mapped[str] = mapped_column(String(10), default="local")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, index=True)

    __table_args__ = (Index("ix_auto_sched_user_next", "user_id", "next_run_at"),)

    def param_dict(self) -> dict:
        try:
            return json.loads(self.params) if self.params else {}
        except Exception:  # noqa: BLE001
            return {}

    def set_params(self, val: Any) -> None:
        self.params = _json_dumps(val)


# --------------------------------------------------------------------------- #
# 4. 出站 Webhook 配置
# --------------------------------------------------------------------------- #
class AutomationWebhook(Base):
    __tablename__ = "automation_webhooks"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(String(32), ForeignKey("users.id"), index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    url: Mapped[str] = mapped_column(Text, nullable=False)
    method: Mapped[str] = mapped_column(String(10), default="POST")
    headers: Mapped[str] = mapped_column(Text, default="{}")  # JSON
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    # 触发该 webhook 的事件类型过滤（空=全部）
    events: Mapped[str] = mapped_column(Text, default="[]")  # JSON list
    last_called_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_status: Mapped[int | None] = mapped_column(Integer, nullable=True)
    call_count: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, index=True)

    __table_args__ = (Index("ix_auto_wh_user_created", "user_id", "created_at"),)

    def header_dict(self) -> dict:
        try:
            return json.loads(self.headers) if self.headers else {}
        except Exception:  # noqa: BLE001
            return {}

    def event_list(self) -> list[str]:
        try:
            return json.loads(self.events) if self.events else []
        except Exception:  # noqa: BLE001
            return []

    def set_headers(self, val: Any) -> None:
        self.headers = _json_dumps(val)

    def set_events(self, val: Any) -> None:
        self.events = _json_dumps(val)


# --------------------------------------------------------------------------- #
# 5. 运行记录（成本追踪 + 审计）
# --------------------------------------------------------------------------- #
class AutomationRun(Base):
    __tablename__ = "automation_runs"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(String(32), ForeignKey("users.id"), index=True, nullable=False)
    # 来源：rule / scheduled / workflow / agent
    source: Mapped[str] = mapped_column(String(20), default="rule", index=True)
    source_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    name: Mapped[str] = mapped_column(String(160), default="")
    status: Mapped[str] = mapped_column(String(20), default="success")  # success/failed/skipped
    tier: Mapped[str] = mapped_column(String(10), default="local")
    # 成本追踪（继承 Phase 6.5）：token 用量 / 是否调用 LLM
    llm_called: Mapped[bool] = mapped_column(Boolean, default=False)
    tokens_used: Mapped[int] = mapped_column(Integer, default=0)
    message: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, index=True)

    __table_args__ = (Index("ix_auto_runs_user_created", "user_id", "created_at"),)


# --------------------------------------------------------------------------- #
# 6. Action Center 行动项
# --------------------------------------------------------------------------- #
class AutomationAction(Base):
    __tablename__ = "automation_actions"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(String(32), ForeignKey("users.id"), index=True, nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    detail: Mapped[str] = mapped_column(Text, default="")
    category: Mapped[str] = mapped_column(String(20), default="wealth")  # wealth/risk/goal/ai/system
    # 优先级：critical/high/medium/low
    priority: Mapped[str] = mapped_column(String(10), default="medium", index=True)
    # 状态：pending / done / dismissed / deferred
    status: Mapped[str] = mapped_column(String(10), default="pending", index=True)
    # 反馈记录（完成后用户选择/输入）
    feedback: Mapped[str] = mapped_column(Text, default="")  # JSON
    # 关联来源（run / rule / agent）
    source_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, index=True)

    __table_args__ = (Index("ix_auto_actions_user_created", "user_id", "created_at"),)

    def feedback_dict(self) -> dict:
        try:
            return json.loads(self.feedback) if self.feedback else {}
        except Exception:  # noqa: BLE001
            return {}

    def set_feedback(self, val: Any) -> None:
        self.feedback = _json_dumps(val)


# --------------------------------------------------------------------------- #
# 7. 市场数据缓存
# --------------------------------------------------------------------------- #
class AutomationMarketCache(Base):
    __tablename__ = "automation_market_cache"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(String(32), ForeignKey("users.id"), index=True, nullable=False)
    # symbol 形如 AAPL / 000001.SZ / 沪深300
    symbol: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    market_type: Mapped[str] = mapped_column(String(20), default="stock")  # stock/fund/index/fx
    # 最新价 / 历史（JSON list of {date,close}）
    price: Mapped[float | None] = mapped_column(default=None)
    history: Mapped[str] = mapped_column(Text, default="[]")  # JSON list
    currency: Mapped[str] = mapped_column(String(10), default="CNY")
    # 缓存过期时间（秒级时间戳判定）
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    fetched_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    provider: Mapped[str] = mapped_column(String(20), default="dummy")

    __table_args__ = (
        Index("ix_auto_mc_user_symbol", "user_id", "symbol"),
        Index("ix_auto_mc_user_expires", "user_id", "expires_at"),
    )

    def history_list(self) -> list[dict]:
        try:
            return json.loads(self.history) if self.history else []
        except Exception:  # noqa: BLE001
            return []

    def set_history(self, val: Any) -> None:
        self.history = _json_dumps(val)


# --------------------------------------------------------------------------- #
# 8. 用户偏好学习画像
# --------------------------------------------------------------------------- #
class AutomationPreference(Base):
    __tablename__ = "automation_preferences"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(String(32), ForeignKey("users.id"), index=True, nullable=False)
    # 维度：risk_tolerance / advice_acceptance / focus_areas / notify_timing / report_depth
    dimension: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    # 学习到的取值（JSON，可为标度或分布）
    value: Mapped[str] = mapped_column(Text, default="{}")
    # 置信度 0-1
    confidence: Mapped[float] = mapped_column(default=0.0)
    sample_count: Mapped[int] = mapped_column(Integer, default=0)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now, index=True)

    __table_args__ = (Index("ix_auto_pref_user_dim", "user_id", "dimension"),)

    def value_dict(self) -> Any:
        try:
            return json.loads(self.value) if self.value else {}
        except Exception:  # noqa: BLE001
            return self.value

    def set_value(self, val: Any) -> None:
        self.value = _json_dumps(val)


# --------------------------------------------------------------------------- #
# 9. 长期运行计划（退休 / 投资 Agent 周期巡检）
# --------------------------------------------------------------------------- #
class AutomationPlan(Base):
    __tablename__ = "automation_plans"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(String(32), ForeignKey("users.id"), index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="")
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    # agent 类型：retirement / investment / cashflow / risk
    agent_kind: Mapped[str] = mapped_column(String(20), default="retirement", index=True)
    # 巡检频率：weekly / monthly / quarterly
    cadence: Mapped[str] = mapped_column(String(20), default="weekly")
    # 巡检参数（JSON）
    params: Mapped[str] = mapped_column(Text, default="{}")
    last_run_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    next_run_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    run_count: Mapped[int] = mapped_column(Integer, default=0)
    last_summary: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, index=True)

    __table_args__ = (Index("ix_auto_plan_user_next", "user_id", "next_run_at"),)

    def param_dict(self) -> dict:
        try:
            return json.loads(self.params) if self.params else {}
        except Exception:  # noqa: BLE001
            return {}

    def set_params(self, val: Any) -> None:
        self.params = _json_dumps(val)


# --------------------------------------------------------------------------- #
# 10. 财富快照（事件驱动基线）
# --------------------------------------------------------------------------- #
class AutomationSnapshot(Base):
    __tablename__ = "automation_snapshots"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(String(32), ForeignKey("users.id"), index=True, nullable=False)
    # 快照指标：total_assets / monthly_income / monthly_expense / risk_level / goal_progress
    total_assets: Mapped[float] = mapped_column(default=0.0)
    monthly_income: Mapped[float] = mapped_column(default=0.0)
    monthly_expense: Mapped[float] = mapped_column(default=0.0)
    risk_level: Mapped[str] = mapped_column(String(20), default="balanced")
    goal_progress: Mapped[float] = mapped_column(default=0.0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, index=True)

    __table_args__ = (Index("ix_auto_snap_user_created", "user_id", "created_at"),)


# --------------------------------------------------------------------------- #
# 11. 事件总线审计
# --------------------------------------------------------------------------- #
class AutomationEvent(Base):
    __tablename__ = "automation_events"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(String(32), ForeignKey("users.id"), index=True, nullable=False)
    # 事件类型：asset_change / income_change / expense_change / goal_change / risk_change / market_anomaly
    event_type: Mapped[str] = mapped_column(String(30), nullable=False, index=True)
    # 触发指标与前后值
    metric: Mapped[str] = mapped_column(String(40), default="")
    prev_value: Mapped[float | None] = mapped_column(default=None)
    new_value: Mapped[float | None] = mapped_column(default=None)
    change_pct: Mapped[float | None] = mapped_column(default=None)
    severity: Mapped[str] = mapped_column(String(10), default="low")  # critical/high/medium/low
    summary: Mapped[str] = mapped_column(Text, default="")
    # 关联触发的规则/运行
    triggered_rule_ids: Mapped[str] = mapped_column(Text, default="[]")  # JSON list
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, index=True)

    __table_args__ = (Index("ix_auto_evt_user_created", "user_id", "created_at"),)

    def rule_ids(self) -> list[str]:
        try:
            return json.loads(self.triggered_rule_ids) if self.triggered_rule_ids else []
        except Exception:  # noqa: BLE001
            return []

    def set_rule_ids(self, val: Any) -> None:
        self.triggered_rule_ids = _json_dumps(val)
