"""FastAPI 依赖：当前登录用户解析（用户隔离的唯一入口）。

Phase 7.0.1 需求六：所有业务查询必须经 get_current_user 取得 user_id，
再由各 service 强制加 user_id 过滤。任何路由不得信任前端传来的 user_id。
"""
from __future__ import annotations

from fastapi import Depends, HTTPException, Request
from sqlalchemy.orm import Session

from backend.core.security import decode_access_token
from backend.database import get_db


def get_current_user(request: Request, db: Session = Depends(get_db)):
    auth = request.headers.get("Authorization", "")
    token = auth.removeprefix("Bearer ").strip() if auth.startswith("Bearer ") else ""
    if not token:
        # 兼容 cookie 模式
        token = request.cookies.get("finos_token", "")
    payload = decode_access_token(token) if token else None
    if not payload or not payload.get("sub"):
        raise HTTPException(status_code=401, detail="未登录或凭证已过期")

    from backend.user.models import User

    user = db.get(User, payload["sub"])
    if user is None:
        raise HTTPException(status_code=401, detail="用户不存在")
    return user
