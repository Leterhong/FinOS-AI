"""无需密钥的外部业务数据源客户端：汇率（ECB/Frankfurter）、世界银行、GLEIF、SEC EDGAR。

仅访问固定官方主机（不接受用户自定义 URL），避免 SSRF；所有结果做内存缓存与行数裁剪。
"""
from __future__ import annotations

import json
import os
import threading
import time
import urllib.parse
import urllib.request
from typing import Any

_CACHE: dict[str, tuple[float, Any]] = {}
# 缓存与限流均可通过环境变量配置；缓存 TTL 为 0 或开关关闭时禁用缓存。
_CACHE_ENABLED = os.getenv("EXTERNAL_HTTP_CACHE", "1").strip().lower() not in {"0", "false", "no", "off"}
_TTL_SECONDS = max(0, int(os.getenv("EXTERNAL_HTTP_CACHE_TTL", "600")))
_MIN_INTERVAL = max(0.0, float(os.getenv("EXTERNAL_HTTP_MIN_INTERVAL", "0.3")))
_LAST_CALL: dict[str, float] = {}
_THROTTLE_LOCK = threading.Lock()
# SEC EDGAR 要求带联系方式的 User-Agent；可用环境变量覆盖。
_UA = os.getenv("EXTERNAL_HTTP_USER_AGENT", "FinOS-AI research contact@finos.local")


class ExternalDataError(RuntimeError):
    """外部数据获取失败。"""


def external_runtime_config() -> dict[str, Any]:
    """当前外部数据源缓存/限流配置，供目录接口展示。"""
    return {
        "cacheEnabled": _CACHE_ENABLED and _TTL_SECONDS > 0,
        "cacheSeconds": _TTL_SECONDS if _CACHE_ENABLED else 0,
        "minIntervalSeconds": _MIN_INTERVAL,
    }


def _throttle(host: str) -> None:
    if _MIN_INTERVAL <= 0 or not host:
        return
    with _THROTTLE_LOCK:
        wait = _MIN_INTERVAL - (time.time() - _LAST_CALL.get(host, 0.0))
        if wait > 0:
            time.sleep(wait)
        _LAST_CALL[host] = time.time()


def _get_json(url: str, timeout: int = 15) -> Any:
    from backend.core.cache import cache_get, cache_set

    use_cache = _CACHE_ENABLED and _TTL_SECONDS > 0
    if use_cache:
        cached = cache_get(f"ext:http:{url}")
        if cached is not None:
            return cached
    _throttle(urllib.parse.urlparse(url).netloc)
    request = urllib.request.Request(url, headers={"User-Agent": _UA, "Accept": "application/json"})
    try:
        with urllib.request.urlopen(request, timeout=timeout) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except Exception as exc:  # noqa: BLE001
        raise ExternalDataError(f"外部数据请求失败：{type(exc).__name__}") from exc
    if use_cache:
        # 走统一缓存层：生产为 Redis，多实例共享一致；不可用时回退进程内。
        cache_set(f"ext:http:{url}", data, ttl_seconds=_TTL_SECONDS)
    return data


