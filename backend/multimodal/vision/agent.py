"""Vision Agent —— 视觉财富理解（Phase 7.2 需求三 + 十五）。

识别链路（自上而下逐级降级，全程零硬依赖）：
  1. 图片压缩（Pillow 可选，缺失则原图）
  2. 本地 OCR（pytesseract / easyocr 可选，缺失则跳过）        → tier=ocr，零 LLM 成本
  3. 本地规则抽取实体；实体数 ≥ LOCAL_ENOUGH_ENTITIES 直接返回 → 不调 LLM（成本控制）
  4. 仍不足且用户已配置模型 → 调用多模态 LLM 读图            → tier=ai
  5. 全部失败 → 返回空结果 + 友好提示，绝不编造数字

**铁律**：本模块只负责「识别 + 提取」，绝不写入 Financial Twin。
"""
from __future__ import annotations

import base64
import io
import json
import re
from dataclasses import dataclass, field

from sqlalchemy.orm import Session

from backend.core.cache import cache_get, cache_set
from backend.multimodal.constants import (
    LOCAL_ENOUGH_ENTITIES,
    TIER_AI,
    TIER_LOCAL,
    TIER_OCR,
    VISION_CACHE_TTL,
    VISION_IMAGE_MAX_EDGE,
    VISION_IMAGE_QUALITY,
    VISION_MAX_TOKENS,
)
from backend.multimodal.llm import run_llm, vision_message
from backend.multimodal.text.extractor import (
    Entity,
    detect_subtype,
    extract_entities,
    guess_asset_type,
    summarize,
)
from backend.user.models import User

VISION_PROMPT = (
    "这是一张与个人财富相关的截图（可能是股票持仓、基金持仓、银行流水、资产总览或保险保单）。\n"
    "请严格按以下 JSON 输出，不要输出任何解释文字：\n"
    '{"subtype":"stock_holding|fund_holding|bank_statement|insurance_policy|asset_overview|other",'
    '"items":[{"name":"条目名称","assetType":"cash|stock|fund|bond|property|crypto|gold|insurance|pension|liability|other",'
    '"amount":数字金额（元，不带千分位）,"date":"YYYY-MM-DD 或空字符串","note":"备注"}]}\n'
    "只提取图中真实可见的数字。看不清的条目不要输出。金额必须是人民币元的纯数字。"
)


@dataclass
class VisionResult:
    ok: bool = False
    tier: str = TIER_LOCAL
    subtype: str = ""
    raw_text: str = ""
    entities: list[Entity] = field(default_factory=list)
    summary: str = ""
    message: str = ""

    def to_dict(self) -> dict:
        return {
            "ok": self.ok,
            "tier": self.tier,
            "subtype": self.subtype,
            "entities": [e.to_dict() for e in self.entities],
            "summary": self.summary,
            "message": self.message,
        }


# ------------------------------------------------------------------ 图片处理
def compress_image(data: bytes) -> tuple[bytes, str]:
    """长边压到 VISION_IMAGE_MAX_EDGE 并转 JPEG，显著降低 vision token 成本。

    Pillow 缺失时原样返回（零依赖可跑）。
    """
    try:
        from PIL import Image  # type: ignore
    except Exception:  # noqa: BLE001
        return data, "image/png"
    try:
        img = Image.open(io.BytesIO(data))
        if img.mode not in ("RGB", "L"):
            img = img.convert("RGB")
        w, h = img.size
        edge = max(w, h)
        if edge > VISION_IMAGE_MAX_EDGE:
            ratio = VISION_IMAGE_MAX_EDGE / float(edge)
            img = img.resize((max(1, int(w * ratio)), max(1, int(h * ratio))))
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=VISION_IMAGE_QUALITY, optimize=True)
        return buf.getvalue(), "image/jpeg"
    except Exception:  # noqa: BLE001
        return data, "image/png"


def local_ocr(data: bytes) -> str:
    """本地 OCR（可选依赖，缺失返回空串）。"""
    try:
        from PIL import Image  # type: ignore
        import pytesseract  # type: ignore
    except Exception:  # noqa: BLE001
        return ""
    try:
        img = Image.open(io.BytesIO(data))
        return pytesseract.image_to_string(img, lang="chi_sim+eng") or ""
    except Exception:  # noqa: BLE001
        return ""


# ------------------------------------------------------------------ LLM 解析
_JSON_RE = re.compile(r"\{[\s\S]*\}")


