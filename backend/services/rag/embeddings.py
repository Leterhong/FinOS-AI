"""本地确定性 Embedding（后端版，镜像前端 src/knowledge/embeddings）。

- 离线零依赖、确定可复现（同一文本任何时刻同向量）；
- sha256 hashed bag-of-ngrams → 256 维 → L2 归一化（点积即余弦）；
- 中文 bi/tri-gram，英文词；与前端算法一致，保证前后端向量可比。
真实模型接入位：embed_via_model() 走 AI Gateway（可选增强）。
"""
from __future__ import annotations

import hashlib
import math
import re

EMBEDDING_DIM = 256
_CJK = re.compile(r"[一-鿿]+")
_WORD = re.compile(r"[a-z0-9]+")


def tokenize(text: str) -> list[str]:
    cleaned = text.lower().replace(r"[^\p{L}\p{N}\s]", " ")
    cleaned = re.sub(r"[^\w\s]", " ", text.lower())
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    if not cleaned:
        return []
    tokens: list[str] = []
    for m in _WORD.finditer(cleaned):
        tokens.append(m.group(0))
    for m in _CJK.finditer(cleaned):
        seg = m.group(0)
        for i in range(len(seg)):
            tokens.append(seg[i])
            if i + 1 < len(seg):
                tokens.append(seg[i : i + 2])
            if i + 2 < len(seg):
                tokens.append(seg[i : i + 3])
    return tokens


def _hash_token(token: str) -> tuple[int, int]:
    digest = hashlib.sha256(token.encode("utf-8")).digest()
    idx = int.from_bytes(digest[:4], "big") % EMBEDDING_DIM
    sign = 1 if digest[4] % 2 == 0 else -1
    return idx, sign


def local_embed(text: str) -> list[float]:
    vec = [0.0] * EMBEDDING_DIM
    tokens = tokenize(text)
    if not tokens:
        return vec
    tf: dict[str, float] = {}
    for t in tokens:
        tf[t] = tf.get(t, 0.0) + 1.0
    for token, count in tf.items():
        idx, sign = _hash_token(token)
        vec[idx] += sign * (1 + math.log(count))
    norm = math.sqrt(sum(v * v for v in vec))
    if norm > 0:
        vec = [v / norm for v in vec]
    return vec


def cosine_similarity(a: list[float], b: list[float]) -> float:
    n = min(len(a), len(b))
    dot = na = nb = 0.0
    for i in range(n):
        dot += a[i] * b[i]
        na += a[i] * a[i]
        nb += b[i] * b[i]
    if na == 0 or nb == 0:
        return 0.0
    return dot / (math.sqrt(na) * math.sqrt(nb))
