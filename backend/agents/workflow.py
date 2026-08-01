"""AI 任务编排引擎（Phase 7.2 需求十三）。

支持三种任务节点：
  serial      串行：按顺序执行，后一步可读到前一步结果
  parallel    并行：线程池同时执行多个 Agent（IO/计算混合，线程池足够）
  conditional 条件：满足条件才执行（例：负债率 > 50% 才跑债务优化）

编排结果统一带 trace，便于前端展示「AI 是怎么想的」。
成本控制：全流程共享一个 AgentContext（需求十四），预测/评分只算一次。
"""
from __future__ import annotations

import json
import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from typing import Callable

from sqlalchemy.orm import Session

from backend.agents.base import AgentResult, BaseAgent
from backend.agents.context import AgentContext, build_agent_context
from backend.agents.models import AgentRunLog
from backend.agents.registry import enabled_agents, get_agent
from backend.intelligence.constants import DISCLAIMER, WELCOME_MESSAGE
from backend.user.models import User

MAX_PARALLEL = 5


@dataclass
class Step:
    """一个编排节点。"""

    mode: str = "serial"                     # serial / parallel / conditional
    agents: list[str] = field(default_factory=list)
    label: str = ""
    condition: Callable[[AgentContext], bool] | None = None
    condition_desc: str = ""


def _resolve(names: list[str]) -> list[BaseAgent]:
    out = []
    for n in names:
        a = get_agent(n)
        if a is not None:
            out.append(a)
    return out


def _run_parallel(agents: list[BaseAgent], ctx: AgentContext) -> list[AgentResult]:
    if not agents:
        return []
    if len(agents) == 1:
        return [agents[0].execute(ctx)]
    with ThreadPoolExecutor(max_workers=min(MAX_PARALLEL, len(agents))) as pool:
        return list(pool.map(lambda a: a.execute(ctx), agents))


def run_steps(ctx: AgentContext, steps: list[Step]) -> tuple[list[AgentResult], list[dict]]:
    """执行编排，返回 (结果列表, trace)。"""
    results: list[AgentResult] = []
    trace: list[dict] = []

    for idx, step in enumerate(steps, start=1):
        started = time.perf_counter()
        if step.mode == "conditional":
            passed = True
            try:
                passed = bool(step.condition(ctx)) if step.condition else True
            except Exception:  # noqa: BLE001
                passed = False
            if not passed:
                trace.append(
                    {
                        "step": idx, "mode": step.mode, "label": step.label or "条件节点",
                        "skipped": True, "reason": step.condition_desc or "未满足触发条件",
                        "elapsedMs": 0,
                    }
                )
                continue
            batch = _run_parallel(_resolve(step.agents), ctx)
        elif step.mode == "parallel":
            batch = _run_parallel(_resolve(step.agents), ctx)
        else:  # serial
            batch = [a.execute(ctx) for a in _resolve(step.agents)]

        results.extend(batch)
        trace.append(
            {
                "step": idx,
                "mode": step.mode,
                "label": step.label or ("并行分析" if step.mode == "parallel" else "串行分析"),
                "agents": [r.agent for r in batch],
                "skipped": False,
                "elapsedMs": int((time.perf_counter() - started) * 1000),
            }
        )
    return results, trace


# ------------------------------------------------------------------ 默认编排
def default_steps(ctx: AgentContext, agents: list[BaseAgent]) -> list[Step]:
    """默认编排：现金流先行（串行）→ 其余并行 → 高负债时触发条件节点。"""
    names = [a.name for a in agents]
    first = [n for n in names if n == "cashflow"]
    rest = [n for n in names if n not in first and n != "tax"]
    tax = [n for n in names if n == "tax"]

    steps: list[Step] = []
    if first:
        steps.append(Step(mode="serial", agents=first, label="现金流基线分析"))
    if rest:
        steps.append(Step(mode="parallel", agents=rest, label="多领域并行分析"))
    if tax:
        steps.append(
            Step(
                mode="conditional",
                agents=tax,
                label="税务优化（条件触发）",
                condition=lambda c: c.wealth.monthly_income > 0,
                condition_desc="仅在录入月收入后触发税务分析",
            )
        )
    return steps


