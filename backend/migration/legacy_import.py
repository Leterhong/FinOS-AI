"""前端 Node 侧 .data 历史数据迁移到 FastAPI 后端（Phase 7.0.2, 任务 #290）。

幂等：所有写入按前端既有 id（或 user_id+稳定特征）去重；重复运行结果不变。
用户隔离：所有行带 user_id；.data 的 userId 直接作为后端 ``users.id``。

设计要点：
- 不在此函数内 commit；由调用方决定 commit（正式）或 rollback（dry-run）。
- 单文件 / 单 userId 解析失败不中断整体，记入 errors 继续。
"""
from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from sqlalchemy import select

from backend.ai.models import AIModelConfig
from backend.core.security import encrypt_secret, hash_password, is_legacy_password_hash, mask_key
from backend.document.models import Document
from backend.financial.models import Asset, FinancialProfile, Transaction
from backend.memory.models import Memory
from backend.migration.legacy_codec import (
    DEV_FALLBACK_SECRET,
    FINANCIAL_SALT,
    MODEL_CENTER_SALT,
    decrypt_envelope,
    is_envelope,
    parse_maybe_encrypted,
)
from backend.user.models import User


# --------------------------------------------------------------------------- #
# 工具
# --------------------------------------------------------------------------- #
def _now() -> datetime:
    return datetime.now(timezone.utc)


def _to_dt(value: Any, default: datetime | None = None) -> datetime | None:
    """前端时间戳可能是 epoch 毫秒（int）或 ISO 字符串。"""
    if value is None:
        return default
    if isinstance(value, (int, float)):
        try:
            return datetime.fromtimestamp(value / 1000, tz=timezone.utc)
        except (OverflowError, OSError, ValueError):
            return default
    if isinstance(value, str):
        s = value.strip()
        if not s:
            return default
        try:
            return datetime.fromisoformat(s.replace("Z", "+00:00"))
        except ValueError:
            try:
                return datetime.fromtimestamp(float(s) / 1000, tz=timezone.utc)
            except (ValueError, OSError):
                return default
    return default


def _exists(db, model, id_: str) -> bool:
    return db.scalar(select(model.id).where(model.id == id_)) is not None


def _read_json(path: Path) -> Any:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def _read_text(path: Path) -> str:
    with open(path, "r", encoding="utf-8") as f:
        return f.read()


def _secret(finos_data_key: str | None) -> str:
    return finos_data_key or DEV_FALLBACK_SECRET


def _gather_user_ids(data_dir: Path) -> set[str]:
    """汇总所有目录里出现的 userId（users 目录是账户创建的主来源）。"""
    ids: set[str] = set()

    def add_dir(sub: str, suffix: str = "") -> None:
        d = data_dir / sub
        if not d.is_dir():
            return
        for p in d.iterdir():
            if p.is_file() and p.name.endswith(".json" + suffix):
                name = p.name[: -len(".json" + suffix)]
                if not name.startswith("_"):
                    ids.add(name)
            elif p.is_dir() and sub == "documents":
                ids.add(p.name)

    add_dir("users")
    add_dir("financial_profiles")
    add_dir("financial", ".enc")
    add_dir("memory")
    add_dir("documents")
    add_dir("models", ".enc")
    return ids


