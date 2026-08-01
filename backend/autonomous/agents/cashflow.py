# -*- coding: utf-8 -*-
"""
backend/autonomous/agents/cashflow.py — Phase 7.4 需求八：现金流自动分析
（Cashflow Intelligence Agent）。

自动分析：
    1. 收入变化   —— 近 30 天 vs 前 30 天收入
    2. 消费趋势   —— 近 30 天 vs 前 30 天支出，分类 TOP3
    3. 异常支出   —— 单笔超过「月收入 20%」或「支出中位数 3 倍」
    4. 结余健康   —— 储蓄率 / 应急金月数 / 现金流断裂风险

无交易流水时自动降级使用财务档案里的月收入 / 月支出，保证新用户也有结论。
全部规则计算（零 Token），仅高严重度且预算允许时才调用 LLM 润色。
"""
from __future__ import annotations

import statistics
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.autonomous import cost_guard
from backend.financial.models import Transaction
from backend.intelligence.context import WealthContext, build_context
from backend.intelligence.reasoning.explain import enhance_with_llm, make_explanation
from backend.user.models import User

AGENT_KEY = "cashflow"
AGENT_NAME = "现金流智能体"

_SEVERITY_ORDER = {"critical": 0, "high": 1, "medium": 2, "low": 3}


def _top_severity(findings: list[dict]) -> str:
    if not findings:
        return "low"
    return sorted(findings, key=lambda f: _SEVERITY_ORDER.get(f.get("level", "low"), 3))[0].get("level", "low")


def _sum(rows: list[Transaction]) -> float:
    return round(sum(float(r.amount or 0.0) for r in rows), 2)


def _pct(prev: float, cur: float) -> float | None:
    if abs(prev) < 1e-9:
        return None
    return round((cur - prev) / abs(prev) * 100.0, 2)


