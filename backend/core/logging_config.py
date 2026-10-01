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
_IP_KEY = re.compile(r"(^ip$|client_ip|remote_addr|real_ip)", re.IGNORECASE)
_MASK = "***"

_CONFIGURED: dict[str, bool] = {}


def _mask_ip(value: object) -> object:
    """IP 属个人数据：日志中只保留网段前缀，避免长期明文留存。"""
    if not isinstance(value, str):
        return value
    text = value.strip()
    if ":" in text:
        parts = text.split(":")
        return f"{parts[0]}::/16" if parts and parts[0] else _MASK
    octets = text.split(".")
    if len(octets) == 4:
        return f"{octets[0]}.{octets[1]}.x.x"
    return text or _MASK


def _redact(obj):
    if isinstance(obj, dict):
        out = {}
        for key, value in obj.items():
            if _SENSITIVE.search(str(key)):
                out[key] = _MASK
            elif _IP_KEY.search(str(key)):
                out[key] = _mask_ip(value)
            else:
                out[key] = _redact(value)
        return out
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
