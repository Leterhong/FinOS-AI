"""长期记忆服务：AI 记忆按 user_id 隔离读写。"""
from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.core import get_current_user, ok
from backend.core.response import fail
from backend.database import get_db
from backend.memory.models import Memory
from backend.user.models import User

router = APIRouter(prefix="/memory", tags=["memory"])

MEMORY_TYPES = {"fact", "preference", "event", "insight"}


class MemoryIn(BaseModel):
    memory_type: str = "fact"
    content: str = Field(min_length=1, max_length=5000)


@router.get("")
def list_memories(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = list(
        db.scalars(select(Memory).where(Memory.user_id == user.id).order_by(Memory.created_at.desc()).limit(200))
    )
    return ok(
        {
            "memories": [
                {
                    "id": m.id,
                    "memoryType": m.memory_type,
                    "content": m.content,
                    "createdAt": m.created_at.isoformat() if m.created_at else None,
                }
                for m in rows
            ]
        }
    )


@router.post("")
def create_memory(body: MemoryIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if body.memory_type not in MEMORY_TYPES:
        return fail(f"memory_type 必须是 {sorted(MEMORY_TYPES)} 之一")
    m = Memory(user_id=user.id, memory_type=body.memory_type, content=body.content)
    db.add(m)
    db.commit()
    return ok({"id": m.id}, "记忆已保存")


@router.delete("/{memory_id}")
def delete_memory(memory_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    m = db.scalar(select(Memory).where(Memory.id == memory_id, Memory.user_id == user.id))
    if m is None:
        return fail("记忆不存在", status_code=404)
    db.delete(m)
    db.commit()
    return ok(None, "记忆已删除")
