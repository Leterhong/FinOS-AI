"""异步任务仓储（Phase 7.0.4 八、九）。"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.database.base import Base
from backend.tasks.models import AsyncTask


def _to_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, default=str)


def create_task(
    db: Session,
    task_type: str,
    payload: Any,
    user_id: Optional[str] = None,
) -> AsyncTask:
    task = AsyncTask(
        user_id=user_id,
        task_type=task_type,
        status="pending",
        payload=_to_json(payload),
        progress=0,
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    return task


def get_task(db: Session, task_id: str) -> Optional[AsyncTask]:
    return db.execute(select(AsyncTask).where(AsyncTask.id == task_id)).scalar_one_or_none()


def claim_pending(db: Session, limit: int = 10) -> list[AsyncTask]:
    """原子地认领一批待处理任务（SQLite 下用 status 过滤即可）。"""
    rows = db.execute(
        select(AsyncTask).where(AsyncTask.status == "pending").order_by(AsyncTask.created_at).limit(limit)
    ).scalars().all()
    for row in rows:
        row.status = "running"
        row.started_at = _utcnow()
    db.commit()
    return rows


def mark_completed(db: Session, task: AsyncTask, result: Any) -> None:
    task.status = "completed"
    task.result = _to_json(result)
    task.progress = 100
    task.finished_at = _utcnow()
    db.commit()


def mark_failed(db: Session, task: AsyncTask, error: str) -> None:
    task.status = "failed"
    task.error = error
    task.finished_at = _utcnow()
    db.commit()


def set_progress(db: Session, task: AsyncTask, progress: int) -> None:
    task.progress = progress
    db.commit()


def _utcnow():
    return datetime.now(timezone.utc)


# 确保 Base 已注册（避免 create_all 遗漏）
_ = Base
