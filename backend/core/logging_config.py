"""统一日志（Phase 7.0.4 十四、日志系统）。

规则：
- 统一结构化日志（JSON 单行）。
- 禁止输出敏感数据：自动屏蔽 api_key / password / token / secret / authorization 等字段。
"""
from __future__ import annotations

import json
import logging
import re

_SENSITIVE = re.compile(r"(api[_-]?key|password|passwd|token|secret|authorization|key_mask|private)", re.IGNORECASE)
_MASK = "***"

_CONFIGURED: dict[str, bool] = {}


def _redact(obj):
    if isinstance(obj, dict):
        return {k: (_MASK if _SENSITIVE.search(str(k)) else _redact(v)) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_redact(v) for v in obj]
    if isinstance(obj, str) and _SENSITIVE.search(obj):
        return _MASK
    return obj


def get_logger(name: str) -> logging.Logger:
    """返回结构化日志器（每个 name 仅配置一次 handler）。"""
    logger = logging.getLogger(name)
    if not _CONFIGURED.get(name):
        if not logger.handlers:
            handler = logging.StreamHandler()
            handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s %(message)s"))
            logger.addHandler(handler)
            logger.setLevel(logging.INFO)
            logger.propagate = False
        _CONFIGURED[name] = True
    return logger


def log_struct(logger: logging.Logger, level: int, event: str, **fields) -> None:
    """结构化记录（自动脱敏）。"""
    payload = _redact(fields)
    payload["event"] = event
    logger.log(level, json.dumps(payload, ensure_ascii=False, default=str))


_LEVELS = {
    "debug": logging.DEBUG,
    "info": logging.INFO,
    "warning": logging.WARNING,
    "warn": logging.WARNING,
    "error": logging.ERROR,
    "critical": logging.CRITICAL,
}


def log_event(logger: logging.Logger, level: str, event: str, **fields) -> None:
    """便捷结构化记录：接受字符串级别（info/warning/error...），自动脱敏。

    示例：log_event(logger, "info", "auth.login.ok", user_id=uid, ip=ip)
    """
    log_struct(logger, _LEVELS.get(level.lower(), logging.INFO), event, **fields)
