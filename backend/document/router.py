"""Document Service（Phase 7.0.1 需求十）：

POST   /api/documents/upload — 文件存后端磁盘，绑定 user_id
GET    /api/documents        — 仅本人文件
DELETE /api/documents/{id}   — 仅本人可删（含物理文件）
"""
from __future__ import annotations

import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, Request, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.config import UPLOAD_DIR
from backend.core import get_current_user, ok
from backend.core.response import fail
from backend.core.uploads import UploadTooLarge, read_upload_limited
from backend.database import get_db
from backend.document.models import Document
from backend.security.audit import write_audit
from backend.security.permission import require_owned_resource
from backend.user.models import User

router = APIRouter(prefix="/documents", tags=["documents"])

MAX_SIZE = 20 * 1024 * 1024  # 20MB
ALLOWED_EXT = {".pdf", ".csv", ".xlsx", ".xls", ".png", ".jpg", ".jpeg", ".txt", ".json"}


@router.post("/upload")
async def upload(file: UploadFile, request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    filename = file.filename or "unnamed"
    ext = Path(filename).suffix.lower()
    if ext not in ALLOWED_EXT:
        return fail(f"不支持的文件类型：{ext}")
    try:
        content = await read_upload_limited(file, MAX_SIZE)
    except UploadTooLarge as exc:
        return fail(str(exc), status_code=413)

    # 按用户隔离目录存储，文件名用 UUID 防穿越/冲突
    user_dir = UPLOAD_DIR / user.id
    user_dir.mkdir(parents=True, exist_ok=True)
    stored_name = f"{uuid.uuid4().hex}{ext}"
    storage_path = user_dir / stored_name
    storage_path.write_bytes(content)

    doc = Document(user_id=user.id, filename=filename, storage_path=str(storage_path), status="uploaded")
    db.add(doc)
    db.commit()
    db.refresh(doc)
    write_audit(db, user_id=user.id, action="document.upload", resource=f"document:{doc.id}", request=request)
    db.commit()
    return ok({"id": doc.id, "filename": doc.filename, "status": doc.status}, "文件已上传")


@router.get("")
def list_documents(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    docs = list(
        db.scalars(select(Document).where(Document.user_id == user.id).order_by(Document.created_at.desc()))
    )
    return ok(
        {
            "documents": [
                {
                    "id": d.id,
                    "filename": d.filename,
                    "status": d.status,
                    "createdAt": d.created_at.isoformat() if d.created_at else None,
                }
                for d in docs
            ]
        }
    )


@router.get("/{doc_id}/download")
def download_document(doc_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    doc = require_owned_resource(db, Document, doc_id, user.id)
    path = Path(doc.storage_path).resolve()
    user_root = (UPLOAD_DIR / user.id).resolve()
    if not path.is_file() or user_root not in path.parents:
        return fail("文件不可用", status_code=404)
    return FileResponse(path=path, filename=doc.filename, media_type="application/octet-stream")


@router.delete("/{doc_id}")
def delete_document(doc_id: str, request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    doc = require_owned_resource(db, Document, doc_id, user.id)
    try:
        p = Path(doc.storage_path)
        if p.is_file() and UPLOAD_DIR in p.parents:
            p.unlink()
    except OSError:
        pass
    db.delete(doc)
    write_audit(db, user_id=user.id, action="document.delete", resource=f"document:{doc_id}", request=request)
    db.commit()
    return ok(None, "文件已删除")