def analyze(
    db: Session,
    user: User,
    ctx: WealthContext | None = None,
    *,
    allow_llm: bool = True,
) -> dict:
    ctx = ctx or build_context(db, user)
    now = datetime.now(timezone.utc)
    d30 = now - timedelta(days=30)
    d60 = now - timedelta(days=60)

    txs = list(
        db.scalars(
            select(Transaction).where(Transaction.user_id == user.id, Transaction.date >= d60)
        ).all()
    )

    def _bucket(kind: str, start, end) -> list[Transaction]:
        out = []
        for t in txs:
            if t.type != kind or t.date is None:
                continue
            dt = t.date if t.date.tzinfo else t.date.replace(tzinfo=timezone.utc)
            if start <= dt < end:
                out.append(t)
        return out

    cur_income_rows = _bucket("income", d30, now + timedelta(days=1))
    prev_income_rows = _bucket("income", d60, d30)
    cur_expense_rows = _bucket("expense", d30, now + timedelta(days=1))
    prev_expense_rows = _bucket("expense", d60, d30)

    has_tx = bool(cur_income_rows or prev_income_rows or cur_expense_rows or prev_expense_rows)

    if has_tx:
        cur_income, prev_income = _sum(cur_income_rows), _sum(prev_income_rows)
        cur_expense, prev_expense = _sum(cur_expense_rows), _sum(prev_expense_rows)
    else:
        cur_income = prev_income = round(float(ctx.monthly_income or 0.0), 2)
        cur_expense = prev_expense = round(float(ctx.monthly_expense or 0.0), 2)

    income_change = _pct(prev_income, cur_income)
    expense_change = _pct(prev_expense, cur_expense)
    surplus = round(cur_income - cur_expense, 2)
    savings_rate = round(surplus / cur_income, 4) if cur_income > 0 else 0.0

    findings: list[dict] = []

    # 1) 收入变化
    if income_change is not None and income_change <= -30:
        findings.append(
            {
                "level": "critical",
                "dimension": "收入变化",
                "title": f"月收入下降 {abs(income_change):.1f}%",
                "detail": f"由 ¥{prev_income:,.0f} 降至 ¥{cur_income:,.0f}，已触发重大收入下滑预警。",
                "advice": "立即压缩非必要开支，检查应急金是否覆盖 6 个月生活费，并暂缓大额支出计划。",
            }
        )
    elif income_change is not None and income_change <= -10:
        findings.append(
            {
                "level": "high",
                "dimension": "收入变化",
                "title": f"月收入下降 {abs(income_change):.1f}%",
                "detail": f"由 ¥{prev_income:,.0f} 降至 ¥{cur_income:,.0f}。",
                "advice": "确认是否为一次性因素；若将持续，建议同步下调储蓄目标与消费预算。",
            }
        )
    elif income_change is not None and income_change >= 20:
        findings.append(
            {
                "level": "low",
                "dimension": "收入变化",
                "title": f"月收入上升 {income_change:.1f}%",
                "detail": f"由 ¥{prev_income:,.0f} 增至 ¥{cur_income:,.0f}。",
                "advice": "把新增收入的一部分自动转入长期投资账户，避免消费同步膨胀。",
            }
        )

    # 2) 消费趋势
    if expense_change is not None and expense_change >= 20:
        findings.append(
            {
                "level": "high" if expense_change >= 30 else "medium",
                "dimension": "消费趋势",
                "title": f"月支出上升 {expense_change:.1f}%",
                "detail": f"由 ¥{prev_expense:,.0f} 增至 ¥{cur_expense:,.0f}。",
                "advice": "对照分类明细找出增量最大的两项，设定下月上限并跟踪。",
            }
        )

    # 3) 异常支出
    amounts = [float(t.amount or 0.0) for t in cur_expense_rows if float(t.amount or 0.0) > 0]
    anomalies: list[dict] = []
    if len(amounts) >= 3:
        median = statistics.median(amounts)
        threshold = max(median * 3, cur_income * 0.2 if cur_income > 0 else 0.0)
        for t in cur_expense_rows:
            amt = float(t.amount or 0.0)
            if threshold > 0 and amt >= threshold:
                anomalies.append(
                    {
                        "id": t.id,
                        "amount": round(amt, 2),
                        "category": t.category or "other",
                        "date": t.date.isoformat() if t.date else None,
                        "timesMedian": round(amt / median, 1) if median > 0 else None,
                    }
                )
        anomalies.sort(key=lambda x: x["amount"], reverse=True)
        if anomalies:
            top = anomalies[0]
            findings.append(
                {
                    "level": "high" if len(anomalies) >= 3 else "medium",
                    "dimension": "异常支出",
                    "title": f"检测到 {len(anomalies)} 笔异常大额支出",
                    "detail": f"最大一笔 ¥{top['amount']:,.0f}（{top['category']}），约为常规支出中位数的 {top.get('timesMedian') or '—'} 倍。",
                    "advice": "确认是否为一次性开销；若属经常性支出，需要重新纳入月度预算。",
                }
            )

    # 4) 结余健康
    if surplus < 0:
        findings.append(
            {
                "level": "critical",
                "dimension": "结余健康",
                "title": f"当月现金流为负（¥{surplus:,.0f}）",
                "detail": "支出已超过收入，长期将侵蚀本金并触发现金流断裂风险。",
                "advice": "先削减弹性支出至收支平衡，再考虑增加收入来源。",
            }
        )
    elif 0 <= savings_rate < 0.1 and cur_income > 0:
        findings.append(
            {
                "level": "medium",
                "dimension": "结余健康",
                "title": f"储蓄率仅 {savings_rate:.1%}",
                "detail": "低于 10% 的储蓄率难以支撑长期财富目标。",
                "advice": "尝试「先储蓄后消费」，工资到账当天自动划转 10%–20%。",
            }
        )

    months = ctx.emergency_months
    if months is not None and months < 3:
        findings.append(
            {
                "level": "high",
                "dimension": "结余健康",
                "title": f"应急金仅够 {months} 个月支出",
                "detail": "低于 3 个月安全线。",
                "advice": f"优先补足现金至 ¥{cur_expense * 3:,.0f} 左右。",
            }
        )

    # 分类 TOP3
    by_cat: dict[str, float] = {}
    for t in cur_expense_rows:
        by_cat[t.category or "other"] = by_cat.get(t.category or "other", 0.0) + float(t.amount or 0.0)
    top_categories = [
        {"category": k, "amount": round(v, 2), "pct": round(v / cur_expense, 4) if cur_expense > 0 else 0.0}
        for k, v in sorted(by_cat.items(), key=lambda kv: kv[1], reverse=True)[:3]
    ]

    severity = _top_severity(findings)
    tier, tier_reason = cost_guard.decide_tier(
        db, user.id, severity=severity, requested="ai" if allow_llm else "local"
    )

    exp = make_explanation(
        "现金流分析",
        [
            f"近 30 天收入 ¥{cur_income:,.0f}、支出 ¥{cur_expense:,.0f}，结余 ¥{surplus:,.0f}。",
            (f"数据来源：{len(txs)} 笔流水" if has_tx else "尚无流水记录，已按财务档案的月度收支估算。"),
        ],
        [f["title"] for f in findings[:3]] or ["现金流结构稳定，无异常项。"],
        [f["advice"] for f in findings[:3]] or ["维持当前收支节奏，并持续记录流水以提高分析精度。"],
    )

    llm_called = False
    if tier == "ai" and findings:
        facts = (
            f"收入={cur_income:.0f}(环比{income_change}%); 支出={cur_expense:.0f}(环比{expense_change}%); "
            f"结余={surplus:.0f}; 储蓄率={savings_rate:.4f}; 异常支出={len(anomalies)}笔"
        )
        before = exp.tier
        exp = enhance_with_llm(db, user, exp, facts=facts, complex_enough=True, max_tokens=420)
        llm_called = exp.tier == "ai" and before != "ai"
    else:
        tier = "local" if tier == "ai" else tier

    return {
        "agent": AGENT_KEY,
        "agentName": AGENT_NAME,
        "hasData": bool(has_tx or ctx.has_data),
        "severity": severity,
        "metrics": {
            "currentIncome": cur_income,
            "previousIncome": prev_income,
            "incomeChangePct": income_change,
            "currentExpense": cur_expense,
            "previousExpense": prev_expense,
            "expenseChangePct": expense_change,
            "surplus": surplus,
            "savingsRate": savings_rate,
            "emergencyMonths": months,
            "transactionCount": len(txs),
            "dataSource": "transactions" if has_tx else "profile",
        },
        "topCategories": top_categories,
        "anomalies": anomalies[:5],
        "findings": findings,
        "explanation": exp.to_dict(),
        "tier": exp.tier if llm_called else tier,
        "tierReason": tier_reason,
        "llmCalled": llm_called,
        "generatedAt": now.isoformat(),
    }
