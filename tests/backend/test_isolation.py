"""用户隔离铁律测试：任何数据查询都必须强制 user_id 过滤。

这是 FinOS AI 最高优先级的安全约束——用户 A 在任何情况下都不得
读取、修改或删除用户 B 的数据；越权访问一律等同「资源不存在」（404），
不得返回 403，以免暴露资源是否存在。
"""
from __future__ import annotations

from tests.conftest import API, assert_envelope


# ---------------------------------------------------------------- 资产隔离
def test_assets_are_isolated_between_users(client, user_a, user_b):
    client.post(f"{API}/financial/assets",
                json={"type": "stock", "name": "A的持仓", "amount": 100000},
                headers=user_a["headers"])
    client.post(f"{API}/financial/assets",
                json={"type": "cash", "name": "B的存款", "amount": 20000},
                headers=user_b["headers"])

    a_data = assert_envelope(client.get(f"{API}/financial/assets", headers=user_a["headers"]))
    b_data = assert_envelope(client.get(f"{API}/financial/assets", headers=user_b["headers"]))

    assert [x["name"] for x in a_data["assets"]] == ["A的持仓"]
    assert [x["name"] for x in b_data["assets"]] == ["B的存款"]
    assert a_data["total"] == 100000
    assert b_data["total"] == 20000


def test_cannot_delete_other_users_asset(client, user_a, user_b):
    created = client.post(f"{API}/financial/assets",
                          json={"type": "fund", "name": "A的基金", "amount": 30000},
                          headers=user_a["headers"])
    asset_id = created.json()["data"]["id"]

    # 用户 B 尝试删除 A 的资产
    resp = client.delete(f"{API}/financial/assets/{asset_id}", headers=user_b["headers"])
    assert resp.status_code == 404, "越权访问必须返回 404（等同不存在），不得返回 403 暴露资源存在性"

    # A 的资产仍然完好
    a_data = assert_envelope(client.get(f"{API}/financial/assets", headers=user_a["headers"]))
    assert len(a_data["assets"]) == 1


# ---------------------------------------------------------------- 交易隔离
def test_transactions_are_isolated(client, user_a, user_b):
    client.post(f"{API}/financial/transactions",
                json={"type": "income", "amount": 8000, "category": "salary"},
                headers=user_a["headers"])

    b_data = assert_envelope(client.get(f"{API}/financial/transactions", headers=user_b["headers"]))
    assert b_data["transactions"] == [], "用户 B 不得看到用户 A 的交易记录"

    a_data = assert_envelope(client.get(f"{API}/financial/transactions", headers=user_a["headers"]))
    assert len(a_data["transactions"]) == 1


# ---------------------------------------------------------------- 画像隔离
def test_profile_is_isolated(client, user_a, user_b):
    client.post(f"{API}/financial/profile",
                json={"age": 30, "income": 30000, "expense": 12000, "risk_level": "balanced"},
                headers=user_a["headers"])

    b_twin = assert_envelope(client.get(f"{API}/financial/profile", headers=user_b["headers"]))
    assert b_twin.get("hasData") is False, "新用户不得继承他人画像"


def test_new_user_gets_welcome_state(client, user_b):
    resp = client.get(f"{API}/financial/profile", headers=user_b["headers"])
    body = resp.json()
    assert body["success"] is True
    assert body["data"].get("hasData") is False
    assert "欢迎" in body.get("message", ""), "零数据用户应返回欢迎创建数字分身的提示"


# ---------------------------------------------------------------- 跨模块隔离
def test_knowledge_chunks_are_isolated(client, user_a, user_b):
    client.post(f"{API}/rag/ingest",
                json={"title": "A的私有笔记", "category": "note", "text": "这是用户 A 的私有知识内容。"},
                headers=user_a["headers"])

    b_chunks = client.get(f"{API}/rag/chunks", headers=user_b["headers"])
    if b_chunks.status_code == 200:
        payload = b_chunks.json()["data"]
        items = payload.get("chunks", payload) if isinstance(payload, dict) else payload
        titles = [c.get("title") for c in items] if isinstance(items, list) else []
        assert "A的私有笔记" not in titles, "用户 B 不得检索到用户 A 的知识片段"


def test_rag_query_does_not_leak_other_users_knowledge(client, user_a, user_b):
    client.post(f"{API}/rag/ingest",
                json={"title": "A的机密", "category": "note", "text": "用户 A 的年终奖金额是三十万元。"},
                headers=user_a["headers"])

    resp = client.post(f"{API}/rag/query", json={"question": "年终奖", "topK": 5},
                       headers=user_b["headers"])
    if resp.status_code == 200:
        data = resp.json()["data"]
        assert "三十万" not in (data.get("context") or ""), "跨用户 RAG 检索泄露"
        for hit in data.get("hits", []):
            assert hit.get("title") != "A的机密"


# ---------------------------------------------------------------- 无令牌拦截
def test_protected_endpoints_reject_anonymous(client):
    protected = [
        ("GET", f"{API}/financial/assets"),
        ("GET", f"{API}/financial/transactions"),
        ("GET", f"{API}/financial/profile"),
        ("GET", f"{API}/ai/models"),
        ("GET", f"{API}/agents/market"),
    ]
    for method, path in protected:
        resp = client.request(method, path)
        assert resp.status_code in (401, 403), f"{method} {path} 未拦截匿名访问（{resp.status_code}）"
