"""AI CFO 服务（Phase 7.0.2 需求七）。

流程：读取 Financial Twin → 读取长期 Memory → 检索 RAG → 调用用户模型 → 生成财富建议。
零 LLM 时返回 local 分级建议（引用退休目标 + 风险偏好），绝不编造；
配置了模型则走 AI 生成（tier=ai）。所有建议带免责声明。
"""
from __future__ import annotations

import json

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.ai.gateway import GatewayError, generate_sync as gw_generate_sync
from backend.ai.models import AIModelConfig
from backend.memory.models import Memory
from backend.services.rag.service import retrieve_knowledge
from backend.services.twin.service import get_latest
from backend.user.models import User

DISCLAIMER = "FinOS AI提供信息分析和辅助决策，不构成投资建议。"


def _local_advice(twin: dict, memory_count: int) -> dict:
    lines: list[str] = []
    health = twin.get("healthScore", 0)
    risk = twin.get("riskLevel", "balanced")
    sr = twin.get("savingsRate", 0.0) or 0.0
    em = twin.get("emergencyMonths")
    gp = twin.get("goalProgress", 0.0) or 0.0
    allocation = twin.get("allocation", {})

    lines.append(f"当前财富健康分为 {health}/100，风险偏好为「{risk}」。")
    if sr < 0.1:
        lines.append("储蓄率偏低，建议优先提升每月结余，建立稳定的现金流缓冲。")
    else:
        lines.append(f"储蓄率 {sr:.0%} 处于健康区间，可保持并适度提高投资比例。")
    if em is None:
        lines.append("尚未录入应急现金，建议预留 3-6 个月支出的应急金。")
    elif em < 3:
        lines.append(f"应急金仅可覆盖 {em} 个月支出，建议补充现金类资产至 3-6 个月。")
    else:
        lines.append(f"应急金覆盖 {em} 个月支出，流动性充足。")
    top = max(allocation.items(), key=lambda kv: kv[1], default=None)
    if top and top[1] >= 0.7:
        lines.append(f"「{top[0]}」占比 {top[1]:.0%} 偏高，建议分散以降低集中度风险。")
    if gp > 0:
        lines.append(f"财富目标完成度 {gp:.0%}，按当前节奏持续推进即可。")
    if memory_count:
        lines.append(f"已结合你历史沉淀的 {memory_count} 条长期记忆进行个性化分析。")
    return {"tier": "local", "suggestions": lines, "summary": "；".join(lines)}


def analyze(db: Session, user: User, question: str = "") -> dict:
    twin = get_latest(db, user)
    if not twin.get("hasData"):
        return {
            "hasData": False,
            "message": "欢迎创建你的财富数字分身",
            "advice": None,
            "disclaimer": DISCLAIMER,
        }

    memory_count = db.scalar(
        select(Memory).where(Memory.user_id == user.id).order_by(Memory.created_at.desc())
    )
    mc = len(list(db.scalars(select(Memory).where(Memory.user_id == user.id)).all())) if memory_count is not None else 0

    rag_ctx = ""
    if question:
        rag_ctx = retrieve_knowledge(question, user.id).context_text

    local = _local_advice(twin, mc)

    # 可选 LLM 增强
    tier = "local"
    ai_content = None
    cfg = db.scalar(select(AIModelConfig).where(AIModelConfig.user_id == user.id, AIModelConfig.is_default == True))  # noqa: E712
    if cfg is None:
        cfg = db.scalar(select(AIModelConfig).where(AIModelConfig.user_id == user.id))
    if cfg is not None:
        from backend.core.security import decrypt_secret

        api_key = decrypt_secret(cfg.api_key_encrypted)
        if api_key:
            prompt = (
                f"用户财富画像：净资产 ¥{twin.get('netWorth', 0):,.0f}，健康分 {twin.get('healthScore', 0)}，"
                f"风险偏好 {twin.get('riskLevel')}。\n本地建议：{local['summary']}\n"
            )
            if rag_ctx:
                prompt += f"相关知识：\n{rag_ctx}\n"
            if question:
                prompt += f"用户问题：{question}\n"
            prompt += "请基于以上给出简洁、可执行的财富建议（不超过 200 字）。"
            try:
                gen = gw_generate_sync(
                    cfg.base_url,
                    api_key,
                    cfg.model_id,
                    [{"role": "system", "content": "你是 FinOS AI 私人财富 CFO。"}, {"role": "user", "content": prompt}],
                    max_tokens=400,
                )
                ai_content = gen["content"]
                tier = "ai"
            except GatewayError:
                ai_content = None

    return {
        "hasData": True,
        "twin": {
            "netWorth": twin.get("netWorth"),
            "healthScore": twin.get("healthScore"),
            "riskLevel": twin.get("riskLevel"),
            "goalProgress": twin.get("goalProgress"),
        },
        "advice": {
            "tier": tier,
            "local": local,
            "ai": ai_content,
        },
        "ragContextLen": len(rag_ctx),
        "disclaimer": DISCLAIMER,
    }
