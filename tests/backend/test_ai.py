"""AI 层测试：模型配置安全（Key 永不回传）、用量统计、无模型时的优雅降级。

注意：测试环境不连接任何真实大模型。用例只验证
「未配置模型 / 模型不可用」时系统是否优雅降级而非崩溃或泄密。
"""
from __future__ import annotations

import importlib

from backend.ai.gateway import GatewayError, PUBLIC_GATEWAY_ERROR
from tests.conftest import API, assert_envelope

FAKE_MODEL = {
    "name": "测试模型",
    "provider": "openai-compatible",
    "base_url": "https://api.example.invalid/v1",
    "model_id": "gpt-test",
    "api_key": "sk-super-secret-key-should-never-leak-1234567890",
    "is_default": True,
}


# ---------------------------------------------------------------- 模型配置
def test_model_list_empty_for_new_user(client, auth):
    data = assert_envelope(client.get(f"{API}/ai/models", headers=auth))
    assert data["models"] == []


def test_create_model_never_returns_plaintext_key(client, auth):
    resp = client.post(f"{API}/ai/models", json=FAKE_MODEL, headers=auth)
    assert resp.status_code == 200, resp.text
    raw = resp.text
    assert FAKE_MODEL["api_key"] not in raw, "严重安全缺陷：响应回传了明文 API Key"

    data = assert_envelope(resp)
    assert "apiKey" not in data and "api_key" not in data and "api_key_encrypted" not in data
    assert data["keyMask"], "应返回掩码"
    assert "****" in data["keyMask"] or "*" in data["keyMask"]


def test_list_models_never_leaks_key(client, auth):
    client.post(f"{API}/ai/models", json=FAKE_MODEL, headers=auth)
    resp = client.get(f"{API}/ai/models", headers=auth)
    assert FAKE_MODEL["api_key"] not in resp.text, "模型列表泄露明文 API Key"
    data = assert_envelope(resp)
    assert len(data["models"]) == 1
    assert data["models"][0]["isDefault"] is True


def test_model_config_is_user_isolated(client, user_a, user_b):
    client.post(f"{API}/ai/models", json=FAKE_MODEL, headers=user_a["headers"])
    b_data = assert_envelope(client.get(f"{API}/ai/models", headers=user_b["headers"]))
    assert b_data["models"] == [], "用户 B 不得看到用户 A 的模型配置"


def test_cannot_delete_other_users_model(client, user_a, user_b):
    created = client.post(f"{API}/ai/models", json=FAKE_MODEL, headers=user_a["headers"])
    config_id = created.json()["data"]["id"]
    resp = client.delete(f"{API}/ai/models/{config_id}", headers=user_b["headers"])
    assert resp.status_code == 404, "越权删除他人模型配置必须返回 404"


def test_delete_own_model(client, auth):
    created = client.post(f"{API}/ai/models", json=FAKE_MODEL, headers=auth)
    config_id = created.json()["data"]["id"]
    assert client.delete(f"{API}/ai/models/{config_id}", headers=auth).status_code == 200
    assert assert_envelope(client.get(f"{API}/ai/models", headers=auth))["models"] == []


# ---------------------------------------------------------------- 输入校验
def test_generate_without_model_degrades_gracefully(client, auth):
    """未配置任何模型时，不得 500，应返回明确的业务错误。"""
    resp = client.post(f"{API}/ai/generate",
                       json={"messages": [{"role": "user", "content": "你好"}]},
                       headers=auth)
    assert resp.status_code != 500, "无模型时不得抛出未处理异常"
    body = resp.json()
    assert "success" in body


def test_generate_rejects_oversized_input(client, auth):
    resp = client.post(f"{API}/ai/generate",
                       json={"messages": [{"role": "user", "content": "危" * 200000}]},
                       headers=auth)
    assert resp.status_code != 500
    assert resp.json().get("success") is False, "超长输入必须被安全上限拦截"


def test_generate_rejects_empty_messages(client, auth):
    resp = client.post(f"{API}/ai/generate", json={"messages": []}, headers=auth)
    assert resp.status_code == 422


def test_generate_requires_auth(client):
    resp = client.post(f"{API}/ai/generate", json={"messages": [{"role": "user", "content": "hi"}]})
    assert resp.status_code in (401, 403)


def test_generate_gateway_error_never_exposes_exception(client, auth, monkeypatch):
    client.post(f"{API}/ai/models", json=FAKE_MODEL, headers=auth)
    secret = "upstream=https://internal.example/v1 api_key=sk-do-not-leak"

    async def fail_generate(*_args, **_kwargs):
        raise GatewayError(secret)

    ai_router = importlib.import_module("backend.ai.router")
    monkeypatch.setattr(ai_router, "gw_generate", fail_generate)
    resp = client.post(
        f"{API}/ai/generate",
        json={"messages": [{"role": "user", "content": "分析经营风险"}]},
        headers=auth,
    )
    assert resp.status_code == 502
    assert secret not in resp.text
    assert PUBLIC_GATEWAY_ERROR in resp.text


def test_embed_gateway_error_never_exposes_exception(client, auth, monkeypatch):
    client.post(f"{API}/ai/models", json=FAKE_MODEL, headers=auth)
    secret = "provider traceback with sk-do-not-leak"

    async def fail_embed(*_args, **_kwargs):
        raise GatewayError(secret)

    ai_router = importlib.import_module("backend.ai.router")
    monkeypatch.setattr(ai_router, "gw_embed", fail_embed)
    resp = client.post(f"{API}/ai/embed", json={"texts": ["季度财报"]}, headers=auth)
    assert resp.status_code == 502
    assert secret not in resp.text
    assert PUBLIC_GATEWAY_ERROR in resp.text


def test_stream_gateway_error_never_exposes_exception(client, auth, monkeypatch):
    client.post(f"{API}/ai/models", json=FAKE_MODEL, headers=auth)
    secret = "private endpoint 10.0.0.8 and sk-do-not-leak"

    async def fail_stream(*_args, **_kwargs):
        if False:
            yield ""
        raise GatewayError(secret)

    ai_router = importlib.import_module("backend.ai.router")
    monkeypatch.setattr(ai_router, "gw_stream", fail_stream)
    resp = client.post(
        f"{API}/ai/stream",
        json={"messages": [{"role": "user", "content": "生成风险提示"}]},
        headers=auth,
    )
    assert resp.status_code == 200
    assert secret not in resp.text
    assert PUBLIC_GATEWAY_ERROR in resp.text


# ---------------------------------------------------------------- 用量统计
def test_usage_returns_new_structure(client, auth):
    resp = client.get(f"{API}/ai/usage", headers=auth)
    assert resp.status_code == 200
    data = assert_envelope(resp)
    assert "usage" in data and "totals" in data, f"用量结构应为 {{usage,totals}}，实际: {list(data.keys())}"
    assert isinstance(data["usage"], list)
    totals = data["totals"]
    for key in ("calls", "tokens", "inputTokens", "outputTokens"):
        assert key in totals, f"totals 缺少 {key}，实际: {list(totals.keys())}"


def test_usage_is_zero_for_new_user(client, auth):
    data = assert_envelope(client.get(f"{API}/ai/usage", headers=auth))
    assert data["totals"]["calls"] == 0
    assert data["totals"]["tokens"] == 0


# ---------------------------------------------------------------- 会话
def test_sessions_empty_for_new_user(client, auth):
    resp = client.get(f"{API}/ai/sessions", headers=auth)
    assert resp.status_code == 200
    data = assert_envelope(resp)
    items = data.get("sessions", data) if isinstance(data, dict) else data
    assert items in ([], None) or len(items) == 0
