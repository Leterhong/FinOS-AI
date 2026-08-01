"""Agent 执行器（Phase 7.0.2 需求五；Phase 7.9 接入 Phase 7.2 Agent 生态）。

按 Steps 顺序执行。步骤分三类：

- **数据类**（data / rag / memory / document）：直接查库或走检索服务；
- **领域分析类**（investment / retirement / cashflow / risk / tax / monitor）：
  委托给 ``backend.agents`` 注册表中的真实 Agent 实现，产出带分数与
  三段式结论的结构化结果；
- **汇总类**（advisor）：聚合本轮所有领域 Agent 的真实结论。

零 LLM 依赖即可跑完；``service.py`` 可在末步用已配置模型追加自然语言总结。
"""
from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from backend.agents.context import AgentContext, build_agent_context
from backend.agents.registry import get_agent
from backend.document.models import Document
from backend.memory.models import Memory
from backend.services.agent.planner import Step
from backend.services.rag.service import retrieve_knowledge
from backend.services.twin.service import get_latest
from backend.user.models import User

# 旧编排的 agent 名 → Phase 7.2 Agent 注册表中的实现名
DOMAIN_AGENT_ALIASES = {
    "investment": "investment",
    "retirement": "retirement",
    "cashflow": "cashflow",
    "risk": "insurance",
    "tax": "tax",
}

SCORE_DIMENSION_LABELS = {
    "liquidity": "流动性",
    "solvency": "偿债能力",
    "savings": "储蓄能力",
    "investment": "投资配置",
    "protection": "风险保障",
    "growth": "成长性",
}


class _ContextHolder:
    """惰性构建并复用 AgentContext，避免每个步骤重复读库与重复计算。"""

    def __init__(self, db: Session, user: User, question: str) -> None:
        self._db = db
        self._user = user
        self._question = question
        self._ctx: AgentContext | None = None

    def get(self) -> AgentContext:
        if self._ctx is None:
            self._ctx = build_agent_context(
                self._db, self._user, question=self._question, use_ai=False
            )
        return self._ctx


def _run_domain_agent(agent_name: str, step: Step, holder: _ContextHolder) -> dict:
    """调用 Phase 7.2 注册表中的真实领域 Agent。"""
    impl = get_agent(agent_name)
    if impl is None:
        return {
            "agent": step.agent,
            "ok": False,
            "summary": f"未找到 {agent_name} 分析能力，本步骤已跳过。",
        }
    result = impl.execute(holder.get())
    return {
        "agent": step.agent,
        "ok": result.ok,
        "summary": result.headline or f"{result.title}分析完成。",
        "score": result.score,
        "cause": result.cause,
        "impact": result.impact,
        "advice": result.advice,
        "metrics": result.metrics,
        "tier": result.tier,
        "elapsedMs": result.elapsed_ms,
    }


def _run_monitor(step: Step, holder: _ContextHolder) -> dict:
    """财富监控：基于六维健康评分找出最薄弱环节（真实计算，非固定文案）。"""
    ctx = holder.get()
    if not ctx.has_data:
        return {
            "agent": step.agent,
            "ok": True,
            "summary": "尚无财富数据，暂无可监控的变化。",
            "score": None,
        }
    score = ctx.score() or {}
    total = score.get("total") or score.get("score")
    dimensions = score.get("dimensions") or {}

    weakest_key, weakest_value = "", None
    for key, value in dimensions.items():
        numeric = value.get("score") if isinstance(value, dict) else value
        if not isinstance(numeric, (int, float)):
            continue
        if weakest_value is None or numeric < weakest_value:
            weakest_key, weakest_value = key, numeric

    if weakest_value is not None:
        label = SCORE_DIMENSION_LABELS.get(weakest_key, weakest_key)
        summary = (
            f"财富健康度 {total:.0f} 分，最薄弱维度为{label}（{weakest_value:.0f} 分）。"
            if isinstance(total, (int, float))
            else f"最薄弱维度为{label}（{weakest_value:.0f} 分）。"
        )
    elif isinstance(total, (int, float)):
        summary = f"财富健康度 {total:.0f} 分，各维度暂无明显短板。"
    else:
        summary = "评分数据不足，暂无法给出健康度结论。"

    return {
        "agent": step.agent,
        "ok": True,
        "summary": summary,
        "score": total if isinstance(total, (int, float)) else None,
        "weakestDimension": weakest_key or None,
        "dimensions": dimensions,
    }


