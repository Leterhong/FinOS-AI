"""安全体系测试：响应头、错误不泄露堆栈、限流、密钥零泄露、健康探针。"""
from __future__ import annotations

import uuid

from tests.conftest import API, assert_envelope
from backend.security.middleware import SecurityMiddleware
from backend.core.cache import cache


# ---------------------------------------------------------------- 安全响应头
def test_security_headers_present(client):
    resp = client.get(f"{API}/health")
    assert resp.headers.get("X-Content-Type-Options") == "nosniff"
    assert resp.headers.get("X-Frame-Options") == "DENY"
    assert resp.headers.get("Referrer-Policy") == "no-referrer"
    assert "camera=()" in resp.headers.get("Permissions-Policy", "")


def test_api_responses_are_not_cached(client, auth):
    resp = client.get(f"{API}/financial/assets", headers=auth)
    assert resp.headers.get("Cache-Control") == "no-store", "含敏感数据的 API 必须禁止缓存"
    assert "default-src 'none'" in resp.headers.get("Content-Security-Policy", "")


# ---------------------------------------------------------------- 错误处理
def test_404_returns_envelope_without_stacktrace(client):
    resp = client.get(f"{API}/this-route-does-not-exist")
    assert resp.status_code == 404
    body = resp.text
    for leak in ("Traceback", "File \"", "sqlalchemy", "site-packages"):
        assert leak not in body, f"错误响应泄露内部信息: {leak}"


def test_validation_error_does_not_leak_internals(client):
    resp = client.post(f"{API}/auth/register", json={"email": 123})
    assert resp.status_code == 422
    assert "Traceback" not in resp.text
    assert "site-packages" not in resp.text


# ---------------------------------------------------------------- 限流
def test_auth_endpoints_are_rate_limited(client):
    """登录端点严格限流 10 次/分钟/IP，防暴力破解。"""
    cache._rate.clear()
    statuses = []
    for _ in range(14):
        r = client.post(f"{API}/auth/login",
                        json={"email": f"brute-{uuid.uuid4().hex[:6]}@finos.test",
                              "password": "WrongPass123!"})
        statuses.append(r.status_code)
    assert 429 in statuses, f"登录端点未触发限流，实际状态码序列: {statuses}"
    cache._rate.clear()


def test_bootstrap_not_subject_to_strict_auth_limit(client):
    """bootstrap 每次整页加载都会静默调用，必须比登录限流宽松，避免正常刷新触发 429。"""
    cache._rate.clear()
    statuses = []
    for _ in range(15):
        r = client.post(f"{API}/auth/bootstrap", json={})
        statuses.append(r.status_code)
    assert 429 not in statuses, f"bootstrap 被过严限流，实际状态码序列: {statuses}"
    cache._rate.clear()


# ---------------------------------------------------------------- 密钥零泄露
def test_no_plaintext_key_in_any_response(client, auth):
    secret = "sk-leak-canary-0987654321abcdefghij"
    client.post(f"{API}/ai/models",
                json={"name": "Canary", "provider": "openai-compatible",
                      "base_url": "https://api.example.invalid/v1",
                      "model_id": "m1", "api_key": secret, "is_default": True},
                headers=auth)

    for path in (f"{API}/ai/models", f"{API}/ai/usage", f"{API}/auth/me"):
        resp = client.get(path, headers=auth)
        assert secret not in resp.text, f"{path} 泄露了明文 API Key"


def test_user_object_never_contains_password_hash(client, user_a):
    resp = client.get(f"{API}/auth/me", headers=user_a["headers"])
    text = resp.text.lower()
    for leak in ("password", "passwordhash", "password_hash", "$2b$"):
        assert leak not in text, f"用户对象泄露敏感字段: {leak}"


