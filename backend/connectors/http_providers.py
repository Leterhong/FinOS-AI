"""无需密钥的外部业务数据源客户端：汇率（ECB/Frankfurter）、世界银行、GLEIF、SEC EDGAR。

仅访问固定官方主机（不接受用户自定义 URL），避免 SSRF；所有结果做内存缓存与行数裁剪。
"""
from __future__ import annotations

import json
import os
import time
import urllib.parse
import urllib.request
from typing import Any

_CACHE: dict[str, tuple[float, Any]] = {}
_TTL_SECONDS = 600
# SEC EDGAR 要求带联系方式的 User-Agent；可用环境变量覆盖。
_UA = os.getenv("EXTERNAL_HTTP_USER_AGENT", "FinOS-AI research contact@finos.local")


class ExternalDataError(RuntimeError):
    """外部数据获取失败。"""


def _get_json(url: str, timeout: int = 15) -> Any:
    cached = _CACHE.get(url)
    if cached and time.time() - cached[0] < _TTL_SECONDS:
        return cached[1]
    request = urllib.request.Request(url, headers={"User-Agent": _UA, "Accept": "application/json"})
    try:
        with urllib.request.urlopen(request, timeout=timeout) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except Exception as exc:  # noqa: BLE001
        raise ExternalDataError(f"外部数据请求失败：{type(exc).__name__}") from exc
    _CACHE[url] = (time.time(), data)
    return data


# ---------------------------------------------------------------- 汇率（Frankfurter / ECB）
def fx_latest(base: str = "USD", symbols: str = "CNY,EUR,JPY,HKD,GBP") -> list[dict[str, Any]]:
    base = (base or "USD").upper()[:3]
    symbols = ",".join(s.strip().upper()[:3] for s in (symbols or "").split(",") if s.strip())[:80]
    url = f"https://api.frankfurter.dev/v1/latest?base={urllib.parse.quote(base)}"
    if symbols:
        url += f"&symbols={urllib.parse.quote(symbols)}"
    data = _get_json(url)
    rates = data.get("rates") or {}
    return [{"基准": data.get("base", base), "目标货币": symbol, "汇率": rate, "日期": data.get("date", "")} for symbol, rate in rates.items()]


def fx_series(base: str = "USD", symbol: str = "CNY", days: int = 30) -> list[dict[str, Any]]:
    base = (base or "USD").upper()[:3]
    symbol = (symbol or "CNY").upper()[:3]
    days = max(1, min(int(days), 365))
    start = time.strftime("%Y-%m-%d", time.gmtime(time.time() - days * 86400))
    url = f"https://api.frankfurter.dev/v1/{start}..?base={urllib.parse.quote(base)}&symbols={urllib.parse.quote(symbol)}"
    data = _get_json(url)
    rows = [{"日期": date, "汇率": (rates or {}).get(symbol)} for date, rates in (data.get("rates") or {}).items()]
    return list(reversed(rows[-days:]))


# ---------------------------------------------------------------- 世界银行（World Bank）
WB_INDICATORS: dict[str, str] = {
    "NY.GDP.MKTP.CD": "GDP（现价美元）",
    "NY.GDP.MKTP.KD.ZG": "GDP 增长率",
    "FP.CPI.TOTL.ZG": "通胀率（CPI）",
    "SP.POP.TOTL": "总人口",
    "NE.EXP.GNFS.ZS": "出口占 GDP 比重",
}


def worldbank_indicator(country: str = "CN", indicator: str = "NY.GDP.MKTP.CD", limit: int = 10) -> list[dict[str, Any]]:
    country = "".join(c for c in (country or "CN").upper() if c.isalnum())[:3] or "CN"
    if indicator not in WB_INDICATORS:
        raise ExternalDataError("不支持的世界银行指标")
    limit = max(1, min(int(limit), 60))
    url = f"https://api.worldbank.org/v2/country/{country}/indicator/{indicator}?format=json&per_page={limit}"
    data = _get_json(url)
    if not isinstance(data, list) or len(data) < 2 or not data[1]:
        return []
    rows: list[dict[str, Any]] = []
    for item in data[1]:
        rows.append({
            "指标": WB_INDICATORS[indicator],
            "国家/地区": (item.get("country") or {}).get("value", country),
            "年份": item.get("date"),
            "值": item.get("value"),
        })
    return rows


def worldbank_indicators() -> list[dict[str, str]]:
    return [{"id": key, "label": value} for key, value in WB_INDICATORS.items()]


# ---------------------------------------------------------------- GLEIF 企业主体（LEI）
def gleif_search(name: str, limit: int = 5) -> list[dict[str, Any]]:
    keyword = (name or "").strip()[:80]
    if not keyword:
        raise ExternalDataError("请提供企业名称")
    limit = max(1, min(int(limit), 25))
    url = f"https://api.gleif.org/api/v1/lei-records?filter%5Bentity.legalName%5D={urllib.parse.quote(keyword)}&page%5Bsize%5D={limit}"
    data = _get_json(url)
    rows: list[dict[str, Any]] = []
    for item in (data.get("data") or []):
        entity = (item.get("attributes") or {}).get("entity") or {}
        registration = (item.get("attributes") or {}).get("registration") or {}
        rows.append({
            "LEI": item.get("id"),
            "法定名称": (entity.get("legalName") or {}).get("name"),
            "国家/地区": (entity.get("legalAddress") or {}).get("country"),
            "状态": (entity.get("status") if isinstance(entity.get("status"), str) else registration.get("status")),
            "最近更新": (registration.get("lastUpdateDate") if isinstance(registration.get("lastUpdateDate"), str) else None),
        })
    return rows


# ---------------------------------------------------------------- SEC EDGAR 公司财务
SEC_TAGS: dict[str, str] = {
    "Revenues": "营业收入",
    "NetIncomeLoss": "净利润",
    "Assets": "总资产",
    "Liabilities": "总负债",
    "NetCashProvidedByUsedInOperatingActivities": "经营活动现金流净额",
}


def sec_company_concept(cik: str, tag: str = "Revenues", limit: int = 8) -> list[dict[str, Any]]:
    digits = "".join(c for c in (cik or "") if c.isdigit())
    if not digits:
        raise ExternalDataError("请提供有效的 CIK（数字）")
    if tag not in SEC_TAGS:
        raise ExternalDataError("不支持的 SEC 财务科目")
    cik10 = digits.zfill(10)
    url = f"https://data.sec.gov/api/xbrl/companyconcept/CIK{cik10}/us-gaap/{tag}.json"
    data = _get_json(url)
    rows: list[dict[str, Any]] = []
    for unit_items in (data.get("units") or {}).values():
        for item in unit_items:
            rows.append({"期间结束": item.get("end"), "数值": item.get("val"), "财年": item.get("fy"), "季度": item.get("fp"), "表单": item.get("form")})
    rows.sort(key=lambda r: str(r.get("期间结束") or ""), reverse=True)
    return rows[: max(1, min(int(limit), 40))]


def sec_tags() -> list[dict[str, str]]:
    return [{"id": key, "label": value} for key, value in SEC_TAGS.items()]
