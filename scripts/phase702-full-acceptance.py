"""任务 #291 — Phase 7.0.2 完整验收补齐。

运行（项目根，PYTHONPATH=.）：
  python scripts/phase702-full-acceptance.py

覆盖四块：
  1. 迁移幂等：run_legacy_import 跑两次，第二次全 skipped、行数不变。
  2. 页面 API 契约：register/login → assets CRUD → twin recalc+status →
     cfo analyze（无模型降级）→ rag ingest/query/chunks → agent run→轮询 →
     monitor run。（documents 无真实文件则跳过标注）
  3. 跨用户隔离：第二用户看不到第一用户 assets / agent 任务详情 403/404 / twin 欢迎态。
  4. 生产 mock 禁用：src/ mock adapter 仍带 SIMULATED_DATA_NOTE；backend/ 无演示数据。

全部通过则 PASS=X FAIL=0；否则修复后重跑。
"""
from __future__ import annotations

import hashlib
import json
import os
import sys
import tempfile
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

# ---- 必须在 import backend 之前设置 ----
_TMP = Path(tempfile.mkdtemp(prefix="finos702_"))
_DB = _TMP / "finos702.db"
os.environ["DATABASE_URL"] = f"sqlite:///{_DB.as_posix()}"
os.environ["ENCRYPTION_MASTER_KEY"] = "qqVLJLsnK_PMt7Im3Qz006hjBsZw9XT3aDkZVuvY_Pk="
os.environ["JWT_SECRET"] = "test-jwt-secret-702"
os.environ["MIGRATE_LEGACY_DATA"] = "false"

from sqlalchemy import func, select  # noqa: E402

from backend.config import get_settings  # noqa: E402
from backend.database import SessionLocal, init_db  # noqa: E402
from backend.main import app  # noqa: E402
from backend.migration.legacy_codec import (  # noqa: E402
    FINANCIAL_SALT,
    MODEL_CENTER_SALT,
    encrypt_envelope,
    encrypt_envelope_text,
)
from backend.migration.legacy_import import run_legacy_import  # noqa: E402

get_settings()  # 触发 .env 读取

# 用于行数统计的模型
from backend.ai.models import AIModelConfig  # noqa: E402
from backend.document.models import Document  # noqa: E402
from backend.financial.models import Asset, FinancialProfile, Transaction  # noqa: E402
from backend.memory.models import Memory  # noqa: E402
from backend.user.models import User  # noqa: E402

# ---------- 统计 ----------
passed = 0
failed = 0
failures: list[str] = []


def assert_ok(cond: bool, msg: str) -> None:
    global passed, failed
    if cond:
        passed += 1
        print(f"  ✓ {msg}")
    else:
        failed += 1
        failures.append(msg)
        print(f"  ✗ {msg}")


