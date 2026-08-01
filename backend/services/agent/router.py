"""Agent 编排路由（Phase 7.0.2 需求五/六）。

POST /api/agent/tasks      — 触发一次编排（持久化到 agent_tasks）
GET  /api/agent/tasks      — 任务列表（状态机）
GET  /api/agent/tasks/{id} — 任务详情 + 执行结果
"""
from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from backend.core import get_current_user, ok
from backend.core.response import fail
from backend.database import get_db
from backend.services.agent.service import get_task, list_tasks, run_orchestration
from backend.user.models import User

router = APIRouter(prefix="/agent/tasks", tags=["agent"])

TASK_TYPES = {"general", "cfo", "monitor", "rag", "import"}


class RunIn(BaseModel):
    task_type: str = "general"
    question: str = ""


@router.post("")
def run(body: RunIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if body.task_type not in TASK_TYPES:
        return fail(f"task_type 必须是 {sorted(TASK_TYPES)} 之一")
    try:
        result = run_orchestration(db, user, body.task_type, body.question)
    except Exception as e:  # noqa: BLE001
        return fail(f"编排失败：{e}", status_code=500)
    return ok(result, "Agent 编排完成")


@router.get("")
def list_all(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return ok({"tasks": list_tasks(db, user)})


@router.get("/{task_id}")
def detail(task_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    task = get_task(db, user, task_id)
    if task is None:
        return fail("任务不存在", status_code=404)
    return ok(task)
