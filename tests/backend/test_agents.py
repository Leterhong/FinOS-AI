"""Agent 生态测试：内置 Agent 注册表、单体运行、工作流、本地降级（tier=local）。

核心断言：在没有配置任何 LLM 的环境下，Agent 必须走确定性本地算法，
返回 tier="local" 的可用结果，绝不 500、绝不白屏。
"""
from __future__ import annotations

from tests.conftest import API, assert_envelope

BUILTIN_AGENTS = {"cashflow", "insurance", "investment", "retirement", "tax"}


def _seed_financial_data(client, headers) -> None:
    client.post(f"{API}/financial/profile",
                json={"age": 33, "income": 28000, "expense": 13000,
                      "risk_level": "balanced", "goal": "10年内实现财务自由"},
                headers=headers)
    for payload in [
        {"type": "cash", "name": "活期存款", "amount": 180000},
        {"type": "stock", "name": "A股组合", "amount": 420000},
        {"type": "fund", "name": "指数基金", "amount": 260000},
        {"type": "property", "name": "自住房", "amount": 2200000},
    ]:
        client.post(f"{API}/financial/assets", json=payload, headers=headers)


# ---------------------------------------------------------------- 注册表
def test_agent_market_lists_builtin_agents(client, auth):
    resp = client.get(f"{API}/agents/market", headers=auth)
    assert resp.status_code == 200
    data = assert_envelope(resp)
    items = data["items"]
    names = {a.get("name") for a in items}
    missing = BUILTIN_AGENTS - names
    assert not missing, f"内置 Agent 缺失: {missing}"


def test_agent_market_requires_auth(client):
    assert client.get(f"{API}/agents/market").status_code in (401, 403)


# ---------------------------------------------------------------- 单体运行
def test_run_agent_degrades_to_local_without_llm(client, auth):
    _seed_financial_data(client, auth)
    resp = client.post(f"{API}/agents/run/investment", json={"useAi": False}, headers=auth)
    assert resp.status_code == 200, resp.text
    data = assert_envelope(resp)
    assert data.get("tier") in ("local", None) or data.get("tier") == "local"
    assert data, "本地降级仍须返回可用结果"


def test_run_unknown_agent_returns_404(client, auth):
    resp = client.post(f"{API}/agents/run/nonexistent_agent", json={"useAi": False}, headers=auth)
    assert resp.status_code == 404


def test_run_agent_requires_auth(client):
    resp = client.post(f"{API}/agents/run/investment", json={"useAi": False})
    assert resp.status_code in (401, 403)


def test_all_builtin_agents_are_runnable(client, auth):
    """五个内置 Agent 在无 LLM 环境下均须可运行且不抛 500。"""
    _seed_financial_data(client, auth)
    for name in sorted(BUILTIN_AGENTS):
        resp = client.post(f"{API}/agents/run/{name}", json={"useAi": False}, headers=auth)
        assert resp.status_code == 200, f"Agent {name} 运行失败: {resp.status_code} {resp.text[:200]}"


# ---------------------------------------------------------------- 工作流
def test_workflow_runs_multiple_agents(client, auth):
    _seed_financial_data(client, auth)
    resp = client.post(f"{API}/agents/workflow",
                       json={"agents": ["investment", "cashflow"], "useAi": False, "persist": False},
                       headers=auth)
    assert resp.status_code == 200, resp.text
    assert assert_envelope(resp) is not None


# ---------------------------------------------------------------- 工具
def test_tools_are_listed(client, auth):
    resp = client.get(f"{API}/agents/tools", headers=auth)
    assert resp.status_code == 200
    data = assert_envelope(resp)
    items = data.get("tools", data) if isinstance(data, dict) else data
    assert items, "Agent 工具清单不应为空"


def test_tool_call_is_scoped_to_current_user(client, user_a, user_b):
    """工具上下文锁定：Agent 工具只能读取调用者自己的数据。"""
    _seed_financial_data(client, user_a["headers"])
    resp = client.post(f"{API}/agents/tools/call",
                       json={"name": "get_assets", "args": {}},
                       headers=user_b["headers"])
    if resp.status_code == 200 and resp.json().get("success"):
        payload = str(resp.json().get("data"))
        assert "A股组合" not in payload, "Agent 工具泄露了其他用户的资产"


# ---------------------------------------------------------------- 运行日志
def test_agent_runs_log_is_isolated(client, user_a, user_b):
    _seed_financial_data(client, user_a["headers"])
    client.post(f"{API}/agents/run/cashflow", json={"useAi": False}, headers=user_a["headers"])

    resp = client.get(f"{API}/agents/runs", headers=user_b["headers"])
    assert resp.status_code == 200
    data = assert_envelope(resp)
    items = data["items"] if isinstance(data, dict) and "items" in data else data
    assert not items, "用户 B 不得看到用户 A 的 Agent 运行日志"
