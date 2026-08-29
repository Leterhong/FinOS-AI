"""多模态服务层（Phase 7.2 需求四：确认流程铁律）。

    上传 → Agent 识别 → 提取 → **用户确认** → 写入 Financial Twin

铁律：
1. ingest_* 只创建 MultimodalInput + ExtractionResult(needs_confirm)，**绝不修改任何财富数据**。
2. 只有 confirm_extractions 才会写 Asset / FinancialProfile / Transaction。
3. 全流程强制 user_id 隔离；跨用户访问一律 404（不泄露资源是否存在）。
"""
from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.core.cache import cache_invalidate_prefix
from backend.financial.models import Asset, FinancialProfile, Transaction
from backend.multimodal.constants import (
    KIND_ASSET,
    KIND_EXPENSE,
    KIND_GOAL,
    KIND_INCOME,
    KIND_LIABILITY,
    KIND_PROFILE,
    MAX_TEXT_CHARS,
    MODALITY_TEXT,
    STATUS_CONFIRMED,
    STATUS_NEEDS_CONFIRM,
    STATUS_REJECTED,
)
from backend.multimodal.models import ExtractionResult, MultimodalInput
from backend.multimodal.router.dispatcher import detect_modality, dispatch, validate_size
from backend.multimodal.storage import content_hash as hash_bytes, save_encrypted
from backend.user.models import User


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _invalidate(user_id: str) -> None:
    """财富数据变化 → 清掉相关缓存（Twin / Intelligence / 报告）。"""
    for prefix in (f"twin:{user_id}", f"wi:", f"report:{user_id}", f"agent:{user_id}"):
        try:
            cache_invalidate_prefix(prefix)
        except Exception:  # noqa: BLE001
            pass


# ------------------------------------------------------------------ 摄入
def ingest(
    db: Session,
    user: User,
    *,
    text: str = "",
    data: bytes | None = None,
    filename: str = "",
    mime: str = "",
    modality: str | None = None,
    allow_ai: bool = True,
) -> dict:
    """统一摄入入口：自动判类型 → 分派 → 落 needs_confirm。"""
    text = (text or "")[:MAX_TEXT_CHARS]
    mod = modality or detect_modality(filename, mime, has_file=bool(data))

    size = len(data) if data else 0
    err = validate_size(mod, size)
    if err:
        raise ValueError(err)
    if not data and not text.strip():
        raise ValueError("请输入文字，或上传图片 / 文件 / 语音。")

    chash = hash_bytes(data) if data else hash_bytes(text.encode("utf-8"))
    input_id = uuid.uuid4().hex

    storage_path = None
    if data:
        try:
            storage_path = save_encrypted(user.id, input_id, filename or f"{mod}.bin", data)
        except Exception:  # noqa: BLE001 — 存储失败不阻断识别
            storage_path = None

    record = MultimodalInput(
        id=input_id,
        user_id=user.id,
        modality=mod,
        filename=(filename or "")[:300],
        mime=(mime or "")[:120],
        size_bytes=size,
        content_hash=chash,
        storage_path=storage_path,
        status="processing",
    )
    db.add(record)
    db.flush()

    try:
        result = dispatch(
            db, user, modality=mod, text=text, data=data,
            filename=filename, content_hash=chash, allow_ai=allow_ai,
        )
    except Exception as exc:  # noqa: BLE001
        record.status = "failed"
        record.error = str(exc)[:500]
        db.commit()
        raise ValueError("识别失败，请稍后重试或换一种输入方式。") from exc

    record.status = "extracted"
    record.subtype = (result.subtype or "")[:40]
    record.raw_text = (result.raw_text or "")[:20000] or None
    record.summary = (result.summary or "")[:1000]
    record.tier = result.tier

    extractions: list[ExtractionResult] = []
    for e in result.entities:
        row = ExtractionResult(
            user_id=user.id,
            input_id=input_id,
            kind=e.kind,
            label=(e.label or "")[:200],
            asset_type=(e.asset_type or "other")[:30],
            amount=round(float(e.amount or 0.0), 2),
            occurred_at=(e.occurred_at or "")[:40],
            confidence=round(float(e.confidence or 0.5), 2),
            evidence=(e.evidence or "")[:500],
            payload=json.dumps(e.payload or {}, ensure_ascii=False),
            status=STATUS_NEEDS_CONFIRM,
        )
        db.add(row)
        extractions.append(row)
    db.commit()

    payload = result.to_dict()
    payload.update(
        {
            "inputId": input_id,
            "needsConfirm": True,
            "extractions": [serialize_extraction(x) for x in extractions],
            "note": "识别结果不会自动写入你的财富分身，请逐条确认后再应用。",
        }
    )
    return payload


