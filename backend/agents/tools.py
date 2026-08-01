"""Agent Tool 系统（Phase 7.2 需求十一）。

工具类型：
  calc            财富计算（复利/月供/退休缺口/税）
  db_query        用户财富数据查询（强制 user_id 隔离）
  rag             知识库检索
  market          市场数据（沿用 Phase 6.9 行情适配层，不可用时降级）
  file_parse      文件解析（复用 multimodal.document.parser）

Tool Calling 流程：
  Agent 声明需要的工具 → run_tool(ctx, name, **kwargs) → 结构化结果 → 参与推理

铁律：所有工具都通过 ctx 拿 db/user，禁止跨用户查询；工具异常一律返回 {"ok": False}。
"""
from __future__ import annotations

from typing import TYPE_CHECKING, Any, Callable

from sqlalchemy import select

if TYPE_CHECKING:
    from backend.agents.context import AgentContext

_TOOLS: dict[str, dict[str, Any]] = {}


def tool(name: str, description: str = "", params: dict | None = None):
    """注册一个工具。"""

    def deco(fn: Callable[..., dict]):
        _TOOLS[name] = {"fn": fn, "description": description, "params": params or {}}
        return fn

    return deco


def list_tools() -> list[dict]:
    return [
        {"name": k, "description": v["description"], "params": v["params"]}
        for k, v in _TOOLS.items()
    ]


def _normalize_kwargs(fn: Callable[..., dict], kwargs: dict) -> tuple[dict, list[str], list[str]]:
    """把调用方给的参数名对齐到工具签名。

    LLM / 前端常写成同义名（rate ↔ annualRate、income ↔ monthlyIncome），
    直接透传会抛 TypeError。这里做三级匹配：精确 → 忽略大小写 → 唯一后缀匹配，
    仍无法匹配的参数收集到 unknown，由调用方拿到可读报错而不是堆栈。
    """
    import inspect

    valid = [p for p in inspect.signature(fn).parameters if p != "ctx"]
    lowered = {p.lower(): p for p in valid}
    out: dict = {}
    unknown: list[str] = []
    for key, value in (kwargs or {}).items():
        if key in valid:
            out[key] = value
            continue
        low = key.lower()
        if low in lowered:
            out[lowered[low]] = value
            continue
        cand = [
            p for p in valid
            if p.lower().endswith(low) or low.endswith(p.lower())
            or p.lower().startswith(low) or low.startswith(p.lower())
        ]
        if len(cand) == 1:
            out[cand[0]] = value
        else:
            unknown.append(key)
    return out, unknown, valid


def run_tool(ctx: "AgentContext", name: str, **kwargs) -> dict:
    spec = _TOOLS.get(name)
    if spec is None:
        return {"ok": False, "error": f"未知工具：{name}"}
    normalized, unknown, valid = _normalize_kwargs(spec["fn"], kwargs)
    if unknown:
        return {
            "ok": False,
            "tool": name,
            "error": f"无法识别的参数 {unknown}，该工具支持：{valid}",
        }
    try:
        result = spec["fn"](ctx, **normalized)
        if not isinstance(result, dict):
            result = {"value": result}
        result.setdefault("ok", True)
        result["tool"] = name
        return result
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "tool": name, "error": str(exc)[:200]}


# ------------------------------------------------------------------ calc
@tool("calc.compound", "复利终值：本金 + 定期追加", {"principal": "float", "annualRate": "float", "years": "int", "monthly": "float"})
def _compound(ctx, principal: float = 0.0, annualRate: float = 0.05, years: int = 10, monthly: float = 0.0) -> dict:
    balance = float(principal)
    r = float(annualRate)
    for _ in range(max(0, int(years))):
        balance = balance * (1 + r) + monthly * 12
    return {"futureValue": round(balance, 2), "years": years, "annualReturn": round(r, 4)}


@tool("calc.loan", "等额本息月供", {"principal": "float", "annualRate": "float", "years": "int"})
def _loan(ctx, principal: float = 0.0, annualRate: float = 0.04, years: int = 30) -> dict:
    n = max(1, int(years) * 12)
    i = float(annualRate) / 12
    if i <= 0:
        monthly = principal / n
    else:
        factor = (1 + i) ** n
        monthly = principal * i * factor / (factor - 1)
    return {
        "monthlyPayment": round(monthly, 2),
        "totalPayment": round(monthly * n, 2),
        "totalInterest": round(monthly * n - principal, 2),
    }


