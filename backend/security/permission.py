"""资源所有权与用户上下文权限检查。"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any, TypeVar

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

T = TypeVar("T")

_logger = logging.getLogger("finos.security")


@dataclass(frozen=True)
class UserContext:
    user_id: str
    email: str


def require_owned_resource(db: Session, model: type[T], resource_id: str, user_id: str) -> T:
    """校验资源归属，越权一律按「不存在」处理。

    安全口径（Phase 7.8 统一）：无论资源真的不存在，还是存在但属于他人，
    一律返回 404。返回 403 会形成「资源存在性」侧信道，让攻击者可以通过
    状态码差异枚举出系统中真实存在的资源 ID。越权尝试仅写入服务端日志
    供审计，不通过响应体对外暴露任何差异。
    """
    resource = db.get(model, resource_id)
    if resource is None:
        raise HTTPException(status_code=404, detail="资源不存在")
    if getattr(resource, "user_id", None) != user_id:
        _logger.warning(
            '{"event": "security.ownership.denied", "model": "%s", "user_id": "%s"}',
            getattr(model, "__name__", "unknown"),
            user_id,
        )
        raise HTTPException(status_code=404, detail="资源不存在")
    return resource


def owned_query(model: Any, user_id: str):
    return select(model).where(model.user_id == user_id)
