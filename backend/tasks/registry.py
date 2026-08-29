"""异步任务处理器注册表（Phase 7.0.4 八、九）。

workers 线程调用 run_handler(task_type, payload, user_id) 执行具体逻辑。
新增任务类型只需在 HANDLERS 注册一个同步函数即可（异步调用用 asyncio.run 包裹）。
"""
from __future__ import annotations

import json
import logging
from typing import Any, Callable

from sqlalchemy.orm import Session

logger = logging.getLogger("finos.tasks")

Handler = Callable[[dict, Session, str | None], dict]


def _h_ping(payload: dict, _db: Session, _user_id: str | None) -> dict:
    return {"pong": True, "received": payload}


def _h_ai_generate(payload: dict, db: Session, user_id: str | None) -> dict:
    from sqlalchemy import select

    from backend.ai.gateway import GatewayError, generate_sync
    from backend.ai.models import AIModelConfig
    from backend.core.security import decrypt_secret
    from backend.config import get_settings

    settings = get_settings()
    messages = payload.get("messages") or [{"role": "user", "content": payload.get("prompt", "hi")}]
    max_tokens = min(int(payload.get("max_tokens", 1024)), settings.ai_max_tokens)
    if not user_id:
        return {"content": "", "error": "需要登录后执行 AI 任务"}
    q = select(AIModelConfig).where(AIModelConfig.user_id == user_id)
    config = db.scalar(q.where(AIModelConfig.is_default == True)) or db.scalar(q)  # noqa: E712
    if not config:
        return {"content": "", "error": "未配置可用模型，请先在模型中心连接你的模型"}
    try:
        api_key = decrypt_secret(config.api_key_encrypted)
    except Exception as exc:  # noqa: BLE001
        return {"content": "", "error": f"模型密钥解密失败：{exc}"}
    try:
        res = generate_sync(config.base_url, api_key, config.model_id, messages, max_tokens=max_tokens)
        return {"content": res.get("content", ""), "tokens": res.get("tokens", 0)}
    except GatewayError as exc:
        return {"content": "", "error": f"模型调用失败：{exc}"}
    except Exception as exc:  # noqa: BLE001
        return {"content": "", "error": f"AI 任务异常：{exc}"}


def _h_document_analysis(payload: dict, db: Session, user_id: str | None) -> dict:
    from sqlalchemy import select

    from backend.services.document.service import analyze_document
    from backend.user.models import User

    document_id = payload.get("documentId") or payload.get("document_id")
    if not document_id:
        return {"error": "缺少 documentId"}
    if not user_id:
        return {"error": "需要登录后执行文档解析任务"}
    user = db.scalar(select(User).where(User.id == user_id))
    if user is None:
        return {"error": "用户不存在或已删除"}
    result = analyze_document(db, user, document_id)
    return {"documentId": document_id, "result": result}


HANDLERS: dict[str, Handler] = {
    "ping": _h_ping,
    "ai_generate": _h_ai_generate,
    "document_analysis": _h_document_analysis,
}


def run_handler(task_type: str, payload: dict, db: Session, user_id: str | None) -> dict:
    handler = HANDLERS.get(task_type)
    if handler is None:
        return {"error": f"未知任务类型：{task_type}"}
    return handler(payload, db, user_id)
