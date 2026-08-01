"""人生事件模拟引擎 + 方案 A/B/C 对比（Phase 7.1 需求四 / 十二）。

流程：
  真实 Twin → 复制副本 → 施加事件 → 重新预测 + 重新评分 → 计算差异 → 三段式解释 → 落库

所有数字都来自纯代码重算，LLM 只在解释环节可选参与（且不得改数字）。
"""
from __future__ import annotations

import json

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.intelligence.constants import DISCLAIMER, WELCOME_MESSAGE
from backend.intelligence.context import WealthContext
from backend.intelligence.models import ScenarioSimulation
from backend.intelligence.prediction.engine import predict_wealth
from backend.intelligence.reasoning.explain import enhance_with_llm, make_explanation, render_text
from backend.intelligence.scoring.engine import score_wealth
from backend.intelligence.simulation.events import EVENT_CATALOG, apply_event
from backend.user.models import User


def _snapshot(ctx: WealthContext, horizon: int) -> dict:
    pred = predict_wealth(ctx, horizons=(1, 5, 10, max(10, horizon)))
    score = score_wealth(ctx, pred.get("goal"))
    by_year = {m["year"]: m["netWorth"] for m in pred.get("milestones", [])}
    return {
        "netWorth": ctx.net_worth,
        "monthlySurplus": ctx.monthly_surplus,
        "savingsRate": ctx.savings_rate,
        "emergencyMonths": ctx.emergency_months,
        "debtRatio": ctx.debt_ratio,
        "netWorth1y": by_year.get(1),
        "netWorth5y": by_year.get(5),
        "netWorth10y": by_year.get(10),
        "healthScore": score.get("totalScore"),
        "dimensions": score.get("dimensions", []),
        "goalProbability": (pred.get("goal") or {}).get("probability"),
        "retirementGap": (pred.get("retirement") or {}).get("gap"),
        "timeline": pred.get("timeline", []),
        "assumptions": pred.get("assumptions", {}),
    }


def _diff(base: dict, scen: dict) -> dict:
    keys = (
        "netWorth",
        "monthlySurplus",
        "netWorth1y",
        "netWorth5y",
        "netWorth10y",
        "healthScore",
        "goalProbability",
        "retirementGap",
        "emergencyMonths",
    )
    out: dict = {}
    for k in keys:
        b, s = base.get(k), scen.get(k)
        if isinstance(b, (int, float)) and isinstance(s, (int, float)):
            out[k] = {"before": round(b, 2), "after": round(s, 2), "delta": round(s - b, 2)}
    return out


def _build_explanation(event_label: str, notes: list[str], impact: dict, scen: dict) -> object:
    cause = list(notes)
    impact_lines: list[str] = []
    advice: list[str] = []

    nw10 = impact.get("netWorth10y")
    if nw10:
        direction = "增加" if nw10["delta"] >= 0 else "减少"
        impact_lines.append(f"10 年后净资产预计{direction} ¥{abs(nw10['delta']):,.0f}（¥{nw10['before']:,.0f} → ¥{nw10['after']:,.0f}）。")
    surplus = impact.get("monthlySurplus")
    if surplus:
        if surplus["delta"] < 0:
            impact_lines.append(f"月度结余减少 ¥{abs(surplus['delta']):,.0f}，降至 ¥{surplus['after']:,.0f}。")
            if surplus["after"] < 0:
                impact_lines.append("月度结余转负，将持续消耗存量资产。")
                advice.append("优先压缩非必要支出或提高收入，把月结余拉回正值再执行该决策。")
        else:
            impact_lines.append(f"月度结余增加 ¥{surplus['delta']:,.0f}，升至 ¥{surplus['after']:,.0f}。")
    hs = impact.get("healthScore")
    if hs:
        if hs["delta"] < -5:
            impact_lines.append(f"财富健康分从 {hs['before']} 降至 {hs['after']}（-{abs(hs['delta']):.0f}）。")
        elif hs["delta"] > 5:
            impact_lines.append(f"财富健康分从 {hs['before']} 升至 {hs['after']}（+{hs['delta']:.0f}）。")
    gp = impact.get("goalProbability")
    if gp:
        impact_lines.append(f"财富目标达成概率由 {gp['before']:.0%} 变为 {gp['after']:.0%}。")
    gap = impact.get("retirementGap")
    if gap and gap["delta"] > 0:
        impact_lines.append(f"退休资金缺口扩大 ¥{gap['delta']:,.0f}。")
        advice.append("重新评估退休年龄或提高长期定投额度，以补上扩大的缺口。")

    em = scen.get("emergencyMonths")
    if isinstance(em, (int, float)) and em < 3:
        advice.append(f"执行后应急金仅够 {em} 个月支出，建议先补足到 3-6 个月再行动。")
    weakest = min(scen.get("dimensions", []), key=lambda d: d["score"], default=None)
    if weakest:
        advice.append(f"执行后最薄弱环节是「{weakest['label']}」（{weakest['score']} 分），应作为后续优化重点。")
    if not advice:
        advice.append("该决策对整体财富结构冲击可控，可按计划推进并持续跟踪月度结余。")

    return make_explanation(f"「{event_label}」情景分析", cause, impact_lines, advice)


