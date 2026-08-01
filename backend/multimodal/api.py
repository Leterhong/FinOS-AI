"""Multimodal API（Phase 7.2）。

路由前缀：/api/multimodal
全部接口强制登录 + user_id 隔离；识别结果一律 needs_confirm，确认后才写 Financial Twin。
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, Form, Request, UploadFile
from sqlalchemy.orm import Session

from backend.core import get_current_user, ok
from backend.core.response import fail
from backend.database import get_db
from backend.multimodal import service
from backend.multimodal.constants import DISCLAIMER, MODALITIES, WELCOME_MESSAGE
from backend.multimodal.router.dispatcher import detect_modality
from backend.multimodal.schemas import (
    ConfirmRequest,
    RejectRequest,
    SpeechRequest,
    TextIngestRequest,
)
from backend.security.audit import write_audit
from backend.user.models import User

router = APIRouter(prefix="/multimodal", tags=["multimodal"])


@router.get("/capabilities")
def capabilities(user: User = Depends(get_current_user)):
    """前端据此决定展示哪些入口（可选依赖缺失时优雅隐藏）。"""

    def _has(mod: str) -> bool:
        try:
            __import__(mod)
            return True
        except Exception:  # noqa: BLE001
            return False

    return ok(
        {
            "modalities": list(MODALITIES),
            "image": {"compress": _has("PIL"), "ocr": _has("pytesseract")},
            "audio": {"serverStt": _has("faster_whisper") or _has("whisper"), "clientStt": True},
            "document": {
                "pdf": _has("pypdf") or _has("PyPDF2"),
                "xlsx": _has("openpyxl"),
                "docx": _has("docx"),
                "native": ["csv", "tsv", "txt", "md", "json", "html"],
            },
            "confirmRequired": True,
            "disclaimer": DISCLAIMER,
        }
    )


# ------------------------------------------------------------------ 摄入
@router.post("/text")
def ingest_text(
    body: TextIngestRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        data = service.ingest_text(db, user, body.text, allow_ai=body.useAi)
    except ValueError as exc:
        return fail(str(exc))
    return ok(data, "已完成识别，请确认后写入")


@router.post("/upload")
async def upload(
    file: UploadFile,
    request: Request,
    modality: str = Form(default=""),
    useAi: str = Form(default="true"),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """统一上传口：图片 / 文件 / 音频自动判类型并分派。"""
    filename = file.filename or "unnamed"
    content = await file.read()
    mod = modality or detect_modality(filename, file.content_type or "", has_file=True)
    if mod not in MODALITIES:
        return fail(f"不支持的输入类型：{mod}")
    try:
        data = service.ingest(
            db, user,
            data=content, filename=filename, mime=file.content_type or "",
            modality=mod, allow_ai=str(useAi).lower() != "false",
        )
    except ValueError as exc:
        return fail(str(exc))
    write_audit(
        db, user_id=user.id, action="multimodal.upload",
        resource=f"multimodal:{data.get('inputId')}", request=request,
    )
    db.commit()
    return ok(data, "已完成识别，请确认后写入")


@router.post("/speech")
def speech(
    body: SpeechRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """语音财富助手（前端 Web Speech API 转写文本走这里，零成本零依赖）。"""
    from backend.multimodal.audio.agent import process_speech

    result = process_speech(db, user, transcript=body.transcript)
    if not result.ok:
        return fail(result.message or "未识别到语音内容")
    payload = result.to_dict()
    if body.autoIngest and result.entities:
        try:
            ingested = service.ingest(
                db, user, text=result.transcript, modality="audio", allow_ai=body.useAi
            )
            payload["inputId"] = ingested.get("inputId")
            payload["extractions"] = ingested.get("extractions", [])
            payload["needsConfirm"] = True
        except ValueError:
            payload["extractions"] = []
    return ok(payload, "语音已识别，请确认后写入")


# ------------------------------------------------------------------ 确认流程
@router.get("/pending")
def pending(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    items = service.list_pending(db, user)
    return ok({"items": items, "count": len(items)})


@router.post("/confirm")
def confirm(
    body: ConfirmRequest,
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        data = service.confirm_extractions(db, user, body.ids, edits=body.edits)
    except ValueError as exc:
        return fail(str(exc))
    except LookupError as exc:
        return fail(str(exc), status_code=404)
    write_audit(db, user_id=user.id, action="multimodal.confirm", resource="financial-twin", request=request)
    db.commit()
    return ok(data, data.get("message", "已写入"))


@router.post("/reject")
def reject(
    body: RejectRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return ok(service.reject_extractions(db, user, body.ids))


# ------------------------------------------------------------------ 历史
@router.get("/inputs")
def inputs(limit: int = 20, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    items = service.list_inputs(db, user, limit=limit)
    if not items:
        return ok({"items": [], "hasData": False, "welcome": WELCOME_MESSAGE})
    return ok({"items": items, "hasData": True})


@router.get("/inputs/{input_id}")
def input_detail(input_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    data = service.get_input(db, user, input_id)
    if data is None:
        return fail("记录不存在", status_code=404)
    return ok(data)


@router.delete("/inputs/{input_id}")
def delete_input(
    input_id: str,
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not service.delete_input(db, user, input_id):
        return fail("记录不存在", status_code=404)
    write_audit(db, user_id=user.id, action="multimodal.delete", resource=f"multimodal:{input_id}", request=request)
    db.commit()
    return ok(None, "已删除")
