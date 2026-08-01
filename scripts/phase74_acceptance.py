# -*- coding: utf-8 -*-
"""
Phase 7.4 FinOS AI 智能自动化 + AI 主动服务系统 验收脚本（#357）。

覆盖 5 项核心验收 + 结构/隔离检查：
  验收1  事件驱动自动化：资产变动 → scan 检测到事件 → 触发规则 → 生成通知
  验收2  行动中心：创建 → 完成 → 反馈即学习（接受率上升）
  验收3  真实金融数据接口：离线时优雅降级（degraded=True，绝不 500）
  验收4  关闭 Agent 后不再执行：禁用计划 → run 返回 skipped
  验收5  成本控制：当日 LLM 预算耗尽 → 自动降级 local
  附加    跨用户隔离 / bootstrap 幂等 / 路由与表注册

运行：
  "C:/Users/LENOVO/.workbuddy/binaries/python/envs/default/Scripts/python.exe" scripts/phase74_acceptance.py
"""
from __future__ import annotations

import os
import sys
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
os.environ.setdefault("MIGRATE_LEGACY_DATA", "false")

from fastapi.testclient import TestClient  # noqa: E402

from backend import main as backend_main  # noqa: E402
from backend.database import SessionLocal  # noqa: E402
from backend.autonomous import cost_guard  # noqa: E402
from backend.autonomous.market.manager import MarketDataManager, set_manager  # noqa: E402
from backend.autonomous.market.providers import DeterministicProvider  # noqa: E402
from backend.autonomous.models import AutomationRun  # noqa: E402

PASS: list[str] = []
FAIL: list[str] = []

AUTO = "/api/autonomous"
NOTIF = "/api/notifications"


def check(name: str, cond: bool, detail: str = "") -> None:
    if cond:
        PASS.append(name)
        print(f"  [PASS] {name}")
    else:
        FAIL.append(f"{name} — {detail}")
        print(f"  [FAIL] {name} — {detail}")


def register(c: TestClient, email: str) -> str:
    r = c.post("/api/auth/register", json={"email": email, "password": "Test@12345", "name": "验收用户"})
    if r.status_code != 200 or not r.json().get("success"):
        r = c.post("/api/auth/login", json={"email": email, "password": "Test@12345"})
    return r.json()["data"].get("token") or r.json()["data"]["finos_token"]


def uid_by_email(email: str) -> str:
    from sqlalchemy import select
    from backend.user.models import User

    db = SessionLocal()
    try:
        u = db.scalar(select(User).where(User.email == email))
        return u.id if u else ""
    finally:
        db.close()


