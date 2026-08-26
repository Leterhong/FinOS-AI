"""AI CFO 路由（Phase 7.0.2 需求七）。

POST /api/cfo/analyze — 读取 Twin + Memory + RAG + 用户模型，生成财富建议
"""
from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.core import get_current_user, ok
from backend.core.response import fail
from backend.database import get_db
from backend.services.cfo.service import analyze
from backend.user.models import User

router = APIRouter(prefix="/cfo", tags=["cfo"])


class AnalyzeIn(BaseModel):
    question: str = ""


@router.post("/analyze")
def cfo_analyze(body: AnalyzeIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    try:
        result = analyze(db, user, body.question)
    except Exception:  # noqa: BLE001
        return fail("CFO 分析失败，请稍后重试", status_code=500)
    return ok(result)