def simulate_event(
    db: Session,
    user: User,
    ctx: WealthContext,
    event_type: str,
    params: dict | None = None,
    *,
    horizon: int = 10,
    use_ai: bool = True,
    persist: bool = True,
) -> dict:
    """单事件模拟。无数据返回欢迎态。"""
    if not ctx.has_data:
        return {"hasData": False, "message": WELCOME_MESSAGE, "disclaimer": DISCLAIMER}

    label = EVENT_CATALOG.get(event_type, {}).get("label", event_type)
    scen_ctx, notes, detail = apply_event(ctx, event_type, params)

    baseline = _snapshot(ctx, horizon)
    scenario = _snapshot(scen_ctx, horizon)
    impact = _diff(baseline, scenario)

    exp = _build_explanation(label, notes, impact, scenario)
    # 成本控制：只有「影响显著」才值得调用 LLM 润色
    significant = any(
        abs(v.get("delta", 0)) > 0
        for k, v in impact.items()
        if k in {"healthScore", "netWorth10y"}
    )
    if use_ai and significant:
        facts = json.dumps(
            {"event": label, "params": detail, "impact": impact, "afterHealthScore": scenario.get("healthScore")},
            ensure_ascii=False,
            default=str,
        )
        exp = enhance_with_llm(db, user, exp, facts=facts, complex_enough=True)

    result = {
        "hasData": True,
        "eventType": event_type,
        "eventLabel": label,
        "params": detail,
        "baseline": baseline,
        "scenario": scenario,
        "impact": impact,
        "explanation": exp.to_dict(),
        "assumptions": scenario.get("assumptions", {}),
        "disclaimer": DISCLAIMER,
    }

    if persist:
        row = ScenarioSimulation(
            user_id=user.id,
            event_type=event_type,
            label=label,
            params=json.dumps(detail, ensure_ascii=False, default=str),
            baseline=json.dumps(baseline, ensure_ascii=False, default=str),
            scenario=json.dumps(scenario, ensure_ascii=False, default=str),
            impact=json.dumps(impact, ensure_ascii=False, default=str),
            explanation=render_text(exp),
        )
        db.add(row)
        db.commit()
        result["simulationId"] = row.id
    return result


def compare_plans(
    db: Session,
    user: User,
    ctx: WealthContext,
    plans: list[dict],
    *,
    horizon: int = 10,
    use_ai: bool = False,
) -> dict:
    """方案 A/B/C 对比（需求十二）。

    plans 结构：[{"key": "A", "label": "现在买房", "events": [{"type": "buy_house", "params": {...}}]}]
    每个方案可叠加多个事件，按顺序作用在同一个副本上。
    """
    if not ctx.has_data:
        return {"hasData": False, "message": WELCOME_MESSAGE, "disclaimer": DISCLAIMER}
    if not plans:
        return {"hasData": True, "plans": [], "message": "未提供对比方案", "disclaimer": DISCLAIMER}

    baseline = _snapshot(ctx, horizon)
    results = []
    for idx, plan in enumerate(plans[:5]):
        key = str(plan.get("key") or chr(ord("A") + idx))
        cur = ctx
        all_notes: list[str] = []
        details: list[dict] = []
        for ev in plan.get("events", []):
            cur, notes, detail = apply_event(cur, str(ev.get("type", "custom")), ev.get("params") or {})
            all_notes.extend(notes)
            details.append({"type": ev.get("type"), "detail": detail})
        snap = _snapshot(cur, horizon)
        impact = _diff(baseline, snap)
        exp = _build_explanation(str(plan.get("label") or f"方案 {key}"), all_notes, impact, snap)
        results.append(
            {
                "key": key,
                "label": plan.get("label") or f"方案 {key}",
                "events": details,
                "snapshot": snap,
                "impact": impact,
                "explanation": exp.to_dict(),
            }
        )

    # 推荐逻辑：10 年净资产 + 健康分 + 目标概率 综合打分（纯代码，非 LLM）
    def rank_score(r: dict) -> float:
        snap = r["snapshot"]
        nw = snap.get("netWorth10y") or 0.0
        hs = snap.get("healthScore") or 0
        gp = snap.get("goalProbability") or 0.0
        base_nw = baseline.get("netWorth10y") or 1.0
        nw_norm = nw / base_nw if base_nw else 0.0
        return nw_norm * 50 + hs * 0.4 + gp * 20

    ranked = sorted(results, key=rank_score, reverse=True)
    best = ranked[0]
    comparison_reason = (
        f"「{best['label']}」在 10 年净资产、财富健康分与目标达成概率的综合口径下表现最优；"
        "该排序基于纯代码模型计算，仅供参考，不构成投资建议。"
    )

    return {
        "hasData": True,
        "baseline": baseline,
        "plans": results,
        "recommended": {"key": best["key"], "label": best["label"], "reason": comparison_reason},
        "ranking": [{"key": r["key"], "score": round(rank_score(r), 2)} for r in ranked],
        "disclaimer": DISCLAIMER,
    }


def list_simulations(db: Session, user: User, limit: int = 20) -> list[dict]:
    rows = db.scalars(
        select(ScenarioSimulation)
        .where(ScenarioSimulation.user_id == user.id)
        .order_by(ScenarioSimulation.created_at.desc())
        .limit(limit)
    ).all()
    out = []
    for r in rows:
        try:
            impact = json.loads(r.impact)
        except (json.JSONDecodeError, TypeError):
            impact = {}
        out.append(
            {
                "id": r.id,
                "eventType": r.event_type,
                "label": r.label,
                "impact": impact,
                "explanation": r.explanation,
                "createdAt": r.created_at.isoformat() if r.created_at else None,
            }
        )
    return out
