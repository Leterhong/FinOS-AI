"""三段式解释层（Phase 7.1 需求九 + 十三 + 十五）。

规则：
1. 任何复杂分析结果都必须能渲染为「原因 / 影响 / 建议」三段。
2. 默认由本地模板生成（tier=local，零 LLM 成本）。
3. 只有满足「场景复杂 + 用户已配置模型」时才调用 LLM 润色（tier=ai）；
   调用失败静默降级回本地文本，绝不阻断主流程、绝不编造数据。
4. LLM 只负责「表达」，数字与结论全部来自本地计算结果，防止模型幻觉污染财务数据。
"""
from __future__ import annotations

import asyncio
from dataclasses import dataclass, field

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.ai.gateway import GatewayError, generate as gw_generate
from backend.ai.models import AIModelConfig
from backend.intelligence.constants import DISCLAIMER
from backend.user.models import User

SYSTEM_PROMPT = (
    "你是 FinOS AI 的私人财富 CFO。你只能基于用户提供的计算结果进行解释，"
    "不得编造任何数字，不得承诺收益，不得给出具体买卖指令。"
    "输出必须严格分为三段，且每段以「原因：」「影响：」「建议：」开头。"
)


@dataclass
class Explanation:
    """三段式解释。cause/impact/advice 均为要点列表。"""

    title: str = ""
    cause: list[str] = field(default_factory=list)
    impact: list[str] = field(default_factory=list)
    advice: list[str] = field(default_factory=list)
    tier: str = "local"
    ai_text: str | None = None

    def to_dict(self) -> dict:
        return {
            "title": self.title,
            "cause": self.cause,
            "impact": self.impact,
            "advice": self.advice,
            "tier": self.tier,
            "text": render_text(self),
            "aiText": self.ai_text,
            "disclaimer": DISCLAIMER,
        }


def make_explanation(
    title: str,
    cause: list[str],
    impact: list[str],
    advice: list[str],
) -> Explanation:
    """构造三段式解释，任何一段为空都会补上兜底说明（保证结构完整）。"""
    return Explanation(
        title=title,
        cause=[c for c in cause if c] or ["基于你当前录入的财富数据计算得出。"],
        impact=[i for i in impact if i] or ["对整体财富状况暂无显著影响。"],
        advice=[a for a in advice if a] or ["保持当前节奏，并持续更新财富数据以提高分析准确度。"],
    )


def render_text(exp: Explanation) -> str:
    parts = [
        "原因：" + "；".join(exp.cause),
        "影响：" + "；".join(exp.impact),
        "建议：" + "；".join(exp.advice),
    ]
    return "\n".join(parts)


def resolve_model(db: Session, user: User) -> tuple[AIModelConfig, str] | None:
    """解析用户默认模型配置，返回 (config, api_key)。未配置返回 None。"""
    cfg = db.scalar(
        select(AIModelConfig).where(
            AIModelConfig.user_id == user.id, AIModelConfig.is_default == True  # noqa: E712
        )
    )
    if cfg is None:
        cfg = db.scalar(select(AIModelConfig).where(AIModelConfig.user_id == user.id))
    if cfg is None:
        return None
    from backend.core.security import decrypt_secret

    api_key = decrypt_secret(cfg.api_key_encrypted)
    if not api_key:
        return None
    return cfg, api_key


def llm_available(db: Session, user: User) -> bool:
    return resolve_model(db, user) is not None


def _run_generate(cfg: AIModelConfig, api_key: str, messages: list[dict], max_tokens: int) -> str:
    """同步上下文安全调用 async gateway。

    注意：backend.ai.gateway.generate 是 async def，直接下标取值会 TypeError，
    必须通过事件循环执行（这是 Phase 7.0.2 遗留缺陷，本模块不再重复）。
    """
    async def _call() -> dict:
        return await gw_generate(
            cfg.base_url, api_key, cfg.model_id, messages, temperature=0.4, max_tokens=max_tokens
        )

    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        loop = None
    if loop is not None and loop.is_running():
        # 已在事件循环中（FastAPI async 路由）：放到独立线程跑，避免嵌套 loop 报错
        import concurrent.futures

        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
            return pool.submit(lambda: asyncio.run(_call())).result()["content"]
    return asyncio.run(_call())["content"]


def enhance_with_llm(
    db: Session,
    user: User,
    exp: Explanation,
    *,
    facts: str,
    complex_enough: bool = True,
    max_tokens: int = 500,
) -> Explanation:
    """可选 LLM 润色。不满足条件或调用失败一律保持 local（成本控制 + 稳定性）。"""
    if not complex_enough:
        return exp
    resolved = resolve_model(db, user)
    if resolved is None:
        return exp
    cfg, api_key = resolved
    prompt = (
        f"以下是系统用纯代码计算出的财富分析结果（数字均为真实计算值，禁止修改）：\n{facts}\n\n"
        f"本地生成的三段式草稿：\n{render_text(exp)}\n\n"
        "请在不改动任何数字的前提下，把它改写得更清晰、更具体、更可执行，"
        "严格保留「原因：」「影响：」「建议：」三段结构，总长度不超过 300 字。"
    )
    try:
        content = _run_generate(
            cfg,
            api_key,
            [{"role": "system", "content": SYSTEM_PROMPT}, {"role": "user", "content": prompt}],
            max_tokens,
        )
    except (GatewayError, Exception):  # noqa: B014 — 任何异常都必须降级，不能影响主流程
        return exp
    if not content or "原因" not in content:
        return exp
    exp.tier = "ai"
    exp.ai_text = content.strip()
    return exp
