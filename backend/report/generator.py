"""Wealth Report Generator（Phase 7.2 需求七）。

生成链路：
  AgentContext（一次加载）→ 模板段（纯本地计算）→ 多 Agent 建议 → 可选 LLM 润色导语 → Markdown

成本控制：正文数字全部本地计算，LLM 只用来写「导语 + 行动清单」，
失败或未配置模型一律 tier=local 降级，绝不阻断。
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.agents.context import build_agent_context
from backend.agents.workflow import run_workflow
from backend.intelligence.constants import DISCLAIMER, WELCOME_MESSAGE
from backend.multimodal.llm import run_llm
from backend.report.models import WealthReport
from backend.report.templates import REPORT_TEMPLATES, Section, TEMPLATE_SECTIONS
from backend.user.models import User

INTRO_SYSTEM = (
    "你是 FinOS AI 的私人财富 CFO。你只能基于给定的计算结果撰写导语，"
    "不得编造任何数字，不得承诺收益，不得给出具体买卖指令。"
)


@dataclass
class ReportDoc:
    kind: str = "monthly"
    title: str = ""
    period: str = ""
    intro: str = ""
    sections: list[Section] = field(default_factory=list)
    actions: list[str] = field(default_factory=list)
    tier: str = "local"
    generated_at: str = ""
    summary: dict = field(default_factory=dict)
    id: str = ""  # 落库后回填，供前端直接调 /reports/{id}/export

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "hasData": True,
            "kind": self.kind,
            "title": self.title,
            "period": self.period,
            "intro": self.intro,
            "sections": [s.to_dict() for s in self.sections],
            "actions": self.actions,
            "tier": self.tier,
            "generatedAt": self.generated_at,
            "summary": self.summary,
            "disclaimer": DISCLAIMER,
        }

    def to_markdown(self) -> str:
        parts = [f"# {self.title}", ""]
        if self.period:
            parts.append(f"**统计周期**：{self.period}　|　**生成时间**：{self.generated_at}")
            parts.append("")
        if self.intro:
            parts.extend([self.intro, ""])
        for s in self.sections:
            parts.append(s.to_markdown())
        if self.actions:
            parts.extend(["## 行动清单", ""])
            parts.extend(f"{i}. {a}" for i, a in enumerate(self.actions, start=1))
            parts.append("")
        parts.extend(["---", "", f"> {DISCLAIMER}"])
        return "\n".join(parts)


def _period_label(kind: str) -> str:
    now = datetime.now(timezone.utc).astimezone()
    fmt = REPORT_TEMPLATES.get(kind, {}).get("periodFormat", "%Y-%m-%d")
    return now.strftime(fmt)


def generate_report(
    db: Session,
    user: User,
    kind: str = "monthly",
    *,
    use_ai: bool = True,
    persist: bool = True,
) -> ReportDoc | dict:
    """生成一份财富报告。无数据返回欢迎态 dict（绝不编造）。"""
    tpl = REPORT_TEMPLATES.get(kind)
    if tpl is None:
        raise ValueError(f"未知的报告类型：{kind}")

    ctx = build_agent_context(db, user, question=f"生成{tpl['title']}", use_ai=use_ai)
    if not ctx.has_data:
        return {"hasData": False, "message": WELCOME_MESSAGE, "disclaimer": DISCLAIMER}

    sections = [TEMPLATE_SECTIONS[key](ctx) for key in tpl["sections"] if key in TEMPLATE_SECTIONS]

    # 多 Agent 建议 → 行动清单
    wf = run_workflow(db, user, question="", use_ai=use_ai, persist=False)
    summary = wf.get("summary") or {}
    actions = list(summary.get("topAdvice") or [])
    for r in wf.get("results") or []:
        if len(actions) >= 6:
            break
        for a in (r.get("advice") or [])[:1]:
            if a not in actions:
                actions.append(a)

    doc = ReportDoc(
        kind=kind,
        title=tpl["title"],
        period=_period_label(kind),
        sections=sections,
        actions=actions[:6],
        generated_at=datetime.now(timezone.utc).astimezone().strftime("%Y-%m-%d %H:%M"),
        summary=summary,
    )

    # 可选 LLM 导语（只写文字，不碰数字）
    doc.intro = _local_intro(ctx, summary)
    if use_ai:
        facts = json.dumps(
            {"context": ctx.wealth.to_dict(), "summary": summary}, ensure_ascii=False
        )[:2500]
        content = run_llm(
            db, user,
            [
                {"role": "system", "content": INTRO_SYSTEM},
                {
                    "role": "user",
                    "content": (
                        f"以下是系统计算出的用户财富数据（数字均为真实计算值，禁止修改）：\n{facts}\n\n"
                        f"请为《{tpl['title']}》写一段 120 字以内的导语，"
                        "语气专业克制，点明本期最值得关注的一件事，不要罗列数字清单。"
                    ),
                },
            ],
            max_tokens=300,
        )
        if content:
            doc.intro = content
            doc.tier = "ai"

    if persist:
        try:
            row = WealthReport(
                user_id=user.id,
                kind=kind,
                title=doc.title,
                period=doc.period,
                tier=doc.tier,
                content=doc.to_markdown()[:60000],
                payload=json.dumps(doc.to_dict(), ensure_ascii=False)[:60000],
                section_count=len(doc.sections),
            )
            db.add(row)
            db.commit()
            doc.id = row.id
            doc.summary = dict(doc.summary or {})
            doc.summary["reportId"] = row.id
        except Exception:  # noqa: BLE001
            db.rollback()
    return doc


def _local_intro(ctx, summary: dict) -> str:
    w = ctx.wealth
    weakest = summary.get("weakestTitle")
    base = (
        f"本期你的净资产为 ¥{w.net_worth:,.0f}，月结余 ¥{w.monthly_surplus:,.0f}，"
        f"储蓄率 {w.savings_rate * 100:.1f}%。"
    )
    if weakest:
        base += f"综合多领域分析，本期最值得优先处理的是「{weakest}」。"
    return base


# ------------------------------------------------------------------ 历史
def list_reports(db: Session, user: User, limit: int = 20) -> list[dict]:
    rows = db.scalars(
        select(WealthReport)
        .where(WealthReport.user_id == user.id)
        .order_by(WealthReport.created_at.desc())
        .limit(min(limit, 100))
    )
    return [
        {
            "id": r.id,
            "kind": r.kind,
            "title": r.title,
            "period": r.period,
            "tier": r.tier,
            "sectionCount": r.section_count,
            "createdAt": r.created_at.isoformat() if r.created_at else None,
        }
        for r in rows
    ]


def get_report(db: Session, user: User, report_id: str) -> dict | None:
    row = db.scalar(
        select(WealthReport).where(
            WealthReport.id == report_id, WealthReport.user_id == user.id
        )
    )
    if row is None:
        return None
    try:
        payload = json.loads(row.payload or "{}")
    except json.JSONDecodeError:
        payload = {}
    # 注意：payload 是生成时的快照，其 id 字段可能为空（落库前序列化），
    # 因此必须让数据库真值覆盖快照，而不是反过来。
    return {
        **payload,
        "id": row.id,
        "hasData": True,
        "kind": row.kind,
        "title": row.title,
        "period": row.period,
        "tier": row.tier,
        "markdown": row.content,
        "createdAt": row.created_at.isoformat() if row.created_at else None,
    }


def delete_report(db: Session, user: User, report_id: str) -> bool:
    row = db.scalar(
        select(WealthReport).where(
            WealthReport.id == report_id, WealthReport.user_id == user.id
        )
    )
    if row is None:
        return False
    db.delete(row)
    db.commit()
    return True
