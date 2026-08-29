"""数据备份与导出（Phase 7.6 需求十一）：

GET /api/backup/export?format=json|csv — 导出「当前用户」全部数据（多租户隔离）
GET /api/backup/database                — 整库逻辑备份（需 X-Backup-Key，保留密文原样）

安全约束：
- export 仅导出当前登录用户自己的数据，强制 user_id 过滤。
- database 需携带 X-Backup-Key == settings.backup_api_key（未配置则一律拒绝），
  通过原始连接转储各表「存储值」（加密字段保持密文，可用于还原）。
"""
from __future__ import annotations

import csv
import hmac
import io
import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse, StreamingResponse
from sqlalchemy import inspect, select, text
from sqlalchemy.orm import Session

from backend.ai.models import AIConversation, AIModelConfig, AIUsageLog
from backend.config import get_settings
from backend.core import get_current_user, ok
from backend.core.logging_config import get_logger, log_event
from backend.core.response import fail
from backend.database import engine, get_db
from backend.financial.models import Asset, FinancialProfile, Transaction
from backend.security.audit import client_ip, write_audit
from backend.user.models import User

router = APIRouter(prefix="/backup", tags=["backup"])
logger = get_logger("finos.backup")
settings = get_settings()


def _dt(v) -> str | None:
    return v.isoformat() if isinstance(v, datetime) else None


def _collect_user_data(db: Session, user: User) -> dict:
    """汇总当前用户的全部业务数据（加密字段经 ORM 自动解密为明文）。"""
    profiles = list(db.scalars(select(FinancialProfile).where(FinancialProfile.user_id == user.id)))
    assets = list(db.scalars(select(Asset).where(Asset.user_id == user.id)))
    txns = list(db.scalars(select(Transaction).where(Transaction.user_id == user.id)))
    sessions = list(db.scalars(select(AIConversation).where(AIConversation.user_id == user.id)))
    usage = list(db.scalars(select(AIUsageLog).where(AIUsageLog.user_id == user.id)))
    models = list(db.scalars(select(AIModelConfig).where(AIModelConfig.user_id == user.id)))
    return {
        "exportedAt": datetime.now(timezone.utc).isoformat(),
        "schemaVersion": "7.6",
        "user": {"id": user.id, "email": user.email, "createdAt": _dt(user.created_at)},
        "financialProfiles": [
            {
                "id": p.id,
                "age": p.age,
                "income": p.income,
                "expense": p.expense,
                "riskLevel": p.risk_level,
                "goal": p.goal,
                "createdAt": _dt(p.created_at),
            }
            for p in profiles
        ],
        "assets": [
            {
                "id": a.id,
                "type": a.type,
                "name": a.name,
                "amount": a.amount,
                "source": a.source,
                "createdAt": _dt(a.created_at),
            }
            for a in assets
        ],
        "transactions": [
            {"id": t.id, "type": t.type, "amount": t.amount, "category": t.category, "date": _dt(t.date)}
            for t in txns
        ],
        "aiSessions": [
            {
                "id": s.id,
                "title": s.title,
                "model": s.model,
                "tokens": s.tokens,
                "messages": _safe_json(s.conversation),
                "createdAt": _dt(s.created_at),
            }
            for s in sessions
        ],
        "aiUsage": [
            {
                "id": u.id,
                "model": u.model,
                "provider": u.provider,
                "tokens": u.tokens,
                "inputTokens": u.input_tokens,
                "outputTokens": u.output_tokens,
                "latencyMs": u.latency_ms,
                "requestType": u.request_type,
                "createdAt": _dt(u.created_at),
            }
            for u in usage
        ],
        # 模型配置绝不导出密钥密文/明文，只导出可见掩码信息（需求六/九）
        "aiModelConfigs": [
            {
                "id": m.id,
                "name": m.name,
                "provider": m.provider,
                "baseUrl": m.base_url,
                "modelId": m.model_id,
                "keyMask": m.key_mask,
                "isDefault": m.is_default,
                "status": m.status,
                "createdAt": _dt(m.created_at),
            }
            for m in models
        ],
    }


def _safe_json(raw: str | None):
    try:
        return json.loads(raw or "[]")
    except json.JSONDecodeError:
        return []


@router.get("/export")
def export_my_data(
    request: Request,
    format: str = "json",
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    data = _collect_user_data(db, user)
    write_audit(db, user_id=user.id, action="backup.export", resource=f"format:{format}", request=request)
    db.commit()
    log_event(logger, "info", "backup.export", user_id=user.id, format=format, ip=client_ip(request))

    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    if format.lower() == "csv":
        buf = io.StringIO()
        writer = csv.writer(buf)
        writer.writerow(["category", "id", "name_or_type", "amount_or_detail", "created_at"])
        for a in data["assets"]:
            writer.writerow(["asset", a["id"], f'{a["type"]}:{a["name"]}', a["amount"], a["createdAt"]])
        for t in data["transactions"]:
            writer.writerow(["transaction", t["id"], t["type"], t["amount"], t["date"]])
        for p in data["financialProfiles"]:
            writer.writerow(["profile", p["id"], f'income/expense', f'{p["income"]}/{p["expense"]}', p["createdAt"]])
        buf.seek(0)
        return StreamingResponse(
            iter([buf.getvalue()]),
            media_type="text/csv; charset=utf-8",
            headers={"Content-Disposition": f'attachment; filename="finos-export-{stamp}.csv"'},
        )

    return JSONResponse(
        content=data,
        headers={"Content-Disposition": f'attachment; filename="finos-export-{stamp}.json"'},
    )


@router.get("/database")
def dump_database(request: Request):
    """整库逻辑备份（管理员用）：需在 X-Backup-Key 头携带 BACKUP_API_KEY。"""
    provided = request.headers.get("x-backup-key", "")
    expected = settings.backup_api_key or ""
    if not expected or not hmac.compare_digest(provided, expected):
        log_event(logger, "warning", "backup.database.denied", ip=client_ip(request))
        return fail("无权访问整库备份", status_code=403)

    inspector = inspect(engine)
    dump: dict = {
        "exportedAt": datetime.now(timezone.utc).isoformat(),
        "dialect": engine.dialect.name,
        "tables": {},
    }
    with engine.connect() as conn:
        for table_name in inspector.get_table_names():
            try:
                result = conn.execute(text(f'SELECT * FROM "{table_name}"'))  # noqa: S608 表名来自元数据
                cols = list(result.keys())
                rows = [dict(zip(cols, row)) for row in result.fetchall()]
                dump["tables"][table_name] = rows
            except Exception as exc:  # noqa: BLE001 单表失败不阻断整库
                dump["tables"][table_name] = {"error": type(exc).__name__}

    log_event(logger, "info", "backup.database.ok", tables=len(dump["tables"]), ip=client_ip(request))
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    return JSONResponse(
        content=json.loads(json.dumps(dump, default=str)),
        headers={"Content-Disposition": f'attachment; filename="finos-db-backup-{stamp}.json"'},
    )