def ingest_text(db: Session, user: User, text: str, *, allow_ai: bool = True) -> dict:
    return ingest(db, user, text=text, modality=MODALITY_TEXT, allow_ai=allow_ai)


# ------------------------------------------------------------------ 查询
def serialize_extraction(x: ExtractionResult) -> dict:
    try:
        payload = json.loads(x.payload or "{}")
    except json.JSONDecodeError:
        payload = {}
    return {
        "id": x.id,
        "inputId": x.input_id,
        "kind": x.kind,
        "label": x.label,
        "assetType": x.asset_type,
        "amount": round(float(x.amount or 0.0), 2),
        "currency": x.currency,
        "occurredAt": x.occurred_at,
        "confidence": round(float(x.confidence or 0.0), 2),
        "evidence": x.evidence,
        "payload": payload,
        "status": x.status,
        "applied": bool(x.applied),
        "createdAt": x.created_at.isoformat() if x.created_at else None,
    }


def serialize_input(rec: MultimodalInput, extractions: list[ExtractionResult] | None = None) -> dict:
    return {
        "id": rec.id,
        "modality": rec.modality,
        "subtype": rec.subtype,
        "filename": rec.filename,
        "mime": rec.mime,
        "sizeBytes": rec.size_bytes,
        "summary": rec.summary,
        "tier": rec.tier,
        "status": rec.status,
        "error": rec.error,
        "createdAt": rec.created_at.isoformat() if rec.created_at else None,
        "extractions": [serialize_extraction(x) for x in (extractions or [])],
    }


def list_inputs(db: Session, user: User, limit: int = 20) -> list[dict]:
    rows = list(
        db.scalars(
            select(MultimodalInput)
            .where(MultimodalInput.user_id == user.id)
            .order_by(MultimodalInput.created_at.desc())
            .limit(min(limit, 100))
        )
    )
    if not rows:
        return []
    ids = [r.id for r in rows]
    ex = list(
        db.scalars(
            select(ExtractionResult).where(
                ExtractionResult.user_id == user.id, ExtractionResult.input_id.in_(ids)
            )
        )
    )
    grouped: dict[str, list[ExtractionResult]] = {}
    for x in ex:
        grouped.setdefault(x.input_id, []).append(x)
    return [serialize_input(r, grouped.get(r.id, [])) for r in rows]


def list_pending(db: Session, user: User, limit: int = 100) -> list[dict]:
    rows = db.scalars(
        select(ExtractionResult)
        .where(
            ExtractionResult.user_id == user.id,
            ExtractionResult.status == STATUS_NEEDS_CONFIRM,
        )
        .order_by(ExtractionResult.created_at.desc())
        .limit(min(limit, 200))
    )
    return [serialize_extraction(x) for x in rows]


def get_input(db: Session, user: User, input_id: str) -> dict | None:
    rec = db.scalar(
        select(MultimodalInput).where(
            MultimodalInput.id == input_id, MultimodalInput.user_id == user.id
        )
    )
    if rec is None:
        return None
    ex = list(
        db.scalars(
            select(ExtractionResult).where(
                ExtractionResult.user_id == user.id, ExtractionResult.input_id == input_id
            )
        )
    )
    return serialize_input(rec, ex)


# ------------------------------------------------------------------ 确认 / 拒绝
def _ensure_profile(db: Session, user: User) -> FinancialProfile:
    profile = db.scalar(select(FinancialProfile).where(FinancialProfile.user_id == user.id))
    if profile is None:
        profile = FinancialProfile(user_id=user.id)
        db.add(profile)
        db.flush()
    return profile


