"""财富监控服务（Phase 7.0.2 需求十一，迁移 Phase 6.8 Monitor）。

POST /api/monitor/run：计算 Twin → 与上一快照对比检测变化（资产/收入/目标/风险）
→ 生成监控简报 → 写通知表（source="monitor"，用户隔离）。
零 LLM 依赖，纯规则；返回监控摘要 + 本次写入的通知。
"""
from __future__ import annotations

import json
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.notification.models import Notification
from backend.services.models import FinancialTwin
from backend.services.twin.service import compute_and_save, get_latest
from backend.user.models import User


def detect_changes(current: dict, prev: dict | None) -> list[dict]:
    """资产/收入/目标/风险变化检测（对比上一快照）。"""
    if prev is None:
        return []
    changes: list[dict] = []
    nw = current.get("netWorth", 0.0)
    pnw = prev.get("netWorth", 0.0)
    if pnw and abs(nw - pnw) / max(abs(pnw), 1) >= 0.1:
        direction = "up" if nw > pnw else "down"
        changes.append(
            {"type": "asset", "direction": direction, "from": round(pnw, 2), "to": round(nw, 2),
             "title": f"净资产较上次{'增加' if direction == 'up' else '下降'}"}
        )
    gp = current.get("goalProgress", 0.0)
    pgp = prev.get("goalProgress", 0.0)
    if gp - pgp >= 0.05:
        changes.append({"type": "goal", "direction": "up", "from": round(pgp, 4), "to": round(gp, 4), "title": "财富目标完成度提升"})
    rs = current.get("riskScore", 0.0)
    prs = prev.get("riskScore", 0.0)
    if rs - prs >= 10:
        changes.append({"type": "risk", "direction": "up", "from": round(prs, 2), "to": round(rs, 2), "title": "风险暴露上升，建议关注集中度/负债"})
    return changes


def run(db: Session, user: User) -> dict:
    current = compute_and_save(db, user)
    if not current.get("hasData"):
        return {"hasData": False, "message": "欢迎创建你的财富数字分身", "changes": [], "notifications": []}

    # 取倒数第二条作为对比基准（最新一条是本次刚写入的）
    rows = db.scalars(
        select(FinancialTwin).where(FinancialTwin.user_id == user.id).order_by(FinancialTwin.created_at.desc()).limit(2)
    ).all()
    prev = None
    if len(rows) >= 2:
        try:
            prev = json.loads(rows[1].snapshot)
        except (json.JSONDecodeError, TypeError):
            prev = None

    changes = detect_changes(current, prev)
    alerts = changes

    notifications: list[dict] = []
    for ch in alerts:
        n = Notification(
            user_id=user.id,
            source="monitor",
            severity="warn" if ch["direction"] == "down" else "info",
            title=ch["title"],
            body=json.dumps(ch, ensure_ascii=False, default=str),
        )
        db.add(n)
        notifications.append({"id": n.id, "title": n.title, "severity": n.severity})

    # 无变化也写一条例行体检通知
    if not alerts:
        n = Notification(
            user_id=user.id,
            source="monitor",
            severity="info",
            title="财富例行体检",
            body="本次监控未发现明显异常，资产与风险状况稳定。",
        )
        db.add(n)
        notifications.append({"id": n.id, "title": n.title, "severity": n.severity})

    db.commit()

    return {
        "hasData": True,
        "monitoredAt": datetime.now(timezone.utc).isoformat(),
        "netWorth": current.get("netWorth"),
        "healthScore": current.get("healthScore"),
        "riskScore": current.get("riskScore"),
        "goalProgress": current.get("goalProgress"),
        "changes": alerts,
        "notifications": notifications,
    }
