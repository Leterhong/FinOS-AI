"""Twin 路由（Phase 7.0.2 需求二/三）。

POST /api/twin/recalculate — 重算并保存快照历史
GET  /api/twin/status       — 最新 Twin 状态 + 历史
"""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from backend.core import get_current_user, ok
from backend.core.cache import cache_delete, cache_get, cache_set
from backend.database import get_db
from backend.services.twin.service import compute_and_save, get_latest
from backend.user.models import User

router = APIRouter(prefix="/twin", tags=["twin"])


def _cache_key(user_id: str) -> str:
    return f"twin:status:{user_id}"


@router.post("/recalculate")
def recalculate(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    cache_delete(_cache_key(user.id))
    twin = compute_and_save(db, user)
    cache_set(_cache_key(user.id), twin, ttl_seconds=120)
    return ok(twin, "Twin 已重算并保存快照")


@router.get("/status")
def status(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    cached = cache_get(_cache_key(user.id))
    if cached is not None:
        return ok({**cached, "cached": True})
    twin = get_latest(db, user)
    cache_set(_cache_key(user.id), twin, ttl_seconds=120)
    return ok(twin)