def _summarize(results: list[AgentResult], ctx: AgentContext) -> dict:
    ok_results = [r for r in results if r.ok]
    scored = [r for r in ok_results if r.score is not None]
    avg = round(sum(r.score for r in scored) / len(scored), 1) if scored else None
    weakest = min(scored, key=lambda r: r.score) if scored else None

    top_advice: list[str] = []
    for r in sorted(scored, key=lambda x: x.score):
        for a in r.advice[:2]:
            if a not in top_advice:
                top_advice.append(a)
        if len(top_advice) >= 5:
            break

    headline = (
        f"综合来看，你最需要优先处理的是「{weakest.title}」（{weakest.score:.0f} 分）。"
        if weakest
        else "已完成本轮多领域分析。"
    )
    return {
        "headline": headline,
        "averageScore": avg,
        "weakestDomain": weakest.agent if weakest else None,
        "weakestTitle": weakest.title if weakest else None,
        "topAdvice": top_advice,
        "agentCount": len(results),
        "disclaimer": DISCLAIMER,
    }


def run_workflow(
    db: Session,
    user: User,
    *,
    question: str = "",
    use_ai: bool = True,
    agents: list[str] | None = None,
    persist: bool = True,
) -> dict:
    """多 Agent 工作流总入口（需求十三 + 十四）。"""
    started = time.perf_counter()
    ctx = build_agent_context(db, user, question=question, use_ai=use_ai)
    if not ctx.has_data:
        return {
            "hasData": False,
            "message": WELCOME_MESSAGE,
            "results": [],
            "trace": [],
            "disclaimer": DISCLAIMER,
        }

    selected = _resolve(agents) if agents else enabled_agents(db, user)
    if not selected:
        return {
            "hasData": True,
            "results": [],
            "trace": [],
            "summary": {"headline": "你还没有启用任何 Agent，可在 Agent 市场中开启。"},
            "disclaimer": DISCLAIMER,
        }

    steps = default_steps(ctx, selected)
    results, trace = run_steps(ctx, steps)
    summary = _summarize(results, ctx)
    elapsed = int((time.perf_counter() - started) * 1000)

    payload = {
        "hasData": True,
        "question": question,
        "results": [r.to_dict() for r in results],
        "trace": trace,
        "summary": summary,
        "elapsedMs": elapsed,
        "context": ctx.wealth.to_dict(),
        "disclaimer": DISCLAIMER,
    }

    if persist:
        try:
            db.add(
                AgentRunLog(
                    user_id=user.id,
                    kind="workflow",
                    agent_name=",".join(r.agent for r in results)[:50],
                    question=question[:2000],
                    tier="ai" if any(r.tier == "ai" for r in results) else "local",
                    ok=all(r.ok for r in results),
                    elapsed_ms=elapsed,
                    trace=json.dumps(trace, ensure_ascii=False)[:8000],
                    result=json.dumps(summary, ensure_ascii=False)[:8000],
                )
            )
            db.commit()
        except Exception:  # noqa: BLE001
            db.rollback()
    return payload


def run_single(
    db: Session, user: User, name: str, *, question: str = "", use_ai: bool = True
) -> dict:
    """执行单个 Agent。"""
    a = get_agent(name)
    if a is None:
        raise LookupError(f"未知的 Agent：{name}")
    ctx = build_agent_context(db, user, question=question, use_ai=use_ai)
    if not ctx.has_data:
        return {"hasData": False, "message": WELCOME_MESSAGE, "disclaimer": DISCLAIMER}
    result = a.execute(ctx)
    return {"hasData": True, "result": result.to_dict(), "disclaimer": DISCLAIMER}