def _post_form_json(url: str, form: dict[str, Any], timeout: int = 15) -> Any:
    """固定主机的表单 POST（仅用于无需密钥的公开数据接口），带缓存与限流。"""
    from backend.core.cache import cache_get, cache_set

    body = urllib.parse.urlencode(form).encode("utf-8")
    use_cache = _CACHE_ENABLED and _TTL_SECONDS > 0
    cache_key = f"ext:http:POST:{url}:{body.decode('utf-8')}"
    if use_cache:
        cached = cache_get(cache_key)
        if cached is not None:
            return cached
    _throttle(urllib.parse.urlparse(url).netloc)
    request = urllib.request.Request(
        url,
        data=body,
        headers={"User-Agent": _UA, "Accept": "application/json", "Content-Type": "application/x-www-form-urlencoded"},
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as resp:
            raw = resp.read().decode("utf-8")
    except Exception as exc:  # noqa: BLE001
        raise ExternalDataError(f"外部数据请求失败：{type(exc).__name__}") from exc
    try:
        data = json.loads(raw)
    except Exception as exc:  # noqa: BLE001
        raise ExternalDataError("外部数据返回非 JSON") from exc
    if use_cache:
        cache_set(cache_key, data, ttl_seconds=_TTL_SECONDS)
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


# ---------------------------------------------------------------- 巨潮资讯（上市公司公告）
# 中国证监会指定信息披露网站，免费公开、无需密钥；仅访问固定官方主机。
CNINFO_HOST = "https://www.cninfo.com.cn"
CNINFO_PDF_HOST = "http://static.cninfo.com.cn"
_CNINFO_CATEGORIES: dict[str, str] = {
    "风险提示": "category_gszl_szsh",
    "业绩预告": "category_yjygjxz_szsh",
    "诉讼仲裁": "category_sszc_szsh",
    "重大合同": "category_zdht_szsh",
    "股权质押": "category_gqzy_szsh",
    "减持": "category_jjyj_szsh",
    "年报": "category_ndbg_szsh",
    "半年报": "category_bndbg_szsh",
}


def cninfo_categories() -> list[dict[str, str]]:
    return [{"id": key, "label": key} for key in _CNINFO_CATEGORIES]


def _cninfo_column(sec_code: str) -> str:
    return "sse" if sec_code.startswith(("6", "9")) else "szse"


def cninfo_company_search(keyword: str, limit: int = 8) -> list[dict[str, Any]]:
    keyword = (keyword or "").strip()[:40]
    if not keyword:
        raise ExternalDataError("请提供公司名称或证券代码")
    limit = max(1, min(int(limit), 25))
    data = _post_form_json(
        f"{CNINFO_HOST}/new/information/topSearch/query",
        {"keyWord": keyword, "maxNum": limit},
    )
    rows: list[dict[str, Any]] = []
    if isinstance(data, list):
        for item in data[:limit]:
            rows.append({
                "证券代码": item.get("code"),
                "证券简称": item.get("zwjc"),
                "类别": item.get("category"),
                "orgId": item.get("orgId"),
            })
    return rows


def cninfo_announcements(sec_code: str, limit: int = 10, category: str = "") -> list[dict[str, Any]]:
    code = "".join(c for c in (sec_code or "").strip() if c.isalnum())[:6]
    if not code or not code.isdigit():
        raise ExternalDataError("请提供 6 位证券代码")
    limit = max(1, min(int(limit), 30))
    companies = _post_form_json(
        f"{CNINFO_HOST}/new/information/topSearch/query",
        {"keyWord": code, "maxNum": 5},
    )
    org_id = ""
    sec_name = ""
    if isinstance(companies, list):
        for item in companies:
            if item.get("code") == code:
                org_id = str(item.get("orgId") or "")
                sec_name = str(item.get("zwjc") or "")
                break
    if not org_id:
        raise ExternalDataError("未找到该证券代码对应的上市公司")
    form: dict[str, Any] = {
        "pageNum": 1,
        "pageSize": limit,
        "column": _cninfo_column(code),
        "tabName": "fulltext",
        "stock": f"{code},{org_id}",
        "isHLtitle": "true",
    }
    if category and category in _CNINFO_CATEGORIES:
        form["category"] = _CNINFO_CATEGORIES[category]
    data = _post_form_json(f"{CNINFO_HOST}/new/hisAnnouncement/query", form)
    rows: list[dict[str, Any]] = []
    for item in (data.get("announcements") or [])[:limit]:
        ts = item.get("announcementTime")
        date = time.strftime("%Y-%m-%d", time.gmtime(ts / 1000)) if isinstance(ts, (int, float)) else ""
        adjunct = item.get("adjunctUrl")
        rows.append({
            "证券代码": item.get("secCode") or code,
            "证券简称": item.get("secName") or sec_name,
            "公告标题": item.get("announcementTitle"),
            "公告日期": date,
            "PDF": f"{CNINFO_PDF_HOST}/{adjunct}" if adjunct else "",
        })
    return rows
