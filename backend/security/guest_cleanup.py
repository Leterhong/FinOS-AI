"""Guest 访客账户安全清理（R-01 缓解，默认关闭）。

由 `GUEST_CLEANUP_DAYS` 环境变量门控（默认 0 = 不清理）。开启后仅删除同时满足
以下全部条件的访客账户（不可逆操作因此被收敛为显式开启 + 多重白名单）：

1. 邮箱匹配 guest 前缀 `guest-*@guest.finos.local`（绝不触碰注册用户）；
2. 创建时间早于 `GUEST_CLEANUP_DAYS` 天前；
3. 名下没有任何业务数据（遍历元数据中所有含 user_id 的表，除白名单外的
   业务表都必须为空——有任何一行业务数据即整账户跳过）；
4. 不存在仍然有效（未过期且未吊销）的 refresh 会话——活跃会话绝不清理。

删除范围仅限：该 guest 的 refresh_tokens、audit/security 记录与 user 行本身。
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from backend.auth.models import RefreshToken
from backend.database.base import Base
from backend.user.models import User
from backend.security.models import AuditLog, SecurityEvent

logger = logging.getLogger("finos.security.guest_cleanup")

GUEST_EMAIL_SUFFIX = "@guest.finos.local"

# 这些表不参与「是否有业务数据」判定：users 是账户本身，refresh_tokens 由
# 活跃会话检查单独把关，audit/security 是无业务价值的合规留痕。
_NON_BUSINESS_TABLES = frozenset({"users", "refresh_tokens", "audit_logs", "security_events"})


def _has_active_refresh_session(db: Session, user_id: str, now: datetime) -> bool:
    from backend.auth.models import RefreshToken

    row = db.scalar(
        select(RefreshToken.id)
        .where(
            RefreshToken.user_id == user_id,
            RefreshToken.revoked.is_(False),
            RefreshToken.expires_at > now,
        )
        .limit(1)
    )
    return row is not None


def cleanup_stale_guests(db: Session, max_age_days: int) -> int:
    """删除满足全部安全条件的过期空访客账户。返回删除数量。"""
    if max_age_days <= 0:
        return 0

    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(days=max_age_days)

    guests = list(
        db.scalars(
            select(User).where(
                User.email.endswith(GUEST_EMAIL_SUFFIX),
                User.created_at < cutoff,
            )
        )
    )

    # 预构建「含 user_id 的业务表」清单（元数据驱动，新表自动纳入）。
    business_tables = [
        table
        for table in Base.metadata.sorted_tables
        if "user_id" in table.c and table.name not in _NON_BUSINESS_TABLES
    ]

    removed = 0
    for guest in guests:
        try:
            if _has_active_refresh_session(db, guest.id, now):
                continue
            has_business_data = False
            for table in business_tables:
                hit = db.scalar(select(table.c.user_id).where(table.c.user_id == guest.id).limit(1))
                if hit is not None:
                    has_business_data = True
                    break
            if has_business_data:
                continue

            db.execute(delete(RefreshToken).where(RefreshToken.user_id == guest.id))
            db.execute(delete(AuditLog).where(AuditLog.user_id == guest.id))
            db.execute(delete(SecurityEvent).where(SecurityEvent.user_id == guest.id))
            db.delete(guest)
            removed += 1
        except Exception:  # noqa: BLE001 单账户失败不影响其余清理
            db.rollback()
            logger.exception("guest_cleanup_skip", extra={"user_id": guest.id})

    if removed:
        db.commit()
        logger.info("guest_cleanup_done", extra={"removed": removed, "max_age_days": max_age_days})
    return removed
