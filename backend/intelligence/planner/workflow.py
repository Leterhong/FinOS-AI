"""Wealth Intelligence Workflow —— 多 Agent 协作（Phase 7.1 需求七）。

编排：
    Planner Agent（拆解任务）
        ├─ Cashflow Agent      现金流
        ├─ Investment Agent    投资结构
        ├─ Risk Agent          风险
        ├─ Retirement Agent    退休
        └─ LifePlanner Agent   人生阶段与事件
    → Strategy Agent（汇总成短/中/长期策略）
    → Summary Agent（生成最终三段式总结）

工程要点：
- 五个分析 Agent 均为纯代码计算，通过线程池并行执行（互不依赖，无 DB 写入）。
- 只有 Strategy / Summary 环节可能调用 LLM，且必须满足「已配置模型 + 场景复杂」。
- 每个 Agent 的输出都是「原因 / 影响 / 建议」三段式（需求九）。
"""
from __future__ import annotations

import concurrent.futures
import json
import time

from sqlalchemy.orm import Session

from backend.intelligence.constants import DISCLAIMER, WELCOME_MESSAGE
from backend.intelligence.context import WealthContext
from backend.intelligence.ltm.service import build_memory_context, capture_wealth_change, sync_from_profile
from backend.intelligence.prediction.engine import predict_wealth
from backend.intelligence.reasoning.explain import enhance_with_llm, make_explanation
from backend.intelligence.recommendation.strategy import generate_strategies
from backend.intelligence.scoring.engine import save_score, score_wealth
from backend.user.models import User

AGENTS = ("cashflow", "investment", "risk", "retirement", "life_planner")

AGENT_LABELS = {
    "planner": "规划调度 Agent",
    "cashflow": "现金流 Agent",
    "investment": "投资结构 Agent",
    "risk": "风险 Agent",
    "retirement": "退休规划 Agent",
    "life_planner": "人生规划 Agent",
    "strategy": "策略 Agent",
    "summary": "总结 Agent",
}


# ------------------------------------------------------------------ 子 Agent
def _agent_cashflow(ctx: WealthContext, pred: dict, score: dict) -> dict:
    cf = pred.get("cashflow", {})
    dim = next((d for d in score.get("dimensions", []) if d["key"] == "cashflow"), {})
    cause = list(dim.get("reasons", []))
    impact = [cf.get("note", "")]
    advice: list[str] = []
    if ctx.monthly_surplus < 0:
        advice.append(f"当月缺口 ¥{abs(ctx.monthly_surplus):,.0f}，需立即削减固定支出或提高收入。")
    elif ctx.savings_rate < 0.2:
        advice.append("设置工资到账自动转存，把储蓄率推到 20% 以上。")
    else:
        advice.append("维持当前储蓄节奏，把增量结余投入长期账户。")
    if cf.get("breakEvenYear"):
        advice.append(f"提前为第 {cf['breakEvenYear']} 年的结余转负做准备。")
    return {
        "agent": "cashflow",
        "label": AGENT_LABELS["cashflow"],
        "score": dim.get("score"),
        "data": {"breakEvenYear": cf.get("breakEvenYear"), "monthlySurplus": ctx.monthly_surplus},
        "explanation": make_explanation("现金流分析", cause, impact, advice).to_dict(),
    }


def _agent_investment(ctx: WealthContext, pred: dict, score: dict) -> dict:
    dim = next((d for d in score.get("dimensions", []) if d["key"] == "investment"), {})
    cause = list(dim.get("reasons", []))
    milestones = {m["year"]: m["netWorth"] for m in pred.get("milestones", [])}
    impact = [
        f"按年化 {ctx.base_annual_return:.1%} 假设，10 年后净资产约 ¥{milestones.get(10, 0):,.0f}。"
    ]
    advice = []
    if ctx.investment_ratio < 0.2:
        advice.append("投资类资产占比过低，长期购买力可能被通胀侵蚀，可用定投逐步提高比例。")
    elif ctx.investment_ratio > 0.8:
        advice.append("投资类资产占比过高，建议保留足够现金以应对短期支出。")
    else:
        advice.append("投资比例合理，重点转向降低费率与坚持长期持有。")
    return {
        "agent": "investment",
        "label": AGENT_LABELS["investment"],
        "score": dim.get("score"),
        "data": {"investmentRatio": ctx.investment_ratio, "allocation": ctx.allocation_pct},
        "explanation": make_explanation("投资结构分析", cause, impact, advice).to_dict(),
    }


