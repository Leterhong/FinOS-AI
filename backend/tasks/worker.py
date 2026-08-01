"""异步任务 Worker（Phase 7.0.4 八、九）。

后台守护线程：周期性认领 pending 任务并执行，更新 status / result / error。
避免阻塞 HTTP 请求——创建任务立即返回 task_id，结果由 Worker 异步产出。
"""
from __future__ import annotations

import json
import logging
import threading

from backend.database import SessionLocal
from backend.tasks import repository as repo
from backend.tasks.registry import run_handler

logger = logging.getLogger("finos.tasks")

_stop = threading.Event()
_worker_thread: "threading.Thread | None" = None


def _process_once() -> None:
    db = SessionLocal()
    try:
        tasks = repo.claim_pending(db, limit=10)
        for task in tasks:
            user_id = task.user_id
            try:
                payload = json.loads(task.payload) if task.payload else {}
            except Exception:  # noqa: BLE001
                payload = {}
            try:
                result = run_handler(task.task_type, payload, db, user_id)
                if result.get("error"):
                    repo.mark_failed(db, task, str(result["error"]))
                else:
                    repo.mark_completed(db, task, result)
            except Exception as exc:  # noqa: BLE001
                logger.exception("task_exec_failed")
                repo.mark_failed(db, task, str(exc))
    finally:
        db.close()


def _loop(interval: float = 1.0) -> None:
    while not _stop.is_set():
        try:
            _process_once()
        except Exception:  # noqa: BLE001
            logger.exception("worker_loop_error")
        _stop.wait(interval)


def start_worker() -> None:
    global _worker_thread
    if _worker_thread and _worker_thread.is_alive():
        return
    _stop.clear()
    _worker_thread = threading.Thread(target=_loop, name="finos-task-worker", daemon=True)
    _worker_thread.start()
    logger.info("task_worker_started")


def stop_worker() -> None:
    _stop.set()
