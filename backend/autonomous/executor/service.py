# -*- coding: utf-8 -*-
"""
backend/autonomous/executor/service.py — Phase 7.4 需求一：动作执行器（Executor）。

注册表模式，与 backend/tasks/registry.py 保持同一风格：
    ACTION_HANDLERS: dict[str, Handler]

支持的动作类型：
    create_notification  推送带优先级的主动提醒
    create_action_item   在 Action Center 生成一条可完成/忽略/延期的行动项
    generate_report      生成日/周/月/年报告
    run_agent            运行投资 / 现金流 / 偏好学习智能体
    add_memory           写入长期记忆（同 key 幂等覆盖）
    call_webhook         调用用户配置的出站 Webhook
    create_task          写入异步任务队列（复用 Phase 7.0.4 的 Worker）

三条硬约束：
  1. 单个动作失败必须被隔离，不能中断整条动作链；
  2. 所有动作强制携带 user_id，绝不跨用户写数据；
  3. 涉及 LLM 的动作先过 cost_guard，预算不足自动降级为本地模式。
"""
from __future__ import annotations

import json
import logging
import urllib.request
from collections.abc import Callable
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.autonomous import notifications as notif_engine
from backend.autonomous.models import AutomationAction, AutomationWebhook
from backend.user.models import User

logger = logging.getLogger("finos.autonomous.executor")

Handler = Callable[[Session, User, dict, dict], dict]

ACTION_TYPES = (
    "create_notification",
    "create_action_item",
    "generate_report",
    "run_agent",
    "add_memory",
    "call_webhook",
    "create_task",
)

ACTION_LABELS = {
    "create_notification": "发送提醒",
    "create_action_item": "创建行动项",
    "generate_report": "生成报告",
    "run_agent": "运行智能体",
    "add_memory": "写入长期记忆",
    "call_webhook": "调用 Webhook",
    "create_task": "创建异步任务",
}


# --------------------------------------------------------------------------- #
# 模板变量插值：{{event.summary}} / {{metric}} 等
# --------------------------------------------------------------------------- #
def render(template: Any, context: dict) -> Any:
    if not isinstance(template, str) or "{{" not in template:
        return template
    out = template
    flat = _flatten(context)
    for key, val in flat.items():
        out = out.replace("{{" + key + "}}", "" if val is None else str(val))
    return out


def _flatten(data: dict, prefix: str = "") -> dict:
    flat: dict[str, Any] = {}
    for k, v in (data or {}).items():
        key = f"{prefix}{k}"
        if isinstance(v, dict):
            flat.update(_flatten(v, f"{key}."))
        else:
            flat[key] = v
    return flat


def _params(raw: dict, context: dict) -> dict:
    return {k: render(v, context) for k, v in (raw or {}).items()}


# --------------------------------------------------------------------------- #
# 各动作实现
# --------------------------------------------------------------------------- #
def _h_create_notification(db: Session, user: User, params: dict, context: dict) -> dict:
    n, created = notif_engine.push(
        db,
        user.id,
        title=str(params.get("title") or "FinOS AI 提醒"),
        body=str(params.get("body") or ""),
        category=str(params.get("category") or "ai"),
        priority=str(params.get("priority") or params.get("severity") or "medium"),
        source=str(params.get("source") or "autonomous"),
    )
    return {
        "notificationId": n.id if n else None,
        "created": created,
        "priority": n.severity if n else None,
        "deduped": not created,
    }


def _h_create_action_item(db: Session, user: User, params: dict, context: dict) -> dict:
    due_days = params.get("dueInDays")
    due_at = None
    if due_days is not None:
        try:
            due_at = datetime.now(timezone.utc) + timedelta(days=float(due_days))
        except Exception:  # noqa: BLE001
            due_at = None
    item = AutomationAction(
        user_id=user.id,
        title=str(params.get("title") or "待处理事项")[:200],
        detail=str(params.get("detail") or ""),
        category=str(params.get("category") or "wealth"),
        priority=notif_engine.normalize_priority(str(params.get("priority") or "medium")),
        source_id=context.get("sourceId"),
        due_at=due_at,
    )
    db.add(item)
    db.commit()
    return {"actionItemId": item.id, "priority": item.priority}


def _h_generate_report(db: Session, user: User, params: dict, context: dict) -> dict:
    from backend.autonomous import reports

    kind = str(params.get("kind") or "daily")
    allow_llm = bool(params.get("allowLlm", True))
    result = reports.generate(db, user, kind, allow_llm=allow_llm, notify=bool(params.get("notify", True)))
    return {
        "kind": kind,
        "reportId": result.get("id"),
        "hasData": result.get("hasData", True),
        "tier": result.get("tier", "local"),
    }