def _agent_risk(ctx: WealthContext, pred: dict, score: dict) -> dict:
    dim = next((d for d in score.get("dimensions", []) if d["key"] == "risk"), {})
    prot = next((d for d in score.get("dimensions", []) if d["key"] == "protection"), {})
    cause = list(dim.get("reasons", [])) + list(prot.get("reasons", []))
    impact = []
    top = max(ctx.allocation_pct.items(), key=lambda kv: kv[1], default=None)
    if top and top[1] >= 0.7:
        impact.append(f"「{top[0]}」单类波动 10% 将直接影响净资产约 ¥{ctx.total_assets * top[1] * 0.1:,.0f}。")
    if ctx.debt_ratio > 0.5:
        impact.append(f"负债率 {ctx.debt_ratio:.0%}，收入中断时偿付压力显著。")
    if not impact:
        impact.append("当前风险暴露在可控范围内。")
    advice = []
    if (ctx.emergency_months or 0) < 3:
        advice.append("先把应急金补到 3-6 个月支出，这是所有风险控制的第一道防线。")
    if ctx.protection_amount <= 0:
        advice.append("配置基础医疗与意外保障，用小额确定成本对冲大额不确定损失。")
    if top and top[1] >= 0.7:
        advice.append("用增量资金分散到其他类别，逐步把单一集中度降到 50% 以内。")
    return {
        "agent": "risk",
        "label": AGENT_LABELS["risk"],
        "score": dim.get("score"),
        "data": {"debtRatio": ctx.debt_ratio, "emergencyMonths": ctx.emergency_months},
        "explanation": make_explanation("风险评估", cause, impact, advice).to_dict(),
    }


def _agent_retirement(ctx: WealthContext, pred: dict, score: dict) -> dict:
    ret = pred.get("retirement", {})
    if not ret.get("available"):
        exp = make_explanation(
            "退休规划",
            [ret.get("reason", "缺少测算所需信息。")],
            ["无法给出退休资金缺口结论。"],
            ["在财富档案中补充年龄，即可获得完整的退休测算。"],
        )
        return {"agent": "retirement", "label": AGENT_LABELS["retirement"], "score": None, "data": {}, "explanation": exp.to_dict()}

    cause = [
        f"当前 {ret['currentAge']} 岁，距 {ret['retirementAge']} 岁退休还有 {ret['yearsToRetirement']} 年。",
        f"按通胀折算，退休时年支出约 ¥{ret['annualExpenseAtRetirement']:,.0f}，对应所需资本 ¥{ret['requiredCapital']:,.0f}。",
    ]
    impact = [f"按当前储蓄与收益假设，退休时预计积累 ¥{ret['projectedCapital']:,.0f}。"]
    advice = []
    if ret["covered"]:
        impact.append("测算结果显示可覆盖退休需求。")
        advice.append("临近退休 5 年内逐步降低波动性资产比例，锁定成果。")
    else:
        impact.append(f"存在缺口 ¥{ret['gap']:,.0f}。")
        advice.append(f"每月额外储蓄约 ¥{ret['extraMonthlySavingNeeded']:,.0f} 可补上缺口。")
        advice.append("或考虑延后退休年龄、下调退休后支出预期。")
    return {
        "agent": "retirement",
        "label": AGENT_LABELS["retirement"],
        "score": None,
        "data": {"gap": ret["gap"], "covered": ret["covered"]},
        "explanation": make_explanation("退休规划", cause, impact, advice).to_dict(),
    }


