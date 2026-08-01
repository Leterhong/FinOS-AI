"""安全体系测试：响应头、错误不泄露堆栈、限流、密钥零泄露、健康探针。"""
from __future__ import annotations

import uuid

from tests.conftest import API, assert_envelope
from backend.security.middleware import SecurityMiddleware


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
    SecurityMiddleware._requests.clear()
    statuses = []
    for _ in range(14):
        r = client.post(f"{API}/auth/login",
                        json={"email": f"brute-{uuid.uuid4().hex[:6]}@finos.test",
                              "password": "WrongPass123!"})
        statuses.append(r.status_code)
    assert 429 in statuses, f"登录端点未触发限流，实际状态码序列: {statuses}"
    SecurityMiddleware._requests.clear()


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
