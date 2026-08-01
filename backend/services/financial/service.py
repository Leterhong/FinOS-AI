"""财富数据服务（Phase 7.0.1 延续 + Phase 7.0.2 需求四）：

资产 CRUD 全能力：现金 / 股票 / 基金 / 房产 / 负债（liability）。
全部绑定 user_id，强制隔离。供 /api/assets 路由调用。
"""
from __future__ import annotations

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from backend.financial.models import Asset
from backend.security.permission import require_owned_resource
from backend.user.models import User

ASSET_TYPES = {
    "cash",
    "stock",
    "fund",
    "bond",
    "property",
    "crypto",
    "insurance",
    "liability",
    "other",
}


def list_assets(db: Session, user: User) -> dict:
    assets = list(
        db.scalars(select(Asset).where(Asset.user_id == user.id).order_by(Asset.created_at.desc()))
    )
    total = round(sum(a.amount for a in assets), 2)
    return {
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
        "total": total,
    }


def create_asset(db: Session, user: User, payload: dict) -> dict:
    atype = payload.get("type")
    if atype not in ASSET_TYPES:
        raise ValueError(f"type 必须是 {sorted(ASSET_TYPES)} 之一")
    asset = Asset(
        user_id=user.id,
        type=atype,
        name=payload.get("name", ""),
        amount=float(payload.get("amount", 0)),
        source=payload.get("source", "manual"),
    )
    db.add(asset)
    db.commit()
    db.refresh(asset)
    return {"id": asset.id, "type": asset.type, "name": asset.name, "amount": asset.amount, "source": asset.source}


def update_asset(db: Session, user: User, asset_id: str, payload: dict) -> dict:
    asset = require_owned_resource(db, Asset, asset_id, user.id)
    if "type" in payload:
        if payload["type"] not in ASSET_TYPES:
            raise ValueError(f"type 必须是 {sorted(ASSET_TYPES)} 之一")
        asset.type = payload["type"]
    if "name" in payload:
        asset.name = payload["name"]
    if "amount" in payload:
        asset.amount = float(payload["amount"])
    if "source" in payload:
        asset.source = payload["source"]
    db.commit()
    db.refresh(asset)
    return {"id": asset.id, "type": asset.type, "name": asset.name, "amount": asset.amount, "source": asset.source}


def delete_asset(db: Session, user: User, asset_id: str) -> None:
    # 强制 user_id 过滤：他人资产等同不存在（需求六）
    asset = require_owned_resource(db, Asset, asset_id, user.id)
    db.execute(delete(Asset).where(Asset.id == asset_id, Asset.user_id == user.id))
    db.commit()