# ---------------------------------------------------------------- 健康探针
def test_health_is_public(client):
    resp = client.get(f"{API}/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body.get("success") is True or "status" in str(body)


def test_health_does_not_expose_secrets(client):
    resp = client.get(f"{API}/health")
    text = resp.text
    for leak in ("jwt_secret", "ENCRYPTION_MASTER_KEY", "password", "DATABASE_URL"):
        assert leak not in text, f"健康探针泄露配置: {leak}"


# ---------------------------------------------------------------- 上传防护
def test_upload_rejects_unauthenticated(client):
    resp = client.post(f"{API}/documents/upload", files={"file": ("a.txt", b"hello", "text/plain")})
    assert resp.status_code in (401, 403, 404, 422)


def test_upload_rejects_dangerous_extension(client, auth):
    resp = client.post(f"{API}/documents/upload",
                       files={"file": ("evil.exe", b"MZ\x90\x00", "application/octet-stream")},
                       headers=auth)
    assert resp.status_code != 500, "非法文件类型不得抛出未处理异常"
    if resp.status_code == 200:
        assert resp.json().get("success") is False, "可执行文件必须被拒绝"


# ---------------------------------------------------------------- 2026-11 安全审计回归
def test_intelligence_events_requires_auth(client):
    """V-05 回归：遗留静态目录端点也必须要求认证。"""
    resp = client.get(f"{API}/intelligence/events")
    assert resp.status_code in (401, 403), f"无认证端点返回 {resp.status_code}"

    auth_resp = client.get(f"{API}/intelligence/events", headers=auth_fixture_headers(client))
    assert auth_resp.status_code == 200, auth_resp.text


def auth_fixture_headers(client):
    """独立获取认证头（避免依赖 auth fixture 的用例顺序）。"""
    import uuid

    email = f"sec-audit-{uuid.uuid4().hex[:8]}@finos.test"
    r = client.post(f"{API}/auth/register", json={"email": email, "password": "Test1234!"})
    token = r.json()["data"]["token"]
    return {"Authorization": f"Bearer {token}"}


# ---------------------------------------------------------------- R-01 Guest 清理回归
def _mk_guest(db_session, email: str, days_old: int):
    from datetime import datetime, timedelta, timezone

    from backend.user.models import User

    u = User(
        email=email,
        password_hash="x",
        created_at=datetime.now(timezone.utc) - timedelta(days=days_old),
    )
    db_session.add(u)
    db_session.commit()
    db_session.refresh(u)
    return u


def test_guest_cleanup_removes_empty_old_guest_only(client, db_session):
    """R-01 回归：仅删除「过期 + 空数据 + 无活跃会话」的 guest；其余全部保留。"""
    from datetime import datetime, timedelta, timezone

    from sqlalchemy import select

    from backend.auth.models import RefreshToken
    from backend.enterprise.models import EnterpriseCase
    from backend.security.guest_cleanup import cleanup_stale_guests
    from backend.user.models import User

    old_empty = _mk_guest(db_session, f"guest-{uuid.uuid4().hex[:8]}@guest.finos.local", days_old=40)
    old_with_data = _mk_guest(db_session, f"guest-{uuid.uuid4().hex[:8]}@guest.finos.local", days_old=40)
    gc_case_id = f"CASE-GC-{uuid.uuid4().hex[:8]}"
    db_session.add(EnterpriseCase(id=gc_case_id, user_id=old_with_data.id, company="有数据的访客", title="t"))
    new_empty = _mk_guest(db_session, f"guest-{uuid.uuid4().hex[:8]}@guest.finos.local", days_old=1)
    real_user = _mk_guest(db_session, f"real-{uuid.uuid4().hex[:8]}@finos.test", days_old=400)  # 非 guest 前缀，绝不触碰

    # old_empty 保留一条已过期的 refresh 会话（不构成活跃会话，可清理）
    db_session.add(
        RefreshToken(
            user_id=old_empty.id,
            jti="gc-expired",
            expires_at=datetime.now(timezone.utc) - timedelta(days=1),
            revoked=False,
        )
    )
    # old_with_data 保留一条活跃会话（双重保险路径）
    db_session.add(
        RefreshToken(
            user_id=old_with_data.id,
            jti="gc-active",
            expires_at=datetime.now(timezone.utc) + timedelta(days=7),
            revoked=False,
        )
    )
    db_session.commit()

    removed = cleanup_stale_guests(db_session, max_age_days=30)
    assert removed == 1, f"应仅删除 1 个空访客，实际 {removed}"

    assert db_session.scalar(select(User).where(User.id == old_empty.id)) is None
    assert db_session.scalar(select(User).where(User.id == old_with_data.id)) is not None, "有业务数据的访客必须保留"
    assert db_session.scalar(select(User).where(User.id == new_empty.id)) is not None, "未过期的访客必须保留"
    assert db_session.scalar(select(User).where(User.id == real_user.id)) is not None, "非 guest 前缀账户绝不清理"
    assert db_session.scalar(select(EnterpriseCase).where(EnterpriseCase.id == gc_case_id)) is not None

    # 关闭开关时零操作
    assert cleanup_stale_guests(db_session, max_age_days=0) == 0