# --------------------------------------------------------------------------- #
# 各实体迁移
# --------------------------------------------------------------------------- #
def _migrate_user(db, user_id: str, stats: dict, errors: list, secret: str) -> None:
    path = Path(_data_root) / "users" / f"{user_id}.json"
    record = None
    if path.is_file():
        try:
            record = _read_json(path)
        except Exception as exc:  # noqa: BLE001
            errors.append(f"users/{user_id}: 读取失败 {exc}")
            return

    # 已存在则不动密码、跳过计 skipped
    if _exists(db, User, user_id):
        stats["skipped"] += 1
        return

    if record is None:
        # 仅有业务数据但无账户文件：创建占位账户，保证外键成立（密码不可登录）
        user = User(
            id=user_id,
            email=f"{user_id}@legacy.local",
            password_hash=hash_password(uuid.uuid4().hex),
            created_at=_now(),
        )
        db.add(user)
        stats["users"] += 1
        return

    try:
        password_hash = record.get("passwordHash")
        password_salt = record.get("passwordSalt")
        if password_hash and password_salt:
            pwd = f"scrypt:v1:{password_salt}:{password_hash}"
        else:
            pwd = hash_password(uuid.uuid4().hex)
        user = User(
            id=user_id,
            email=record.get("email") or f"{user_id}@legacy.local",
            password_hash=pwd,
            avatar=record.get("avatarUrl"),
            created_at=_to_dt(record.get("createdAt"), default=_now()),
        )
        db.add(user)
        stats["users"] += 1
    except Exception as exc:  # noqa: BLE001
        errors.append(f"users/{user_id}: 写入失败 {exc}")


def _migrate_profile(db, user_id: str, stats: dict, errors: list) -> None:
    path = Path(_data_root) / "financial_profiles" / f"{user_id}.json"
    if not path.is_file():
        return
    try:
        rec = _read_json(path)
    except Exception as exc:  # noqa: BLE001
        errors.append(f"financial_profiles/{user_id}: 读取失败 {exc}")
        return
    pid = rec.get("id") or user_id
    if _exists(db, FinancialProfile, pid):
        stats["skipped"] += 1
        return
    try:
        goals = rec.get("goals") or {}
        life_goal = goals.get("lifeGoal") or ""
        profile = FinancialProfile(
            id=pid,
            user_id=user_id,
            age=rec.get("age"),
            income=float(rec.get("income") or 0),
            expense=float(rec.get("expense") or 0),
            risk_level="balanced",
            goal=(life_goal[:500] if isinstance(life_goal, str) else None),
            created_at=_to_dt(rec.get("createdAt"), default=_now()),
        )
        db.add(profile)
        stats["profiles"] += 1
    except Exception as exc:  # noqa: BLE001
        errors.append(f"financial_profiles/{user_id}: 写入失败 {exc}")


def _migrate_financial(db, user_id: str, stats: dict, errors: list, secret: str) -> None:
    path = Path(_data_root) / "financial" / f"{user_id}.json.enc"
    if not path.is_file():
        return
    try:
        text = _read_text(path)
        record = parse_maybe_encrypted(text, secret, FINANCIAL_SALT)
    except Exception as exc:  # noqa: BLE001
        errors.append(f"financial/{user_id}.enc: 解密失败 {exc}")
        return

    record_ts = _to_dt(record.get("updatedAt"), default=_now())
    if not isinstance(record, dict):
        errors.append(f"financial/{user_id}.enc: 结构异常")
        return

    # 交易
    for tx in record.get("transactions", []) or []:
        if not isinstance(tx, dict):
            continue
        tid = tx.get("id")
        if not tid or _exists(db, Transaction, tid):
            stats["skipped"] += 1 if tid else 0
            continue
        try:
            date_str = tx.get("date")
            dt = _to_dt(date_str, default=_now()) if not isinstance(date_str, str) else datetime.fromisoformat(
                date_str + "T00:00:00+00:00"
            )
        except Exception:  # noqa: BLE001
            dt = _now()
        try:
            db.add(
                Transaction(
                    id=tid,
                    user_id=user_id,
                    type=tx.get("direction") or "other",
                    amount=abs(float(tx.get("amount") or 0)),
                    category=tx.get("category") or "other",
                    date=dt,
                )
            )
            stats["transactions"] += 1
        except Exception as exc:  # noqa: BLE001
            errors.append(f"financial/{user_id} tx {tid}: {exc}")

    # 持仓 / 保单 → assets
    for h in record.get("holdings", []) or []:
        if not isinstance(h, dict):
            continue
        hid = h.get("id")
        if not hid or _exists(db, Asset, hid):
            stats["skipped"] += 1 if hid else 0
            continue
        try:
            db.add(
                Asset(
                    id=hid,
                    user_id=user_id,
                    type=h.get("type") or "other",
                    name=h.get("name") or "未命名资产",
                    amount=float(h.get("marketValue") or 0),
                    source=h.get("source") or "import",
                    created_at=record_ts,
                )
            )
            stats["assets"] += 1
        except Exception as exc:  # noqa: BLE001
            errors.append(f"financial/{user_id} holding {hid}: {exc}")

    for p in record.get("policies", []) or []:
        if not isinstance(p, dict):
            continue
        pid = p.get("id")
        if not pid or _exists(db, Asset, pid):
            stats["skipped"] += 1 if pid else 0
            continue
        try:
            name = f"{p.get('insurer', '')} {p.get('productName', '')}".strip() or "未命名保单"
            db.add(
                Asset(
                    id=pid,
                    user_id=user_id,
                    type="insurance",
                    name=name,
                    amount=float(p.get("coverage") or 0),
                    source=p.get("source") or "import",
                    created_at=record_ts,
                )
            )
            stats["assets"] += 1
        except Exception as exc:  # noqa: BLE001
            errors.append(f"financial/{user_id} policy {pid}: {exc}")


