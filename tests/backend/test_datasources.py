"""外部数据源（AKShare）接口测试：仅覆盖不联网的元数据与错误分支。"""
from __future__ import annotations


def test_akshare_datasets_requires_auth(client):
    resp = client.get("/api/data-sources/akshare/datasets")
    assert resp.status_code in (401, 403)


def test_akshare_datasets_list(client, auth):
    resp = client.get("/api/data-sources/akshare/datasets", headers=auth)
    assert resp.status_code == 200, resp.text
    data = resp.json()["data"]
    ids = [item["id"] for item in data["datasets"]]
    assert "lpr" in ids and "fx_boc" in ids and "money_supply" in ids
    assert data["source"] == "AKShare"


def test_akshare_unknown_dataset(client, auth):
    resp = client.get("/api/data-sources/akshare/not-exist", headers=auth)
    assert resp.status_code == 404
