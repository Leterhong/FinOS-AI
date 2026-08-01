"""AI 服务网关接口（Phase 7.0.1 需求八/九）：

模型配置（Key 全程加密，前端只见名称/状态/掩码）：
  POST   /api/ai/models        — 保存配置（Fernet 加密入库）
  GET    /api/ai/models        — 列表（绝不含 Key）
  DELETE /api/ai/models/{id}
  POST   /api/ai/models/{id}/test — 后端解密测连

调用（统一入口 + 用量落库 AIUsageLog）：
  POST /api/ai/generate
  POST /api/ai/stream   （SSE）
  POST /api/ai/embed
  GET  /api/ai/usage
"""
from __future__ import annotations

import json
import time

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from backend.ai.gateway import GatewayError, embed as gw_embed, generate as gw_generate
from backend.ai.gateway import stream as gw_stream, test_connection
from backend.ai.models import AIConversation, AIModelConfig, AIUsageLog
from backend.core import get_current_user, ok
from backend.core.response import fail
from backend.core.security import decrypt_secret, encrypt_secret, mask_key
from backend.database import SessionLocal, get_db
from backend.config import get_settings
from backend.security.audit import write_audit, write_security_event
from backend.security.permission import require_owned_resource
from backend.user.models import User

router = APIRouter(prefix="/ai", tags=["ai"])
settings = get_settings()


def _validate_ai_request(messages: list[dict], max_tokens: int) -> str | None:
    if max_tokens > settings.ai_max_tokens:
        return f"max_tokens 不能超过 {settings.ai_max_tokens}"
    total_chars = sum(len(str(message.get("content", ""))) for message in messages)
    if total_chars > settings.ai_max_input_chars:
        return "请求内容超过安全上限"
    return None


