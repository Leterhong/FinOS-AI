"""RAG 路由（Phase 7.0.2 需求九）。

POST /api/rag/query   — 检索 +（可选）LLM 作答，用户隔离
POST /api/rag/ingest  — 入库知识切片（自动 embedding）
GET  /api/rag/chunks  — 列出本人知识切片
DELETE /api/rag/chunks/{id}
"""
from __future__ import annotations

import json

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.ai.gateway import GatewayError, generate as gw_generate
from backend.ai.models import AIModelConfig
from backend.core import get_current_user, ok
from backend.core.response import fail
from backend.core.security import decrypt_secret
from backend.database import SessionLocal, get_db
from backend.security.permission import require_owned_resource
from backend.services.models import KnowledgeChunk
from backend.services.rag.embeddings import local_embed
from backend.services.rag.service import retrieve_knowledge
from backend.user.models import User

router = APIRouter(prefix="/rag", tags=["rag"])


class QueryIn(BaseModel):
    question: str = Field(min_length=1, max_length=1000)
    topK: int = 5
    answer: bool = False  # 是否调用已配置模型作答


class IngestIn(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    category: str = "general"
    text: str = Field(min_length=1, max_length=8000)


def _resolve_config(db: Session, user: User):
    cfg = db.scalar(select(AIModelConfig).where(AIModelConfig.user_id == user.id, AIModelConfig.is_default == True))  # noqa: E712
    if cfg is None:
        cfg = db.scalar(select(AIModelConfig).where(AIModelConfig.user_id == user.id))
    return cfg


@router.post("/query")
def rag_query(body: QueryIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    result = retrieve_knowledge(body.question, user.id, top_k=body.topK)
    payload = {
        "question": result.question,
        "rewrittenQuery": result.rewritten,
        "context": result.context_text,
        "sources": result.sources,
        "hits": [
            {"title": h.title, "category": h.category, "score": round(h.score, 4), "scope": h.scope}
            for h in result.hits
        ],
        "tookMs": result.took_ms,
    }
    if body.answer and result.context_text:
        cfg = _resolve_config(db, user)
        if cfg is None:
            payload["answer"] = None
            payload["note"] = "尚未配置 AI 模型，仅返回检索上下文"
        else:
            api_key = decrypt_secret(cfg.api_key_encrypted)
            try:
                gen = gw_generate(
                    cfg.base_url,
                    api_key,
                    cfg.model_id,
                    [
                        {
                            "role": "system",
                            "content": "你是 FinOS AI 私人财富助手，仅依据给定知识上下文回答，不编造。",
                        },
                        {
                            "role": "user",
                            "content": f"知识上下文：\n{result.context_text}\n\n用户问题：{body.question}",
                        },
                    ],
                )
                payload["answer"] = gen["content"]
            except GatewayError as e:
                payload["answer"] = None
                payload["note"] = str(e)
    return ok(payload)


@router.post("/ingest")
def ingest(body: IngestIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    vec = local_embed(f"{body.title} {body.text}")
    chunk = KnowledgeChunk(
        user_id=user.id,
        document_id=None,
        category=body.category,
        title=body.title,
        text=body.text,
        vector=json.dumps(vec),
    )
    db.add(chunk)
    db.commit()
    return ok({"id": chunk.id}, "知识已入库")


@router.get("/chunks")
def list_chunks(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.scalars(
        select(KnowledgeChunk).where(KnowledgeChunk.user_id == user.id).order_by(KnowledgeChunk.created_at.desc())
    ).all()
    return ok(
        {
            "chunks": [
                {"id": c.id, "title": c.title, "category": c.category, "text": c.text[:200]}
                for c in rows
            ]
        }
    )


@router.delete("/chunks/{chunk_id}")
def delete_chunk(chunk_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    c = require_owned_resource(db, KnowledgeChunk, chunk_id, user.id)
    db.delete(c)
    db.commit()
    return ok(None, "已删除")
