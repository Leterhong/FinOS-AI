"""财富数据服务（Phase 7.0.1 需求七）：

GET  /api/financial/profile           — 画像 + Twin（无数据返回欢迎状态）
POST /api/financial/profile           — 创建/更新画像
GET  /api/financial/assets            — 资产列表
POST /api/financial/assets            — 添加资产
DELETE /api/financial/assets/{id}     — 删除资产
GET  /api/financial/transactions      — 交易列表
POST /api/financial/transactions      — 添加交易
POST /api/financial/twin/recalculate  — 强制重算 Twin

隔离：所有查询强制 user_id == 当前登录用户（需求六），并做缓存失效。
"""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from backend.core import get_current_user, ok
from backend.core.cache import cache_delete, cache_get, cache_set
from backend.core.response import fail
from backend.database import get_db
from backend.financial.models import Asset, FinancialProfile, Transaction
from backend.financial.twin_engine import WELCOME_MESSAGE, compute_twin
from backend.user.models import User

router = APIRouter(prefix="/financial", tags=["financial"])

ASSET_TYPES = {"cash", "stock", "fund", "bond", "property", "crypto", "insurance", "other"}


class ProfileIn(BaseModel):
    age: int | None = Field(default=None, ge=0, le=120)
    income: float = Field(default=0, ge=0)
    expense: float = Field(default=0, ge=0)
    risk_level: str = "balanced"
    goal: str | None = None


class AssetIn(BaseModel):
    type: str
    name: str = Field(min_length=1, max_length=200)
    amount: float = Field(ge=0)
    source: str = "manual"


class TransactionIn(BaseModel):
    type: str  # income/expense/transfer
    amount: float
    category: str = "other"
    date: datetime | None = None


def _twin_cache_key(user_id: str) -> str:
    return f"twin:{user_id}"


def _load_twin(db: Session, user: User) -> dict:
    profile = db.scalar(select(FinancialProfile).where(FinancialProfile.user_id == user.id))
    assets = list(db.scalars(select(Asset).where(Asset.user_id == user.id)))
    return compute_twin(profile, assets)


@router.get("/profile")
def get_profile(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    cached = cache_get(_twin_cache_key(user.id))
    if cached is not None:
        return ok({**cached, "cached": True})
    twin = _load_twin(db, user)
    cache_set(_twin_cache_key(user.id), twin, ttl_seconds=120)
    return ok(twin, "" if twin.get("hasData") else WELCOME_MESSAGE)


@router.post("/profile")
def upsert_profile(body: ProfileIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if body.risk_level not in {"conservative", "balanced", "aggressive"}:
        return fail("risk_level 必须是 conservative/balanced/aggressive")
    profile = db.scalar(select(FinancialProfile).where(FinancialProfile.user_id == user.id))
    if profile is None:
        profile = FinancialProfile(user_id=user.id)
        db.add(profile)
    profile.age = body.age
    profile.income = body.income
    profile.expense = body.expense
    profile.risk_level = body.risk_level
    profile.goal = body.goal
    db.commit()
    cache_delete(_twin_cache_key(user.id))
    return ok(_load_twin(db, user), "财富画像已保存")


@router.get("/assets")
def list_assets(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    assets = list(
        db.scalars(select(Asset).where(Asset.user_id == user.id).order_by(Asset.created_at.desc()))
    )
    return ok(
        {
            "assets": [
                {
                    "id": a.id,
                    "type": a.type,
                    "name": a.name,
                    "amount": a.amount,
                    "source": a.source,
                    "createdAt": a.created_at.isoformat() if a.created_at else None,
                }
                for a in assets
            ],
            "total": round(sum(a.amount for a in assets), 2),
        }
    )


@router.post("/assets")
def create_asset(body: AssetIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if body.type not in ASSET_TYPES:
        return fail(f"type 必须是 {sorted(ASSET_TYPES)} 之一")
    asset = Asset(user_id=user.id, type=body.type, name=body.name, amount=body.amount, source=body.source)
    db.add(asset)
    db.commit()
    db.refresh(asset)
    cache_delete(_twin_cache_key(user.id))
    return ok({"id": asset.id}, "资产已添加")


@router.delete("/assets/{asset_id}")
def delete_asset(asset_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    # 强制 user_id 过滤：他人资产等同不存在
    asset = db.scalar(select(Asset).where(Asset.id == asset_id, Asset.user_id == user.id))
    if asset is None:
        return fail("资产不存在", status_code=404)
    db.execute(delete(Asset).where(Asset.id == asset_id, Asset.user_id == user.id))
    db.commit()
    cache_delete(_twin_cache_key(user.id))
    return ok(None, "资产已删除")


@router.get("/transactions")
def list_transactions(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    txs = list(
        db.scalars(
            select(Transaction).where(Transaction.user_id == user.id).order_by(Transaction.date.desc()).limit(200)
        )
    )
    return ok(
        {
            "transactions": [
                {
                    "id": t.id,
                    "type": t.type,
                    "amount": t.amount,
                    "category": t.category,
                    "date": t.date.isoformat() if t.date else None,
                }
                for t in txs
            ]
        }
    )


@router.post("/transactions")
def create_transaction(
    body: TransactionIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)
):
    if body.type not in {"income", "expense", "transfer"}:
        return fail("type 必须是 income/expense/transfer")
    tx = Transaction(
        user_id=user.id,
        type=body.type,
        amount=body.amount,
        category=body.category,
        date=body.date or datetime.now(timezone.utc),
    )
    db.add(tx)
    db.commit()
    cache_delete(_twin_cache_key(user.id))
    return ok({"id": tx.id}, "交易已记录")


@router.post("/twin/recalculate")
def recalculate_twin(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    cache_delete(_twin_cache_key(user.id))
    twin = _load_twin(db, user)
    cache_set(_twin_cache_key(user.id), twin, ttl_seconds=120)
    return ok(twin, "Twin 已重算")
