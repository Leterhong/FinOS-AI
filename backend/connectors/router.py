"""外部业务数据源 API（AKShare 宏观 / 汇率）。"""
from __future__ import annotations

from fastapi import APIRouter, Depends, Query

from backend.connectors.akshare_provider import DATASETS, AkshareError, fetch_dataset, list_datasets
from backend.connectors.http_providers import (
    ExternalDataError,
    external_runtime_config,
    fx_latest,
    fx_series,
    gleif_search,
    sec_company_concept,
    sec_tags,
    worldbank_indicator,
    worldbank_indicators,
)
from backend.core import get_current_user, ok
from backend.core.response import fail
from backend.user.models import User

router = APIRouter(prefix="/data-sources", tags=["data-sources"])

NOTE = "外部公开数据源，仅供研判参考，需人工复核"


def _external(fn, *args, **kwargs):
    try:
        rows = fn(*args, **kwargs)
    except ExternalDataError as exc:
        return fail(str(exc), status_code=502)
    return ok({"rows": rows, "source": "external", "note": NOTE})


@router.get("/external/meta")
def external_meta(user: User = Depends(get_current_user)):
    return ok({"worldbankIndicators": worldbank_indicators(), "secTags": sec_tags(), "note": NOTE})


@router.get("/catalog")
def catalog(user: User = Depends(get_current_user)):
    runtime = external_runtime_config()
    sources = [
        {"provider": "akshare", "dataset": item["id"], "label": item["label"], "category": item["category"], "requiresKey": False, "cacheSeconds": runtime["cacheSeconds"], "host": "akshare"}
        for item in list_datasets()
    ]
    for provider, label, host, datasets in [
        ("fx", "ECB 汇率", "api.frankfurter.dev", ["latest", "series"]),
        ("worldbank", "世界银行", "api.worldbank.org", ["indicator"]),
        ("gleif", "GLEIF 法人识别", "api.gleif.org", ["search"]),
        ("sec", "SEC EDGAR", "data.sec.gov", ["concept", "tags"]),
    ]:
        for dataset in datasets:
            sources.append({"provider": provider, "dataset": dataset, "label": label, "category": "external", "requiresKey": False, "cacheSeconds": runtime["cacheSeconds"], "host": host})
    return ok({"sources": sources, "runtime": runtime, "note": NOTE})


@router.get("/config")
def external_config(user: User = Depends(get_current_user)):
    return ok({**external_runtime_config(), "note": NOTE})


@router.get("/fx/latest")
def external_fx_latest(base: str = "USD", symbols: str = "CNY,EUR,JPY,HKD", user: User = Depends(get_current_user)):
    return _external(fx_latest, base, symbols)


@router.get("/fx/series")
def external_fx_series(base: str = "USD", symbol: str = "CNY", days: int = Query(30, ge=1, le=365), user: User = Depends(get_current_user)):
    return _external(fx_series, base, symbol, days)


@router.get("/worldbank")
def external_worldbank(
    country: str = "CN",
    indicator: str = "NY.GDP.MKTP.CD",
    limit: int = Query(12, ge=1, le=60),
    user: User = Depends(get_current_user),
):
    return _external(worldbank_indicator, country, indicator, limit)


@router.get("/gleif")
def external_gleif(name: str = "", limit: int = Query(8, ge=1, le=25), user: User = Depends(get_current_user)):
    return _external(gleif_search, name, limit)


@router.get("/sec")
def external_sec(
    cik: str = "",
    tag: str = "Revenues",
    limit: int = Query(10, ge=1, le=40),
    user: User = Depends(get_current_user),
):
    return _external(sec_company_concept, cik, tag, limit)


@router.get("/akshare/datasets")
def akshare_datasets(user: User = Depends(get_current_user)):
    return ok({"datasets": list_datasets(), "source": "AKShare", "note": NOTE})


@router.get("/akshare/{dataset}")
def akshare_dataset(
    dataset: str,
    limit: int = Query(12, ge=1, le=60),
    user: User = Depends(get_current_user),
):
    if dataset not in DATASETS:
        return fail("未知的数据集", status_code=404)
    try:
        rows = fetch_dataset(dataset, limit)
    except AkshareError as exc:
        return fail(str(exc), status_code=502)
    return ok({"dataset": dataset, "rows": rows, "source": "AKShare", "note": NOTE})
