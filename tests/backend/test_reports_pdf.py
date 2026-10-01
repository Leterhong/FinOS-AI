"""风险清单 PDF 导出接口测试（reportlab 渲染，中文内置字体）。"""
from __future__ import annotations

PAYLOAD = {
    "generatedAt": "2026-10-01 12:00",
    "groups": [
        {
            "project": "测试企业 · 尽调",
            "risks": [
                {
                    "title": "经营现金流为负",
                    "level": "high",
                    "status": "待核验",
                    "company": "测试企业",
                    "evidence": "经营活动现金流量净额 -420 万元，需关注偿债压力",
                    "evidenceQuotes": ["经营活动现金流量净额 -420 万元"],
                    "ruleRefs": "R-CFO-001@v1.0 经营活动现金流为负（授信）",
                    "ruleText": "现金流量持续性审查要求",
                    "impact": "短期偿债压力上升",
                    "factIds": ["FACT-1"],
                    "ruleCodes": ["R-CFO-001"],
                },
            ],
        },
    ],
}


def test_risk_checklist_pdf_requires_auth(client):
    resp = client.post("/api/reports/risk-checklist.pdf", json=PAYLOAD)
    assert resp.status_code in (401, 403)


def test_risk_checklist_pdf_renders(client, auth):
    resp = client.post("/api/reports/risk-checklist.pdf", json=PAYLOAD, headers=auth)
    assert resp.status_code == 200, resp.text
    assert resp.headers["content-type"].startswith("application/pdf")
    assert resp.content[:4] == b"%PDF"
    assert len(resp.content) > 1000
