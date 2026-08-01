"""报告导出器（Phase 7.2 需求七：Markdown / 网页 / PDF）。

- Markdown：ReportDoc.to_markdown()，零依赖
- HTML：自带轻量样式，可直接浏览器打印成 PDF（零依赖）
- PDF：reportlab 可选；缺失时返回 None，由路由降级为「下载 HTML 后打印」
"""
from __future__ import annotations

import html
import io
import re

_HEAD = """<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title>
<style>
:root{{--fg:#0f172a;--muted:#64748b;--line:#e2e8f0;--brand:#00D68F;--bg:#ffffff}}
*{{box-sizing:border-box}}
body{{margin:0;padding:48px 24px;background:#f8fafc;color:var(--fg);
font:15px/1.75 -apple-system,"PingFang SC","Microsoft YaHei",sans-serif}}
.page{{max-width:820px;margin:0 auto;background:var(--bg);padding:56px 56px 48px;
border-radius:14px;box-shadow:0 1px 3px rgba(15,23,42,.08)}}
h1{{font-size:28px;margin:0 0 8px;letter-spacing:-.02em}}
h2{{font-size:18px;margin:36px 0 12px;padding-left:11px;border-left:3px solid var(--brand)}}
.meta{{color:var(--muted);font-size:13px;margin-bottom:28px}}
.intro{{background:#f0fdf9;border:1px solid #ccf5e7;border-radius:10px;padding:16px 18px;margin-bottom:8px}}
table{{width:100%;border-collapse:collapse;margin:14px 0;font-size:14px}}
th,td{{padding:9px 12px;border-bottom:1px solid var(--line);text-align:left}}
th{{background:#f8fafc;font-weight:600;color:var(--muted)}}
td:nth-child(n+2){{text-align:right;font-variant-numeric:tabular-nums}}
ul{{padding-left:20px;margin:10px 0}}li{{margin:5px 0}}
ol{{padding-left:22px}}
.footer{{margin-top:40px;padding-top:18px;border-top:1px solid var(--line);
color:var(--muted);font-size:12.5px}}
@media print{{body{{background:#fff;padding:0}}.page{{box-shadow:none;padding:24px}}}}
</style></head><body><div class="page">
"""

_FOOT = """</div></body></html>"""


def to_html(doc) -> str:
    """ReportDoc → 独立 HTML 页面（可直接打印成 PDF）。"""
    d = doc.to_dict() if hasattr(doc, "to_dict") else doc
    parts = [_HEAD.format(title=html.escape(d.get("title", "财富报告")))]
    parts.append(f"<h1>{html.escape(d.get('title', ''))}</h1>")
    meta = []
    if d.get("period"):
        meta.append(f"统计周期：{html.escape(str(d['period']))}")
    if d.get("generatedAt"):
        meta.append(f"生成时间：{html.escape(str(d['generatedAt']))}")
    if meta:
        parts.append(f"<div class='meta'>{'　|　'.join(meta)}</div>")
    if d.get("intro"):
        parts.append(f"<div class='intro'>{html.escape(str(d['intro'])).replace(chr(10), '<br>')}</div>")

    for s in d.get("sections", []):
        parts.append(f"<h2>{html.escape(s.get('heading', ''))}</h2>")
        for p in s.get("paragraphs", []):
            parts.append(f"<p>{html.escape(str(p))}</p>")
        table = s.get("table")
        if table and table.get("columns"):
            head = "".join(f"<th>{html.escape(str(c))}</th>" for c in table["columns"])
            body = "".join(
                "<tr>" + "".join(f"<td>{html.escape(str(c))}</td>" for c in row) + "</tr>"
                for row in table.get("rows", [])
            )
            parts.append(f"<table><thead><tr>{head}</tr></thead><tbody>{body}</tbody></table>")
        if s.get("bullets"):
            items = "".join(f"<li>{html.escape(str(b))}</li>" for b in s["bullets"])
            parts.append(f"<ul>{items}</ul>")

    if d.get("actions"):
        parts.append("<h2>行动清单</h2><ol>")
        parts.extend(f"<li>{html.escape(str(a))}</li>" for a in d["actions"])
        parts.append("</ol>")

    parts.append(f"<div class='footer'>{html.escape(d.get('disclaimer', ''))}</div>")
    parts.append(_FOOT)
    return "".join(parts)


_MD_STRIP = re.compile(r"[*_`>#]")


def to_pdf(doc) -> bytes | None:
    """ReportDoc → PDF 字节流。reportlab 缺失返回 None（调用方降级为 HTML）。"""
    try:
        from reportlab.lib.pagesizes import A4  # type: ignore
        from reportlab.lib.units import mm  # type: ignore
        from reportlab.pdfbase import pdfmetrics  # type: ignore
        from reportlab.pdfbase.ttfonts import TTFont  # type: ignore
        from reportlab.pdfgen import canvas  # type: ignore
    except Exception:  # noqa: BLE001
        return None

    font_name = "Helvetica"
    for path, name in (
        ("C:/Windows/Fonts/msyh.ttc", "MSYH"),
        ("C:/Windows/Fonts/simhei.ttf", "SimHei"),
        ("/System/Library/Fonts/PingFang.ttc", "PingFang"),
        ("/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc", "WQY"),
    ):
        try:
            pdfmetrics.registerFont(TTFont(name, path))
            font_name = name
            break
        except Exception:  # noqa: BLE001
            continue

    d = doc.to_dict() if hasattr(doc, "to_dict") else doc
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    width, height = A4
    margin, y = 20 * mm, height - 24 * mm

    def line(text: str, size: int = 10.5, gap: float = 6.2, bold: bool = False) -> None:
        nonlocal y
        if y < 24 * mm:
            c.showPage()
            y = height - 24 * mm
        c.setFont(font_name, size)
        max_chars = int((width - 2 * margin) / (size * 0.62))
        text = _MD_STRIP.sub("", text)
        for i in range(0, len(text), max_chars) or [0]:
            chunk = text[i:i + max_chars]
            c.drawString(margin, y, chunk)
            y -= size + gap
            if y < 24 * mm:
                c.showPage()
                y = height - 24 * mm
                c.setFont(font_name, size)
        if bold:
            y -= 2

    line(d.get("title", "财富报告"), 17, 10, bold=True)
    if d.get("period"):
        line(f"统计周期：{d['period']}　生成时间：{d.get('generatedAt', '')}", 9, 10)
    if d.get("intro"):
        line(str(d["intro"]), 10.5, 8)
    y -= 4

    for s in d.get("sections", []):
        line(s.get("heading", ""), 13.5, 8, bold=True)
        for p in s.get("paragraphs", []):
            line(str(p))
        table = s.get("table")
        if table and table.get("columns"):
            line(" | ".join(str(x) for x in table["columns"]), 10)
            for row in table.get("rows", []):
                line(" | ".join(str(x) for x in row), 10)
        for b in s.get("bullets", []):
            line("• " + str(b))
        y -= 4

    if d.get("actions"):
        line("行动清单", 13.5, 8, bold=True)
        for i, a in enumerate(d["actions"], start=1):
            line(f"{i}. {a}")

    y -= 6
    line(d.get("disclaimer", ""), 9)
    c.save()
    return buf.getvalue()


def pdf_available() -> bool:
    try:
        import reportlab  # noqa: F401

        return True
    except Exception:  # noqa: BLE001
        return False
