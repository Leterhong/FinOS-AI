"""FinOS AI 测试全局装置（pytest fixtures）。

设计要点
--------
1. **完全隔离的临时数据库**：在导入任何 ``backend`` 模块之前改写 ``DATABASE_URL``
   环境变量，指向 ``tests/.tmp/`` 下的临时 SQLite 文件，绝不触碰开发库
   ``backend/data/finos.db``。
2. **每个测试函数一张全新的库**：``client`` fixture 会重新建表并清空数据，
   保证用例之间零耦合、可任意乱序执行。
3. **限流桶复位**：``SecurityMiddleware`` 使用进程内滑动窗口，
   注册/登录端点限流为 10 次/分钟/IP。测试前清空桶，避免批量用例触发 429。
4. **双用户装置**：``user_a`` / ``user_b`` 用于验证「用户隔离铁律」。

运行方式::

    PYTHONPATH=. pytest tests/backend -v
"""
from __future__ import annotations

import os
import sys
import uuid
from pathlib import Path
from typing import Any

import pytest

# ---------------------------------------------------------------- 环境准备
# 必须在 import backend 之前完成：backend.database.session 在模块导入期创建 engine
ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

TMP_DIR = ROOT / "tests" / ".tmp"
TMP_DIR.mkdir(parents=True, exist_ok=True)
TEST_DB = TMP_DIR / "test.db"

os.environ["DATABASE_URL"] = f"sqlite:///{TEST_DB.as_posix()}"
os.environ["JWT_SECRET"] = "finos-ai-test-jwt-secret-not-for-production-use-only-64bytes-long!"
# 固定测试主密钥（解码后恰为 32 字节），确保加密字段可读写
os.environ["ENCRYPTION_MASTER_KEY"] = "Zmlub3MtYWktdGVzdC1tYXN0ZXIta2V5LTMyYnl0ZXM="
os.environ["ENV"] = "test"

from fastapi.testclient import TestClient  # noqa: E402

from backend.database import Base, engine, init_db  # noqa: E402
from backend.main import app  # noqa: E402
from backend.core.cache import cache
from backend.security.middleware import SecurityMiddleware  # noqa: E402

API = "/api"


# ---------------------------------------------------------------- 基础装置
@pytest.fixture(scope="session", autouse=True)
def _prepare_schema() -> None:
    """整个测试会话开始前建表一次。"""
    init_db()


@pytest.fixture()
def client() -> TestClient:
    """全新数据库 + 全新客户端（每个测试函数独立）。"""
    # 清空所有业务表（保留表结构，比 drop_all 快且避免外键顺序问题）
    with engine.begin() as conn:
        for table in reversed(Base.metadata.sorted_tables):
            conn.exec_driver_sql(f'DELETE FROM "{table.name}"')

    # 复位限流窗口，避免跨用例累计触发 429
    cache._rate.clear()  # 限流窗口在 cache 内（Redis/内存双模式）

    with TestClient(app) as c:
        yield c


# ---------------------------------------------------------------- 用户装置
def _unique_email(tag: str) -> str:
    return f"{tag}-{uuid.uuid4().hex[:10]}@finos.test"


def register_user(client: TestClient, email: str | None = None, password: str = "Test1234!") -> dict[str, Any]:
    """注册并返回测试身份；Refresh Token 仅从 HttpOnly Cookie 读取。"""
    email = email or _unique_email("user")
    resp = client.post(f"{API}/auth/register", json={"email": email, "password": password})
    assert resp.status_code == 200, f"注册失败: {resp.status_code} {resp.text}"
    body = resp.json()
    assert body["success"] is True, body
    data = body["data"]
    return {
        "email": email,
        "password": password,
        "token": data["token"],
        "refreshToken": resp.cookies.get("finos_refresh"),
        "user": data["user"],
        "headers": {"Authorization": f"Bearer {data['token']}"},
    }


@pytest.fixture()
def db_session():
    """独立 DB 会话：与 TestClient 共用同一测试数据库。"""
    from backend.database import SessionLocal

    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture()
def user_a(client: TestClient) -> dict[str, Any]:
    return register_user(client, _unique_email("alice"))


@pytest.fixture()
def user_b(client: TestClient) -> dict[str, Any]:
    return register_user(client, _unique_email("bob"))


@pytest.fixture()
def auth(user_a: dict[str, Any]) -> dict[str, str]:
    """默认已登录用户的请求头。"""
    return user_a["headers"]


# ---------------------------------------------------------------- 断言助手
def assert_envelope(resp, expect_success: bool = True) -> Any:
    """校验统一响应信封并返回 data / error。"""
    body = resp.json()
    assert "success" in body, f"响应缺少 success 字段: {body}"
    assert body["success"] is expect_success, f"期望 success={expect_success}, 实际: {body}"
    return body.get("data") if expect_success else body.get("error")
