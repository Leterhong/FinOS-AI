"""Phase 7.0.3 安全验收：数据库密文 / API Key 掩码 / 跨用户越权 / RAG 隔离 / 账户删除。"""
from __future__ import annotations

import os
import tempfile
from pathlib import Path

# 隔离测试数据库与加密密钥
_DB = Path(tempfile.gettempdir()) / f"finos_phase703_test_{os.getpid()}.db"
if _DB.exists():
    _DB.unlink()
os.environ["DATABASE_URL"] = f"sqlite:///{_DB.as_posix()}"
os.environ["ENCRYPTION_MASTER_KEY"] = "qqVLJLsnK_PMt7Im3Qz006hjBsZw9XT3aDkZVuvY_Pk="
os.environ["JWT_SECRET"] = "phase703-test-secret"
os.environ["CORS_ORIGINS"] = "http://localhost:3000"

from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import create_engine, text  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402

from backend.main import app  # noqa: E402
from backend.database.base import Base  # noqa: E402
from backend.database.session import SessionLocal  # noqa: E402

PASS = 0
FAIL = 0


def check(name: str, cond: bool, detail: str = "") -> None:
    global PASS, FAIL
    if cond:
        PASS += 1
        print(f"[PASS] {name}")
    else:
        FAIL += 1
        print(f"[FAIL] {name} :: {detail}")


client = TestClient(app)
from backend.database import init_db

init_db()

# ---------- 用户注册 / 登录 ----------
def register_login(email: str, pwd: str = "StrongPass1") -> tuple[str, str]:
    r = client.post("/api/auth/register", json={"email": email, "password": pwd})
    assert r.status_code == 200, r.text
    token = r.json()["data"]["token"]
    return r.json()["data"]["user"]["id"], token


ua_id, ua_token = register_login("user-a@finos.test")
ub_id, ub_token = register_login("user-b@finos.test")
H = {"Authorization": f"Bearer {ua_token}"}
H_B = {"Authorization": f"Bearer {ub_token}"}


# ---------- 测试1：数据库敏感字段不可读 ----------
client.post("/api/assets", headers=H, json={"type": "cash", "name": "招行储蓄", "amount": 123456.78})
raw = SessionLocal().execute(text("select amount from assets where user_id=:u"), {"u": ua_id}).fetchone()[0]
check("测试1-资产金额数据库密文", str(raw).startswith("aesgcm:v1:"), f"raw={raw}")
res = client.get("/api/assets", headers=H)
amounts = [a["amount"] for a in res.json()["data"]["assets"]]
check("测试1-接口返回明文金额", 123456.78 in amounts, f"amounts={amounts}")


# ---------- 测试2：前端响应无 API Key ----------
client.post(
    "/api/ai/models",
    headers=H,
    json={"name": "test", "base_url": "https://api.test/v1", "model_id": "m1", "api_key": "sk-secret-123456"},
)
models = client.get("/api/ai/models", headers=H).json()["data"]["models"]
payload = str(models)
check("测试2-模型列表不含明文Key", "sk-secret-123456" not in payload, payload)
check("测试2-模型列表不含密文字段", "api_key_encrypted" not in payload and "encryptedApiKey" not in payload, payload)
check("测试2-模型列表展示掩码", any("****" in (m.get("keyMask") or "") for m in models), payload)


# ---------- 测试3：用户A访问用户B数据 ----------
asset_id = res.json()["data"]["assets"][0]["id"]
r403 = client.delete(f"/api/assets/{asset_id}", headers=H_B)
check("测试3-跨用户删除他人资产 403/404", r403.status_code in (403, 404), f"status={r403.status_code}")


# ---------- 测试4：RAG 跨用户隔离 ----------
client.post("/api/rag/ingest", headers=H, json={"title": "私密持仓", "category": "holding", "text": "我持有 100 万腾讯股票"})
client.post("/api/rag/ingest", headers=H_B, json={"title": "他人持仓", "category": "holding", "text": "我持有 50 万茅台股票"})
qa = client.post("/api/rag/query", headers=H_B, json={"question": "我持有腾讯股票吗", "topK": 5})
hits = qa.json()["data"]["hits"]
cross = [h for h in hits if h.get("title") == "私密持仓"]
check("测试4-RAG 不跨用户召回", len(cross) == 0, f"hits={hits}")


# ---------- 测试5：删除账户级联清除 ----------
client.post("/api/assets", headers=H, json={"type": "fund", "name": "基金", "amount": 8888})
client.post("/api/rag/ingest", headers=H, json={"title": "待删知识", "text": "删除前知识"})
db = SessionLocal()
before_assets = db.execute(text("select count(*) from assets where user_id=:u"), {"u": ua_id}).scalar()
before_chunks = db.execute(text("select count(*) from knowledge_chunks where user_id=:u"), {"u": ua_id}).scalar()
db.close()
check("测试5-删除前存在数据", before_assets >= 1 and before_chunks >= 1, f"assets={before_assets}, chunks={before_chunks}")

del_res = client.request("DELETE", "/api/security/account", headers=H, json={"password": "StrongPass1", "confirmation": "DELETE MY DATA"})
check("测试5-账户删除成功", del_res.status_code == 200 and del_res.json().get("data", {}).get("deleted") is True, del_res.text)

db = SessionLocal()
after_user = db.execute(text("select count(*) from users where id=:u"), {"u": ua_id}).scalar()
after_assets = db.execute(text("select count(*) from assets where user_id=:u"), {"u": ua_id}).scalar()
after_chunks = db.execute(text("select count(*) from knowledge_chunks where user_id=:u"), {"u": ua_id}).scalar()
after_cfg = db.execute(text("select count(*) from ai_model_configs where user_id=:u"), {"u": ua_id}).scalar()
db.close()
check("测试5-用户已删除", after_user == 0, f"user={after_user}")
check("测试5-关联数据已删除", after_assets == 0 and after_chunks == 0 and after_cfg == 0, f"assets={after_assets}, chunks={after_chunks}, cfg={after_cfg}")


# ---------- 安全头 ----------
hdr = client.get("/health")
check("安全头-X-Frame-Options", hdr.headers.get("X-Frame-Options") == "DENY", str(hdr.headers))


print(f"\nPhase 7.0.3 验收结果：PASS={PASS} FAIL={FAIL}")
raise SystemExit(1 if FAIL else 0)