def _migrate_memory(db, user_id: str, stats: dict, errors: list) -> None:
    path = Path(_data_root) / "memory" / f"{user_id}.json"
    if not path.is_file():
        return
    try:
        rec = _read_json(path)
    except Exception as exc:  # noqa: BLE001
        errors.append(f"memory/{user_id}: 读取失败 {exc}")
        return
    if not isinstance(rec, dict):
        return

    buckets = {
        "profile": rec.get("profile", []) or [],
        "goal": rec.get("goal", []) or [],
        "financial": rec.get("financial", []) or [],
        "decision": rec.get("decision", []) or [],
    }
    for mtype, items in buckets.items():
        for i, entry in enumerate(items):
            if not isinstance(entry, dict):
                continue
            mid = entry.get("id") or f"{user_id}-{mtype}-{i}"
            if _exists(db, Memory, mid):
                stats["skipped"] += 1
                continue
            try:
                db.add(
                    Memory(
                        id=mid,
                        user_id=user_id,
                        memory_type=mtype,
                        content=json.dumps(entry, ensure_ascii=False),
                        created_at=_to_dt(entry.get("timestamp"), default=_now()),
                    )
                )
                stats["memories"] += 1
            except Exception as exc:  # noqa: BLE001
                errors.append(f"memory/{user_id} {mtype} {mid}: {exc}")

    # preferences 整体作为一条 preference 记忆
    prefs = rec.get("preferences")
    if isinstance(prefs, dict) and prefs:
        pid = f"{user_id}-preferences"
        if not _exists(db, Memory, pid):
            try:
                db.add(
                    Memory(
                        id=pid,
                        user_id=user_id,
                        memory_type="preference",
                        content=json.dumps(prefs, ensure_ascii=False),
                        created_at=_now(),
                    )
                )
                stats["memories"] += 1
            except Exception as exc:  # noqa: BLE001
                errors.append(f"memory/{user_id} preferences: {exc}")


def _migrate_documents(db, user_id: str, stats: dict, errors: list) -> None:
    path = Path(_data_root) / "documents" / user_id / "index.json"
    if not path.is_file():
        return
    try:
        rec = _read_json(path)
    except Exception as exc:  # noqa: BLE001
        errors.append(f"documents/{user_id}: 读取失败 {exc}")
        return
    items = rec if isinstance(rec, list) else (rec.get("items") if isinstance(rec, dict) else [])
    if not isinstance(items, list):
        return
    for doc in items:
        if not isinstance(doc, dict):
            continue
        did = doc.get("id")
        if not did or _exists(db, Document, did):
            stats["skipped"] += 1 if did else 0
            continue
        try:
            db.add(
                Document(
                    id=did,
                    user_id=user_id,
                    filename=doc.get("fileName") or "unknown",
                    storage_path=doc.get("storedName") or doc.get("fileName") or "",
                    status=doc.get("ragStatus") or "uploaded",
                    created_at=_to_dt(doc.get("uploadedAt"), default=_now()),
                )
            )
            stats["documents"] += 1
        except Exception as exc:  # noqa: BLE001
            errors.append(f"documents/{user_id} {did}: {exc}")