@tool("calc.retirement_gap", "退休资金缺口（4% 法则）", {"annualExpense": "float", "withdrawRate": "float"})
def _retirement_gap(ctx, annualExpense: float = 0.0, withdrawRate: float = 0.04) -> dict:
    need = annualExpense / max(0.001, withdrawRate)
    gap = need - ctx.wealth.net_worth
    return {
        "requiredCorpus": round(need, 2),
        "currentNetWorth": round(ctx.wealth.net_worth, 2),
        "gap": round(max(0.0, gap), 2),
        "covered": round(min(1.0, ctx.wealth.net_worth / need), 4) if need > 0 else 0.0,
    }


@tool("calc.tax_salary", "工资薪金个税估算（综合所得年度累计口径，简化版）", {"monthlyIncome": "float", "specialDeduction": "float"})
def _tax_salary(ctx, monthlyIncome: float = 0.0, specialDeduction: float = 0.0) -> dict:
    """按 2019 起施行的七级超额累进税率估算，仅作参考不构成税务意见。"""
    annual = float(monthlyIncome) * 12
    taxable = max(0.0, annual - 60000 - float(specialDeduction) * 12 - annual * 0.105)
    brackets = (
        (36000, 0.03, 0), (144000, 0.10, 2520), (300000, 0.20, 16920),
        (420000, 0.25, 31920), (660000, 0.30, 52920), (960000, 0.35, 85920),
        (float("inf"), 0.45, 181920),
    )
    tax = 0.0
    for cap, rate, deduct in brackets:
        if taxable <= cap:
            tax = taxable * rate - deduct
            break
    tax = max(0.0, tax)
    return {
        "annualIncome": round(annual, 2),
        "taxableIncome": round(taxable, 2),
        "estimatedAnnualTax": round(tax, 2),
        "effectiveRate": round(tax / annual, 4) if annual > 0 else 0.0,
        "note": "简化估算，未含全部专项附加扣除与地方政策，仅供参考。",
    }


# ------------------------------------------------------------------ db_query
@tool("db.assets", "查询本人资产明细", {"limit": "int"})
def _db_assets(ctx, limit: int = 50) -> dict:
    from backend.financial.models import Asset

    rows = list(
        ctx.db.scalars(
            select(Asset).where(Asset.user_id == ctx.user.id).limit(min(int(limit), 200))
        )
    )
    return {
        "count": len(rows),
        "items": [
            {"id": a.id, "type": a.type, "name": a.name, "amount": round(float(a.amount or 0), 2)}
            for a in rows
        ],
    }


@tool("db.profile", "查询本人财务画像", {})
def _db_profile(ctx) -> dict:
    w = ctx.wealth
    return {
        "hasData": w.has_data,
        "age": w.age,
        "riskLevel": w.risk_level,
        "monthlyIncome": w.monthly_income,
        "monthlyExpense": w.monthly_expense,
        "netWorth": w.net_worth,
        "goal": w.goal_text,
    }


@tool("db.transactions", "查询本人近期收支流水", {"limit": "int"})
def _db_transactions(ctx, limit: int = 30) -> dict:
    from backend.financial.models import Transaction

    rows = list(
        ctx.db.scalars(
            select(Transaction)
            .where(Transaction.user_id == ctx.user.id)
            .order_by(Transaction.date.desc())
            .limit(min(int(limit), 200))
        )
    )
    return {
        "count": len(rows),
        "items": [
            {
                "type": t.type,
                "amount": round(float(t.amount or 0), 2),
                "category": t.category,
                "date": t.date.isoformat() if t.date else None,
            }
            for t in rows
        ],
    }


# ------------------------------------------------------------------ rag
@tool("rag.search", "检索本人知识库", {"query": "str", "topK": "int"})
def _rag_search(ctx, query: str = "", topK: int = 3) -> dict:
    try:
        from backend.services.rag.service import search as rag_search

        hits = rag_search(ctx.db, ctx.user, query, top_k=int(topK))
        return {"hits": hits, "count": len(hits)}
    except Exception:  # noqa: BLE001
        return {"ok": False, "hits": [], "error": "知识库暂不可用"}


# ------------------------------------------------------------------ market
@tool("market.quote", "获取行情快照（不可用时降级为空）", {"symbol": "str"})
def _market_quote(ctx, symbol: str = "") -> dict:
    try:
        from backend.services.monitor.service import fetch_quote  # type: ignore

        return {"symbol": symbol, "quote": fetch_quote(symbol)}
    except Exception:  # noqa: BLE001
        return {"ok": False, "symbol": symbol, "error": "行情源未配置，已跳过市场数据。"}


# ------------------------------------------------------------------ file_parse
@tool("file.parse", "解析文件文本并抽取财富实体", {"filename": "str", "data": "bytes"})
def _file_parse(ctx, filename: str = "", data: bytes = b"") -> dict:
    from backend.multimodal.document.parser import parse_document

    r = parse_document(filename, data)
    return r.to_dict()
