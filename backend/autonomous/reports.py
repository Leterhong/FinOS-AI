# -*- coding: utf-8 -*-
"""
backend/autonomous/reports.py — Phase 7.4 需求五：自动财富报告。

四种周期，全部由自动化任务触发，用户无需手动点击：
    daily    每日简报（复用 Personal OS 的 DailyBriefing，幂等）
    weekly   每周总结（本模块自建，聚合投资 + 现金流智能体结论）
    monthly  月度报告（复用 Phase 7.2 报告生成器 kind=monthly）
    yearly   年度报告（复用 Phase 7.2 报告生成器 kind=annual）

成本控制：是否调用 LLM 由 cost_guard 决定，预算耗尽时全部走本地模板，
报告照常产出，只是文字更朴素——绝不因为没有预算就不生成报告。
"""
from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from backend.autonomous import cost_guard
from backend.autonomous import notifications as notif_engine
from backend.autonomous.agents import cashflow as cashflow_agent
from backend.autonomous.agents import investment as investment_agent
from backend.intelligence.context import build_context
from backend.report.models import WealthReport
from backend.user.models import User

REPORT_KINDS = ("daily", "weekly", "monthly", "yearly")
KIND_LABEL = {
    "daily": "每日简报",
    "weekly": "每周财富总结",
    "monthly": "月度财富报告",
    "yearly": "年度财富报告",
}
_DISCLAIMER = "FinOS AI提供信息分析和辅助决策，不构成投资建议。"


# --------------------------------------------------------------------------- #
# 每日简报
# --------------------------------------------------------------------------- #
def generate_daily(db: Session, user: User, *, force: bool = False) -> dict:
    from backend.personal_os import briefing as briefing_svc

    data = briefing_svc.generate_briefing(user, db, force=force)
    return {
        "kind": "daily",
        "title": KIND_LABEL["daily"],
        "period": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "tier": "local",
        "briefing": data,
        "disclaimer": _DISCLAIMER,
    }


# --------------------------------------------------------------------------- #
# 每周总结（自建）
# --------------------------------------------------------------------------- #
def _week_period() -> str:
    now = datetime.now(timezone.utc)
    monday = now - timedelta(days=now.weekday())
    return f"{monday.strftime('%Y-%m-%d')} ~ {(monday + timedelta(days=6)).strftime('%Y-%m-%d')}"


def generate_weekly(db: Session, user: User, *, allow_llm: bool = True, persist: bool = True) -> dict:
    ctx = build_context(db, user)
    if not ctx.has_data:
        return {
            "kind": "weekly",
            "hasData": False,
            "message": "欢迎创建你的财富数字分身",
            "disclaimer": _DISCLAIMER,
        }

    inv = investment_agent.analyze(db, user, ctx, allow_llm=False)
    cf = cashflow_agent.analyze(db, user, ctx, allow_llm=False)
    findings = (inv.get("findings") or []) + (cf.get("findings") or [])
    severity = "low"
    for level in ("critical", "high", "medium"):
        if any(f.get("level") == level for f in findings):
            severity = level
            break

    tier, _reason = cost_guard.decide_tier(
        db, user.id, severity=severity, requested="light" if allow_llm else "local"
    )

    lines = [
        f"# {KIND_LABEL['weekly']}",
        "",
        f"**统计周期**：{_week_period()}　|　**生成时间**：{datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M')} UTC",
        "",
        "## 一、本周核心指标",
        "",
        f"- 净资产：¥{ctx.net_worth:,.0f}",
        f"- 月度收入：¥{ctx.monthly_income:,.0f}　月度支出：¥{ctx.monthly_expense:,.0f}",
        f"- 月度结余：¥{ctx.monthly_surplus:,.0f}（储蓄率 {ctx.savings_rate * 100:.1f}%）",
        f"- 权益类仓位：{(inv.get('metrics') or {}).get('equityRatio', 0) * 100:.1f}%　现金占比：{(inv.get('metrics') or {}).get('cashRatio', 0) * 100:.1f}%",
        "",
        "## 二、投资组合",
        "",
        (inv.get("explanation") or {}).get("text", ""),
        "",
        "## 三、现金流",
        "",
        (cf.get("explanation") or {}).get("text", ""),
        "",
    ]
    if findings:
        lines.extend(["## 四、本周待办", ""])
        for i, f in enumerate(findings[:6], start=1):
            lines.append(f"{i}. **[{f.get('level')}] {f.get('title')}** —— {f.get('advice')}")
        lines.append("")
    lines.extend(["---", "", f"> {_DISCLAIMER}"])
    content = "\n".join(lines)

    payload = {
        "kind": "weekly",
        "period": _week_period(),
        "metrics": {
            "netWorth": ctx.net_worth,
            "monthlyIncome": ctx.monthly_income,
            "monthlyExpense": ctx.monthly_expense,
            "monthlySurplus": ctx.monthly_surplus,
            "savingsRate": ctx.savings_rate,
        },
        "investment": inv.get("metrics"),
        "cashflow": cf.get("metrics"),
        "findings": findings[:8],
        "severity": severity,
    }

    report_id = None
    if persist:
        try:
            row = WealthReport(
                user_id=user.id,
                kind="weekly",
                title=KIND_LABEL["weekly"],
                period=_week_period(),
                tier=tier,
                content=content[:60000],
                payload=json.dumps(payload, ensure_ascii=False, default=str)[:60000],
                section_count=4 if findings else 3,
            )
            db.add(row)
            db.commit()
            report_id = row.id
        except Exception:  # noqa: BLE001
            db.rollback()

    return {
        "kind": "weekly",
        "hasData": True,
        "id": report_id,
        "title": KIND_LABEL["weekly"],
        "period": _week_period(),
        "tier": tier,
        "severity": severity,
        "content": content,
        "payload": payload,
        "disclaimer": _DISCLAIMER,
    }


