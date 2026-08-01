"""Agent 基类与统一结果结构（Phase 7.2 需求九）。

设计目标：把 Phase 7.0.2 `services/agent/executor.py` 的 if 分发链、
Phase 7.1 `intelligence/planner/workflow.py` 的 `_agent_*` 纯函数，
收敛为「一个基类 + 一张注册表」的可扩展生态。

约定：
- 每个 Agent 只做一件事，输入 AgentContext，输出 AgentResult。
- 结果必须能渲染成三段式（cause / impact / advice），tier 标明 local 还是 ai。
- 任何 Agent 抛异常都由 registry 兜底成 failed 结果，绝不拖垮整个工作流。
"""
from __future__ import annotations

import time
from dataclasses import asdict, dataclass, field
from typing import TYPE_CHECKING

from backend.intelligence.constants import DISCLAIMER

if TYPE_CHECKING:  # 避免循环导入
    from backend.agents.context import AgentContext


@dataclass
class AgentResult:
    agent: str = ""
    title: str = ""
    ok: bool = True
    tier: str = "local"                       # local / ai
    score: float | None = None                # 该领域 0-100 分（可选）
    headline: str = ""                        # 一句话结论
    cause: list[str] = field(default_factory=list)
    impact: list[str] = field(default_factory=list)
    advice: list[str] = field(default_factory=list)
    metrics: dict = field(default_factory=dict)
    tools_used: list[str] = field(default_factory=list)
    elapsed_ms: int = 0
    error: str = ""

    def to_dict(self) -> dict:
        data = asdict(self)
        data["toolsUsed"] = data.pop("tools_used")
        data["elapsedMs"] = data.pop("elapsed_ms")
        data["text"] = (
            "原因：" + "；".join(self.cause or ["—"]) + "\n"
            "影响：" + "；".join(self.impact or ["—"]) + "\n"
            "建议：" + "；".join(self.advice or ["—"])
        )
        data["disclaimer"] = DISCLAIMER
        return data


class BaseAgent:
    """所有财富 Agent 的基类。

    子类必须声明 name / title / domain，并实现 run(ctx)。
    """

    name: str = "base"
    title: str = "通用 Agent"
    domain: str = "general"
    description: str = ""
    default_enabled: bool = True
    priority: int = 100          # 越小越先执行（工作流排序默认值）
    tools: tuple[str, ...] = ()

    # ---- 元信息（Marketplace 展示用） ----
    @classmethod
    def meta(cls) -> dict:
        return {
            "name": cls.name,
            "title": cls.title,
            "domain": cls.domain,
            "description": cls.description,
            "defaultEnabled": cls.default_enabled,
            "defaultPriority": cls.priority,
            "tools": list(cls.tools),
        }

    # ---- 是否适用于当前上下文（条件任务用） ----
    def applicable(self, ctx: "AgentContext") -> bool:  # noqa: ARG002
        return True

    def run(self, ctx: "AgentContext") -> AgentResult:  # pragma: no cover - 抽象
        raise NotImplementedError

    # ---- 带计时与异常兜底的执行封装 ----
    def execute(self, ctx: "AgentContext") -> AgentResult:
        started = time.perf_counter()
        try:
            if not self.applicable(ctx):
                result = AgentResult(
                    agent=self.name, title=self.title, ok=True,
                    headline="当前数据不适用该分析，已跳过。",
                    cause=["缺少该领域所需的关键数据。"],
                    impact=["本轮分析未覆盖该领域。"],
                    advice=["补充相关财富数据后可获得该领域的专项建议。"],
                )
            else:
                result = self.run(ctx)
        except Exception as exc:  # noqa: BLE001 — 单个 Agent 失败不影响整体
            result = AgentResult(
                agent=self.name, title=self.title, ok=False,
                error=str(exc)[:300],
                headline="该领域分析暂时不可用。",
                cause=["分析过程中出现异常。"],
                impact=["本轮结果不包含该领域结论。"],
                advice=["稍后重试，或补充更完整的财富数据。"],
            )
        result.agent = result.agent or self.name
        result.title = result.title or self.title
        result.elapsed_ms = int((time.perf_counter() - started) * 1000)
        return result