def _migrate_models(db, user_id: str, stats: dict, errors: list, secret: str) -> None:
    path = Path(_data_root) / "models" / f"{user_id}.json.enc"
    if not path.is_file():
        return
    try:
        text = _read_text(path)
        file_obj = parse_maybe_encrypted(text, secret, FINANCIAL_SALT)
    except Exception as exc:  # noqa: BLE001
        errors.append(f"models/{user_id}.enc: 解密失败 {exc}")
        return
    if not isinstance(file_obj, dict):
        errors.append(f"models/{user_id}.enc: 结构异常")
        return
    configs = file_obj.get("configs") or []
    file_ts = _to_dt(file_obj.get("updatedAt"), default=_now())
    for cfg in configs:
        if not isinstance(cfg, dict):
            continue
        cid = cfg.get("id")
        if not cid or _exists(db, AIModelConfig, cid):
            stats["skipped"] += 1 if cid else 0
            continue
        try:
            # encryptedApiKey 是同结构信封，salt 为 finos-model-center-v1
            plain_key = ""
            ek = cfg.get("encryptedApiKey")
            if isinstance(ek, dict) and is_envelope(ek):
                plain_key = decrypt_envelope(ek, secret, MODEL_CENTER_SALT, as_json=False) or ""
            elif isinstance(ek, str) and ek:
                plain_key = ek
        except Exception as exc:  # noqa: BLE001
            errors.append(f"models/{user_id} key {cid}: 解密失败 {exc}")
            plain_key = ""
        try:
            db.add(
                AIModelConfig(
                    id=cid,
                    user_id=user_id,
                    name=cfg.get("displayName") or cfg.get("modelName") or cfg.get("providerName") or "未命名模型",
                    provider=cfg.get("providerType") or cfg.get("providerName") or "openai-compatible",
                    base_url=cfg.get("baseUrl") or "",
                    model_id=cfg.get("modelId") or "",
                    api_key_encrypted=encrypt_secret(plain_key),
                    key_mask=mask_key(plain_key),
                    is_default=bool(cfg.get("isDefault", False)),
                    status=cfg.get("status") or "unverified",
                    created_at=_to_dt(cfg.get("createdAt"), default=file_ts),
                )
            )
            stats["model_configs"] += 1
        except Exception as exc:  # noqa: BLE001
            errors.append(f"models/{user_id} {cid}: 写入失败 {exc}")


# --------------------------------------------------------------------------- #
# 入口
# --------------------------------------------------------------------------- #
_data_root: Path = Path(".")


def run_legacy_import(
    data_dir: str,
    db,
    *,
    finos_data_key: str | None = None,
    user_filter: str | None = None,
) -> dict:
    """迁移 .data 历史数据。幂等；不在此提交事务。"""
    global _data_root
    _data_root = Path(data_dir)
    secret = _secret(finos_data_key)

    stats = {
        "users": 0,
        "profiles": 0,
        "assets": 0,
        "transactions": 0,
        "memories": 0,
        "documents": 0,
        "model_configs": 0,
        "skipped": 0,
        "errors": [],
    }
    errors = stats["errors"]

    user_ids = _gather_user_ids(_data_root)
    if user_filter:
        user_ids = {u for u in user_ids if u == user_filter}
    # 稳定顺序，便于复现
    for user_id in sorted(user_ids):
        try:
            _migrate_user(db, user_id, stats, errors, secret)
            _migrate_profile(db, user_id, stats, errors)
            _migrate_financial(db, user_id, stats, errors, secret)
            _migrate_memory(db, user_id, stats, errors)
            _migrate_documents(db, user_id, stats, errors)
            _migrate_models(db, user_id, stats, errors, secret)
        except Exception as exc:  # noqa: BLE001
            errors.append(f"{user_id}: 未预期错误 {exc}")

    return stats
