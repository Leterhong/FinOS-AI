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
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

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


def _table(header: list[str], rows: list[list[str]]) -> Table:
    data = [[Paragraph(escape(str(cell)), _STYLE_BODY) for cell in header]]
    for row in rows:
        data.append([Paragraph(escape(str(cell)), _STYLE_BODY) for cell in row])
    table = Table(data, hAlign="LEFT")
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#EFF4FA")),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#C9D6E4")),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]))
    return table


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

        meta = group.get("meta")
        if meta:
            story.append(Paragraph("<b>企业基础信息</b>", _STYLE_BODY))
            story.append(Paragraph(
                "企业名称：{c}　研判任务：{t}<br/>所属行业：{i}　金额规模：{a}<br/>负责人：{o}　状态：{s}　风险等级：{r}　进度：{p}%<br/>数据密级：{cl}".format(
                    c=escape(str(meta.get("company") or "")), t=escape(str(meta.get("title") or "")),
                    i=escape(str(meta.get("industry") or "")), a=escape(str(meta.get("amount") or "")),
                    o=escape(str(meta.get("owner") or "")), s=escape(str(meta.get("status") or "")),
                    r=escape(str(meta.get("risk") or "")), p=round(float(meta.get("progress") or 0)),
                    cl=escape(str(meta.get("classification") or "internal")),
                ), _STYLE_BODY))

        stats = group.get("stats")
        if stats:
            levels = stats.get("byLevel") or {}
            story.append(Paragraph(f"<b>风险汇总</b>：共 {stats.get('total', 0)} 项（重大 {levels.get('critical', 0)} · 高 {levels.get('high', 0)} · 中 {levels.get('medium', 0)} · 低 {levels.get('low', 0)}）；待核验 {stats.get('pending', 0)} · 已确认 {stats.get('confirmed', 0)} · 已缓释 {stats.get('mitigated', 0)}；{stats.get('documents', 0)} 份资料 · {stats.get('facts', 0)} 条事实", _STYLE_BODY))

        metrics = group.get("financialMetrics") or []
        story.append(Paragraph("<b>财务指标</b>", _STYLE_BODY))
        if metrics:
            story.append(_table(["指标", "数值", "类别", "口径说明"], [[m.get("name", ""), m.get("displayValue", ""), m.get("category", ""), m.get("interpretation", "")] for m in metrics]))
        else:
            story.append(Paragraph("当前项目缺少可计算的财务事实（需上传含资产负债/利润/现金流科目的资料）。", _STYLE_META))

        trends = group.get("financialTrends") or []
        if trends:
            story.append(Spacer(1, 4))
            story.append(Paragraph("<b>跨期趋势</b>", _STYLE_BODY))
            story.append(_table(["指标", "期初", "期末", "变化率"], [[t.get("topic", ""), t.get("fromPeriod", ""), t.get("toPeriod", ""), f"{float(t.get('changeRate') or 0):.1f}%"] for t in trends]))

        story.append(Spacer(1, 4))
        story.append(Paragraph("<b>风险明细</b>", _STYLE_BODY))
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