def _agent_life_planner(ctx: WealthContext, pred: dict, score: dict) -> dict:
    from backend.intelligence.ltm.service import _life_stage

    stage = _life_stage(int(ctx.age)) if ctx.age is not None else "未知阶段"
    goal = pred.get("goal", {})
    cause = [f"处于「{stage}」，风险偏好「{ctx.risk_level}」。"]
    if goal.get("available"):
        cause.append(f"财富目标 ¥{goal['targetAmount']:,.0f}，规划期 {goal['horizonYears']} 年。")
    else:
        cause.append(goal.get("reason", "尚未设置可量化目标。"))
    impact = []
    if goal.get("available"):
        impact.append(
            f"模拟 {goal['paths']} 条路径，达成概率 {goal['probability']:.0%}（{goal['probabilityLabel']}），"
            f"悲观情形（10 分位）约 ¥{goal['percentile10']:,.0f}，乐观情形（90 分位）约 ¥{goal['percentile90']:,.0f}。"
        )
    else:
        impact.append("缺少量化目标时，规划只能给出方向性建议。")
    advice = _stage_advice(stage)
    if goal.get("available") and goal["probability"] < 0.5:
        advice.insert(0, "目标达成概率偏低，建议在「目标金额 / 期限 / 月储蓄」三者中至少调整一项。")
    return {
        "agent": "life_planner",
        "label": AGENT_LABELS["life_planner"],
        "score": None,
        "data": {"stage": stage, "goalProbability": goal.get("probability")},
        "explanation": make_explanation("人生阶段规划", cause, impact, advice).to_dict(),
    }


def _stage_advice(stage: str) -> list[str]:
    mapping = {
        "职业起步期": ["优先建立应急金与记账习惯，把可投资资金投向低成本宽基定投。"],
        "财富积累期": ["提高储蓄率是这一阶段回报最高的动作，其次才是提高收益率。"],
        "家庭建设期": ["为家庭责任配置足额保障，并预留教育与住房的中期资金池。"],
        "资产稳固期": ["开始把部分权益资产转向稳健品种，明确退休资金的独立账户。"],
        "退休准备期": ["以本金安全为第一目标，逐年降低波动暴露并测算提取计划。"],
        "退休期": ["以稳定现金流为核心，控制提取率在 4% 以内以延长资金存续。"],
    }
    return mapping.get(stage, ["补充年龄与目标信息，可获得更贴合人生阶段的规划。"])


_AGENT_FUNCS = {
    "cashflow": _agent_cashflow,
    "investment": _agent_investment,
    "risk": _agent_risk,
    "retirement": _agent_retirement,
    "life_planner": _agent_life_planner,
}


