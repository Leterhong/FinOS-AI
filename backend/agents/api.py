"""Agent Ecosystem API（Phase 7.2）。

路由前缀：/api/agents
"""
from __future__ import annotations

import hashlib
import json

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.agents import registry
from backend.agents.context import build_agent_context
from backend.agents.models import AgentRunLog
from backend.agents.schemas import (
    AgentConfigRequest,
    RunAgentRequest,
    RunWorkflowRequest,
    ToolCallRequest,
)
from backend.agents.tools import list_tools, run_tool
from backend.agents.workflow import run_single, run_workflow
from backend.core import get_current_user, ok
from backend.core.cache import cache_get, cache_set
from backend.core.response import fail
from backend.database import get_db
from backend.user.models import User

router = APIRouter(prefix="/agents", tags=["agents"])

WORKFLOW_TTL = 180


# ------------------------------------------------------------------ 市场 / 配置
@router.get("/market")
def market(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Agent Marketplace：所有可用 Agent + 本人开关状态（需求十二）。"""
    return ok({"items": registry.marketplace(db, user)})


@router.put("/market/{name}")
def configure(
    name: str,
    body: AgentConfigRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        data = registry.set_user_agent(
            db, user, name,
            enabled=body.enabled, priority=body.priority,
            focus=body.focus, settings=body.settings,
        )
    except LookupError as exc:
        return fail(str(exc), status_code=404)
    return ok(data, "已更新 Agent 配置")


# ------------------------------------------------------------------ 工具
@router.get("/tools")
def tools(user: User = Depends(get_current_user)):
    return ok({"items": list_tools()})


@router.post("/tools/call")
def call_tool(
    body: ToolCallRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Tool Calling 调试入口（强制走本人上下文，无法跨用户查询）。"""
    ctx = build_agent_context(db, user, with_memory=False)
    result = run_tool(ctx, body.tool, **(body.params or {}))
    if not result.get("ok", True):
        return fail(result.get("error", "工具调用失败"))
    return ok(result)


# ------------------------------------------------------------------ 执行
@router.post("/run/{name}")
def run_agent(
    name: str,
    body: RunAgentRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        data = run_single(db, user, name, question=body.question, use_ai=body.useAi)
    except LookupError as exc:
        return fail(str(exc), status_code=404)
    return ok(data)


@router.post("/workflow")
def workflow(
    body: RunWorkflowRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """多 Agent 工作流（串行 + 并行 + 条件编排）。"""
    # 内置 hash() 每进程随机化（PYTHONHASHSEED）且可能碰撞，改用 sha256 稳定键。
    digest = hashlib.sha256(
        json.dumps([body.question, sorted(body.agents or [])], ensure_ascii=False).encode("utf-8")
    ).hexdigest()
    key = f"agent:{user.id}:wf:{digest}"
    if not body.question:
        cached = cache_get(key)
        if cached:
            return ok(cached)
    data = run_workflow(
        db, user,
        question=body.question, use_ai=body.useAi,
        agents=body.agents, persist=body.persist,
    )
    if not body.question and data.get("hasData"):
        cache_set(key, data, ttl_seconds=WORKFLOW_TTL)
    return ok(data)


@router.get("/runs")
def runs(limit: int = 20, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.scalars(
        select(AgentRunLog)
        .where(AgentRunLog.user_id == user.id)
        .order_by(AgentRunLog.created_at.desc())
        .limit(min(limit, 100))
    )
    items = []
    for r in rows:
        try:
            result = json.loads(r.result or "{}")
        except json.JSONDecodeError:
            result = {}
        items.append(
            {
                "id": r.id,
                "kind": r.kind,
                "agentName": r.agent_name,
                "question": r.question,
                "tier": r.tier,
                "ok": r.ok,
                "elapsedMs": r.elapsed_ms,
                "summary": result,
                "createdAt": r.created_at.isoformat() if r.created_at else None,
            }
        )
    return ok({"items": items})
