"""认证体系测试：注册 / 登录 / 令牌刷新轮换 / 登出吊销 / 未授权拦截。"""
from __future__ import annotations

import uuid

from tests.conftest import API, assert_envelope, register_user


# ---------------------------------------------------------------- 注册
def test_register_success(client):
    email = f"reg-{uuid.uuid4().hex[:8]}@finos.test"
    resp = client.post(f"{API}/auth/register", json={"email": email, "password": "Test1234!"})
    assert resp.status_code == 200
    data = assert_envelope(resp)
    assert data["token"], "注册应返回 access token"
    assert data["refreshToken"], "注册应返回 refresh token"
    assert data["user"]["email"] == email
    assert data["user"]["profileCompleted"] is False, "新用户档案应未完成"
    assert "password" not in data["user"], "响应绝不可包含密码字段"
    assert "passwordHash" not in data["user"]


def test_register_duplicate_email_returns_409(client):
    email = f"dup-{uuid.uuid4().hex[:8]}@finos.test"
    client.post(f"{API}/auth/register", json={"email": email, "password": "Test1234!"})
    resp = client.post(f"{API}/auth/register", json={"email": email, "password": "Other1234!"})
    assert resp.status_code == 409
    error = assert_envelope(resp, expect_success=False)
    assert "已注册" in error


def test_register_rejects_weak_password(client):
    resp = client.post(
        f"{API}/auth/register",
        json={"email": f"weak-{uuid.uuid4().hex[:6]}@finos.test", "password": "123"},
    )
    assert resp.status_code == 422, "密码长度不足应被 pydantic 拦截"


def test_register_rejects_invalid_email(client):
    resp = client.post(f"{API}/auth/register", json={"email": "abc", "password": "Test1234!"})
    assert resp.status_code == 422


# ---------------------------------------------------------------- 登录
def test_login_success(client):
    u = register_user(client)
    resp = client.post(f"{API}/auth/login", json={"email": u["email"], "password": u["password"]})
    assert resp.status_code == 200
    data = assert_envelope(resp)
    assert data["token"] and data["refreshToken"]
    assert data["user"]["id"] == u["user"]["id"]


def test_login_wrong_password_returns_401(client):
    u = register_user(client)
    resp = client.post(f"{API}/auth/login", json={"email": u["email"], "password": "WrongPass123!"})
    assert resp.status_code == 401
    error = assert_envelope(resp, expect_success=False)
    assert "邮箱或密码错误" in error, "错误信息不得区分「用户不存在」与「密码错误」，防用户枚举"


def test_login_unknown_email_same_error(client):
    resp = client.post(
        f"{API}/auth/login",
        json={"email": f"ghost-{uuid.uuid4().hex[:6]}@finos.test", "password": "Test1234!"},
    )
    assert resp.status_code == 401
    error = assert_envelope(resp, expect_success=False)
    assert "邮箱或密码错误" in error


# ---------------------------------------------------------------- /me
def test_me_requires_token(client):
    resp = client.get(f"{API}/auth/me")
    assert resp.status_code in (401, 403), "未携带令牌必须被拒绝"


def test_me_with_token(client, user_a):
    resp = client.get(f"{API}/auth/me", headers=user_a["headers"])
    assert resp.status_code == 200
    data = assert_envelope(resp)
    assert data["user"]["email"] == user_a["email"]


def test_me_rejects_forged_token(client):
    resp = client.get(f"{API}/auth/me", headers={"Authorization": "Bearer not.a.real.token"})
    assert resp.status_code in (401, 403)


# ---------------------------------------------------------------- 刷新令牌
def test_refresh_rotates_token(client, user_a):
    old_refresh = user_a["refreshToken"]
    resp = client.post(f"{API}/auth/refresh", json={"refreshToken": old_refresh})
    assert resp.status_code == 200
    data = assert_envelope(resp)
    assert data["token"], "刷新应返回新的 access token"
    new_refresh = data["refreshToken"]
    assert new_refresh and new_refresh != old_refresh, "Refresh Token 必须轮换"

    # 旧 refresh 应已被吊销（一次性使用）
    replay = client.post(f"{API}/auth/refresh", json={"refreshToken": old_refresh})
    assert replay.status_code in (401, 403), "旧 Refresh Token 重放必须失败"


def test_refresh_with_garbage_fails(client):
    resp = client.post(f"{API}/auth/refresh", json={"refreshToken": "garbage-token"})
    assert resp.status_code in (400, 401, 403)


# ---------------------------------------------------------------- 登出
def test_logout_revokes_refresh_token(client, user_a):
    resp = client.post(f"{API}/auth/logout", json={"refreshToken": user_a["refreshToken"]},
                       headers=user_a["headers"])
    assert resp.status_code == 200

    after = client.post(f"{API}/auth/refresh", json={"refreshToken": user_a["refreshToken"]})
    assert after.status_code in (401, 403), "登出后 Refresh Token 必须失效"


# ---------------------------------------------------------------- CSRF
def test_csrf_endpoint_sets_cookie(client):
    resp = client.get(f"{API}/auth/csrf")
    assert resp.status_code == 200
    data = assert_envelope(resp)
    assert data["csrfToken"], "应返回 csrfToken"
    assert "finos_csrf" in resp.cookies, "应下发双提交 Cookie"


# ---------------------------------------------------------------- 数据持久性
def test_data_survives_relogin(client):
    u = register_user(client)
    client.post(f"{API}/financial/assets",
                json={"type": "cash", "name": "活期存款", "amount": 50000},
                headers=u["headers"])

    relogin = client.post(f"{API}/auth/login", json={"email": u["email"], "password": u["password"]})
    new_headers = {"Authorization": f"Bearer {relogin.json()['data']['token']}"}

    assets = client.get(f"{API}/financial/assets", headers=new_headers)
    data = assert_envelope(assets)
    assert len(data["assets"]) == 1
    assert data["total"] == 50000