# ============================================================
# 1. 迁移幂等
# ============================================================
def build_synthetic_data() -> Path:
    d = _TMP / ".data"
    (d / "users").mkdir(parents=True)
    (d / "financial_profiles").mkdir(parents=True)
    (d / "financial").mkdir(parents=True)
    (d / "memory").mkdir(parents=True)
    (d / "documents" / "user-verify-290").mkdir(parents=True)
    (d / "models").mkdir(parents=True)

    (d / "users" / "user-verify-290.json").write_text(
        json.dumps(
            {
                "id": "user-verify-290",
                "email": "verify290@example.com",
                "name": "Verify",
                "passwordHash": hashlib.scrypt(
                    b"Sup3rSecret!", salt=(s := os.urandom(16)), n=16384, r=8, p=1, dklen=64
                ).hex(),
                "passwordSalt": s.hex(),
                "profileCompleted": True,
                "createdAt": 1700000000000,
                "updatedAt": 1700000000000,
                "avatarUrl": None,
            },
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )
    (d / "financial_profiles" / "user-verify-290.json").write_text(
        json.dumps(
            {
                "id": "wp-verify-1",
                "userId": "user-verify-290",
                "name": "Verify",
                "age": 30,
                "occupation": "dev",
                "city": "BJ",
                "income": 5000,
                "expense": 2000,
                "investment": 1000,
                "assets": {"cash": 10000, "stocks": 0, "funds": 0, "realEstate": 0, "other": 0},
                "liabilities": {"mortgage": 0, "loans": 0, "other": 0},
                "goals": {"retirementAge": 60, "targetAmount": 1000000, "lifeGoal": "财富自由"},
                "completed": True,
                "createdAt": 1700000000000,
                "updatedAt": 1700000000000,
            },
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )
    (d / "financial" / "user-verify-290.json.enc").write_text(
        json.dumps(
            encrypt_envelope(
                {
                    "userId": "user-verify-290",
                    "transactions": [
                        {"id": "tx-1", "date": "2026-01-01", "amount": 100, "direction": "income", "category": "salary", "merchant": "x", "description": "d", "rawType": "", "source": "manual", "confidence": 1, "classifiedBy": "manual", "importId": "i1"},
                        {"id": "tx-2", "date": "2026-01-02", "amount": -50, "direction": "expense", "category": "food", "merchant": "y", "description": "d", "rawType": "", "source": "manual", "confidence": 1, "classifiedBy": "manual", "importId": "i1"},
                    ],
                    "holdings": [
                        {"id": "hold-1", "userId": "user-verify-290", "name": "基金A", "type": "fund", "marketValue": 8000, "source": "manual", "importId": "i1"},
                    ],
                    "policies": [
                        {"id": "pol-1", "userId": "user-verify-290", "insurer": "平安", "productName": "重疾险", "coverage": 500000, "source": "manual", "importId": "i1"},
                    ],
                    "imports": [],
                    "updatedAt": "2026-01-02T00:00:00.000Z",
                    "version": 2,
                },
                "secret",
                FINANCIAL_SALT,
            ),
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )
    (d / "memory" / "user-verify-290.json").write_text(
        json.dumps(
            {
                "userId": "user-verify-290",
                "profile": [{"id": "mem-p1", "timestamp": 1700000000000, "note": "p"}],
                "goal": [{"id": "mem-g1", "timestamp": 1700000000000, "goalType": "退休", "label": "退休", "note": "退休"}],
                "financial": [{"id": "mem-f1", "timestamp": 1700000000000, "changeNote": "调仓"}],
                "decision": [{"id": "mem-d1", "timestamp": 1700000000000, "decision": "买入"}],
                "preferences": {"risk": "balanced"},
            },
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )
    (d / "documents" / "user-verify-290" / "index.json").write_text(
        json.dumps(
            [{"id": "doc-1", "userId": "user-verify-290", "fileName": "stmt.csv", "storedName": "doc-1.csv", "mimeType": "text/csv", "size": 100, "category": "asset_proof", "uploadedAt": 1700000000000, "ragStatus": "uploaded"}],
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )
    (d / "models" / "user-verify-290.json.enc").write_text(
        json.dumps(
            encrypt_envelope(
                {
                    "userId": "user-verify-290",
                    "configs": [
                        {
                            "id": "cfg-1",
                            "userId": "user-verify-290",
                            "providerName": "openai",
                            "providerType": "openai-compatible",
                            "displayName": "GPT",
                            "modelName": "gpt-4o",
                            "modelId": "gpt-4o",
                            "baseUrl": "https://api.openai.com/v1",
                            "encryptedApiKey": encrypt_envelope_text("sk-verify-290-abcdefghij", "secret", MODEL_CENTER_SALT),
                            "status": "online",
                            "isDefault": True,
                            "roles": ["default"],
                            "createdAt": "2026-01-01T00:00:00.000Z",
                            "updatedAt": "2026-01-01T00:00:00.000Z",
                        }
                    ],
                    "updatedAt": "2026-01-01T00:00:00.000Z",
                },
                "secret",
                FINANCIAL_SALT,
            ),
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )
    return d


def count_all(db) -> dict:
    return {
        "users": db.scalar(select(func.count()).select_from(User)) or 0,
        "profiles": db.scalar(select(func.count()).select_from(FinancialProfile)) or 0,
        "assets": db.scalar(select(func.count()).select_from(Asset)) or 0,
        "tx": db.scalar(select(func.count()).select_from(Transaction)) or 0,
        "mem": db.scalar(select(func.count()).select_from(Memory)) or 0,
        "doc": db.scalar(select(func.count()).select_from(Document)) or 0,
        "cfg": db.scalar(select(func.count()).select_from(AIModelConfig)) or 0,
    }


def test_migration_idempotent() -> None:
    print("\n=== 1) 迁移幂等 ===")
    data_dir = build_synthetic_data()
    init_db()

    db = SessionLocal()
    s1 = run_legacy_import(str(data_dir), db, finos_data_key="secret")
    db.commit()
    db.close()

    db = SessionLocal()
    s2 = run_legacy_import(str(data_dir), db, finos_data_key="secret")
    db.commit()
    db.close()

    c1 = count_all(SessionLocal())
    db = SessionLocal(); c1 = count_all(db); db.close()

    print("  第一次统计:", json.dumps(s1, ensure_ascii=False))
    print("  第二次统计:", json.dumps(s2, ensure_ascii=False))
    print("  行数:", c1)

    # 第二次应全部 skipped（无新增）
    second_inserts = (
        s2.get("users", 0) + s2.get("profiles", 0) + s2.get("assets", 0)
        + s2.get("transactions", 0) + s2.get("memories", 0)
        + s2.get("documents", 0) + s2.get("model_configs", 0)
    )
    assert_ok(second_inserts == 0, "第二次导入新增行数=0（全 skipped）")
    assert_ok(s2.get("skipped", 0) > 0, "第二次 skipped > 0")
    # 行数稳定
    assert_ok(
        c1["users"] == 1 and c1["profiles"] == 1 and c1["assets"] == 2 and c1["tx"] == 2
        and c1["mem"] == 5 and c1["doc"] == 1 and c1["cfg"] == 1,
        "导入后行数正确（users=1 assets=2 tx=2 mem=5 doc=1 cfg=1）",
    )


# ============================================================
# 2 & 3. 页面 API 契约 + 跨用户隔离（同一 TestClient 生命周期）
# ============================================================
def test_api_contract_and_isolation() -> None:
    from fastapi.testclient import TestClient

    print("\n=== 2) 页面 API 契约 ===")
    with TestClient(app) as client:  # 进入 lifespan（启动 worker + init_db）
        # ----- 用户 A -----
        email_a = f"a702_{int(time.time())}@finos.test"
        r = client.post("/api/auth/register", json={"email": email_a, "password": "Passw0rd!2026"})
        assert_ok(r.status_code == 200 and r.json().get("success"), "A 注册成功")
        tok_a = r.json()["data"]["token"]
        h = {"Authorization": f"Bearer {tok_a}"}

        # login 拿新 token
        r = client.post("/api/auth/login", json={"email": email_a, "password": "Passw0rd!2026"})
        assert_ok(r.status_code == 200 and r.json().get("success"), "A 重新登录成功")
        tok_a = r.json()["data"]["token"]
        h = {"Authorization": f"Bearer {tok_a}"}

        # assets CRUD
        r = client.post("/api/assets", json={"type": "cash", "name": "招行", "amount": 50000}, headers=h)
        assert_ok(r.status_code == 200 and r.json().get("success"), "POST /assets 成功")
        aid = r.json()["data"]["id"]
        r = client.get("/api/assets", headers=h)
        assert_ok(r.status_code == 200 and r.json()["data"]["total"] == 50000, "GET /assets total=50000")
        r = client.put(f"/api/assets/{aid}", json={"type": "cash", "name": "招行2", "amount": 80000}, headers=h)
        assert_ok(r.status_code == 200 and r.json().get("success"), "PUT /assets 成功")
        r = client.get("/api/assets", headers=h)
        assert_ok(r.json()["data"]["total"] == 80000, "PUT 后 total=80000")
        r = client.delete(f"/api/assets/{aid}", headers=h)
        assert_ok(r.status_code == 200 and r.json().get("success"), "DELETE /assets 成功")
        r = client.get("/api/assets", headers=h)
        assert_ok(r.json()["data"]["total"] == 0, "DELETE 后 total=0")

        # twin recalculate + status
        r = client.post("/api/assets", json={"type": "cash", "name": "招行", "amount": 50000}, headers=h)
        aid = r.json()["data"]["id"]
        r = client.post("/api/twin/recalculate", headers=h)
        assert_ok(
            r.status_code == 200 and r.json().get("success") and r.json()["data"]["netWorth"] == 50000,
            "POST /twin/recalculate netWorth=50000",
        )
        r = client.get("/api/twin/status", headers=h)
        assert_ok(
            r.status_code == 200 and r.json().get("success") and r.json()["data"]["hasData"] is True,
            "GET /twin/status hasData=true",
        )

        # cfo analyze（无模型 → 降级 local，非 500）
        r = client.post("/api/cfo/analyze", json={"question": "如何优化配置"}, headers=h)
        j = r.json()
        assert_ok(r.status_code == 200 and j.get("success"), "POST /cfo/analyze 非 500")
        if j.get("success"):
            assert_ok(j["data"]["hasData"] is True, "CFO 读取到真实数据 hasData=true")
            assert_ok(j["data"].get("advice", {}).get("tier") == "local", "CFO 未配模型降级为 local")
            assert_ok("不构成投资建议" in j["data"].get("disclaimer", ""), "CFO 带合规免责声明")

        # rag ingest + query + chunks
        r = client.post(
            "/api/rag/ingest",
            json={"title": "退休规划", "category": "retirement", "text": "退休应配置指数基金并预留应急金"},
            headers=h,
        )
        assert_ok(r.status_code == 200 and r.json().get("success"), "POST /rag/ingest 成功")
        r = client.post("/api/rag/query", json={"question": "如何做退休规划", "topK": 3}, headers=h)
        assert_ok(
            r.status_code == 200 and r.json().get("success") and len(r.json()["data"]["hits"]) >= 1,
            "POST /rag/query 命中 ≥1",
        )
        assert_ok(r.json()["data"]["sources"][0]["scope"] == "personal", "RAG 来源归属 personal")
        r = client.get("/api/rag/chunks", headers=h)
        assert_ok(
            r.status_code == 200 and r.json().get("success") and len(r.json()["data"]["chunks"]) >= 1,
            "GET /rag/chunks ≥1",
        )

        # agent run → 轮询完成
        r = client.post("/api/agent/tasks", json={"task_type": "general", "question": "整体财务建议"}, headers=h)
        assert_ok(r.status_code == 200 and r.json().get("success"), "POST /agent/tasks 成功")
        task_id = r.json()["data"]["taskId"]
        assert_ok(len(r.json()["data"]["agents"]) >= 1, "编排路由 ≥1 子智能体")
        # 同步返回即完成（编排同步执行）
        detail = client.get(f"/api/agent/tasks/{task_id}", headers=h).json()
        assert_ok(detail.get("success") and detail["data"]["status"] == "completed", "Agent 任务状态 completed")
        assert_ok(detail["data"]["result"]["execution"]["steps"] >= 1, "任务结果含执行步骤")
        # 列表含该任务
        lst = client.get("/api/agent/tasks", headers=h).json()
        assert_ok(any(t["id"] == task_id for t in lst["data"]["tasks"]), "任务列表含本任务")

        # monitor run（先补 profile，使 hasData=true）
        r = client.post(
            "/api/financial/profile",
            json={"age": 35, "income": 20000, "expense": 12000, "risk_level": "balanced", "goal": "积累 100 万退休金"},
            headers=h,
        )
        assert_ok(r.status_code == 200 and r.json().get("success"), "POST /financial/profile 成功")
        r = client.post("/api/monitor/run", headers=h)
        assert_ok(r.status_code == 200 and r.json().get("success"), "POST /monitor/run 成功（非 500）")
        if r.json().get("success"):
            assert_ok(r.json()["data"]["hasData"] is True, "Monitor 检测到真实数据 hasData=true")

        # documents：无真实文件 → 跳过标注
        print("  ⊘ documents 真实文件上传/解析：本次无真实文件，跳过（标注）")

    # 退出 client lifespan 后，新建 client 做跨用户隔离（同 DB 文件）
    print("\n=== 3) 跨用户隔离 ===")
    with TestClient(app) as c2:
        email_b = f"b702_{int(time.time())}@finos.test"
        r = c2.post("/api/auth/register", json={"email": email_b, "password": "Passw0rd!2026"})
        assert_ok(r.status_code == 200 and r.json().get("success"), "B 注册成功")
        tok_b = r.json()["data"]["token"]
        hb = {"Authorization": f"Bearer {tok_b}"}

        # B 看不到 A 的 assets
        r = c2.get("/api/assets", headers=hb)
        assert_ok(r.json()["data"]["total"] == 0, "B 的 /assets 为空（隔离）")
        # B 访问 A 的 agent 任务详情 → 403/404
        r = c2.get(f"/api/agent/tasks/{task_id}", headers=hb)
        assert_ok(r.status_code in (403, 404), f"B 访问 A 的任务详情被拒（status={r.status_code}）")
        # B twin 欢迎态
        r = c2.get("/api/twin/status", headers=hb)
        assert_ok(r.json()["data"]["hasData"] is False, "B 的 twin 无数据")
        assert_ok("欢迎创建你的财富数字分身" in r.json()["data"].get("message", ""), "B 为欢迎态")


# ============================================================
# 4. 生产 mock 禁用
# ============================================================
def grep_count(text: str, pattern: str) -> int:
    return text.count(pattern)


def test_production_mock_disabled() -> None:
    print("\n=== 4) 生产 mock 禁用 ===")
    src = ROOT / "src"
    mock_files = ["market-data.ts", "fund-data.ts", "macro-data.ts", "news.ts"]
    all_present = True
    for fn in mock_files:
        p = src / "ai" / "tools" / fn
        if not p.exists():
            print(f"  ! 未找到 {p}")
            all_present = False
            continue
        content = p.read_text(encoding="utf-8", errors="ignore")
        has = "SIMULATED_DATA_NOTE" in content
        print(f"  {'✓' if has else '✗'} {fn} 含 SIMULATED_DATA_NOTE: {has}")
        all_present = all_present and has
    assert_ok(all_present, "src/ mock adapter 仍带 SIMULATED_DATA_NOTE 前缀")

    backend = ROOT / "backend"
    bad_hits = 0
    for p in backend.rglob("*.py"):
        if ".venv" in str(p) or "node_modules" in str(p):
            continue
        content = p.read_text(encoding="utf-8", errors="ignore")
        bad_hits += grep_count(content, "Alex Chen") + grep_count(content, "1280420")
    assert_ok(bad_hits == 0, f"backend/ 无硬编码演示数据（Alex Chen/1280420 命中={bad_hits}）")


def main() -> int:
    print("########## 任务 #291 Phase 7.0.2 完整验收 ##########")
    test_migration_idempotent()
    test_api_contract_and_isolation()
    test_production_mock_disabled()

    print(f"\n=== 结果：PASS={passed} FAIL={failed} ===")
    if failed:
        print("失败项：")
        for f in failures:
            print("  - " + f)
        return 1
    print("全部通过 ✅")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
