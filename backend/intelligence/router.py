"""Wealth Intelligence API（Phase 7.1）。

路由前缀：/api/intelligence
所有接口强制登录 + user_id 隔离；无数据一律返回 hasData=False + 欢迎文案。
"""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.core import get_current_user, ok
from backend.core.cache import cache_delete, cache_get, cache_invalidate_prefix, cache_set
from backend.database import get_db
from backend.intelligence.constants import DISCLAIMER, PREDICTION_HORIZONS
from backend.intelligence.context import build_context
from backend.intelligence.ltm.service import (
    build_memory_context,
    capture_decision,
    delete_memory,
    recall,
    remember,
    sync_from_profile,
)
from backend.intelligence.planner.workflow import run_wealth_intelligence
from backend.intelligence.prediction.engine import predict_wealth
from backend.intelligence.reasoning.explain import enhance_with_llm, make_explanation
from backend.intelligence.recommendation.strategy import generate_strategies, list_strategies, save_strategies
from backend.intelligence.schemas import (
    ChatRequest,
    CompareRequest,
    MemoryWriteRequest,
    PredictRequest,
    SimulateRequest,
    StrategyRequest,
    WorkflowRequest,
)
from backend.intelligence.scoring.engine import save_score, score_history, score_wealth
from backend.intelligence.simulation.engine import compare_plans, list_simulations, simulate_event
from backend.intelligence.simulation.events import list_events
from backend.user.models import User

router = APIRouter(prefix="/intelligence", tags=["intelligence"])

PRED_TTL = 300  # 预测结果缓存 5 分钟（需求十三：预测优先使用缓存）


def _pred_key(user_id: str, tag: str, fingerprint: str) -> str:
    """缓存键内嵌数据指纹：财富数据一变，键自动改变 → 旧缓存天然失效。"""
    return f"wi:pred:{user_id}:{tag}:{fingerprint}"


def _fingerprint(ctx) -> str:
    import hashlib
    import json as _json

    raw = _json.dumps(ctx.to_dict(), sort_keys=True, default=str)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:12]


def _chat_key(user_id: str, session_id: str) -> str:
    return f"wi:chat:{user_id}:{session_id}"


