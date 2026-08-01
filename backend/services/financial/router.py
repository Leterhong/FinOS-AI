"""资产路由（Phase 7.0.2 需求四）：/api/assets 全 CRUD。

GET    /api/assets        — 本人资产列表 + 总额
POST   /api/assets        — 新增（现金/股票/基金/房产/负债…）
PUT    /api/assets/{id}   — 修改
DELETE /api/assets/{id}   — 删除（强制 user_id 隔离）
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from backend.core import get_current_user, ok
from backend.core.cache import cache_delete
from backend.core.response import fail
from backend.database import get_db
from backend.security.audit import write_audit
from backend.services.financial.service import create_asset, delete_asset, list_assets, update_asset
from backend.user.models import User

router = APIRouter(prefix="/assets", tags=["assets"])


class AssetIn(BaseModel):
    type: str
    name: str = Field(min_length=1, max_length=200)
    amount: float = Field(ge=0)
    source: str = "manual"


def _invalidate_twin(user: User) -> None:
    cache_delete(f"twin:status:{user.id}")
    cache_delete(f"twin:{user.id}")


@router.get("")
def list_all(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return ok(list_assets(db, user))


@router.post("")
def create(body: AssetIn, request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    try:
        asset = create_asset(db, user, body.model_dump())
    except ValueError as e:
        return fail(str(e))
    write_audit(db, user_id=user.id, action="asset.create", resource=f"asset:{asset['id']}", request=request)
    db.commit()
    _invalidate_twin(user)
    return ok(asset, "资产已添加")


@router.put("/{asset_id}")
def update(asset_id: str, body: AssetIn, request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    asset = update_asset(db, user, asset_id, body.model_dump())
    write_audit(db, user_id=user.id, action="asset.update", resource=f"asset:{asset_id}", request=request)
    db.commit()
    _invalidate_twin(user)
    return ok(asset, "资产已更新")


@router.delete("/{asset_id}")
def delete(asset_id: str, request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    delete_asset(db, user, asset_id)
    write_audit(db, user_id=user.id, action="asset.delete", resource=f"asset:{asset_id}", request=request)
    db.commit()
    _invalidate_twin(user)
    return ok(None, "资产已删除")
