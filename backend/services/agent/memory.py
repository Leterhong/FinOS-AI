"""Agent 运行记忆（Phase 7.0.2 需求五）。

编排过程中的临时上下文（scratch memory），按 task_id 隔离。
最终结构化结果落 AgentTask.result；关键结论可选写入长期 Memory 表。
"""
from __future__ import annotations

import time
from collections import OrderedDict
from dataclasses import dataclass, field
from threading import Lock

# 编排任务通常秒级结束，正常路径由 service.py 的 finally 显式 clear()。
# 这两个上限只是为了兜住异常路径（进程被打断、clear 未执行）导致的内存泄漏。
MAX_SESSIONS = 256
SESSION_TTL_SECONDS = 30 * 60


@dataclass
class ScratchMemory:
    task_id: str
    notes: list[str] = field(default_factory=list)
    context: dict = field(default_factory=dict)
    created_at: float = field(default_factory=time.monotonic)

    def add(self, note: str) -> None:
        self.notes.append(note)

    def put(self, key: str, value) -> None:
        self.context[key] = value

    def get(self, key: str, default=None):
        return self.context.get(key, default)

    def to_dict(self) -> dict:
        return {"taskId": self.task_id, "notes": self.notes, "context": self.context}


_sessions: "OrderedDict[str, ScratchMemory]" = OrderedDict()
_lock = Lock()


def _evict_locked() -> None:
    """淘汰过期会话；仍超量则按 LRU 丢弃最旧的。调用方必须已持锁。"""
    now = time.monotonic()
    for key in [
        k for k, v in _sessions.items() if now - v.created_at > SESSION_TTL_SECONDS
    ]:
        _sessions.pop(key, None)
    while len(_sessions) > MAX_SESSIONS:
        _sessions.popitem(last=False)


def for_task(task_id: str) -> ScratchMemory:
    with _lock:
        existing = _sessions.get(task_id)
        if existing is not None:
            _sessions.move_to_end(task_id)
            return existing
        created = ScratchMemory(task_id)
        _sessions[task_id] = created
        _evict_locked()
        return created


def clear(task_id: str) -> None:
    with _lock:
        _sessions.pop(task_id, None)


def active_count() -> int:
    """当前驻留的 scratch 会话数（供健康检查/诊断使用）。"""
    with _lock:
        return len(_sessions)
