"""AKShare 外部数据源接入（宏观 / 汇率）。

说明：
- AKShare 为开源免费数据源；不同接口的可用性依赖网络目标站点。
- 本模块懒加载 akshare（导入较重），并对结果做内存缓存与行数裁剪，避免频繁请求与超时。
- 返回结构化 records，供前端展示；所有外部数据均标记为「外部来源·需人工复核」。
"""
from __future__ import annotations

import math
import time
from typing import Any, Callable

_CACHE: dict[str, tuple[float, list[dict[str, Any]]]] = {}
_CACHE_TTL_SECONDS = 3600


class AkshareError(RuntimeError):
    """AKShare 数据获取失败。"""


def _dataset_lpr(ak) -> Any:
    return ak.macro_china_lpr()


def _dataset_gdp(ak) -> Any:
    return ak.macro_china_gdp_yearly()


def _dataset_cpi(ak) -> Any:
    return ak.macro_china_cpi_yearly()


def _dataset_ppi(ak) -> Any:
    return ak.macro_china_ppi_yearly()


def _dataset_money_supply(ak) -> Any:
    return ak.macro_china_money_supply()


def _dataset_shrzgm(ak) -> Any:
    return ak.macro_china_shrzgm()


def _dataset_fx_boc(ak) -> Any:
    return ak.currency_boc_safe()


DATASETS: dict[str, dict[str, Any]] = {
    "lpr": {"label": "贷款市场报价利率（LPR）", "category": "利率", "loader": _dataset_lpr, "unit": "%"},
    "gdp": {"label": "中国 GDP 年率", "category": "宏观", "loader": _dataset_gdp, "unit": "%"},
    "cpi": {"label": "中国 CPI 年率", "category": "宏观", "loader": _dataset_cpi, "unit": "%"},
    "ppi": {"label": "中国 PPI 年率", "category": "宏观", "loader": _dataset_ppi, "unit": "%"},
    "money_supply": {"label": "货币供应量（M0/M1/M2）", "category": "宏观", "loader": _dataset_money_supply, "unit": "亿元"},
    "shrzgm": {"label": "社会融资规模增量", "category": "宏观", "loader": _dataset_shrzgm, "unit": "亿元"},
    "fx_boc": {"label": "人民币汇率中间价", "category": "汇率", "loader": _dataset_fx_boc, "unit": "CNY"},
}


def list_datasets() -> list[dict[str, Any]]:
    return [
        {"id": key, "label": value["label"], "category": value["category"], "unit": value["unit"]}
        for key, value in DATASETS.items()
    ]


def _clean_value(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, float) and (math.isnan(value) or math.isinf(value)):
        return None
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return value


def fetch_dataset(dataset: str, limit: int = 12, mc: Any = None) -> list[dict[str, Any]]:
    """获取数据集最近 limit 行（按原始顺序，最新在前或按原始排序）。"""
    spec = DATASETS.get(dataset)
    if spec is None:
        raise AkshareError("未知的数据集")
    limit = max(1, min(int(limit), 60))

    cached = _CACHE.get(dataset)
    if cached and time.time() - cached[0] < _CACHE_TTL_SECONDS:
        return cached[1][-limit:][::-1]

    akshare = mc
    if akshare is None:
        try:
            import akshare as akshare_module  # noqa: WPS433 (懒加载，导入较重)
        except Exception as exc:  # noqa: BLE001
            raise AkshareError("AKShare 未安装或导入失败") from exc
        akshare = akshare_module

    try:
        loader: Callable[[Any], Any] = spec["loader"]
        frame = loader(akshare)
    except Exception as exc:  # noqa: BLE001
        raise AkshareError(f"数据源获取失败：{type(exc).__name__}") from exc

    rows: list[dict[str, Any]] = []
    try:
        records = frame.to_dict("records")
        for record in records:
            rows.append({str(k): _clean_value(v) for k, v in record.items()})
    except Exception as exc:  # noqa: BLE001
        raise AkshareError(f"数据源解析失败：{type(exc).__name__}") from exc

    _CACHE[dataset] = (time.time(), rows)
    # 时间序列多为升序，取最近 limit 条并以最新在前返回。
    return rows[-limit:][::-1]
