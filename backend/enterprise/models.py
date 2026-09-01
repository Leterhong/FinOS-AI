"""企业工作区 ORM 模型（2.1 服务端持久化）。

企业对象此前只存在于浏览器 localStorage——换设备即失、无法审计、无法协作。
本模块把项目/资料/风险/规则/任务/投研底稿落库，全部绑定 user_id 并建立索引。
"""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import Float, Index, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from backend.database.base import Base


def _now() -> datetime:
    return datetime.now(timezone.utc)


class EnterpriseCase(Base):
    __tablename__ = "enterprise_cases"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(String(64), nullable=False)
    organization_id: Mapped[str] = mapped_column(String(32), nullable=False, default="")
    classification: Mapped[str] = mapped_column(String(24), nullable=False, default="internal")
    company: Mapped[str] = mapped_column(String(200), nullable=False)
    title: Mapped[str] = mapped_column(String(300), nullable=False, default="")
    industry: Mapped[str] = mapped_column(String(120), nullable=False, default="")
    amount: Mapped[str] = mapped_column(String(120), nullable=False, default="")
    status: Mapped[str] = mapped_column(String(40), nullable=False, default="研判中")
    risk: Mapped[str] = mapped_column(String(20), nullable=False, default="medium")
    progress: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    owner: Mapped[str] = mapped_column(String(120), nullable=False, default="")
    next_action: Mapped[str] = mapped_column(String(300), nullable=False, default="")
    archived_at: Mapped[str] = mapped_column(String(40), nullable=False, default="")
    created_at: Mapped[datetime] = mapped_column(default=_now)
    updated_at: Mapped[datetime] = mapped_column(default=_now, onupdate=_now)

    __table_args__ = (
        Index("ix_enterprise_cases_user", "user_id"),
        Index("ix_enterprise_cases_org", "organization_id"),
    )


class EnterpriseDocument(Base):
    __tablename__ = "enterprise_documents"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(String(64), nullable=False)
    case_id: Mapped[str] = mapped_column(String(64), nullable=False, default="")
    classification: Mapped[str] = mapped_column(String(24), nullable=False, default="internal")
    name: Mapped[str] = mapped_column(String(300), nullable=False)
    kind: Mapped[str] = mapped_column(String(40), nullable=False, default="企业资料")
    status: Mapped[str] = mapped_column(String(40), nullable=False, default="解析中")
    facts: Mapped[int] = mapped_column(default=0)
    rule_hits: Mapped[int] = mapped_column(default=0)
    analysis: Mapped[str | None] = mapped_column(Text, nullable=True)
    model: Mapped[str | None] = mapped_column(String(200), nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    evidence_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(default=_now)
    updated_at: Mapped[datetime] = mapped_column(default=_now, onupdate=_now)

    __table_args__ = (Index("ix_enterprise_documents_user", "user_id"),)


class EnterpriseRisk(Base):
    __tablename__ = "enterprise_risks"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(String(64), nullable=False)
    case_id: Mapped[str] = mapped_column(String(64), nullable=False, default="")
    company: Mapped[str] = mapped_column(String(200), nullable=False, default="")
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    level: Mapped[str] = mapped_column(String(20), nullable=False, default="medium")
    evidence: Mapped[str] = mapped_column(Text, nullable=False, default="")
    rule: Mapped[str] = mapped_column(String(300), nullable=False, default="")
    impact: Mapped[str] = mapped_column(Text, nullable=False, default="")
    status: Mapped[str] = mapped_column(String(40), nullable=False, default="待核验")
    review_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(default=_now)
    updated_at: Mapped[datetime] = mapped_column(default=_now, onupdate=_now)

    __table_args__ = (Index("ix_enterprise_risks_user", "user_id"),)


class EnterpriseRule(Base):
    __tablename__ = "enterprise_rules"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(String(64), nullable=False)
    organization_id: Mapped[str] = mapped_column(String(32), nullable=False, default="")
    code: Mapped[str] = mapped_column(String(120), nullable=False)
    name: Mapped[str] = mapped_column(String(300), nullable=False)
    domain: Mapped[str] = mapped_column(String(120), nullable=False, default="")
    version: Mapped[str] = mapped_column(String(40), nullable=False, default="v1.0")
    # 结构化触发条件 JSON：[{"metric":..., "op":..., "value":...}]
    conditions: Mapped[str | None] = mapped_column(Text, nullable=True)
    coverage: Mapped[str] = mapped_column(String(40), nullable=False, default="待测试")
    coverage_rate: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    tests_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(default=_now)
    updated_at: Mapped[datetime] = mapped_column(default=_now, onupdate=_now)

    __table_args__ = (
        Index("ix_enterprise_rules_user", "user_id"),
        Index("ix_enterprise_rules_org", "organization_id"),
    )


class EnterpriseTask(Base):
    __tablename__ = "enterprise_tasks"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(String(64), nullable=False)
    case_id: Mapped[str] = mapped_column(String(64), nullable=False, default="")
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    case_name: Mapped[str] = mapped_column(String(300), nullable=False, default="")
    assignee: Mapped[str] = mapped_column(String(120), nullable=False, default="")
    due: Mapped[str] = mapped_column(String(40), nullable=False, default="")
    priority: Mapped[str] = mapped_column(String(20), nullable=False, default="medium")
    stage: Mapped[str] = mapped_column(String(40), nullable=False, default="待处理")
    note: Mapped[str] = mapped_column(Text, nullable=False, default="")
    history_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(default=_now)
    updated_at: Mapped[datetime] = mapped_column(default=_now, onupdate=_now)

    __table_args__ = (Index("ix_enterprise_tasks_user", "user_id"),)


class EnterpriseBrief(Base):
    __tablename__ = "enterprise_briefs"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(String(64), nullable=False)
    case_id: Mapped[str] = mapped_column(String(64), nullable=False, default="")
    title: Mapped[str] = mapped_column(String(300), nullable=False)
    summary: Mapped[str] = mapped_column(Text, nullable=False, default="")
    topic: Mapped[str] = mapped_column(String(300), nullable=False, default="")
    model: Mapped[str | None] = mapped_column(String(200), nullable=True)
    created_at: Mapped[datetime] = mapped_column(default=_now)
    updated_at: Mapped[datetime] = mapped_column(default=_now, onupdate=_now)

    __table_args__ = (Index("ix_enterprise_briefs_user", "user_id"),)