def _h_run_agent(db: Session, user: User, params: dict, context: dict) -> dict:
    from backend.autonomous.agents import cashflow as cashflow_agent
    from backend.autonomous.agents import investment as investment_agent
    from backend.autonomous.agents import preference as preference_agent

    agent = str(params.get("agent") or "investment")
    allow_llm = bool(params.get("allowLlm", True))
    if agent == "cashflow":
        result = cashflow_agent.analyze(db, user, allow_llm=allow_llm)
    elif agent == "preference":
        result = preference_agent.learn(db, user)
    else:
        agent = "investment"
        result = investment_agent.analyze(db, user, allow_llm=allow_llm)

    findings = result.get("findings") or []
    # 高严重度结论自动转成提醒 + 行动项，形成「发现→提醒→行动」闭环
    created = []
    if bool(params.get("emitFindings", True)):
        for f in findings:
            if f.get("level") not in ("critical", "high"):
                continue
            notif_engine.push(
                db,
                user.id,
                title=str(f.get("title") or "")[:200],
                body=f"{f.get('detail', '')}\n建议：{f.get('advice', '')}",
                category="risk" if agent == "investment" else "wealth",
                priority=str(f.get("level") or "medium"),
                source=f"autonomous.{agent}",
            )
            item = AutomationAction(
                user_id=user.id,
                title=str(f.get("title") or "")[:200],
                detail=f"{f.get('detail', '')}\n建议：{f.get('advice', '')}",
                category="risk" if agent == "investment" else "wealth",
                priority=notif_engine.normalize_priority(str(f.get("level") or "medium")),
                source_id=context.get("sourceId"),
            )
            db.add(item)
            created.append(item)
        if created:
            db.commit()

    return {
        "agent": agent,
        "severity": result.get("severity", "low"),
        "findings": len(findings),
        "actionItemsCreated": len(created),
        "tier": result.get("tier", "local"),
        "llmCalled": bool(result.get("llmCalled")),
    }


def _h_add_memory(db: Session, user: User, params: dict, context: dict) -> dict:
    from backend.intelligence.ltm.service import remember

    row = remember(
        db,
        user,
        str(params.get("kind") or "preference"),
        str(params.get("key") or "autonomous_note"),
        str(params.get("content") or ""),
        payload=params.get("payload") if isinstance(params.get("payload"), dict) else None,
        importance=float(params.get("importance") or 0.5),
    )
    return {"memoryId": row.id, "key": row.key}


def _h_call_webhook(db: Session, user: User, params: dict, context: dict) -> dict:
    webhook_id = params.get("webhookId")
    url = params.get("url")
    hook: AutomationWebhook | None = None
    if webhook_id:
        hook = db.scalar(
            select(AutomationWebhook).where(
                AutomationWebhook.id == str(webhook_id), AutomationWebhook.user_id == user.id
            )
        )
        if hook is None:
            return {"error": "Webhook 不存在或无权访问"}
        if not hook.enabled:
            return {"skipped": True, "reason": "Webhook 已停用"}
        url = hook.url

    if not url:
        return {"error": "缺少 Webhook 地址"}

    body = params.get("body")
    if body is None:
        body = {"source": "finos-ai", "context": context}
    payload = json.dumps(body, ensure_ascii=False, default=str).encode("utf-8")
    headers = {"Content-Type": "application/json"}
    if hook is not None:
        headers.update({str(k): str(v) for k, v in hook.header_dict().items()})

    status = None
    err = None
    try:
        req = urllib.request.Request(
            str(url), data=payload, headers=headers, method=str(params.get("method") or (hook.method if hook else "POST"))
        )
        with urllib.request.urlopen(req, timeout=5.0) as resp:  # noqa: S310
            status = resp.status
    except Exception as exc:  # noqa: BLE001
        err = str(exc)[:200]

    if hook is not None:
        hook.last_called_at = datetime.now(timezone.utc)
        hook.last_status = status
        hook.call_count = (hook.call_count or 0) + 1
        db.commit()

    return {"status": status, "error": err, "url": str(url)[:120]}


def _h_create_task(db: Session, user: User, params: dict, context: dict) -> dict:
    from backend.tasks import repository as task_repo

    task_type = str(params.get("taskType") or "ping")
    payload = params.get("payload") if isinstance(params.get("payload"), dict) else {}
    try:
        task = task_repo.create_task(db, user.id, task_type, payload)
        return {"taskId": getattr(task, "id", None), "taskType": task_type}
    except Exception as exc:  # noqa: BLE001
        return {"error": f"任务创建失败：{exc}"}


ACTION_HANDLERS: dict[str, Handler] = {
    "create_notification": _h_create_notification,
    "create_action_item": _h_create_action_item,
    "generate_report": _h_generate_report,
    "run_agent": _h_run_agent,
    "add_memory": _h_add_memory,
    "call_webhook": _h_call_webhook,
    "create_task": _h_create_task,
}


# --------------------------------------------------------------------------- #
# 对外接口
# --------------------------------------------------------------------------- #
def execute_action(db: Session, user: User, action: dict, context: dict | None = None) -> dict:
    """执行单个动作，异常一律吞掉并以结构化结果返回。"""
    context = context or {}
    atype = str((action or {}).get("type") or "")
    handler = ACTION_HANDLERS.get(atype)
    started = datetime.now(timezone.utc)
    if handler is None:
        return {
            "type": atype,
            "label": ACTION_LABELS.get(atype, atype),
            "status": "failed",
            "error": f"未知动作类型：{atype or '(空)'}",
            "durationMs": 0,
        }
    try:
        params = _params((action or {}).get("params") or {}, context)
        result = handler(db, user, params, context)
        status = "failed" if isinstance(result, dict) and result.get("error") else "success"
    except Exception as exc:  # noqa: BLE001
        logger.exception("action_failed: %s", atype)
        try:
            db.rollback()
        except Exception:  # noqa: BLE001
            pass
        result = {"error": str(exc)[:300]}
        status = "failed"
    return {
        "type": atype,
        "label": ACTION_LABELS.get(atype, atype),
        "status": status,
        "result": result,
        "durationMs": int((datetime.now(timezone.utc) - started).total_seconds() * 1000),
    }


def execute_actions(db: Session, user: User, actions: list[dict], context: dict | None = None) -> list[dict]:
    """顺序执行动作链，单个失败不影响后续动作。"""
    out: list[dict] = []
    for action in actions or []:
        out.append(execute_action(db, user, action, context))
    return out
