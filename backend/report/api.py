"""Wealth Report API（Phase 7.2）。

路由前缀：/api/reports
"""
from __future__ import annotations

from fastapi import APIRouter, Depends
from fastapi.responses import HTMLResponse, PlainTextResponse, Response
from sqlalchemy.orm import Session

from backend.core import get_current_user, ok
from backend.core.response import fail
from backend.database import get_db
from backend.report import generator
from backend.report.exporters import pdf_available, to_html, to_pdf
from backend.report.schemas import GenerateReportRequest
from backend.report.templates import REPORT_TEMPLATES
from backend.user.models import User

router = APIRouter(prefix="/reports", tags=["reports"])


@router.get("/kinds")
def kinds(user: User = Depends(get_current_user)):
    return ok(
        {
            "items": [
                {"kind": k, "title": v["title"], "sections": v["sections"]}
                for k, v in REPORT_TEMPLATES.items()
            ],
            "exports": {"markdown": True, "html": True, "pdf": pdf_available()},
        }
    )


@router.post("/generate")
def generate(
    body: GenerateReportRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        doc = generator.generate_report(
            db, user, body.kind, use_ai=body.useAi, persist=body.persist
        )
    except ValueError as exc:
        return fail(str(exc))
    if isinstance(doc, dict):  # 无数据欢迎态
        return ok(doc)
    data = doc.to_dict()
    data["markdown"] = doc.to_markdown()
    return ok(data, "报告已生成")


@router.get("")
def list_reports(limit: int = 20, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    items = generator.list_reports(db, user, limit=limit)
    return ok({"items": items, "hasData": bool(items)})


@router.get("/{report_id}")
def detail(report_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    data = generator.get_report(db, user, report_id)
    if data is None:
        return fail("报告不存在", status_code=404)
    return ok(data)


@router.get("/{report_id}/export")
def export(
    report_id: str,
    format: str = "markdown",
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """导出报告：markdown / html / pdf。PDF 组件缺失时自动降级为 HTML。"""
    data = generator.get_report(db, user, report_id)
    if data is None:
        return fail("报告不存在", status_code=404)

    fmt = (format or "markdown").lower()
    filename = f"{data.get('title', 'report')}-{data.get('period', '')}".strip("-")

    if fmt == "markdown":
        return PlainTextResponse(
            data.get("markdown", ""),
            media_type="text/markdown; charset=utf-8",
            headers={"Content-Disposition": f'attachment; filename="{report_id}.md"'},
        )
    if fmt == "html":
        return HTMLResponse(to_html(data))
    if fmt == "pdf":
        pdf = to_pdf(data)
        if pdf is None:
            # 降级：返回可打印 HTML，并明确告知
            return HTMLResponse(
                to_html(data),
                headers={"X-Export-Fallback": "pdf-unavailable-use-print"},
            )
        return Response(
            content=pdf,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{report_id}.pdf"'},
        )
    return fail(f"不支持的导出格式：{format}")


@router.delete("/{report_id}")
def delete(report_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not generator.delete_report(db, user, report_id):
        return fail("报告不存在", status_code=404)
    return ok(None, "报告已删除")
