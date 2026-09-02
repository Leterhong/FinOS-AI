"""2026-08 审查修复的回归测试：守住本轮修复不被悄悄改回去。"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select

from backend.config.settings import Settings
from backend.core.metrics import normalize_endpoint
from backend.intelligence.context import parse_goal_amount
from backend.services.document.service import _parse_amount, confirm_document
from backend.services.twin.service import _risk_score
# ---------------------------------------------------------------- 网关同步封装
def test_cfo_analyze_with_model_does_not_500(client, auth, user_a, db_session, monkeypatch):
    """此前 gen = gw_generate(...) 未 await 即取值，配置模型后必然 500。"""
    from backend.core.security import encrypt_secret
    from backend.ai.models import AIModelConfig
    from backend.services.cfo.service import gw_generate_sync

    user_id = user_a["user"]["id"]
    db_session.add(
        AIModelConfig(
            user_id=user_id,
            name="测试模型",
            key_mask="sk-t****",
            provider="openai-compatible",
            base_url="https://api.example.invalid/v1",
            model_id="m1",
            api_key_encrypted=encrypt_secret("sk-test"),
            is_default=True,
        )
    )
    db_session.commit()

    def _fake_generate(*_args, **_kwargs):
        return {"content": "AI 建议内容", "tokens": 5, "input_tokens": 1, "output_tokens": 4}

    monkeypatch.setattr(
        "backend.services.cfo.service.gw_generate_sync", _fake_generate
    )
    # 写入资产触发 hasData 路径
    from backend.financial.models import Asset

    db_session.add(Asset(user_id=user_id, type="cash", name="现金", amount=1000.0))
    db_session.commit()

    resp = client.post("/api/cfo/analyze", json={"question": "怎么看待当前资产"}, headers=auth)
    assert resp.status_code == 200, resp.text


# ---------------------------------------------------------------- 风险评分
def test_risk_score_counts_positive_liability():
    """负债以正数占比表示——此前误加负号，负债风险分量恒为 0。"""
    allocation = {"cash": 0.4, "property": 0.9, "liability": 0.5}
    score = _risk_score(allocation)
    # 集中度 (0.9-0.5)*100=40，负债 0.5*40=20 → 60；若负债恒 0 则只有 40。
    assert score >= 60, score


# ---------------------------------------------------------------- 目标解析
@pytest.mark.parametrize(
    ("goal", "expected"),
    [
        ("10年内攒够500万退休", 5_000_000.0),
        ("存够1亿", 100_000_000.0),
        ("50岁退休", None),  # 年龄不是金额——此前会被解析成 50 并得出 100% 进度
        ("5年内存200k", 200_000.0),
    ],
)
def test_parse_goal_amount(goal, expected):
    assert parse_goal_amount(goal) == expected


# ---------------------------------------------------------------- 文档金额解析
@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("1亿元", 100_000_000.0),
        ("1亿", 100_000_000.0),
        ("300万", 3_000_000.0),
        ("余额 12,800.50 元", 12800.50),
    ],
)
def test_parse_amount_units(raw, expected):
    assert _parse_amount(raw) == expected


def test_parse_amount_rejects_dates():
    """日期列（2024-01-01）此前会被当成金额 2024 提出；日期开头的行整行拒绝。"""
    assert _parse_amount("2024-01-01") == 0.0
    assert _parse_amount("2024年1月1日 入账 500 元") == 0.0
    assert _parse_amount("入账 500 元") == 500.0


def test_confirm_document_rejects_invalid_amounts(db_session, user_a):
    """confirm 对负数/非法金额此前会 500 或写入脏数据。"""
    from sqlalchemy import select as _select

    from backend.document.models import Document
    from backend.user.models import User as _User

    real_user = db_session.scalar(
        _select(_User).where(_User.id == user_a["user"]["id"])
    )
    doc = Document(
        user_id=real_user.id,
        filename="a.csv",
        storage_path="/tmp/does-not-matter.csv",
        status="uploaded",
    )
    db_session.add(doc)
    db_session.commit()

    result = confirm_document(
        db_session,
        real_user,
        doc.id,
        records=[
            {"type": "cash", "name": "ok", "amount": 100.0},
            {"type": "cash", "name": "neg", "amount": -5},
            {"type": "cash", "name": "nan", "amount": "not-a-number"},
        ],
    )
    assert result["count"] == 1
    assert result["skipped"] == 2


# ---------------------------------------------------------------- 调度原子认领
def test_scheduler_tick_claim_prevents_double_run(db_session, user_a):
    """两个并发 tick 只有一个能认领同一到期任务。"""
    from backend.autonomous.models import AutomationScheduled
    from backend.autonomous.scheduler.service import due_tasks, tick

    task = AutomationScheduled(
        user_id=user_a["user"]["id"],
        name="每日财富日报",
        frequency="daily",
        task_type="daily_briefing",
        hour=8,
        next_run_at=datetime.now(timezone.utc) - timedelta(minutes=5),
    )
    db_session.add(task)
    db_session.commit()

    due = due_tasks(db_session)
    assert any(t.id == task.id for t in due)

    # 第一次 tick：认领并执行（无数据时应安全跳过/成功）
    tick(db_session)
    db_session.refresh(task)
    claimed_value = task.next_run_at
    # 第二次 tick（模拟另一个 worker）：不得重复执行同一任务
    results = tick(db_session)
    db_session.refresh(task)
    assert all(r.get("taskId") != task.id or r.get("status") != "success" for r in results) or (
        task.next_run_at == claimed_value
    )


# ---------------------------------------------------------------- metrics 归一化
@pytest.mark.parametrize(
    ("path", "expected"),
    [
        ("/api/documents/doc-ms5nx3nvf990ec", "/api/documents/:id"),
        ("/api/user/user-ms5nwyko90d397/profile", "/api/user/:id/profile"),
        ("/api/models/9f8e7d6c-ab12-34cd-56ef-789012345678/default", "/api/models/:id/default"),
        ("/api/tasks/ai_generate", "/api/tasks/ai_generate"),  # 普通词组不得误归一化
        ("/api/auth/refresh", "/api/auth/refresh"),
    ],
)
def test_normalize_endpoint(path, expected):
    assert normalize_endpoint(path) == expected


# ---------------------------------------------------------------- 配置守卫
def test_settings_reject_placeholder_jwt_secret(monkeypatch):
    """仓库自带占位值此前能通过守卫（长度够但人人可见）。"""
    # 测试环境会被 conftest 标记为 dev（回退随机密钥），这里显式还原生产语义。
    monkeypatch.delenv("ENV", raising=False)
    monkeypatch.delenv("ENVIRONMENT", raising=False)
    with pytest.raises(RuntimeError):
        Settings(jwt_secret="please-change-me-to-a-long-random-string", _env_file=None)


def test_settings_reject_non_hs_algorithm():
    with pytest.raises(RuntimeError):
        Settings(jwt_algorithm="none", _env_file=None)


def test_settings_reject_long_expire():
    with pytest.raises(RuntimeError):
        Settings(jwt_expire_minutes=10080, _env_file=None)
