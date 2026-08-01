"""财富监控路由（Phase 7.0.2 需求十一）。

POST /api/monitor/run — 运行监控流水线，变化写入通知表
"""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from backend.core import get_current_user, ok
from backend.core.response import fail
from backend.database import get_db
from backend.services.monitor.service import run
from backend.user.models import User

router = APIRouter(prefix="/monitor", tags=["monitor"])


@router.post("/run")
def monitor_run(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    try:
        result = run(db, user)
    except Exception as e:  # noqa: BLE001
        return fail(f"监控失败：{e}", status_code=500)
    return ok(result)
