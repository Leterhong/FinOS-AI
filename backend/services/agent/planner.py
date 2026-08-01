"""Agent 任务规划器（Phase 7.0.2 需求五）。

零 LLM 依赖的规则规划：依据任务类型 + 问题关键词，产出有序执行步骤。
每个步骤声明要调用的 agent（对应 router 选择的子智能体）。
"""
from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class Step:
    name: str
    agent: str
    intent: str
    depends_on: list[str] = field(default_factory=list)


# 任务类型 → 默认步骤模板
_TEMPLATES: dict[str, list[Step]] = {
    "general": [
        Step("读取用户画像", "data", "load_profile"),
        Step("检索私人知识库", "rag", "retrieve"),
        Step("生成综合建议", "advisor", "summarize"),
    ],
    "cfo": [
        Step("读取 Twin 状态", "data", "load_twin"),
        Step("读取长期记忆", "memory", "load_memory"),
        Step("检索知识库", "rag", "retrieve"),
        Step("生成财富建议", "advisor", "advise"),
    ],
    "monitor": [
        Step("读取 Twin 状态", "data", "load_twin"),
        Step("检测财富变化", "monitor", "detect_changes"),
        Step("生成监控简报", "advisor", "brief"),
    ],
    "rag": [
        Step("检索知识库", "rag", "retrieve"),
        Step("生成作答", "advisor", "answer"),
    ],
    "import": [
        Step("解析文档", "document", "parse"),
        Step("提取财富记录", "document", "extract"),
    ],
}

_KEYWORD_AGENTS = [
    (("风险", "保险", "负债", "risk"), "risk"),
    (("投资", "股票", "基金", "资产配置", "invest"), "investment"),
    (("退休", "养老", "retire"), "retirement"),
    (("现金流", "预算", "储蓄", "cashflow"), "cashflow"),
]


def plan(task_type: str, question: str) -> list[Step]:
    steps = list(_TEMPLATES.get(task_type, _TEMPLATES["general"]))
    # 依据问题关键词追加专项子智能体（去重）
    extras: list[Step] = []
    q = question or ""
    for keywords, agent in _KEYWORD_AGENTS:
        if any(k in q for k in keywords):
            extras.append(Step(f"调用{agent}专项分析", agent, "analyze"))
    return steps + extras


_AGENT_LABELS = {
    "data": "数据服务",
    "rag": "知识检索",
    "memory": "长期记忆",
    "advisor": "财富顾问",
    "monitor": "财富监控",
    "risk": "风险分析",
    "investment": "投资分析",
    "retirement": "退休规划",
    "cashflow": "现金流分析",
    "document": "文档解析",
}


def route(steps: list[Step]) -> list[dict]:
    """返回去重后的 agent 执行序列（带标签）。"""
    seen: set[str] = set()
    out: list[dict] = []
    for s in steps:
        if s.agent in seen:
            continue
        seen.add(s.agent)
        out.append({"agent": s.agent, "label": _AGENT_LABELS.get(s.agent, s.agent)})
    return out