def _run_advisor(step: Step, holder: _ContextHolder, previous: list[dict]) -> dict:
    """汇总本轮所有领域 Agent 的真实结论，而非返回固定文案。"""
    ctx = holder.get()
    domain_results = [
        r for r in previous if r.get("advice") or r.get("score") is not None
    ]

    advice: list[str] = []
    for r in domain_results:
        for item in r.get("advice") or []:
            if item not in advice:
                advice.append(item)

    scores = [r["score"] for r in domain_results if isinstance(r.get("score"), (int, float))]
    avg_score = round(sum(scores) / len(scores), 1) if scores else None

    if not ctx.has_data:
        summary = "尚未录入财富数据，建议先完成数字分身创建再获取个性化建议。"
    elif advice:
        summary = f"综合 {len(domain_results)} 项专项分析，提炼出 {len(advice)} 条可执行建议。"
    else:
        hits = ctx.extras.get("ragHits") if isinstance(ctx.extras, dict) else None
        summary = (
            "已基于财富快照与知识库生成综合判断，当前未发现需要立即处理的问题。"
            if hits is None
            else "已基于财富快照与知识库生成综合判断。"
        )

    return {
        "agent": step.agent,
        "ok": True,
        "summary": summary,
        "score": avg_score,
        "advice": advice[:8],
        "basedOn": [r["agent"] for r in domain_results],
    }


def _run_document(step: Step, user: User, db: Session) -> dict:
    """文档步骤：返回该用户真实的文档统计，不再返回固定占位文案。"""
    total = db.scalar(
        select(func.count()).select_from(Document).where(Document.user_id == user.id)
    ) or 0
    if total == 0:
        summary = "知识库中暂无已上传文档，可在「文档」页上传账单或报表后重试。"
    else:
        summary = f"检测到 {total} 份已上传文档，可用于财富信息提取。"
    return {"agent": step.agent, "ok": True, "summary": summary, "documentCount": total}


def _run_step(
    step: Step,
    user: User,
    db: Session,
    scratch,
    holder: _ContextHolder,
    previous: list[dict],
) -> dict:
    if step.agent == "data":
        twin = get_latest(db, user)
        scratch.put("twin", twin)
        return {
            "agent": step.agent,
            "ok": True,
            "summary": f"净资产 ¥{twin.get('netWorth', 0):,.0f}",
        }

    if step.agent == "rag":
        q = scratch.get("question", "个人财务规划")
        res = retrieve_knowledge(q, user.id)
        scratch.put("ragContext", res.context_text)
        return {"agent": step.agent, "ok": True, "hits": len(res.hits)}

    if step.agent == "memory":
        rows = db.scalars(
            select(Memory)
            .where(Memory.user_id == user.id)
            .order_by(Memory.created_at.desc())
            .limit(20)
        ).all()
        scratch.put("memoryCount", len(rows))
        return {"agent": step.agent, "ok": True, "count": len(rows)}

    if step.agent in DOMAIN_AGENT_ALIASES:
        return _run_domain_agent(DOMAIN_AGENT_ALIASES[step.agent], step, holder)

    if step.agent == "monitor":
        return _run_monitor(step, holder)

    if step.agent == "advisor":
        return _run_advisor(step, holder, previous)

    if step.agent == "document":
        return _run_document(step, user, db)

    return {"agent": step.agent, "ok": True, "summary": step.intent}


def execute(steps: list[Step], user: User, db: Session, task_id: str) -> dict:
    from backend.services.agent.memory import for_task

    scratch = for_task(task_id)
    holder = _ContextHolder(db, user, scratch.get("question", ""))
    step_results: list[dict] = []
    for s in steps:
        step_results.append(_run_step(s, user, db, scratch, holder, step_results))
    return {
        "taskId": task_id,
        "steps": len(step_results),
        "stepResults": step_results,
        "ragContextLen": len(scratch.get("ragContext", "")),
    }
