"""文本模态分析器 + 意图识别（Phase 7.2 需求一/六）。

意图用于 Speech Pipeline：Audio → STT → **Intent** → Financial Agent → Response。
纯本地规则，零成本；意图不确定时回退 general_chat，由上层交给 AI CFO。
"""
from __future__ import annotations

from dataclasses import dataclass

from backend.multimodal.text.extractor import Entity, detect_subtype, extract_entities, summarize

# 意图 → 关键词
INTENT_RULES: dict[str, tuple[str, ...]] = {
    "record_asset": ("我有", "持有", "买了", "账户里", "余额", "记一笔", "新增资产", "存了"),
    "record_income": ("月薪", "工资", "到手", "收入是", "年薪", "发了奖金"),
    "record_expense": ("每月花", "支出", "开销", "房租", "月供", "还款"),
    "set_goal": ("目标", "攒够", "存够", "想在", "打算", "计划在", "财务自由", "退休"),
    "query_wealth": ("我的资产", "净资产", "有多少钱", "财富状况", "健康分", "评分", "现在怎么样"),
    "query_prediction": ("预测", "几年后", "多少年", "能到多少", "未来", "增长到"),
    "simulate_event": ("如果", "假如", "要是", "模拟", "换工作", "创业", "生孩子", "买房会"),
    "generate_report": ("报告", "总结一下", "月报", "年报", "导出"),
}

INTENT_LABELS = {
    "record_asset": "记录资产",
    "record_income": "记录收入",
    "record_expense": "记录支出",
    "set_goal": "设定目标",
    "query_wealth": "查询财富状况",
    "query_prediction": "财富预测",
    "simulate_event": "情景模拟",
    "generate_report": "生成报告",
    "general_chat": "自由对话",
}


@dataclass
class TextAnalysis:
    intent: str = "general_chat"
    intent_label: str = "自由对话"
    confidence: float = 0.4
    subtype: str = ""
    entities: list[Entity] = None  # type: ignore[assignment]
    summary: str = ""

    def to_dict(self) -> dict:
        return {
            "intent": self.intent,
            "intentLabel": self.intent_label,
            "confidence": round(self.confidence, 2),
            "subtype": self.subtype,
            "entities": [e.to_dict() for e in (self.entities or [])],
            "summary": self.summary,
        }


def detect_intent(text: str) -> tuple[str, float]:
    """返回 (intent, confidence)。命中词越多置信度越高。"""
    if not text or not text.strip():
        return "general_chat", 0.3
    flat = " ".join(text.split())
    best, best_hits = "general_chat", 0
    for intent, words in INTENT_RULES.items():
        hits = sum(1 for w in words if w in flat)
        if hits > best_hits:
            best, best_hits = intent, hits
    if best_hits == 0:
        return "general_chat", 0.35
    return best, min(0.95, 0.55 + 0.15 * best_hits)


def analyze_text(text: str) -> TextAnalysis:
    """文本模态统一分析：意图 + 实体 + 摘要。"""
    intent, conf = detect_intent(text)
    entities = extract_entities(text)
    return TextAnalysis(
        intent=intent,
        intent_label=INTENT_LABELS.get(intent, intent),
        confidence=conf,
        subtype=detect_subtype(text),
        entities=entities,
        summary=summarize(text, entities),
    )
