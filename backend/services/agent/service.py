"""Agent 编排服务（Phase 7.0.2 需求五/六）：串联 planner → router → executor。

POST /api/agent/tasks 触发：建任务(pending) → 规划 → 路由 → 执行(running) → 完成(completed)，
全过程写 agent_tasks 表（status 状态机），支持断点查询。零 LLM 依赖可跑；
若用户配置了模型，末步用模型生成自然语言总结（可选增强）。
"""
from __future__ import annotations

import json
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.ai.gateway import GatewayError, generate_sync as gw_generate_sync
from backend.ai.models import AIModelConfig
from backend.services.agent.executor import execute
from backend.services.agent.memory import clear, for_task
from backend.services.agent.planner import plan, route
from backend.services.models import AgentTask
from backend.user.models import User


def _resolve_config(db: Session, user: User):
    cfg = db.scalar(select(AIModelConfig).where(AIModelConfig.user_id == user.id, AIModelConfig.is_default == True))  # noqa: E712
    return cfg or db.scalar(select(AIModelConfig).where(AIModelConfig.user_id == user.id))


def run_orchestration(db: Session, user: User, task_type: str, question: str) -> dict:
    task = AgentTask(user_id=user.id, task_type=task_type, status="pending")
    db.add(task)
    db.commit()
    db.refresh(task)
    task_id = task.id

    steps = plan(task_type, question)
    agents = route(steps)

    task.status = "running"
    db.commit()

    try:
        scratch = for_task(task_id)
        scratch.put("question", question)
        execution = execute(steps, user, db, task_id)

        # 可选 LLM 总结：配置了模型才调，否则返回纯结构化结果
        summary = None
        cfg = _resolve_config(db, user)
        if cfg is not None and question:
            from backend.core.security import decrypt_secret

            api_key = decrypt_secret(cfg.api_key_encrypted)
            if api_key:
                try:
                    gen = gw_generate_sync(
                        cfg.base_url,
                        api_key,
                        cfg.model_id,
                        [
                            {"role": "system", "content": "你是 FinOS AI 编排助手，用一句话总结本次多智能体任务结果。"},
                            {"role": "user", "content": f"任务类型：{task_type}\n问题：{question}\n执行结果：{json.dumps(execution, ensure_ascii=False)[:1500]}"},
                        ],
                        max_tokens=300,
                    )
                    summary = gen["content"]
                except GatewayError:
                    summary = None

        result = {
            "taskId": task_id,
            "taskType": task_type,
            "question": question,
            "agents": agents,
            "execution": execution,
            "summary": summary,
        }
        task.status = "completed"
        task.result = json.dumps(result, ensure_ascii=False, default=str)
        task.finished_at = datetime.now(timezone.utc)
        db.commit()
        return result
    except Exception as e:  # noqa: BLE001
        task.status = "failed"
        task.result = json.dumps({"error": str(e)}, ensure_ascii=False)
        task.finished_at = datetime.now(timezone.utc)
        db.commit()
        raise
    finally:
        clear(task_id)


def list_tasks(db: Session, user: User, limit: int = 50) -> list[dict]:
    rows = db.scalars(
        select(AgentTask).where(AgentTask.user_id == user.id).order_by(AgentTask.created_at.desc()).limit(limit)
    ).all()
    return [
        {
            "id": t.id,
            "taskType": t.task_type,
            "status": t.status,
            "createdAt": t.created_at.isoformat() if t.created_at else None,
            "finishedAt": t.finished_at.isoformat() if t.finished_at else None,
        }
        for t in rows
    ]


def get_task(db: Session, user: User, task_id: str) -> dict | None:
    t = db.scalar(select(AgentTask).where(AgentTask.id == task_id, AgentTask.user_id == user.id))
    if t is None:
        return None
    result = None
    if t.result:
        try:
            result = json.loads(t.result)
        except (json.JSONDecodeError, TypeError):
            result = {"raw": t.result}
    return {
        "id": t.id,
        "taskType": t.task_type,
        "status": t.status,
        "result": result,
        "createdAt": t.created_at.isoformat() if t.created_at else None,
        "finishedAt": t.finished_at.isoformat() if t.finished_at else None,
    }
