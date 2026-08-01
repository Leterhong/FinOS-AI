"""Agent Registry（Phase 7.2 需求十）：动态注册 + 用户级开关。

- 进程内注册表：`register(AgentClass)` 或 `@agent` 装饰器。
- 用户开关来自 UserAgentConfig 表（需求十二 Agent Marketplace）。
- 未在表中出现的 Agent 采用其 default_enabled。
"""
from __future__ import annotations

import json

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.agents.base import BaseAgent
from backend.agents.models import UserAgentConfig
from backend.user.models import User

_REGISTRY: dict[str, type[BaseAgent]] = {}


def register(cls: type[BaseAgent]) -> type[BaseAgent]:
    """注册一个 Agent 类（重复注册以后者为准，便于热替换）。"""
    if not getattr(cls, "name", ""):
        raise ValueError("Agent 必须定义 name")
    _REGISTRY[cls.name] = cls
    return cls


agent = register  # 装饰器别名


def _load_builtin() -> None:
    """懒加载内置插件（放在函数内避免循环导入）。"""
    if _REGISTRY:
        return
    from backend.agents.plugins import load_all  # noqa: WPS433

    load_all()


def all_agents() -> dict[str, type[BaseAgent]]:
    _load_builtin()
    return dict(_REGISTRY)


def get_agent(name: str) -> BaseAgent | None:
    _load_builtin()
    cls = _REGISTRY.get(name)
    return cls() if cls else None


def list_meta() -> list[dict]:
    _load_builtin()
    return [cls.meta() for cls in _REGISTRY.values()]


# ------------------------------------------------------------------ 用户配置
def get_user_configs(db: Session, user: User) -> dict[str, UserAgentConfig]:
    rows = db.scalars(select(UserAgentConfig).where(UserAgentConfig.user_id == user.id))
    return {r.agent_name: r for r in rows}


def enabled_agents(db: Session, user: User) -> list[BaseAgent]:
    """返回该用户已启用的 Agent 实例，按 priority 升序。"""
    _load_builtin()
    configs = get_user_configs(db, user)
    out: list[tuple[int, BaseAgent]] = []
    for name, cls in _REGISTRY.items():
        cfg = configs.get(name)
        enabled = cfg.enabled if cfg is not None else cls.default_enabled
        if not enabled:
            continue
        priority = cfg.priority if cfg is not None else cls.priority
        out.append((priority, cls()))
    out.sort(key=lambda t: t[0])
    return [a for _, a in out]


def marketplace(db: Session, user: User) -> list[dict]:
    """Agent Marketplace 列表（需求十二）。"""
    _load_builtin()
    configs = get_user_configs(db, user)
    items = []
    for name, cls in _REGISTRY.items():
        cfg = configs.get(name)
        meta = cls.meta()
        try:
            settings = json.loads(cfg.settings) if cfg and cfg.settings else {}
        except json.JSONDecodeError:
            settings = {}
        meta.update(
            {
                "enabled": cfg.enabled if cfg is not None else cls.default_enabled,
                "priority": cfg.priority if cfg is not None else cls.priority,
                "focus": cfg.focus if cfg is not None else "",
                "settings": settings,
                "configured": cfg is not None,
            }
        )
        items.append(meta)
    items.sort(key=lambda m: (m["priority"], m["name"]))
    return items


def set_user_agent(
    db: Session,
    user: User,
    name: str,
    *,
    enabled: bool | None = None,
    priority: int | None = None,
    focus: str | None = None,
    settings: dict | None = None,
) -> dict:
    """开启/关闭/配置某个 Agent（需求十二）。"""
    _load_builtin()
    if name not in _REGISTRY:
        raise LookupError(f"未知的 Agent：{name}")
    cfg = db.scalar(
        select(UserAgentConfig).where(
            UserAgentConfig.user_id == user.id, UserAgentConfig.agent_name == name
        )
    )
    if cfg is None:
        cfg = UserAgentConfig(user_id=user.id, agent_name=name)
        db.add(cfg)
    if enabled is not None:
        cfg.enabled = bool(enabled)
    if priority is not None:
        cfg.priority = max(0, min(999, int(priority)))
    if focus is not None:
        cfg.focus = focus[:200]
    if settings is not None:
        cfg.settings = json.dumps(settings, ensure_ascii=False)[:4000]
    db.commit()
    return {
        "name": name,
        "enabled": cfg.enabled,
        "priority": cfg.priority,
        "focus": cfg.focus,
    }
