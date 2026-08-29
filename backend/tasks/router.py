"""异步任务 HTTP 接口（Phase 7.0.4 八、九）。

POST /api/tasks        创建任务，立即返回 task_id（不阻塞）
GET  /api/tasks/{id}    轮询任务状态与结果
"""
from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from backend.core import get_current_user, ok
from backend.core.response import fail
from backend.database import get_db
from backend.tasks import repository as repo
from backend.user.models import User

router = APIRouter(prefix="/tasks", tags=["tasks"])


class TaskCreateIn(BaseModel):
    task_type: str = Field(min_length=1, max_length=40)
    payload: dict = Field(default_factory=dict)


@router.post("")
def create_task(body: TaskCreateIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    task = repo.create_task(db, body.task_type, body.payload, user_id=user.id)
    return ok({"task_id": task.id, "status": task.status, "task_type": task.task_type})


@router.get("/{task_id}")
def get_task(task_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    task = repo.get_task(db, task_id)
    if task is None:
        return fail("任务不存在", status_code=404)
    # 用户隔离：任务一律归属创建者；无主任务（历史脏数据）不对外可见。
    if not task.user_id or task.user_id != user.id:
        return fail("任务不存在", status_code=404)
    return ok(
        {
            "task_id": task.id,
            "task_type": task.task_type,
            "status": task.status,
            "progress": task.progress,
            "result": task.result,
            "error": task.error,
            "created_at": task.created_at.isoformat() if task.created_at else None,
        }
    )
