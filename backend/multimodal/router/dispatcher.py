"""Multimodal Router（Phase 7.2 需求二）。

职责：判断输入类型 → 分派到对应 Agent。

    文本 → Text Agent
    图片 → Vision Agent
    文件 → Document Agent
    语音 → Audio Agent

分派结果统一为 DispatchResult，供 service 层落库成 needs_confirm 提取项。
"""
from __future__ import annotations

from dataclasses import dataclass, field

from sqlalchemy.orm import Session

from backend.multimodal.constants import (
    AUDIO_EXTS,
    DOCUMENT_EXTS,
    IMAGE_EXTS,
    MAX_BYTES_BY_MODALITY,
    MODALITY_AUDIO,
    MODALITY_DOCUMENT,
    MODALITY_IMAGE,
    MODALITY_TEXT,
    TIER_LOCAL,
)
from backend.multimodal.text.extractor import Entity
from backend.user.models import User


@dataclass
class DispatchResult:
    modality: str = MODALITY_TEXT
    ok: bool = False
    tier: str = TIER_LOCAL
    subtype: str = ""
    raw_text: str = ""
    entities: list[Entity] = field(default_factory=list)
    summary: str = ""
    message: str = ""
    extra: dict = field(default_factory=dict)

    def to_dict(self) -> dict:
        return {
            "modality": self.modality,
            "ok": self.ok,
            "tier": self.tier,
            "subtype": self.subtype,
            "entities": [e.to_dict() for e in self.entities],
            "summary": self.summary,
            "message": self.message,
            **self.extra,
        }


def detect_modality(filename: str = "", mime: str = "", has_file: bool = False) -> str:
    """自动判断输入类型（需求二）。"""
    mime = (mime or "").lower()
    name = (filename or "").lower()
    ext = "." + name.rsplit(".", 1)[-1] if "." in name else ""

    if mime.startswith("image/") or ext in IMAGE_EXTS:
        return MODALITY_IMAGE
    if mime.startswith("audio/") or mime.startswith("video/webm") or ext in AUDIO_EXTS:
        return MODALITY_AUDIO
    if ext in DOCUMENT_EXTS or mime.startswith("application/") or mime == "text/csv":
        return MODALITY_DOCUMENT
    if has_file:
        return MODALITY_DOCUMENT
    return MODALITY_TEXT


def validate_size(modality: str, size: int) -> str:
    """超限返回错误提示，正常返回空串（需求十八）。"""
    limit = MAX_BYTES_BY_MODALITY.get(modality)
    if limit and size > limit:
        return f"文件过大（{size / 1024 / 1024:.1f}MB），{modality} 类型上限为 {limit // 1024 // 1024}MB。"
    return ""


def dispatch(
    db: Session,
    user: User,
    *,
    modality: str,
    text: str = "",
    data: bytes | None = None,
    filename: str = "",
    content_hash: str = "",
    allow_ai: bool = True,
) -> DispatchResult:
    """按模态分派到对应 Agent。任何子 Agent 失败都返回可读提示，绝不抛异常。"""
    if modality == MODALITY_IMAGE and data:
        from backend.multimodal.vision.agent import analyze_image

        r = analyze_image(db, user, data, content_hash=content_hash, allow_ai=allow_ai)
        return DispatchResult(
            modality=MODALITY_IMAGE, ok=r.ok, tier=r.tier, subtype=r.subtype,
            raw_text=r.raw_text, entities=r.entities, summary=r.summary, message=r.message,
        )

    if modality == MODALITY_AUDIO:
        from backend.multimodal.audio.agent import process_speech

        r = process_speech(db, user, audio=data, filename=filename, transcript=text)
        return DispatchResult(
            modality=MODALITY_AUDIO, ok=r.ok, tier=TIER_LOCAL,
            raw_text=r.transcript, entities=r.entities, summary=r.summary, message=r.message,
            extra={
                "transcript": r.transcript,
                "sttEngine": r.stt_engine,
                "analysis": r.analysis.to_dict() if r.analysis else None,
            },
        )

    if modality == MODALITY_DOCUMENT and data:
        from backend.multimodal.document.parser import parse_document

        r = parse_document(filename, data)
        return DispatchResult(
            modality=MODALITY_DOCUMENT, ok=r.ok, tier=TIER_LOCAL, subtype=r.subtype,
            raw_text=r.text, entities=r.entities, summary=r.summary, message=r.message,
            extra={"docKind": r.kind, "rows": r.rows},
        )

    # 默认：文本
    from backend.multimodal.text.analyzer import analyze_text

    a = analyze_text(text)
    return DispatchResult(
        modality=MODALITY_TEXT, ok=bool(a.entities), tier=TIER_LOCAL, subtype=a.subtype,
        raw_text=text, entities=a.entities or [], summary=a.summary,
        extra={"analysis": a.to_dict()},
    )
