"""财富实体抽取器（Phase 7.2 需求三/五）。

设计要点：
1. **纯本地、零依赖、零成本**：正则 + 词典即可从 OCR/STT/文档文本中提取金额与资产类型。
2. 抽取结果一律带 evidence（原文片段）与 confidence，供用户在确认页核对。
3. 绝不直接写库——由 service 层封装成 ExtractionResult(needs_confirm)。
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field

from backend.multimodal.constants import (
    ASSET_TYPE_KEYWORDS,
    KIND_ASSET,
    KIND_EXPENSE,
    KIND_GOAL,
    KIND_INCOME,
    KIND_LIABILITY,
    KIND_PROFILE,
    SCREENSHOT_HINTS,
)

# ---------------------------------------------------------------- 金额解析
_UNIT_FACTOR = {
    "亿": 100_000_000.0,
    "万": 10_000.0,
    "萬": 10_000.0,
    "w": 10_000.0,
    "W": 10_000.0,
    "k": 1_000.0,
    "K": 1_000.0,
    "千": 1_000.0,
    "百": 100.0,
}

# 带单位：500万 / 1.2亿 / 8k
_AMOUNT_UNIT_RE = re.compile(r"(?:[¥￥$]\s*)?(\d[\d,]*(?:\.\d+)?)\s*(亿|万|萬|千|百|[wWkK])(?:元)?")
# 显式货币：¥12,345.67 / 12345元 / RMB 3000
_AMOUNT_CURRENCY_RE = re.compile(
    r"(?:[¥￥]|RMB|rmb|CNY|人民币)\s*(\d[\d,]*(?:\.\d+)?)|(\d[\d,]*(?:\.\d+)?)\s*(?:元|块钱|块|人民币)"
)
# 裸数字（含千分位或小数），兜底
_AMOUNT_PLAIN_RE = re.compile(r"(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+\.\d{2}|\d{4,})")

# 时间/比例后缀，命中则不是金额
_NON_AMOUNT_SUFFIX = ("年", "岁", "个月", "月", "周", "天", "日", "%", "％", "倍", "股", "份", "次")

_DATE_RE = re.compile(
    r"(20\d{2}[-/年]\s*\d{1,2}[-/月]\s*\d{1,2}\s*日?|\d{1,2}[-/月]\s*\d{1,2}\s*日?)"
)
_AGE_RE = re.compile(r"(?:我|本人)?\s*(?:今年|年龄)?\s*(\d{2})\s*(?:岁|周岁)")
_PERCENT_RE = re.compile(r"(\d{1,3}(?:\.\d+)?)\s*[%％]")

_INCOME_HINTS = ("月薪", "工资", "薪资", "收入", "税后", "到手", "年薪", "奖金", "分红", "租金收入")
_EXPENSE_HINTS = ("支出", "花费", "开销", "消费", "房租", "还款", "月供", "生活费", "账单")
_GOAL_HINTS = ("目标", "攒够", "存够", "计划", "希望", "打算", "想要", "退休", "买房", "财务自由")
_RISK_HINTS = {
    "conservative": ("保守", "稳健型偏保守", "低风险", "不能亏", "保本"),
    "aggressive": ("激进", "高风险", "进取", "博收益", "全仓"),
    "balanced": ("平衡", "稳健", "中等风险", "均衡"),
}


def _num(raw: str) -> float | None:
    try:
        v = float(str(raw).replace(",", ""))
    except (ValueError, AttributeError):
        return None
    return v if v > 0 else None


# 疑似账号/流水号：连续 9 位以上且无千分位无小数
_ID_LIKE_RE = re.compile(r"^\d{9,}$")
# 表格列分隔（空白 / 竖线 / 制表符 / 中英文逗号）
_COLUMN_SPLIT_RE = re.compile(r"[\s|｜,，\t]+")


def _plain_candidates(text: str) -> list[tuple[float, bool]]:
    """裸数字候选 [(金额, 是否为格式化金额)]。

    「格式化金额」= 带千分位（158,000.00）或恰好两位小数（1580.00），
    这是账面金额的典型书写形式，可与「持仓数量 100」「账号 6222…」区分开。
    """
    out: list[tuple[float, bool]] = []
    for m in _AMOUNT_PLAIN_RE.finditer(text):
        tail = text[m.end():].lstrip()
        if tail.startswith(_NON_AMOUNT_SUFFIX):
            continue
        raw = m.group(1)
        if _ID_LIKE_RE.match(raw):  # 账号/手机号/流水号，不是金额
            continue
        v = _num(raw)
        if v is None or v < 100:
            continue
        formatted = ("," in raw) or bool(re.search(r"\.\d{2}$", raw))
        out.append((round(v, 2), formatted))
    return out


def parse_amount(text: str) -> float | None:
    """从一小段文本里解析出金额（人民币元）。解析失败返回 None。

    三段式优先级：①带单位（万/亿/k）→ ②显式货币（¥/元）→ ③裸数字兜底。

    表格行特判（需求三·持仓截图）：券商/基金持仓的一行形如
    「贵州茅台  100  1580.00  158,000.00」（名称/数量/成本价/市值），
    真正要提取的是**市值**。做法是：若一行里出现 ≥2 个「格式化金额」，
    取其中最大者；否则按出现顺序取第一个。这样既能拿对市值，
    又不会把「转账 5000 到 6222xxxx 账户」里的账号误当金额。
    """
    if not text:
        return None

    m = _AMOUNT_UNIT_RE.search(text)
    if m:
        v = _num(m.group(1))
        if v is not None:
            return round(v * _UNIT_FACTOR.get(m.group(2), 1.0), 2)

    m = _AMOUNT_CURRENCY_RE.search(text)
    if m:
        v = _num(m.group(1) or m.group(2))
        if v is not None:
            return round(v, 2)

    candidates = _plain_candidates(text)
    if not candidates:
        return None
    formatted = [v for v, is_fmt in candidates if is_fmt]
    if formatted:
        # 有格式化金额时，未格式化的数字多半是「持仓数量」，一律不采信
        columns = len([p for p in _COLUMN_SPLIT_RE.split(text.strip()) if p])
        return max(formatted) if columns >= 3 else formatted[0]
    return candidates[0][0]


def guess_asset_type(text: str) -> str:
    """按关键词词典猜资产类型，未命中返回 other。"""
    low = text.lower()
    for atype, words in ASSET_TYPE_KEYWORDS.items():
        for w in words:
            if w.lower() in low:
                return atype
    return "other"


def detect_subtype(text: str) -> str:
    """识别截图/文档的业务类型（需求三）。"""
    scores: dict[str, int] = {}
    for subtype, words in SCREENSHOT_HINTS.items():
        scores[subtype] = sum(1 for w in words if w in text)
    best = max(scores, key=lambda k: scores[k]) if scores else ""
    return best if best and scores[best] >= 2 else ""


# ---------------------------------------------------------------- 数据结构
@dataclass
class Entity:
    """一条待确认的财富实体。"""

    kind: str = KIND_ASSET
    label: str = ""
    asset_type: str = "other"
    amount: float = 0.0
    occurred_at: str = ""
    confidence: float = 0.5
    evidence: str = ""
    payload: dict = field(default_factory=dict)

    def to_dict(self) -> dict:
        return {
            "kind": self.kind,
            "label": self.label,
            "assetType": self.asset_type,
            "amount": round(self.amount, 2),
            "occurredAt": self.occurred_at,
            "confidence": round(self.confidence, 2),
            "evidence": self.evidence,
            "payload": self.payload,
        }


def _clip(text: str, limit: int = 120) -> str:
    text = " ".join(text.split())
    return text if len(text) <= limit else text[:limit] + "…"


# ---------------------------------------------------------------- 主抽取
def extract_entities(text: str, *, default_kind: str = KIND_ASSET) -> list[Entity]:
    """从任意来源文本中抽取财富实体。

    逐行扫描：一行里若同时出现「金额」和「资产/收支关键词」，即视为一条候选。
    """
    if not text:
        return []
    entities: list[Entity] = []
    seen: set[tuple[str, float]] = set()

    for raw_line in text.replace("\r", "\n").split("\n"):
        line = raw_line.strip()
        if not line or len(line) > 300:
            continue
        amount = parse_amount(line)
        if amount is None:
            continue

        kind = default_kind
        atype = guess_asset_type(line)
        conf = 0.55

        if any(h in line for h in _INCOME_HINTS):
            kind, conf = KIND_INCOME, 0.75
        elif any(h in line for h in _EXPENSE_HINTS):
            kind, conf = KIND_EXPENSE, 0.7
        elif atype == "liability":
            kind, conf = KIND_LIABILITY, 0.75
        elif atype != "other":
            kind, conf = KIND_ASSET, 0.8

        # 「月」字样出现在收支行 → 认为是月度金额
        payload: dict = {}
        if kind in (KIND_INCOME, KIND_EXPENSE):
            if "年" in line and "月" not in line:
                payload["period"] = "yearly"
                amount = round(amount / 12.0, 2)
                payload["note"] = "原文为年度金额，已折算为月均"
            else:
                payload["period"] = "monthly"

        date_m = _DATE_RE.search(line)
        label = _clip(re.sub(r"[\d,.]+", " ", line).strip(" -|:：\t"), 40) or line[:40]

        key = (kind + label, round(amount, 2))
        if key in seen:
            continue
        seen.add(key)

        entities.append(
            Entity(
                kind=kind,
                label=label or "未命名条目",
                asset_type=atype if kind in (KIND_ASSET, KIND_LIABILITY) else "other",
                amount=amount,
                occurred_at=date_m.group(1) if date_m else "",
                confidence=conf,
                evidence=_clip(line),
                payload=payload,
            )
        )

    # 目标 / 年龄 / 风险偏好（profile 类，全文级）
    entities.extend(_extract_profile(text))
    return entities


def _extract_profile(text: str) -> list[Entity]:
    out: list[Entity] = []
    flat = " ".join(text.split())

    m = _AGE_RE.search(flat)
    if m:
        age = int(m.group(1))
        if 16 <= age <= 100:
            out.append(
                Entity(
                    kind=KIND_PROFILE,
                    label="年龄",
                    amount=float(age),
                    confidence=0.8,
                    evidence=_clip(m.group(0)),
                    payload={"field": "age", "value": age},
                )
            )

    for level, words in _RISK_HINTS.items():
        if any(w in flat for w in words):
            out.append(
                Entity(
                    kind=KIND_PROFILE,
                    label="风险偏好",
                    confidence=0.65,
                    evidence=_clip(next(w for w in words if w in flat)),
                    payload={"field": "riskLevel", "value": level},
                )
            )
            break

    for sentence in re.split(r"[。；;\n]", flat):
        if any(h in sentence for h in _GOAL_HINTS) and len(sentence) >= 4:
            out.append(
                Entity(
                    kind=KIND_GOAL,
                    label=_clip(sentence.strip(), 60),
                    amount=parse_amount(sentence) or 0.0,
                    confidence=0.7,
                    evidence=_clip(sentence),
                    payload={"field": "goal", "value": sentence.strip()[:200]},
                )
            )
            break
    return out


def summarize(text: str, entities: list[Entity]) -> str:
    """生成一句人话摘要（本地零成本）。"""
    if not entities:
        return "未能从中识别出明确的财务数据，你可以手动补充。"
    kinds: dict[str, int] = {}
    total = 0.0
    for e in entities:
        kinds[e.kind] = kinds.get(e.kind, 0) + 1
        if e.kind in (KIND_ASSET, KIND_LIABILITY):
            total += e.amount
    names = {
        KIND_ASSET: "资产",
        KIND_LIABILITY: "负债",
        KIND_INCOME: "收入",
        KIND_EXPENSE: "支出",
        KIND_GOAL: "目标",
        KIND_PROFILE: "画像",
    }
    parts = [f"{names.get(k, k)}{v}项" for k, v in kinds.items()]
    tail = f"，涉及金额约 ¥{total:,.0f}" if total > 0 else ""
    return "共识别到 " + "、".join(parts) + tail + "，请确认后写入你的财富分身。"
