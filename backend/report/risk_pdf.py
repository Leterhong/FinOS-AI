"""风险清单 PDF 渲染（reportlab + 内置中文 CID 字体 STSong-Light）。"""
from __future__ import annotations

import io
from typing import Any
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.cidfonts import UnicodeCIDFont
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer

_FONT = "STSong-Light"


def _ensure_font() -> None:
    try:
        pdfmetrics.getFont(_FONT)
    except Exception:  # noqa: BLE001
        pdfmetrics.registerFont(UnicodeCIDFont(_FONT))


LEVEL_LABEL = {"low": "低风险", "medium": "中风险", "high": "高风险", "critical": "重大风险"}
LEVEL_COLOR = {"low": "#2E7D32", "medium": "#B7791F", "high": "#C0392B", "critical": "#7B241C"}

_STYLE_TITLE = ParagraphStyle("title", fontName=_FONT, fontSize=20, leading=28, spaceAfter=6, textColor=colors.HexColor("#1F4E79"))
_STYLE_META = ParagraphStyle("meta", fontName=_FONT, fontSize=9.5, leading=14, textColor=colors.HexColor("#808080"), spaceAfter=10)
_STYLE_GROUP = ParagraphStyle("group", fontName=_FONT, fontSize=14, leading=20, spaceBefore=10, spaceAfter=6, textColor=colors.HexColor("#1F4E79"))
_STYLE_RISK = ParagraphStyle("risk", fontName=_FONT, fontSize=11.5, leading=17, spaceBefore=8, spaceAfter=3)
_STYLE_BODY = ParagraphStyle("body", fontName=_FONT, fontSize=10, leading=15.5, spaceAfter=2)
_STYLE_FOOT = ParagraphStyle("foot", fontName=_FONT, fontSize=9, leading=14, spaceBefore=14, textColor=colors.HexColor("#B7791F"))


def _highlight(evidence: str, quotes: list[str]) -> str:
    text = escape(evidence or "")
    for quote in sorted([q for q in (quotes or []) if q and len(q.strip()) >= 2], key=len, reverse=True):
        marked = f'<b><font color="#C0392B" backColor="#FFF3B0">{escape(quote)}</font></b>'
        text = text.replace(escape(quote), marked)
    return text


def render_risk_checklist(payload: dict[str, Any]) -> bytes:
    _ensure_font()
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, leftMargin=18 * mm, rightMargin=18 * mm, topMargin=18 * mm, bottomMargin=16 * mm, title="企业风险清单")
    story: list[Any] = []
    groups = payload.get("groups") or []
    total = sum(len(group.get("risks") or []) for group in groups)

    story.append(Paragraph("企业风险清单", _STYLE_TITLE))
    meta = f"生成时间：{escape(str(payload.get('generatedAt') or ''))}　共 {len(groups)} 个项目 / {total} 项风险"
    story.append(Paragraph(meta, _STYLE_META))

    for group in groups:
        story.append(Paragraph(f"项目：{escape(str(group.get('project') or '未关联项目'))}", _STYLE_GROUP))
        for index, risk in enumerate(group.get("risks") or []):
            level = str(risk.get("level") or "medium")
            color = LEVEL_COLOR.get(level, "#7B241C")
            story.append(Paragraph(f'<font color="{color}"><b>{index + 1}. {escape(str(risk.get("title") or ""))}</b></font>', _STYLE_RISK))
            story.append(Paragraph(
                f'风险等级：<font color="{color}"><b>{LEVEL_LABEL.get(level, level)}</b></font>　状态：{escape(str(risk.get("status") or ""))}',
                _STYLE_BODY,
            ))
            story.append(Paragraph(f"关键证据：{_highlight(str(risk.get('evidence') or ''), list(risk.get('evidenceQuotes') or []))}", _STYLE_BODY))
            if risk.get("ruleRefs"):
                story.append(Paragraph(f"规则命中依据：{escape(str(risk['ruleRefs']))}", _STYLE_BODY))
            if risk.get("ruleText"):
                story.append(Paragraph(f"制度/规则条款：{escape(str(risk['ruleText']))}", _STYLE_BODY))
            if risk.get("impact"):
                story.append(Paragraph(f"潜在影响：{escape(str(risk['impact']))}", _STYLE_BODY))
            story.append(Paragraph(f"事实引用：{escape('、'.join(risk.get('factIds') or []) or '无')}　规则引用：{escape('、'.join(risk.get('ruleCodes') or []) or '无')}", _STYLE_BODY))
            if risk.get("verifiedBy"):
                note = str(risk.get("verificationNote") or "")
                story.append(Paragraph(f'<font color="#2E7D32">复核：{escape(str(risk["verifiedBy"]))}{" · " + escape(str(risk.get("verifiedAt"))) if risk.get("verifiedAt") else ""}{"　" + escape(note) if note else ""}</font>', _STYLE_BODY))

    story.append(Spacer(1, 6))
    story.append(Paragraph("本清单由 FinOS AI 生成，仅用于风险提示与人工复核参考，不构成授信、投资、法律、审计或合规意见。", _STYLE_FOOT))

    doc.build(story)
    return buffer.getvalue()