# ------------------------------------------------------------------ 编排
def run_wealth_intelligence(
    db: Session,
    user: User,
    ctx: WealthContext,
    *,
    question: str = "",
    use_ai: bool = True,
    persist: bool = True,
) -> dict:
    """完整的多 Agent 财富智能工作流。"""
    started = time.time()
    if not ctx.has_data:
        return {"hasData": False, "message": WELCOME_MESSAGE, "disclaimer": DISCLAIMER}

    trace: list[dict] = []

    # Step 1 — Planner：确定要调度哪些 Agent
    planned = list(AGENTS)
    trace.append(
        {
            "step": 1,
            "agent": "planner",
            "label": AGENT_LABELS["planner"],
            "action": f"拆解任务，调度 {len(planned)} 个分析 Agent 并行执行",
            "agents": planned,
        }
    )

    # Step 2 — 基础计算（预测 + 评分），供所有 Agent 共享，避免重复计算（成本控制）
    pred = predict_wealth(ctx)
    score = score_wealth(ctx, pred.get("goal"))

    # Step 3 — 并行执行五个分析 Agent（纯计算，无 DB 写入，线程安全）
    findings: list[dict] = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=len(planned)) as pool:
        futures = {pool.submit(_AGENT_FUNCS[name], ctx, pred, score): name for name in planned}
        for fut in concurrent.futures.as_completed(futures):
            name = futures[fut]
            try:
                findings.append(fut.result())
            except Exception as exc:  # noqa: BLE001 — 单 Agent 失败不影响整体
                findings.append(
                    {
                        "agent": name,
                        "label": AGENT_LABELS.get(name, name),
                        "error": f"该 Agent 执行失败：{exc}",
                        "explanation": make_explanation(
                            AGENT_LABELS.get(name, name), ["分析过程出现异常。"], ["该维度结论暂缺。"], ["稍后重试或补充数据。"]
                        ).to_dict(),
                    }
                )
    findings.sort(key=lambda f: planned.index(f["agent"]) if f["agent"] in planned else 99)
    trace.append({"step": 2, "agent": "parallel", "label": "并行分析", "completed": [f["agent"] for f in findings]})

    # Step 4 — Strategy Agent
    strategies = generate_strategies(db, user, ctx, score, pred, use_ai=use_ai)
    trace.append({"step": 3, "agent": "strategy", "label": AGENT_LABELS["strategy"], "tier": strategies.get("tier")})

    # Step 5 — Summary Agent（注入长期记忆）
    memory_ctx = build_memory_context(db, user)
    summary = _summarize(db, user, ctx, score, pred, findings, memory_ctx, question, use_ai)
    trace.append({"step": 4, "agent": "summary", "label": AGENT_LABELS["summary"], "tier": summary["tier"]})

    # Step 6 — 记忆沉淀（幂等）
    if persist:
        sync_from_profile(db, user, ctx)
        capture_wealth_change(db, user, ctx, score)
        save_score(db, user, score)

    return {
        "hasData": True,
        "question": question,
        "score": score,
        "prediction": {
            "milestones": pred.get("milestones"),
            "timeline": pred.get("timeline"),
            "retirement": pred.get("retirement"),
            "goal": pred.get("goal"),
            "cashflow": pred.get("cashflow"),
            "assumptions": pred.get("assumptions"),
        },
        "findings": findings,
        "strategies": strategies,
        "summary": summary,
        "memoryUsed": bool(memory_ctx),
        "trace": trace,
        "elapsedMs": int((time.time() - started) * 1000),
        "disclaimer": DISCLAIMER,
    }


def _summarize(
    db: Session,
    user: User,
    ctx: WealthContext,
    score: dict,
    pred: dict,
    findings: list[dict],
    memory_ctx: str,
    question: str,
    use_ai: bool,
) -> dict:
    weakest = score.get("weakest", {})
    cause = [
        f"六维评分总分 {score.get('totalScore')}（{score.get('level')}），"
        f"最强项「{score.get('strongest', {}).get('label')}」，最弱项「{weakest.get('label')}」。"
    ]
    if memory_ctx:
        cause.append("已结合你的历史目标与偏好记忆进行个性化分析。")
    if question:
        cause.append(f"围绕你的问题「{question}」展开。")

    impact: list[str] = []
    ret = pred.get("retirement") or {}
    if ret.get("available"):
        impact.append(
            f"退休测算：需 ¥{ret['requiredCapital']:,.0f}，预计 ¥{ret['projectedCapital']:,.0f}，"
            + ("已覆盖。" if ret["covered"] else f"缺口 ¥{ret['gap']:,.0f}。")
        )
    goal = pred.get("goal") or {}
    if goal.get("available"):
        impact.append(f"财富目标达成概率 {goal['probability']:.0%}。")
    milestones = {m["year"]: m["netWorth"] for m in pred.get("milestones", [])}
    if 10 in milestones:
        impact.append(f"10 年后净资产预计 ¥{milestones[10]:,.0f}。")

    advice: list[str] = []
    for f in findings:
        adv = (f.get("explanation") or {}).get("advice") or []
        if adv:
            advice.append(f"{f['label'].replace(' Agent', '')}：{adv[0]}")
    advice = advice[:5]

    exp = make_explanation("财富智能总结", cause, impact, advice)
    complex_enough = (score.get("totalScore", 100) < 75) or bool(question)
    if use_ai and complex_enough:
        facts = json.dumps(
            {
                "score": score.get("totalScore"),
                "weakest": weakest,
                "retirement": ret,
                "goal": goal,
                "memory": memory_ctx,
                "question": question,
            },
            ensure_ascii=False,
            default=str,
        )
        exp = enhance_with_llm(db, user, exp, facts=facts, complex_enough=True, max_tokens=600)
    return exp.to_dict() | {"tier": exp.tier}
