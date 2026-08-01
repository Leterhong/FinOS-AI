"""AI 上下文管理器（Phase 7.2 需求十四）。

问题：每个 Agent 都自己去读一遍 Profile / Asset / 记忆，重复 IO + 重复计算。
方案：一次构建 AgentContext，所有 Agent 共享；预测与评分等昂贵结果**惰性计算 + 就地缓存**。

线程安全：workflow 的并行阶段会在线程池里共享同一个 ctx，惰性字段用锁保护。
"""
from __future__ import annotations

import threading
from dataclasses import dataclass, field

from sqlalchemy.orm import Session

from backend.intelligence.context import WealthContext, build_context
from backend.user.models import User


@dataclass
class AgentContext:
    """所有 Agent 共享的只读上下文（Agent 不得修改 wealth，需要变体请 clone）。"""

    db: Session
    user: User
    wealth: WealthContext
    question: str = ""
    use_ai: bool = True
    memory_text: str = ""
    extras: dict = field(default_factory=dict)

    _cache: dict = field(default_factory=dict, repr=False)
    _lock: threading.Lock = field(default_factory=threading.Lock, repr=False)

    # ---------------------------------------------------------- 惰性昂贵计算
    def prediction(self, horizon: int = 10) -> dict:
        """财富预测（全流程只算一次）。"""
        return self._lazy(f"prediction:{horizon}", lambda: self._predict(horizon))

    def score(self) -> dict:
        """六维健康评分（全流程只算一次）。"""
        return self._lazy("score", self._score)

    def _predict(self, horizon: int) -> dict:
        from backend.intelligence.prediction.engine import predict_wealth

        horizons = tuple(sorted({1, 3, 5, max(1, int(horizon))}))
        try:
            return predict_wealth(self.wealth, horizons=horizons)
        except Exception:  # noqa: BLE001
            return {}

    def _score(self) -> dict:
        from backend.intelligence.scoring.engine import score_wealth

        try:
            return score_wealth(self.wealth)
        except Exception:  # noqa: BLE001
            return {}

    def _lazy(self, key: str, loader):
        with self._lock:
            if key in self._cache:
                return self._cache[key]
        value = loader()
        with self._lock:
            self._cache[key] = value
        return value

    # ---------------------------------------------------------- 便捷属性
    @property
    def has_data(self) -> bool:
        return self.wealth.has_data

    def to_dict(self) -> dict:
        return {
            "wealth": self.wealth.to_dict(),
            "question": self.question,
            "useAi": self.use_ai,
            "hasMemory": bool(self.memory_text),
        }


def build_agent_context(
    db: Session,
    user: User,
    *,
    question: str = "",
    use_ai: bool = True,
    with_memory: bool = True,
) -> AgentContext:
    """统一构建入口：财富上下文 + 长期记忆一次性加载。"""
    wealth = build_context(db, user)
    memory_text = ""
    if with_memory:
        try:
            from backend.intelligence.ltm.service import build_memory_context

            memory_text = build_memory_context(db, user) or ""
        except Exception:  # noqa: BLE001
            memory_text = ""
    return AgentContext(
        db=db, user=user, wealth=wealth,
        question=question, use_ai=use_ai, memory_text=memory_text,
    )