def _parse_llm_json(content: str) -> tuple[str, list[Entity]]:
    m = _JSON_RE.search(content or "")
    if not m:
        return "", []
    try:
        data = json.loads(m.group(0))
    except json.JSONDecodeError:
        return "", []
    subtype = str(data.get("subtype") or "")
    entities: list[Entity] = []
    for item in data.get("items") or []:
        if not isinstance(item, dict):
            continue
        try:
            amount = float(str(item.get("amount", 0)).replace(",", "").replace("¥", ""))
        except (TypeError, ValueError):
            continue
        if amount <= 0:
            continue
        name = str(item.get("name") or "未命名条目")[:100]
        atype = str(item.get("assetType") or "").strip() or guess_asset_type(name)
        kind = "liability" if atype == "liability" else "asset"
        entities.append(
            Entity(
                kind=kind,
                label=name,
                asset_type=atype,
                amount=round(amount, 2),
                occurred_at=str(item.get("date") or "")[:40],
                confidence=0.85,
                evidence=f"AI 视觉识别：{name} ¥{amount:,.2f}",
                payload={"note": str(item.get("note") or "")[:200], "source": "vision-llm"},
            )
        )
    return subtype, entities


# ------------------------------------------------------------------ 主入口
def analyze_image(
    db: Session,
    user: User,
    data: bytes,
    *,
    content_hash: str = "",
    allow_ai: bool = True,
) -> VisionResult:
    """识别一张财富截图，返回待确认实体（绝不写库）。"""
    cache_key = f"mm:vision:{user.id}:{content_hash}" if content_hash else ""
    if cache_key:
        cached = cache_get(cache_key)
        if cached:
            return VisionResult(
                ok=cached.get("ok", False),
                tier=cached.get("tier", TIER_LOCAL),
                subtype=cached.get("subtype", ""),
                raw_text=cached.get("rawText", ""),
                entities=[Entity(**_entity_kwargs(e)) for e in cached.get("entities", [])],
                summary=cached.get("summary", ""),
                message="已复用最近一次识别结果（同一张图片不重复消耗算力）。",
            )

    small, mime = compress_image(data)

    # 1) 本地 OCR（零 LLM 成本）
    text = local_ocr(small)
    entities = extract_entities(text) if text else []
    tier = TIER_OCR if text else TIER_LOCAL
    subtype = detect_subtype(text) if text else ""

    # 2) 本地不足 → 调多模态 LLM
    if allow_ai and len(entities) < LOCAL_ENOUGH_ENTITIES:
        b64 = base64.b64encode(small).decode("ascii")
        content = run_llm(
            db, user, vision_message(VISION_PROMPT, b64, mime),
            max_tokens=VISION_MAX_TOKENS, temperature=0.1,
        )
        if content:
            ai_subtype, ai_entities = _parse_llm_json(content)
            if ai_entities:
                entities = _merge(entities, ai_entities)
                subtype = ai_subtype or subtype
                tier = TIER_AI

    result = VisionResult(
        ok=bool(entities),
        tier=tier,
        subtype=subtype,
        raw_text=text[:5000],
        entities=entities,
        summary=summarize(text, entities),
    )
    if not entities:
        result.message = (
            "未能从这张图片中读出可用的财务数据。"
            "你可以在设置中配置支持图片理解的模型，或直接手动录入。"
        )
    if cache_key and result.ok:
        cache_set(
            cache_key,
            {
                "ok": result.ok,
                "tier": result.tier,
                "subtype": result.subtype,
                "rawText": result.raw_text,
                "entities": [e.to_dict() for e in result.entities],
                "summary": result.summary,
            },
            ttl_seconds=VISION_CACHE_TTL,
        )
    return result


def _entity_kwargs(d: dict) -> dict:
    return {
        "kind": d.get("kind", "asset"),
        "label": d.get("label", ""),
        "asset_type": d.get("assetType", "other"),
        "amount": float(d.get("amount") or 0.0),
        "occurred_at": d.get("occurredAt", ""),
        "confidence": float(d.get("confidence") or 0.5),
        "evidence": d.get("evidence", ""),
        "payload": d.get("payload") or {},
    }


def _merge(local: list[Entity], ai: list[Entity]) -> list[Entity]:
    """AI 结果优先，按 (label, amount) 去重。"""
    out = list(ai)
    seen = {(e.label, round(e.amount, 2)) for e in ai}
    for e in local:
        if (e.label, round(e.amount, 2)) not in seen:
            out.append(e)
    return out
