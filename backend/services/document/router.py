"""Document 解析路由（Phase 7.0.2 需求十）。

POST /api/documents/analyze        — 解析已上传文件，返回候选财富记录
POST /api/documents/{id}/confirm   — 确认候选记录，保存为资产（source=document）
"""
from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from backend.core import get_current_user, ok
from backend.core.response import fail
from backend.database import get_db
from backend.services.document.service import analyze_document, confirm_document
from backend.tasks import repository as task_repo
from backend.user.models import User

router = APIRouter(prefix="/documents", tags=["documents-parse"])


class ConfirmIn(BaseModel):
    records: list[dict] = Field(default_factory=list)


class AnalyzeIn(BaseModel):
    documentId: str


@router.post("/analyze")
def analyze(body: AnalyzeIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    try:
        result = analyze_document(db, user, body.documentId)
    except KeyError:
        return fail("文件不存在", status_code=404)
    return ok(result)


@router.post("/{document_id}/analyze-async")
def analyze_async(document_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """大文件解析异步化（Phase 7.0.4 十）：立即返回 task_id，后台执行解析，前端轮询 /api/tasks/{id}。"""
    task = task_repo.create_task(db, "document_analysis", {"documentId": document_id}, user_id=user.id)
    return ok({"task_id": task.id, "status": task.status})


@router.post("/{document_id}/confirm")
def confirm(document_id: str, body: ConfirmIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    try:
        result = confirm_document(db, user, document_id, body.records)
    except KeyError:
        return fail("文件不存在", status_code=404)
    return ok(result, f"已保存 {result['count']} 条资产")
