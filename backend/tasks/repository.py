"""异步任务仓储（Phase 7.0.4 八、九）。"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy import select, update
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
    """以条件更新认领任务，避免多 Worker 对同一任务重复执行。"""
    candidate_ids = list(
        db.scalars(
            select(AsyncTask.id)
            .where(AsyncTask.status == "pending")
            .order_by(AsyncTask.created_at)
            .limit(limit)
        )
    )
    claimed_ids: list[str] = []
    started_at = _utcnow()
    for task_id in candidate_ids:
        result = db.execute(
            update(AsyncTask)
            .where(AsyncTask.id == task_id, AsyncTask.status == "pending")
            .values(status="running", started_at=started_at)
        )
        if result.rowcount == 1:
            claimed_ids.append(task_id)
    db.commit()
    if not claimed_ids:
        return []
    return list(db.scalars(select(AsyncTask).where(AsyncTask.id.in_(claimed_ids))))


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
