"""财富数据与 Financial Twin 测试：画像、资产、交易、Twin 计算与缓存失效。"""
from __future__ import annotations

from tests.conftest import API, assert_envelope


# ---------------------------------------------------------------- 画像
def test_upsert_profile_returns_twin(client, auth):
    resp = client.post(f"{API}/financial/profile",
                       json={"age": 32, "income": 25000, "expense": 12000,
                             "risk_level": "balanced", "goal": "5年内攒够100万"},
                       headers=auth)
    assert resp.status_code == 200
    data = assert_envelope(resp)
    assert data.get("hasData") is True


def test_profile_rejects_invalid_risk_level(client, auth):
    resp = client.post(f"{API}/financial/profile",
                       json={"age": 30, "income": 10000, "expense": 5000, "risk_level": "yolo"},
                       headers=auth)
    assert resp.status_code == 400
    error = assert_envelope(resp, expect_success=False)
    assert "risk_level" in error


def test_profile_rejects_negative_income(client, auth):
    resp = client.post(f"{API}/financial/profile",
                       json={"age": 30, "income": -1, "expense": 0, "risk_level": "balanced"},
                       headers=auth)
    assert resp.status_code == 422


# ---------------------------------------------------------------- 资产
def test_create_and_list_assets(client, auth):
    for payload in [
        {"type": "cash", "name": "活期", "amount": 100000},
        {"type": "stock", "name": "A股组合", "amount": 250000},
        {"type": "property", "name": "自住房", "amount": 1500000},
    ]:
        resp = client.post(f"{API}/financial/assets", json=payload, headers=auth)
        assert resp.status_code == 200, resp.text

    data = assert_envelope(client.get(f"{API}/financial/assets", headers=auth))
    assert len(data["assets"]) == 3
    assert data["total"] == 1850000


def test_asset_rejects_unknown_type(client, auth):
    resp = client.post(f"{API}/financial/assets",
                       json={"type": "nft_moonshot", "name": "投机", "amount": 100},
                       headers=auth)
    assert resp.status_code == 400
    assert "type" in assert_envelope(resp, expect_success=False)


def test_asset_rejects_negative_amount(client, auth):
    resp = client.post(f"{API}/financial/assets",
                       json={"type": "cash", "name": "负数", "amount": -500},
                       headers=auth)
    assert resp.status_code == 422


def test_delete_asset(client, auth):
    created = client.post(f"{API}/financial/assets",
                          json={"type": "bond", "name": "国债", "amount": 50000},
                          headers=auth)
    asset_id = created.json()["data"]["id"]

    resp = client.delete(f"{API}/financial/assets/{asset_id}", headers=auth)
    assert resp.status_code == 200

    data = assert_envelope(client.get(f"{API}/financial/assets", headers=auth))
    assert data["assets"] == []
    assert data["total"] == 0


def test_delete_nonexistent_asset_returns_404(client, auth):
    resp = client.delete(f"{API}/financial/assets/does-not-exist", headers=auth)
    assert resp.status_code == 404


# ---------------------------------------------------------------- 交易
def test_create_transactions(client, auth):
    client.post(f"{API}/financial/transactions",
                json={"type": "income", "amount": 25000, "category": "salary"}, headers=auth)
    client.post(f"{API}/financial/transactions",
                json={"type": "expense", "amount": 3200, "category": "food"}, headers=auth)

    data = assert_envelope(client.get(f"{API}/financial/transactions", headers=auth))
    assert len(data["transactions"]) == 2


def test_transaction_rejects_unknown_type(client, auth):
    resp = client.post(f"{API}/financial/transactions",
                       json={"type": "gamble", "amount": 100}, headers=auth)
    assert resp.status_code == 400


# ---------------------------------------------------------------- Twin
def test_twin_reflects_assets_after_cache_invalidation(client, auth):
    client.post(f"{API}/financial/profile",
                json={"age": 30, "income": 20000, "expense": 8000, "risk_level": "balanced"},
                headers=auth)
    # 先读一次，写入缓存
    client.get(f"{API}/financial/profile", headers=auth)

    # 新增资产后，缓存必须失效，Twin 需反映最新净值
    client.post(f"{API}/financial/assets",
                json={"type": "cash", "name": "新增存款", "amount": 777000}, headers=auth)

    data = assert_envelope(client.get(f"{API}/financial/profile", headers=auth))
    net = data.get("netWorth") or data.get("net_worth") or data.get("totalAssets")
    assert net is not None, f"Twin 应包含净值字段: {list(data.keys())}"
    assert float(net) >= 777000, "新增资产后 Twin 净值未更新，缓存失效逻辑异常"


def test_twin_recalculate_endpoint(client, auth):
    client.post(f"{API}/financial/profile",
                json={"age": 28, "income": 15000, "expense": 7000, "risk_level": "conservative"},
                headers=auth)
    resp = client.post(f"{API}/financial/twin/recalculate", headers=auth)
    assert resp.status_code == 200
    data = assert_envelope(resp)
    assert data.get("hasData") is True
