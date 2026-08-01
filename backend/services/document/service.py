"""Document 解析提取服务（Phase 7.0.2 需求十，迁移 Phase 6.7）。

流程：读取已上传文件（绑定 user_id）→ 解析（CSV/JSON/TXT，PDF/XLSX 尽力文本化）
→ 启发式提取财富记录（现金/股票/基金/房产/负债…）→ 返回候选列表（带 confidence）。
用户在前端确认后，调用 confirm() 把候选保存为 Asset（source="document"）。
纯代码，零 LLM；提取不到时返回空列表 + 说明，绝不伪造。
"""
from __future__ import annotations

import csv
import io
import json
import re
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.document.models import Document
from backend.financial.models import Asset
from backend.user.models import User

TYPE_KEYWORDS = [
    (("现金", "存款", "储蓄", "活期", "定期", "余额"), "cash"),
    (("股票", "股", "证券", "a股", "港股", "美股"), "stock"),
    (("基金", "etf", "公募", "私募"), "fund"),
    (("债券", "国债", "企业债"), "bond"),
    (("房产", "房", "住宅", "商铺", "物业"), "property"),
    (("加密", "币", "btc", "eth", "虚拟货币"), "crypto"),
    (("负债", "贷款", "房贷", "借款", "信用卡", "网贷", "欠款"), "liability"),
    (("保险", "保单"), "insurance"),
]

_AMOUNT_RE = re.compile(r"([\d][\d,]*(?:\.\d+)?)\s*(元|万元|万|w|k)?", re.I)


def _infer_type(text: str) -> str:
    low = text.lower()
    for keywords, t in TYPE_KEYWORDS:
        if any(k in low for k in keywords):
            return t
    return "other"


def _parse_amount(raw: str) -> float:
    m = _AMOUNT_RE.search(raw)
    if not m:
        return 0.0
    val = float(m.group(1).replace(",", ""))
    unit = (m.group(2) or "").lower()
    if unit in {"万元", "万"}:
        val *= 10000
    elif unit == "w":
        val *= 10000
    elif unit == "k":
        val *= 1000
    return round(val, 2)


def _confidence(name: str, t: str) -> float:
    return 0.95 if t != "other" else 0.6


def extract_from_csv(text: str) -> list[dict]:
    reader = csv.DictReader(io.StringIO(text))
    if not reader.fieldnames:
        return []
    fields = [f.lower() for f in reader.fieldnames]
    names = list(reader.fieldnames)

    def _find(substrings):
        for i, f in enumerate(fields):
            if any(k in f for k in substrings):
                return names[i]
        return None

    amount_key = _find(("金额", "amount", "余额", "市值", "value", "价格"))
    name_key = _find(("名称", "name", "标的", "证券", "股票", "item", "项目"))
    type_key = _find(("类型", "type", "kind", "类别", "category"))
    out: list[dict] = []
    for row in reader:
        try:
            if amount_key:
                amt = _parse_amount(str(row.get(amount_key, "")))
            else:
                # 取第一个数值列
                amt = _parse_amount(str(next((v for v in row.values() if v and re.search(r"\d", str(v))), "0")))
            if amt <= 0:
                continue
            name = str(row.get(name_key, "")) if name_key else ""
            raw_type = str(row.get(type_key, "")).strip() if type_key else ""
            t = _infer_type(raw_type) if raw_type else "other"
            if t == "other" and name:
                t = _infer_type(name)  # 回退用名称/标的推断
            out.append({"type": t, "name": name or f"导入记录{len(out) + 1}", "amount": amt, "confidence": _confidence(name, t)})
        except (ValueError, AttributeError):
            continue
    return out


def extract_from_text(text: str) -> list[dict]:
    out: list[dict] = []
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        # 行内含金额 + 财富关键词
        if not any(k in line.lower() for ks in TYPE_KEYWORDS for k in ks):
            continue
        amt = _parse_amount(line)
        if amt <= 0:
            continue
        t = _infer_type(line)
        out.append({"type": t, "name": line[:60], "amount": amt, "confidence": _confidence(line, t)})
    return out


def analyze_document(db: Session, user: User, document_id: str) -> dict:
    doc = db.scalar(select(Document).where(Document.id == document_id, Document.user_id == user.id))
    if doc is None:
        raise KeyError("document_not_found")
    p = Path(doc.storage_path)
    raw = p.read_bytes() if p.is_file() else b""
    text = ""
    try:
        text = raw.decode("utf-8", errors="ignore")
    except Exception:
        text = ""

    ext = Path(doc.filename).suffix.lower()
    if ext == ".csv":
        records = extract_from_csv(text)
    elif ext == ".json":
        try:
            data = json.loads(text)
            text2 = json.dumps(data, ensure_ascii=False)
            records = extract_from_text(text2)
        except (json.JSONDecodeError, TypeError):
            records = []
    elif ext in {".xlsx", ".xls", ".pdf"}:
        # 尽力文本化后做正则提取；复杂表格建议导出 CSV
        records = extract_from_text(text)
    else:
        records = extract_from_text(text)

    return {
        "documentId": doc.id,
        "filename": doc.filename,
        "records": records,
        "note": "已提取候选财富记录，请在前端确认后保存为资产。" if records else "未从文件提取到财富数据，可手动录入。",
    }


def confirm_document(db: Session, user: User, document_id: str, records: list[dict]) -> dict:
    doc = db.scalar(select(Document).where(Document.id == document_id, Document.user_id == user.id))
    if doc is None:
        raise KeyError("document_not_found")
    saved = []
    for r in records:
        t = r.get("type")
        if t not in {"cash", "stock", "fund", "bond", "property", "crypto", "liability", "insurance", "other"}:
            continue
        asset = Asset(
            user_id=user.id,
            type=t,
            name=str(r.get("name", ""))[:200],
            amount=float(r.get("amount", 0)),
            source="document",
        )
        db.add(asset)
        saved.append({"type": asset.type, "name": asset.name, "amount": asset.amount})
    doc.status = "parsed"
    db.commit()
    return {"documentId": doc.id, "saved": saved, "count": len(saved)}
