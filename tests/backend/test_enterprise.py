"""企业工作区服务端持久化：CRUD + 用户隔离铁律。"""
from __future__ import annotations

import uuid


def _headers(auth: dict) -> dict:
    return auth


def test_case_upsert_and_snapshot_roundtrip(client, auth):
    case_id = f"CASE-{uuid.uuid4().hex[:8]}"
    resp = client.post(
        "/api/enterprise/cases",
        json={
            "id": case_id,
            "company": "测试制造有限公司",
            "title": "流动资金贷款尽调",
            "industry": "制造业",
            "amount": "500万",
            "owner": "张三",
            "progress": 40,
            "nextAction": "上传审计报告",
        },
        headers=auth,
    )
    assert resp.status_code == 200, resp.text

    snap = client.get("/api/enterprise/snapshot", headers=auth).json()["data"]
    assert any(c["id"] == case_id and c["company"] == "测试制造有限公司" for c in snap["cases"])


def test_cross_user_access_returns_404(client, user_a, user_b):
    """用户隔离铁律：B 不能读写 A 的企业对象（统一 404，防枚举）。"""
    case_id = f"CASE-{uuid.uuid4().hex[:8]}"
    client.post(
        "/api/enterprise/cases",
        json={"id": case_id, "company": "甲公司", "title": "t"},
        headers=user_a["headers"],
    )
    # B 读取（快照不含）
    snap_b = client.get("/api/enterprise/snapshot", headers=user_b["headers"]).json()["data"]
    assert not any(c["id"] == case_id for c in snap_b["cases"])
    # B 用同 id upsert → 404（与「不存在」不可区分，且 A 的数据不被篡改）
    resp = client.post(
        "/api/enterprise/cases",
        json={"id": case_id, "company": "乙公司", "title": "t"},
        headers=user_b["headers"],
    )
    assert resp.status_code == 404
    snap_a = client.get("/api/enterprise/snapshot", headers=user_a["headers"]).json()["data"]
    mine = next(c for c in snap_a["cases"] if c["id"] == case_id)
    assert mine["company"] == "甲公司"
    # B 删除 A 的对象 → 404
    del_b = client.delete(f"/api/enterprise/cases/{case_id}", headers=user_b["headers"])
    assert del_b.status_code == 404
    snap_a2 = client.get("/api/enterprise/snapshot", headers=user_a["headers"]).json()["data"]
    assert any(c["id"] == case_id for c in snap_a2["cases"])


def test_document_and_risk_upsert_with_counts(client, auth):
    doc_id = f"DOC-{uuid.uuid4().hex[:8]}"
    resp = client.post(
        "/api/enterprise/documents",
        json={
            "id": doc_id,
            "caseId": "CASE-x",
            "name": "审计报告.pdf",
            "kind": "企业资料",
            "status": "已解析",
            "facts": 12,
            "ruleHits": 3,
            "analysis": "AI 分析正文",
            "model": "gpt-test",
        },
        headers=auth,
    )
    assert resp.status_code == 200
    risk_id = f"RISK-{uuid.uuid4().hex[:8]}"
    resp = client.post(
        "/api/enterprise/risks",
        json={
            "id": risk_id,
            "caseId": "CASE-x",
            "company": "测试制造有限公司",
            "title": "应收账款集中度过高",
            "level": "high",
            "evidence": "前五大客户占比 78%",
            "rule": "客户集中度不超过 60%",
            "impact": "回款风险上升",
            "status": "待核验",
        },
        headers=auth,
    )
    assert resp.status_code == 200
    snap = client.get("/api/enterprise/snapshot", headers=auth).json()["data"]
    doc = next(d for d in snap["documents"] if d["id"] == doc_id)
    assert doc["facts"] == 12 and doc["ruleHits"] == 3
    risk = next(r for r in snap["risks"] if r["id"] == risk_id)
    assert risk["level"] == "high"


def test_rule_conditions_roundtrip(client, auth):
    rule_id = f"RULE-{uuid.uuid4().hex[:8]}"
    resp = client.post(
        "/api/enterprise/rules",
        json={
            "id": rule_id,
            "code": "LR-001",
            "name": "货币资金低于阈值",
            "domain": "授信准入",
            "coverage": "已测试",
            "coverageRate": 100,
            "conditions": [{"metric": "货币资金", "op": "lt", "value": 2_000_000}],
        },
        headers=auth,
    )
    assert resp.status_code == 200
    snap = client.get("/api/enterprise/snapshot", headers=auth).json()["data"]
    rule = next(r for r in snap["rules"] if r["id"] == rule_id)
    assert rule["conditions"] == [{"metric": "货币资金", "op": "lt", "value": 2_000_000}]


def test_task_and_brief_keep_enterprise_case_scope(client, auth):
    """任务与 AI 底稿必须保留项目 ID，前端才能阻止跨企业上下文混用。"""
    case_id = f"CASE-{uuid.uuid4().hex[:8]}"
    task_id = f"TASK-{uuid.uuid4().hex[:8]}"
    brief_id = f"BRIEF-{uuid.uuid4().hex[:8]}"
    assert client.post(
        "/api/enterprise/tasks",
        json={
            "id": task_id,
            "caseId": case_id,
            "title": "复核应收账款",
            "caseName": "测试制造有限公司 · 尽调",
            "assignee": "李四",
            "due": "2026-09-10",
        },
        headers=auth,
    ).status_code == 200
    assert client.post(
        "/api/enterprise/briefs",
        json={
            "id": brief_id,
            "caseId": case_id,
            "title": "客户集中度研究",
            "topic": "客户集中度",
            "summary": "待复核的 AI 研究底稿",
            "model": "gpt-test",
        },
        headers=auth,
    ).status_code == 200

    snap = client.get("/api/enterprise/snapshot", headers=auth).json()["data"]
    task = next(item for item in snap["tasks"] if item["id"] == task_id)
    brief = next(item for item in snap["briefs"] if item["id"] == brief_id)
    assert task["caseId"] == case_id
    assert brief["caseId"] == case_id


def test_snapshot_requires_auth(client):
    resp = client.get("/api/enterprise/snapshot")
    assert resp.status_code == 401