# ------------------------------------------------------------------ 预测
@router.post("/predict")
def predict(
    body: PredictRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """财富预测（1/3/5/10/20/30 年 + 现金流 + 退休 + 目标概率 + Timeline）。"""
    ctx = build_context(db, user)
    tag = f"{body.retirementAge}:{body.goalAmount or 0}:{body.goalYears or 0}"
    key = _pred_key(user.id, tag, _fingerprint(ctx))
    if body.refresh:
        cache_delete(key)
    else:
        cached = cache_get(key)
        if cached is not None:
            return ok({**cached, "cached": True}, "预测结果（缓存）")

    horizons = tuple(body.horizons) if body.horizons else PREDICTION_HORIZONS
    result = predict_wealth(
        ctx,
        horizons=horizons,
        retirement_age=body.retirementAge,
        goal_amount=body.goalAmount,
        goal_years=body.goalYears,
    )
    if result.get("hasData"):
        cache_set(key, result, ttl_seconds=PRED_TTL)
    return ok({**result, "cached": False}, "预测完成")


@router.get("/timeline")
def timeline(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Wealth Timeline：现在 → 5 年 → 10 年 → 退休/目标年龄。"""
    ctx = build_context(db, user)
    result = predict_wealth(ctx)
    if not result.get("hasData"):
        return ok(result, "尚未创建财富数字分身")
    return ok(
        {
            "hasData": True,
            "timeline": result["timeline"],
            "assumptions": result["assumptions"],
            "disclaimer": DISCLAIMER,
        },
        "财富轨迹",
    )


# ------------------------------------------------------------------ 评分
@router.get("/score")
def get_score(
    persist: bool = False,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """六维财富健康评分。"""
    ctx = build_context(db, user)
    pred = predict_wealth(ctx) if ctx.has_data else {}
    result = score_wealth(ctx, pred.get("goal"))
    if persist and result.get("hasData"):
        save_score(db, user, result)
    return ok(result, "六维健康评分")


@router.get("/score/history")
def get_score_history(
    limit: int = 20,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return ok({"items": score_history(db, user, min(limit, 100))}, "评分历史")


# ------------------------------------------------------------------ 事件模拟
@router.get("/events")
def events():
    """可模拟的人生事件目录（含参数定义与默认值）。"""
    return ok({"events": list_events()}, "人生事件目录")


@router.post("/simulate")
def simulate(
    body: SimulateRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """人生事件模拟：在 Twin 副本上重算，返回 baseline / scenario / impact / 三段式解释。"""
    ctx = build_context(db, user)
    try:
        result = simulate_event(
            db, user, ctx, body.eventType, body.params,
            horizon=body.horizon, use_ai=body.useAi, persist=body.persist,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if result.get("hasData") and body.persist:
        impact = result.get("impact", {})
        nw10 = impact.get("netWorth10y", {})
        summary = (
            f"10 年净资产变化 {nw10.get('delta', 0):+,.0f}，"
            f"健康分变化 {impact.get('healthScore', {}).get('delta', 0):+.0f}"
        )
        capture_decision(db, user, result["eventLabel"], summary, payload=result.get("params"))
    return ok(result, "情景模拟完成")


@router.get("/simulations")
def simulations(
    limit: int = 20,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return ok({"items": list_simulations(db, user, min(limit, 100))}, "模拟历史")


@router.post("/compare")
def compare(
    body: CompareRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """方案 A/B/C 对比：同一起点、不同事件组合，给出综合排序与推荐理由。"""
    ctx = build_context(db, user)
    plans = [p.model_dump() for p in body.plans]
    try:
        result = compare_plans(db, user, ctx, plans, horizon=body.horizon)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return ok(result, "方案对比完成")


# ------------------------------------------------------------------ 策略
@router.post("/strategy")
def strategy(
    body: StrategyRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """短期 / 中期 / 长期财富策略。"""
    ctx = build_context(db, user)
    pred = predict_wealth(ctx) if ctx.has_data else {}
    score = score_wealth(ctx, pred.get("goal"))
    result = generate_strategies(db, user, ctx, score, pred, use_ai=body.useAi)
    if body.persist and result.get("hasData"):
        result["savedIds"] = save_strategies(db, user, result)
    return ok(result, "策略生成完成")


@router.get("/strategies")
def strategies(
    limit: int = 30,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return ok({"items": list_strategies(db, user, min(limit, 100))}, "策略历史")


# ------------------------------------------------------------------ 多 Agent 工作流
@router.post("/workflow")
def workflow(
    body: WorkflowRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Wealth Intelligence Workflow：Planner → 5 Agent 并行 → Strategy → Summary。"""
    ctx = build_context(db, user)
    result = run_wealth_intelligence(db, user, ctx, question=body.question, use_ai=body.useAi)
    cache_invalidate_prefix(f"wi:pred:{user.id}")
    return ok(result, "财富智能分析完成")


# ------------------------------------------------------------------ 长期记忆 2.0
@router.get("/memories")
def memories(
    kind: str | None = None,
    limit: int = 20,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    kinds = (kind,) if kind else None
    return ok({"items": recall(db, user, kinds, min(limit, 100), mark_hit=False)}, "长期记忆")


@router.post("/memories")
def write_memory(
    body: MemoryWriteRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    row = remember(
        db, user, body.kind, body.key, body.content,
        payload=body.payload, importance=body.importance,
    )
    return ok({"id": row.id, "kind": row.kind, "key": row.key}, "记忆已保存")


@router.post("/memories/sync")
def sync_memory(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """从财富档案自动沉淀偏好 / 人生阶段 / 目标记忆。"""
    ctx = build_context(db, user)
    written = sync_from_profile(db, user, ctx)
    return ok({"written": written, "count": len(written)}, "记忆同步完成")


@router.delete("/memories/{memory_id}")
def remove_memory(
    memory_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not delete_memory(db, user, memory_id):
        raise HTTPException(status_code=404, detail="记忆不存在")
    return ok({"id": memory_id}, "记忆已删除")


# ------------------------------------------------------------------ AI CFO 连续对话
@router.post("/chat")
def chat(
    body: ChatRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """AI CFO 对话（需求十）：服务端保存会话上下文，多轮连续，自动注入财富数据与长期记忆。"""
    session_id = body.sessionId or uuid.uuid4().hex[:12]
    key = _chat_key(user.id, session_id)
    history: list[dict] = cache_get(key) or []

    ctx = build_context(db, user)
    if not ctx.has_data:
        return ok(
            {
                "hasData": False,
                "sessionId": session_id,
                "message": "欢迎创建你的财富数字分身",
                "disclaimer": DISCLAIMER,
            },
            "尚无财富数据",
        )

    pred = predict_wealth(ctx)
    score = score_wealth(ctx, pred.get("goal"))
    memory_ctx = build_memory_context(db, user)

    ret = pred.get("retirement") or {}
    goal = pred.get("goal") or {}
    facts_lines = [
        f"净资产 ¥{ctx.net_worth:,.0f}，月结余 ¥{ctx.monthly_surplus:,.0f}，储蓄率 {ctx.savings_rate:.0%}。",
        f"财富健康分 {score['totalScore']}（{score['level']}），最弱维度「{score['weakest']['label']}」。",
    ]
    if ret.get("available"):
        facts_lines.append(
            "退休测算：" + ("已覆盖需求。" if ret["covered"] else f"缺口 ¥{ret['gap']:,.0f}。")
        )
    if goal.get("available"):
        facts_lines.append(f"目标达成概率 {goal['probability']:.0%}。")
    if memory_ctx:
        facts_lines.append(memory_ctx)
    if history:
        recent = "；".join(f"{h['role']}: {h['content'][:60]}" for h in history[-4:])
        facts_lines.append(f"最近对话上下文：{recent}")

    exp = make_explanation(
        "AI CFO 回复",
        [f"你的问题：{body.message}"] + facts_lines[:2],
        facts_lines[2:] or ["以上结论基于你当前录入的真实财富数据计算。"],
        [a for f in score["dimensions"] if f["score"] < 60 for a in f["reasons"][:1]][:3]
        or ["整体状况稳健，保持当前节奏并持续更新数据即可。"],
    )
    exp = enhance_with_llm(
        db, user, exp,
        facts="\n".join(facts_lines),
        complex_enough=body.useAi,
        max_tokens=600,
    )

    reply = exp.ai_text or exp.to_dict()["text"]
    history = (history + [
        {"role": "user", "content": body.message},
        {"role": "assistant", "content": reply},
    ])[-20:]
    cache_set(key, history, ttl_seconds=3600)

    return ok(
        {
            "hasData": True,
            "sessionId": session_id,
            "reply": reply,
            "explanation": exp.to_dict(),
            "tier": exp.tier,
            "turns": len(history) // 2,
            "memoryUsed": bool(memory_ctx),
            "disclaimer": DISCLAIMER,
        },
        "AI CFO 已回复",
    )


@router.delete("/chat/{session_id}")
def clear_chat(session_id: str, user: User = Depends(get_current_user)):
    cache_delete(_chat_key(user.id, session_id))
    return ok({"sessionId": session_id}, "会话已清空")


# ------------------------------------------------------------------ 总览
@router.get("/overview")
def overview(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """财富实验室首屏所需的聚合数据（一次请求拿全，减少往返）。"""
    ctx = build_context(db, user)
    if not ctx.has_data:
        return ok({"hasData": False, "message": "欢迎创建你的财富数字分身", "disclaimer": DISCLAIMER}, "尚无数据")
    pred = predict_wealth(ctx)
    score = score_wealth(ctx, pred.get("goal"))
    return ok(
        {
            "hasData": True,
            "current": ctx.to_dict(),
            "score": score,
            "milestones": pred["milestones"],
            "timeline": pred["timeline"],
            "retirement": pred["retirement"],
            "goal": pred["goal"],
            "cashflow": pred["cashflow"],
            "assumptions": pred["assumptions"],
            "events": list_events(),
            "memories": recall(db, user, limit=8, mark_hit=False),
            "disclaimer": DISCLAIMER,
        },
        "财富实验室总览",
    )
