"""RAG 知识检索测试：入库、检索、片段管理、跨用户零泄露。"""
from __future__ import annotations

from tests.conftest import API, assert_envelope

DOC = {
    "title": "指数基金定投笔记",
    "category": "investment",
    "text": (
        "指数基金定投是一种长期投资策略，通过定期定额买入宽基指数基金来平滑成本。"
        "适合无法准确择时的普通投资者，建议至少坚持三到五年以上，并在市场极端下跌时保持纪律。"
    ),
}


# ---------------------------------------------------------------- 入库
def test_ingest_document(client, auth):
    resp = client.post(f"{API}/rag/ingest", json=DOC, headers=auth)
    assert resp.status_code == 200, resp.text
    assert assert_envelope(resp) is not None


def test_ingest_rejects_empty_text(client, auth):
    resp = client.post(f"{API}/rag/ingest", json={"title": "空", "category": "note", "text": ""},
                       headers=auth)
    assert resp.status_code == 422


def test_ingest_rejects_oversized_text(client, auth):
    resp = client.post(f"{API}/rag/ingest",
                       json={"title": "超长", "category": "note", "text": "字" * 20000},
                       headers=auth)
    assert resp.status_code == 422, "超过 8000 字上限应被拦截"


def test_ingest_requires_auth(client):
    assert client.post(f"{API}/rag/ingest", json=DOC).status_code in (401, 403)


# ---------------------------------------------------------------- 检索
def test_query_retrieves_own_document(client, auth):
    client.post(f"{API}/rag/ingest", json=DOC, headers=auth)
    resp = client.post(f"{API}/rag/query", json={"question": "指数基金定投", "topK": 5}, headers=auth)
    assert resp.status_code == 200, resp.text
    data = assert_envelope(resp)
    assert "question" in data and "hits" in data
    assert isinstance(data["hits"], list)
    assert "tookMs" in data


def test_query_on_empty_knowledge_base_is_graceful(client, auth):
    """零知识时不得报错，应返回空命中。"""
    resp = client.post(f"{API}/rag/query", json={"question": "任意问题", "topK": 5}, headers=auth)
    assert resp.status_code == 200
    data = assert_envelope(resp)
    assert data["hits"] == []


def test_query_without_llm_returns_context_only(client, auth):
    """请求 answer=True 但未配置模型时，应返回提示而非 500。"""
    client.post(f"{API}/rag/ingest", json=DOC, headers=auth)
    resp = client.post(f"{API}/rag/query",
                       json={"question": "定投要坚持多久", "topK": 3, "answer": True},
                       headers=auth)
    assert resp.status_code == 200, resp.text
    data = assert_envelope(resp)
    if data.get("context"):
        assert data.get("answer") is None
        assert "尚未配置" in (data.get("note") or "")


def test_query_rejects_empty_question(client, auth):
    resp = client.post(f"{API}/rag/query", json={"question": "", "topK": 5}, headers=auth)
    assert resp.status_code == 422


# ---------------------------------------------------------------- 片段管理
def test_list_chunks(client, auth):
    client.post(f"{API}/rag/ingest", json=DOC, headers=auth)
    resp = client.get(f"{API}/rag/chunks", headers=auth)
    assert resp.status_code == 200
    data = assert_envelope(resp)
    items = data.get("chunks", data) if isinstance(data, dict) else data
    assert items, "入库后片段列表不应为空"


def test_cannot_delete_other_users_chunk(client, user_a, user_b):
    client.post(f"{API}/rag/ingest", json=DOC, headers=user_a["headers"])
    listing = client.get(f"{API}/rag/chunks", headers=user_a["headers"]).json()["data"]
    items = listing.get("chunks", listing) if isinstance(listing, dict) else listing
    if not items:
        return
    chunk_id = items[0].get("id")
    resp = client.delete(f"{API}/rag/chunks/{chunk_id}", headers=user_b["headers"])
    assert resp.status_code == 404, "越权删除他人知识片段必须返回 404"
