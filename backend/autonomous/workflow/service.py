# -*- coding: utf-8 -*-
"""
backend/autonomous/workflow/service.py — Phase 7.4 需求十二：自动化工作流编辑器。

工作流 = 一串「如果……那么……（否则……）」节点，用户在前端拖配，后端按序执行。

steps 结构：
[
  {
    "name": "收入骤降应急",
    "if":   {"conditions": [{"metric":"income_change_pct","op":"drop_pct","threshold":30}],
             "match": "all"},
    "then": [{"type":"create_notification","params":{...}},
             {"type":"run_agent","params":{"agent":"cashflow"}}],
    "else": [],
    "stopOnMatch": false
  }
]

执行语义：
  - 节点条件不满足 → 走 else 分支（可为空）并继续；
  - 节点条件满足且 stopOnMatch=true → 执行 then 后立即结束（用于优先级分流）；
  - 任一动作失败被隔离，工作流继续跑完剩余节点，最终状态标记为 partial。
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.autonomous.executor.service import execute_actions
from backend.autonomous.models import AutomationRun, AutomationWorkflow
from backend.autonomous.trigger.service import build_metrics, describe_condition, evaluate_conditions
from backend.intelligence.context import WealthContext, build_context
from backend.user.models import User

logger = logging.getLogger("finos.autonomous.workflow")


# --------------------------------------------------------------------------- #
# 预置模板（一键创建，降低上手门槛）
# --------------------------------------------------------------------------- #
WORKFLOW_TEMPLATES = [
    {
        "key": "income_drop_guard",
        "name": "收入骤降应急预案",
        "description": "如果月收入较上次快照下降超过 30%，立即提醒并运行现金流与投资智能体。",
        "steps": [
            {
                "name": "收入下降 30%",
                "if": {
                    "conditions": [{"metric": "income_change_pct", "op": "drop_pct", "threshold": 30}],
                    "match": "all",
                },
                "then": [
                    {
                        "type": "create_notification",
                        "params": {
                            "title": "收入大幅下降，已启动应急分析",
                            "body": "检测到月收入下降超过 30%（{{event.summary}}），AI 已自动重算现金流与投资风险。",
                            "category": "risk",
                            "priority": "critical",
                        },
                    },
                    {"type": "run_agent", "params": {"agent": "cashflow"}},
                    {"type": "run_agent", "params": {"agent": "investment"}},
                ],
                "else": [],
            }
        ],
    },
    {
        "key": "asset_drawdown_alert",
        "name": "资产回撤预警",
        "description": "如果总资产下降超过 10%，生成高优先级提醒与行动项。",
        "steps": [
            {
                "name": "总资产回撤 10%",
                "if": {
                    "conditions": [{"metric": "asset_change_pct", "op": "drop_pct", "threshold": 10}],
                    "match": "all",
                },
                "then": [
                    {
                        "type": "create_notification",
                        "params": {
                            "title": "总资产出现明显回撤",
                            "body": "{{event.summary}}",
                            "category": "wealth",
                            "priority": "high",
                        },
                    },
                    {
                        "type": "create_action_item",
                        "params": {
                            "title": "复核资产回撤原因并确认是否需要再平衡",
                            "detail": "{{event.summary}}",
                            "category": "wealth",
                            "priority": "high",
                            "dueInDays": 3,
                        },
                    },
                ],
                "else": [],
            }
        ],
    },
    {
        "key": "overspend_control",
        "name": "支出超标管控",
        "description": "如果月支出上升超过 20% 或储蓄率低于 10%，提示优化消费结构。",
        "steps": [
            {
                "name": "支出异常",
                "if": {
                    "conditions": [
                        {"metric": "expense_change_pct", "op": "rise_pct", "threshold": 20},
                        {"metric": "savings_rate", "op": "lt", "threshold": 0.1},
                    ],
                    "match": "any",
                },
                "then": [
                    {"type": "run_agent", "params": {"agent": "cashflow"}},
                    {
                        "type": "create_action_item",
                        "params": {
                            "title": "梳理本月增量支出并设定下月预算上限",
                            "category": "wealth",
                            "priority": "medium",
                            "dueInDays": 7,
                        },
                    },
                ],
                "else": [],
            }
        ],
    },
]


def list_templates() -> list[dict]:
    return [
        {"key": t["key"], "name": t["name"], "description": t["description"], "stepCount": len(t["steps"])}
        for t in WORKFLOW_TEMPLATES
    ]


def get_template(key: str) -> dict | None:
    for t in WORKFLOW_TEMPLATES:
        if t["key"] == key:
            return t
    return None


# --------------------------------------------------------------------------- #
# 执行
# --------------------------------------------------------------------------- #
def describe_step(step: dict) -> str:
    conds = ((step or {}).get("if") or {}).get("conditions") or []
    match = ((step or {}).get("if") or {}).get("match") or "all"
    joiner = " 或 " if str(match).lower() == "any" else " 且 "
    cond_text = joiner.join(describe_condition(c) for c in conds) or "无条件"
    then_text = "、".join(str(a.get("type")) for a in (step or {}).get("then") or []) or "无动作"
    return f"如果 {cond_text}，那么 {then_text}"


def run_workflow(
    db: Session,
    user: User,
    wf: AutomationWorkflow,
    context: dict | None = None,
    ctx: WealthContext | None = None,
    *,
    persist_run: bool = True,
) -> dict:
    context = dict(context or {})
    context["sourceId"] = wf.id
    ctx = ctx or build_context(db, user)
    event = context.get("event") or {}
    metrics = build_metrics(ctx, None)
    # 把事件字段并进指标，便于条件里直接引用
    for k in ("event_type", "severity", "metric", "change_pct", "prev_value", "new_value"):
        if k in event:
            metrics[k] = event[k]
    if event.get("metric") == "monthly_income":
        metrics["income_change_pct"] = event.get("changePct")
    if event.get("metric") == "monthly_expense":
        metrics["expense_change_pct"] = event.get("changePct")
    if event.get("metric") == "total_assets":
        metrics["asset_change_pct"] = event.get("changePct")

    trace: list[dict] = []
    total_actions = 0
    failed_actions = 0
    llm_called = False

    for idx, step in enumerate(wf.step_list()):
        if not isinstance(step, dict):
            continue
        cond_block = step.get("if") or {}
        matched = evaluate_conditions(
            cond_block.get("conditions") or [], metrics, match=str(cond_block.get("match") or "all")
        )
        branch = "then" if matched else "else"
        actions = step.get(branch) or []
        results = execute_actions(db, user, actions, context) if actions else []
        total_actions += len(results)
        failed_actions += sum(1 for r in results if r.get("status") == "failed")
        llm_called = llm_called or any(
            bool((r.get("result") or {}).get("llmCalled")) for r in results if isinstance(r.get("result"), dict)
        )
        trace.append(
            {
                "index": idx,
                "name": step.get("name") or f"节点 {idx + 1}",
                "描述": describe_step(step),
                "matched": matched,
                "branch": branch,
                "actions": results,
            }
        )
        if matched and bool(step.get("stopOnMatch")):
            break

    status = "success"
    if total_actions and failed_actions == total_actions:
        status = "failed"
    elif failed_actions:
        status = "partial"
    elif not total_actions:
        status = "skipped"

    now = datetime.now(timezone.utc)
    wf.last_run_at = now
    wf.run_count = (wf.run_count or 0) + 1

    run_id = None
    if persist_run:
        run = AutomationRun(
            user_id=user.id,
            source="workflow",
            source_id=wf.id,
            name=wf.name,
            status="success" if status in ("success", "skipped") else status,
            tier=wf.tier,
            llm_called=llm_called,
            message=f"执行 {len(trace)} 个节点，命中 {sum(1 for t in trace if t['matched'])} 个，动作失败 {failed_actions} 个",
        )
        db.add(run)
        run_id = run.id
    db.commit()

    return {
        "workflowId": wf.id,
        "name": wf.name,
        "status": status,
        "runId": run_id,
        "matchedSteps": sum(1 for t in trace if t["matched"]),
        "totalSteps": len(trace),
        "actionsExecuted": total_actions,
        "actionsFailed": failed_actions,
        "trace": trace,
        "ranAt": now.isoformat(),
    }


def run_workflows_for_event(db: Session, user: User, event: dict) -> list[dict]:
    """事件触发全部启用中的工作流。"""
    workflows = list(
        db.scalars(
            select(AutomationWorkflow).where(
                AutomationWorkflow.user_id == user.id, AutomationWorkflow.enabled.is_(True)
            )
        ).all()
    )
    out: list[dict] = []
    ctx = build_context(db, user)
    for wf in workflows:
        try:
            out.append(run_workflow(db, user, wf, {"event": event}, ctx))
        except Exception:  # noqa: BLE001
            logger.exception("workflow_failed: %s", wf.id)
    return out
