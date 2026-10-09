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


def test_external_meta(client, auth):
    resp = client.get("/api/data-sources/external/meta", headers=auth)
    assert resp.status_code == 200, resp.text
    data = resp.json()["data"]
    assert any(item["id"] == "NY.GDP.MKTP.CD" for item in data["worldbankIndicators"])
    assert any(item["id"] == "Revenues" for item in data["secTags"])


def test_gleif_requires_name(client, auth):
    assert client.get("/api/data-sources/gleif?name=", headers=auth).status_code == 502


def test_worldbank_unknown_indicator(client, auth):
    assert client.get("/api/data-sources/worldbank?indicator=NOPE", headers=auth).status_code == 502


def test_catalog_lists_sources_and_runtime(client, auth):
    resp = client.get("/api/data-sources/catalog", headers=auth)
    assert resp.status_code == 200, resp.text
    data = resp.json()["data"]
    providers = {item["provider"] for item in data["sources"]}
    assert {"akshare", "fx", "worldbank", "gleif", "sec", "cninfo"} <= providers
    assert all(item["requiresKey"] is False for item in data["sources"])
    assert "cacheSeconds" in data["runtime"] and "minIntervalSeconds" in data["runtime"]


def test_cninfo_empty_inputs_return_502(client, auth):
    # 空名称 / 非数字代码由 provider 校验拒绝，不发起网络请求。
    assert client.get("/api/data-sources/cninfo/company?name=", headers=auth).status_code == 502
    assert client.get("/api/data-sources/cninfo/announcements?code=abc", headers=auth).status_code == 502
    assert client.get("/api/data-sources/cninfo/announcements?code=600519&category=nope", headers=auth).status_code in (200, 502)


def test_external_config_requires_auth(client, auth):
    assert client.get("/api/data-sources/config").status_code in (401, 403)
    resp = client.get("/api/data-sources/config", headers=auth)
    assert resp.status_code == 200, resp.text
    assert "cacheEnabled" in resp.json()["data"]
