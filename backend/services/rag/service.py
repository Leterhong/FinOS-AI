"""RAG 服务（Phase 7.0.2 需求九）：用户隔离的向量检索。

流程：问题 → Query Rewrite（去噪+同义扩展）→ 本地确定性 Embedding →
      cosine 检索个人空间 +（可选）系统共享空间 → 上下文文本 + 来源。
零 LLM 依赖，离线可跑；真实模型 embedding 作为可选增强（未来接入）。

对外暴露 retrieve_for_llm(question, user_id) 供 AI CFO / Agent 复用。
"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass, field

from sqlalchemy import select

from backend.database import SessionLocal
from backend.services.models import KnowledgeChunk
from backend.services.rag.embeddings import cosine_similarity, local_embed

SYSTEM_KNOWLEDGE_USER_ID = "__system__"

CATEGORY_LABELS = {
    "retirement": "退休规划",
    "investment": "投资理财",
    "risk": "风险管理",
    "saving": "储蓄预算",
    "tax": "税务优化",
    "family": "家庭规划",
    "general": "通用",
}

MIN_SCORE = 0.05
DEFAULT_TOP_K = 5
MAX_CONTEXT_CHARS = 2400

SYNONYMS: list[tuple[re.Pattern, str]] = [
    (re.compile(r"退休|养老|retire", re.I), "退休规划 养老金 4%法则 FIRE 财务自由 提取率"),
    (re.compile(r"投资|股票|基金|债券|理财", re.I), "资产配置 分散投资 风险收益 长期投资 指数基金"),
    (re.compile(r"风险|保险|负债|债务|杠杆", re.I), "风险管理 应急基金 保障 偿债能力 保额"),
    (re.compile(r"储蓄|存款|复利|利息", re.I), "复利 储蓄率 现金流 预算"),
    (re.compile(r"通胀|通货膨胀|物价", re.I), "通货膨胀 购买力 实际收益率"),
    (re.compile(r"税|个税|扣除", re.I), "税务优化 专项附加扣除 个人所得税"),
    (re.compile(r"买房|房贷|教育|传承", re.I), "家庭财富规划 房贷 教育金 资产传承"),
]

STOPWORDS_RE = re.compile(
    r"(请问|一下|帮我|我想|我要|怎么样|怎么办|如何|什么是|是什么|吗|呢|啊|的|了|能不能|可以)"
)


def rewrite_query(question: str) -> str:
    base = STOPWORDS_RE.sub(" ", question).strip()
    expansions = [words for pat, words in SYNONYMS if pat.search(question)]
    return " ".join([base or question, *expansions]).strip()


@dataclass
class Hit:
    chunk_id: str
    title: str
    category: str
    text: str
    score: float
    scope: str


@dataclass
class RetrievalResult:
    question: str
    rewritten: str
    hits: list[Hit] = field(default_factory=list)
    context_text: str = ""
    sources: list[dict] = field(default_factory=list)
    took_ms: int = 0


def _chunk_to_hit(row: KnowledgeChunk, query_vec: list[float]) -> Hit | None:
    try:
        vec = json.loads(row.vector) if row.vector else []
    except (json.JSONDecodeError, TypeError):
        return None
    if not vec:
        return None
    score = cosine_similarity(query_vec, vec)
    if score < MIN_SCORE:
        return None
    scope = "global" if row.user_id == SYSTEM_KNOWLEDGE_USER_ID else "personal"
    return Hit(chunk_id=row.id, title=row.title, category=row.category, text=row.text, score=score, scope=scope)


def retrieve_knowledge(question: str, user_id: str, top_k: int = DEFAULT_TOP_K, include_system: bool = True) -> RetrievalResult:
    import time

    started = time.time()
    rewritten = rewrite_query(question)
    query_vec = local_embed(rewritten)

    with SessionLocal() as db:
        personal = (
            db.scalars(select(KnowledgeChunk).where(KnowledgeChunk.user_id == user_id)).all()
            if user_id and user_id != SYSTEM_KNOWLEDGE_USER_ID
            else []
        )
        system = (
            db.scalars(select(KnowledgeChunk).where(KnowledgeChunk.user_id == SYSTEM_KNOWLEDGE_USER_ID)).all()
            if include_system
            else []
        )

    hits: list[Hit] = []
    for row in personal + system:
        h = _chunk_to_hit(row, query_vec)
        if h:
            hits.append(h)
    hits.sort(key=lambda h: h.score, reverse=True)
    hits = hits[:top_k]

    # 上下文拼接（按字符上限截断）
    lines: list[str] = []
    used = 0
    for i, h in enumerate(hits):
        label = CATEGORY_LABELS.get(h.category, h.category)
        entry = f"【知识 {i + 1}｜{h.title}｜{label}】\n{h.text}"
        if used + len(entry) > MAX_CONTEXT_CHARS and lines:
            break
        lines.append(entry)
        used += len(entry)

    seen: set[str] = set()
    sources: list[dict] = []
    for h in hits:
        key = f"{h.title}|{h.category}"
        if key in seen:
            continue
        seen.add(key)
        sources.append({"title": h.title, "category": CATEGORY_LABELS.get(h.category, h.category), "scope": h.scope})

    return RetrievalResult(
        question=question,
        rewritten=rewritten,
        hits=hits,
        context_text="\n\n".join(lines),
        sources=sources,
        took_ms=int((time.time() - started) * 1000),
    )


def retrieve_for_llm(question: str, user_id: str, top_k: int = DEFAULT_TOP_K) -> str:
    """供 AI CFO / Agent 注入 prompt 的上下文文本。"""
    return retrieve_knowledge(question, user_id, top_k=top_k).context_text