class ModelConfigIn(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    provider: str = "openai-compatible"
    base_url: str = Field(min_length=8, max_length=300)
    model_id: str = Field(min_length=1, max_length=100)
    api_key: str = Field(min_length=1, max_length=500)
    is_default: bool = False


class GenerateIn(BaseModel):
    messages: list[dict] = Field(min_length=1, max_length=100)
    model_config_id: str | None = None
    temperature: float = Field(default=0.7, ge=0, le=2)
    max_tokens: int = Field(default=4096, ge=1)


class EmbedIn(BaseModel):
    texts: list[str]
    model_config_id: str | None = None


def _config_public(c: AIModelConfig) -> dict:
    """前端可见字段：绝不包含 api_key_encrypted / 明文 Key（需求九）。"""
    return {
        "id": c.id,
        "name": c.name,
        "provider": c.provider,
        "baseUrl": c.base_url,
        "modelId": c.model_id,
        "keyMask": c.key_mask,
        "isDefault": c.is_default,
        "status": c.status,
        "createdAt": c.created_at.isoformat() if c.created_at else None,
    }


def _resolve_config(db: Session, user: User, config_id: str | None) -> AIModelConfig | None:
    q = select(AIModelConfig).where(AIModelConfig.user_id == user.id)
    if config_id:
        return require_owned_resource(db, AIModelConfig, config_id, user.id)
    return db.scalar(q.where(AIModelConfig.is_default == True)) or db.scalar(q)  # noqa: E712


def _log_usage(
    user_id: str,
    model: str,
    tokens: int,
    request_type: str,
    *,
    provider: str = "openai-compatible",
    input_tokens: int = 0,
    output_tokens: int = 0,
    latency_ms: int = 0,
) -> None:
    with SessionLocal() as s:
        s.add(
            AIUsageLog(
                user_id=user_id,
                model=model,
                provider=provider,
                tokens=tokens,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                latency_ms=latency_ms,
                request_type=request_type,
            )
        )
        s.commit()


# ---------- 模型配置 ----------
@router.post("/models")
def create_model(body: ModelConfigIn, request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if body.is_default:
        for c in db.scalars(select(AIModelConfig).where(AIModelConfig.user_id == user.id)):
            c.is_default = False
    cfg = AIModelConfig(
        user_id=user.id,
        name=body.name,
        provider=body.provider,
        base_url=body.base_url,
        model_id=body.model_id,
        api_key_encrypted=encrypt_secret(body.api_key),
        key_mask=mask_key(body.api_key),
        is_default=body.is_default,
    )
    db.add(cfg)
    db.commit()
    db.refresh(cfg)
    write_audit(db, user_id=user.id, action="ai.model.create", resource=f"model:{cfg.id}", request=request)
    db.commit()
    return ok(_config_public(cfg), "模型配置已保存（API Key 已加密存储）")


@router.get("/models")
def list_models(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    configs = list(db.scalars(select(AIModelConfig).where(AIModelConfig.user_id == user.id)))
    return ok({"models": [_config_public(c) for c in configs]})


@router.delete("/models/{config_id}")
def delete_model(config_id: str, request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    cfg = require_owned_resource(db, AIModelConfig, config_id, user.id)
    db.delete(cfg)
    write_audit(db, user_id=user.id, action="ai.model.delete", resource=f"model:{config_id}", request=request)
    db.commit()
    return ok(None, "模型配置已删除")


@router.post("/models/{config_id}/test")
async def test_model(config_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    cfg = require_owned_resource(db, AIModelConfig, config_id, user.id)
    api_key = decrypt_secret(cfg.api_key_encrypted)
    if api_key is None:
        cfg.status = "failed"
        db.commit()
        return fail("密钥解密失败，请重新配置")
    okay = await test_connection(cfg.base_url, api_key, cfg.model_id)
    cfg.status = "connected" if okay else "failed"
    db.commit()
    return ok({"status": cfg.status}, "连接正常" if okay else "连接失败，请检查配置")


# ---------- 调用 ----------
@router.post("/generate")
async def generate(body: GenerateIn, request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    violation = _validate_ai_request(body.messages, body.max_tokens)
    if violation:
        write_security_event(db, user_id=user.id, event_type="ai_limit_violation", severity="warn", details=violation, request=request)
        db.commit()
        return fail(violation, status_code=413)
    cfg = _resolve_config(db, user, body.model_config_id)
    if cfg is None:
        return fail("尚未配置 AI 模型，请先到模型中心添加你的模型 API", status_code=412)
    api_key = decrypt_secret(cfg.api_key_encrypted)
    if api_key is None:
        return fail("密钥解密失败，请重新配置模型")
    started = time.monotonic()
    try:
        result = await gw_generate(
            cfg.base_url, api_key, cfg.model_id, body.messages, body.temperature, body.max_tokens
        )
    except GatewayError as e:
        return fail(str(e), status_code=502)
    latency_ms = int((time.monotonic() - started) * 1000)
    _log_usage(
        user.id,
        cfg.model_id,
        result["tokens"],
        "generate",
        provider=cfg.provider,
        input_tokens=result.get("input_tokens", 0),
        output_tokens=result.get("output_tokens", 0),
        latency_ms=latency_ms,
    )
    return ok({"content": result["content"], "model": cfg.model_id, "tokens": result["tokens"]})


@router.post("/stream")
async def stream(body: GenerateIn, request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    violation = _validate_ai_request(body.messages, body.max_tokens)
    if violation:
        write_security_event(db, user_id=user.id, event_type="ai_limit_violation", severity="warn", details=violation, request=request)
        db.commit()
        return fail(violation, status_code=413)
    cfg = _resolve_config(db, user, body.model_config_id)
    if cfg is None:
        return fail("尚未配置 AI 模型，请先到模型中心添加你的模型 API", status_code=412)
    api_key = decrypt_secret(cfg.api_key_encrypted)
    if api_key is None:
        return fail("密钥解密失败，请重新配置模型")

    user_id, model_id, base_url, provider = user.id, cfg.model_id, cfg.base_url, cfg.provider
    input_chars = sum(len(str(m.get("content", ""))) for m in body.messages)

    async def event_source():
        count = 0
        started = time.monotonic()
        try:
            async for delta in gw_stream(base_url, api_key, model_id, body.messages, body.temperature, body.max_tokens):
                count += len(delta)
                yield f"data: {delta}\n\n"
            yield "data: [DONE]\n\n"
        except GatewayError as e:
            yield f"event: error\ndata: {e}\n\n"
        finally:
            # 流式无 usage 回传：按字符估算 token（约 4 字符/token）
            out_tokens = count // 4
            in_tokens = input_chars // 4
            _log_usage(
                user_id,
                model_id,
                out_tokens + in_tokens,
                "stream",
                provider=provider,
                input_tokens=in_tokens,
                output_tokens=out_tokens,
                latency_ms=int((time.monotonic() - started) * 1000),
            )

    return StreamingResponse(event_source(), media_type="text/event-stream")


@router.post("/embed")
async def embed(body: EmbedIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    cfg = _resolve_config(db, user, body.model_config_id)
    if cfg is None:
        return fail("尚未配置 AI 模型", status_code=412)
    api_key = decrypt_secret(cfg.api_key_encrypted)
    if api_key is None:
        return fail("密钥解密失败，请重新配置模型")
    started = time.monotonic()
    try:
        result = await gw_embed(cfg.base_url, api_key, cfg.model_id, body.texts)
    except GatewayError as e:
        return fail(str(e), status_code=502)
    _log_usage(
        user.id,
        cfg.model_id,
        result["tokens"],
        "embed",
        provider=cfg.provider,
        input_tokens=result.get("input_tokens", 0),
        output_tokens=result.get("output_tokens", 0),
        latency_ms=int((time.monotonic() - started) * 1000),
    )
    return ok({"embeddings": result["embeddings"], "tokens": result["tokens"]})


@router.get("/usage")
def usage(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.execute(
        select(
            AIUsageLog.model,
            AIUsageLog.provider,
            AIUsageLog.request_type,
            func.count(),
            func.sum(AIUsageLog.tokens),
            func.sum(AIUsageLog.input_tokens),
            func.sum(AIUsageLog.output_tokens),
            func.avg(AIUsageLog.latency_ms),
        )
        .where(AIUsageLog.user_id == user.id)
        .group_by(AIUsageLog.model, AIUsageLog.provider, AIUsageLog.request_type)
    ).all()
    usage_rows = [
        {
            "model": m,
            "provider": p,
            "requestType": rt,
            "calls": int(c or 0),
            "tokens": int(t or 0),
            "inputTokens": int(it or 0),
            "outputTokens": int(ot or 0),
            "avgLatencyMs": int(lat or 0),
        }
        for m, p, rt, c, t, it, ot, lat in rows
    ]
    totals = {
        "calls": sum(r["calls"] for r in usage_rows),
        "tokens": sum(r["tokens"] for r in usage_rows),
        "inputTokens": sum(r["inputTokens"] for r in usage_rows),
        "outputTokens": sum(r["outputTokens"] for r in usage_rows),
    }
    return ok({"usage": usage_rows, "totals": totals})


# ---------- AI 会话（ai_sessions，多租户隔离） ----------
class ConversationIn(BaseModel):
    id: str | None = None
    title: str = Field(default="新会话", max_length=200)
    model: str = ""
    messages: list[dict] = Field(default_factory=list, max_length=500)
    tokens: int = 0


def _conversation_public(c: AIConversation, *, with_messages: bool = False) -> dict:
    data = {
        "id": c.id,
        "title": c.title,
        "model": c.model,
        "tokens": c.tokens,
        "createdAt": c.created_at.isoformat() if c.created_at else None,
        "updatedAt": c.updated_at.isoformat() if c.updated_at else None,
    }
    if with_messages:
        try:
            data["messages"] = json.loads(c.conversation or "[]")
        except json.JSONDecodeError:
            data["messages"] = []
    return data


@router.get("/sessions")
def list_sessions(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = list(
        db.scalars(
            select(AIConversation)
            .where(AIConversation.user_id == user.id)
            .order_by(AIConversation.updated_at.desc())
        )
    )
    return ok({"sessions": [_conversation_public(c) for c in rows]})


@router.get("/sessions/{session_id}")
def get_session(session_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    c = require_owned_resource(db, AIConversation, session_id, user.id)
    return ok({"session": _conversation_public(c, with_messages=True)})


@router.post("/sessions")
def save_session(body: ConversationIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    payload = json.dumps(body.messages, ensure_ascii=False)
    if body.id:
        c = require_owned_resource(db, AIConversation, body.id, user.id)
        c.title = body.title
        c.model = body.model
        c.conversation = payload
        c.tokens = body.tokens
    else:
        c = AIConversation(
            user_id=user.id,
            title=body.title,
            model=body.model,
            conversation=payload,
            tokens=body.tokens,
        )
        db.add(c)
    db.commit()
    db.refresh(c)
    return ok({"session": _conversation_public(c, with_messages=True)}, "会话已保存")


@router.delete("/sessions/{session_id}")
def delete_session(session_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    c = require_owned_resource(db, AIConversation, session_id, user.id)
    db.delete(c)
    db.commit()
    return ok(None, "会话已删除")
