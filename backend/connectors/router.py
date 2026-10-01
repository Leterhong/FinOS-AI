"""外部业务数据源 API（AKShare 宏观 / 汇率）。"""
from __future__ import annotations

from fastapi import APIRouter, Depends, Query

from backend.connectors.akshare_provider import DATASETS, AkshareError, fetch_dataset, list_datasets
from backend.core import get_current_user, ok
from backend.core.response import fail
from backend.user.models import User

router = APIRouter(prefix="/data-sources", tags=["data-sources"])

NOTE = "外部免费数据源（AKShare），仅供研判参考，需人工复核"


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