# --------------------------------------------------------------------------- #
# 月度 / 年度（复用 Phase 7.2 生成器）
# --------------------------------------------------------------------------- #
def _generate_via_generator(db: Session, user: User, kind: str, *, allow_llm: bool) -> dict:
    from backend.report.generator import generate_report

    tier, _ = cost_guard.decide_tier(
        db, user.id, severity="medium", requested="ai" if allow_llm else "local"
    )
    use_ai = tier == "ai"
    try:
        doc = generate_report(db, user, kind, use_ai=use_ai, persist=True)
    except Exception as exc:  # noqa: BLE001
        return {"kind": kind, "hasData": False, "error": f"报告生成失败：{exc}", "disclaimer": _DISCLAIMER}

    if isinstance(doc, dict):
        doc.setdefault("kind", kind)
        return doc
    return {
        "kind": kind,
        "hasData": True,
        "id": getattr(doc, "id", None),
        "title": doc.title,
        "period": doc.period,
        "tier": doc.tier,
        "content": doc.to_markdown(),
        "llmCalled": use_ai and doc.tier == "ai",
        "disclaimer": _DISCLAIMER,
    }


def generate_monthly(db: Session, user: User, *, allow_llm: bool = True) -> dict:
    return _generate_via_generator(db, user, "monthly", allow_llm=allow_llm)


def generate_yearly(db: Session, user: User, *, allow_llm: bool = True) -> dict:
    out = _generate_via_generator(db, user, "annual", allow_llm=allow_llm)
    out["kind"] = "yearly"
    return out


# --------------------------------------------------------------------------- #
# 统一入口
# --------------------------------------------------------------------------- #
def generate(
    db: Session,
    user: User,
    kind: str = "daily",
    *,
    allow_llm: bool = True,
    force: bool = False,
    notify: bool = True,
) -> dict:
    """生成指定周期报告，并（可选）推送一条「报告已就绪」提醒。"""
    kind = (kind or "daily").lower()
    if kind not in REPORT_KINDS:
        return {"kind": kind, "hasData": False, "error": f"未知的报告类型：{kind}"}

    if kind == "daily":
        result = generate_daily(db, user, force=force)
    elif kind == "weekly":
        result = generate_weekly(db, user, allow_llm=allow_llm)
    elif kind == "monthly":
        result = generate_monthly(db, user, allow_llm=allow_llm)
    else:
        result = generate_yearly(db, user, allow_llm=allow_llm)

    if notify and result.get("hasData") is not False:
        notif_engine.push(
            db,
            user.id,
            title=f"{KIND_LABEL[kind]}已生成",
            body=f"AI 已自动为你生成{KIND_LABEL[kind]}，可在「财富报告」中查看。",
            category="ai",
            priority="low" if kind == "daily" else "medium",
            source="autonomous.reports",
        )
    return result
