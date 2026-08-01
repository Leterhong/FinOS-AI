"""用户服务：资料查询 / 头像更新。"""
from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.core import get_current_user, ok
from backend.database import get_db
from backend.user.models import User

router = APIRouter(prefix="/user", tags=["user"])


class AvatarIn(BaseModel):
    avatar: str  # data URL 或已上传文件路径


@router.get("/me")
def get_me(user: User = Depends(get_current_user)):
    return ok(
        {
            "id": user.id,
            "email": user.email,
            "avatar": user.avatar,
            "createdAt": user.created_at.isoformat() if user.created_at else None,
        }
    )


@router.put("/avatar")
def update_avatar(body: AvatarIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    user.avatar = body.avatar[:512]
    db.add(user)
    db.commit()
    return ok({"avatar": user.avatar}, "头像已更新")