def _apply_one(db: Session, user: User, x: ExtractionResult) -> tuple[bool, str]:
    """把一条提取结果写入 Financial Twin。返回 (是否写入, 引用 id)。"""
    try:
        payload = json.loads(x.payload or "{}")
    except json.JSONDecodeError:
        payload = {}

    if x.kind in (KIND_ASSET, KIND_LIABILITY):
        asset = Asset(
            user_id=user.id,
            type=(x.asset_type or "other"),
            name=(x.label or "未命名条目")[:200],
            amount=round(float(x.amount or 0.0), 2),
            source="multimodal",
        )
        db.add(asset)
        db.flush()
        return True, asset.id

    if x.kind == KIND_INCOME:
        profile = _ensure_profile(db, user)
        amount = round(float(x.amount or 0.0), 2)
        # 仅聚合口径（月薪/月收入/每月…）才覆盖月度收入画像；单笔流水
        # （如一笔 5 万年终奖）不得把整个月收入改成这笔金额。
        if payload.get("aggregate"):
            monthly = payload.get("monthlyAvg")
            profile.income = round(float(monthly), 2) if monthly else amount
        db.add(
            Transaction(user_id=user.id, type="income", amount=amount, category="salary")
        )
        db.flush()
        return True, profile.id

    if x.kind == KIND_EXPENSE:
        profile = _ensure_profile(db, user)
        amount = round(float(x.amount or 0.0), 2)
        if payload.get("aggregate"):
            monthly = payload.get("monthlyAvg")
            profile.expense = round(float(monthly), 2) if monthly else amount
        db.add(
            Transaction(user_id=user.id, type="expense", amount=amount,
                        category=payload.get("category", "other"))
        )
        db.flush()
        return True, profile.id

    if x.kind == KIND_GOAL:
        profile = _ensure_profile(db, user)
        profile.goal = (payload.get("value") or x.label or "")[:500]
        db.flush()
        return True, profile.id

    if x.kind == KIND_PROFILE:
        profile = _ensure_profile(db, user)
        field_name = payload.get("field")
        value = payload.get("value")
        if field_name == "age" and value:
            profile.age = int(value)
        elif field_name == "riskLevel" and value:
            profile.risk_level = str(value)[:20]
        else:
            return False, ""
        db.flush()
        return True, profile.id

    return False, ""


def confirm_extractions(
    db: Session, user: User, ids: list[str], *, edits: dict[str, dict] | None = None
) -> dict:
    """用户确认后写入 Financial Twin（需求四的唯一写入口）。"""
    if not ids:
        raise ValueError("请至少选择一条要确认的识别结果。")
    rows = list(
        db.scalars(
            select(ExtractionResult).where(
                ExtractionResult.user_id == user.id, ExtractionResult.id.in_(ids)
            )
        )
    )
    if not rows:
        raise LookupError("未找到对应的识别结果。")

    edits = edits or {}
    applied, skipped = [], []
    for x in rows:
        if x.status == STATUS_CONFIRMED:
            skipped.append(x.id)
            continue
        patch = edits.get(x.id) or {}
        if "amount" in patch:
            try:
                x.amount = round(float(patch["amount"]), 2)
            except (TypeError, ValueError):
                pass
        if patch.get("label"):
            x.label = str(patch["label"])[:200]
        if patch.get("assetType"):
            x.asset_type = str(patch["assetType"])[:30]
        if patch.get("kind"):
            x.kind = str(patch["kind"])[:20]

        done, ref = _apply_one(db, user, x)
        if done:
            x.status = STATUS_CONFIRMED
            x.applied = True
            x.applied_ref = ref
            applied.append(x.id)
        else:
            skipped.append(x.id)
    db.commit()
    _invalidate(user.id)
    return {
        "applied": applied,
        "appliedCount": len(applied),
        "skipped": skipped,
        "message": f"已确认并写入 {len(applied)} 条财富数据。" if applied else "没有可写入的条目。",
    }


def reject_extractions(db: Session, user: User, ids: list[str]) -> dict:
    rows = list(
        db.scalars(
            select(ExtractionResult).where(
                ExtractionResult.user_id == user.id, ExtractionResult.id.in_(ids or [])
            )
        )
    )
    for x in rows:
        if x.status == STATUS_NEEDS_CONFIRM:
            x.status = STATUS_REJECTED
    db.commit()
    return {"rejectedCount": len(rows), "message": f"已忽略 {len(rows)} 条识别结果。"}


def delete_input(db: Session, user: User, input_id: str) -> bool:
    rec = db.scalar(
        select(MultimodalInput).where(
            MultimodalInput.id == input_id, MultimodalInput.user_id == user.id
        )
    )
    if rec is None:
        return False
    from backend.multimodal.storage import delete_file

    if rec.storage_path:
        delete_file(user.id, rec.storage_path)
    for x in db.scalars(
        select(ExtractionResult).where(
            ExtractionResult.user_id == user.id, ExtractionResult.input_id == input_id
        )
    ):
        db.delete(x)
    db.delete(rec)
    db.commit()
    return True