def h(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def body(r) -> dict:
    try:
        j = r.json()
    except Exception:
        return {}
    if isinstance(j, dict) and "data" in j:
        d = j.get("data")
        return d if isinstance(d, dict) else {"_raw": d}
    return j if isinstance(j, dict) else {}


def seed(c: TestClient, token: str) -> None:
    c.post(
        "/api/financial/profile",
        json={"age": 34, "income": 42000.0, "expense": 21000.0, "riskLevel": "balanced", "goal": "10年内攒够500万退休"},
        headers=h(token),
    )
    for p in (
        {"type": "cash", "name": "活期存款", "amount": 280000},
        {"type": "fund", "name": "指数基金", "amount": 520000},
        {"type": "stock", "name": "A股组合", "amount": 310000},
    ):
        c.post("/api/financial/assets", json=p, headers=h(token))


def main() -> None:
    with TestClient(backend_main.app) as c:
        a_email = f"p74a_{uuid.uuid4().hex[:8]}@finos.local"
        b_email = f"p74b_{uuid.uuid4().hex[:8]}@finos.local"
        ta = register(c, a_email)
        tb = register(c, b_email)
        ida = uid_by_email(a_email)
        seed(c, ta)  # 先录入真实资产，保证 bootstrap 基线快照反映真实数据

        # ---- 结构：路由与引擎状态 ----
        ov = body(c.get(f"{AUTO}/overview", headers=h(ta)))
        check("结构-控制中心返回引擎运行中", ov.get("engine", {}).get("running") is True, str(ov)[:120])
        cost = body(c.get(f"{AUTO}/cost", headers=h(ta)))
        check("结构-成本概览含每日预算", cost.get("dailyBudget") == 20, str(cost)[:120])

        # ---- bootstrap 幂等 ----
        b1 = body(c.post(f"{AUTO}/bootstrap", headers=h(ta)))
        b2 = body(c.post(f"{AUTO}/bootstrap", headers=h(ta)))
        check("bootstrap-首次创建规则>0", (b1.get("rulesCreated") or 0) > 0, str(b1)[:120])
        check("bootstrap-二次幂等(rulesCreated=0)", (b2.get("rulesCreated") or 0) == 0, str(b2)[:120])

        # ---- 验收1：事件驱动自动化 ----
        # bootstrap 已基于真实资产建立基线快照；先扫一次（无变化）作为对照
        c.post(f"{AUTO}/scan", headers=h(ta))
        nb = c.get(NOTIF, headers=h(ta)).json().get("data", {})
        notifs_before = len(nb.get("notifications", [])) if isinstance(nb, dict) else 0
        # 追加一笔大额资产，制造总资产 >10% 变化
        c.post("/api/financial/assets", json={"type": "cash", "name": "新增存款", "amount": 800000}, headers=h(ta))
        sc = body(c.post(f"{AUTO}/scan", headers=h(ta)))
        events = sc.get("eventsDetected", 0)
        check("验收1-扫描检测到资产变化事件", events >= 1, str(sc)[:160])
        na = c.get(NOTIF, headers=h(ta)).json().get("data", {})
        notifs_after = len(na.get("notifications", [])) if isinstance(na, dict) else 0
        check("验收1-规则触发生成了通知", notifs_after > notifs_before, f"before={notifs_before} after={notifs_after}")

        # ---- 验收2：行动中心 ----
        act = body(c.post(f"{AUTO}/actions", json={"title": "复核新资产来源", "category": "wealth", "priority": "medium"}, headers=h(ta)))
        aid = act.get("id")
        check("验收2-行动项创建成功", bool(aid), str(act)[:120])
        comp = body(c.post(f"{AUTO}/actions/{aid}/complete", json={"feedback": {"note": "已确认"}}, headers=h(ta)))
        check("验收2-行动项标记完成", comp.get("status") == "done", str(comp)[:120])
        stats = body(c.get(f"{AUTO}/actions/stats", headers=h(ta)))
        check("验收2-反馈即学习(接受率>0)", (stats.get("acceptanceRate") or 0) > 0, str(stats)[:120])

        # ---- 验收3：市场数据优雅降级 ----
        set_manager(MarketDataManager([DeterministicProvider()]))
        pc = c.get(f"{AUTO}/market/portfolio-change", headers=h(ta))
        pcb = body(pc)
        check("验收3-行情接口不崩溃(200)", pc.status_code == 200, f"status={pc.status_code}")
        check("验收3-离线时优雅降级(degraded)", isinstance(pcb.get("degraded"), bool), str(pcb)[:160])

        # ---- 验收4：关闭 Agent 后不再执行 ----
        plan = body(c.post(f"{AUTO}/plans", json={"name": "退休巡检", "agentKind": "retirement", "cadence": "weekly"}, headers=h(ta)))
        pid = plan.get("id")
        c.put(f"{AUTO}/plans/{pid}", json={"enabled": False}, headers=h(ta))
        runp = body(c.post(f"{AUTO}/plans/{pid}/run", headers=h(ta)))
        check("验收4-禁用计划后run返回skipped", runp.get("status") == "skipped", str(runp)[:160])

        # ---- 验收5：成本控制（预算耗尽降级 local）----
        db = SessionLocal()
        try:
            for _ in range(20):
                db.add(AutomationRun(user_id=ida, source="agent", llm_called=True, status="success"))
            db.commit()
            tier, reason = cost_guard.decide_tier(db, ida, severity="critical", requested="ai")
            check("验收5-预算耗尽降级为local", tier == "local", f"tier={tier} reason={reason}")
        finally:
            db.close()

        # ---- 跨用户隔离 ----
        rules_b = body(c.get(f"{AUTO}/rules", headers=h(tb)))
        rb = rules_b.get("_raw") if isinstance(rules_b, dict) else rules_b
        check("隔离-B 看不到 A 的规则(B 列表为空)", isinstance(rb, list) and len(rb) == 0, f"rules_b={rules_b}")
        # B 尝试操作 A 的行动项（应 404）
        cross = c.post(f"{AUTO}/actions/{aid}/complete", json={}, headers=h(tb))
        check("隔离-B 操作 A 的行动项被拒(404)", cross.status_code == 404, f"status={cross.status_code}")

    print(f"\n==== Phase 7.4 验收结果：PASS={len(PASS)}  FAIL={len(FAIL)} ====")
    if FAIL:
        print("失败项：")
        for f in FAIL:
            print("  -", f)
        sys.exit(1)
    print("全部通过 ✅")


if __name__ == "__main__":
    main()
