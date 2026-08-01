"""任务 #290 自测脚本：

1. 构造合成 .data（临时目录）并加密 models/financial 信封（与前端 Node 参数一致）。
2. 指向临时 SQLite，跑 run_legacy_import 两次，断言第二次全 skipped、无重复行。
3. 断言 assets/transactions/memories/model_configs 行数正确、api_key 可被解密回原文。
4. 校验前端 scrypt 密码哈希可被 verify_password 识别（legacy 回退）。

用法（项目根，PYTHONPATH=.）：
  python scripts/verify290.py
"""
from __future__ import annotations

import hashlib
import json
import os
import tempfile
from pathlib import Path

# 必须在导入 backend 之前设置 DATABASE_URL（settings 惰性缓存）
_TMP = Path(tempfile.mkdtemp(prefix="finos290_"))
_DB = _TMP / "test290.db"
os.environ["DATABASE_URL"] = f"sqlite:///{_DB.as_posix()}"

ROOT = Path(__file__).resolve().parents[1]
from backend.config import get_settings  # noqa: E402

get_settings()  # 触发 .env 读取（含 ENCRYPTION_MASTER_KEY）

from backend.ai.models import AIModelConfig  # noqa: E402
from backend.core.security import decrypt_secret, verify_password  # noqa: E402
from backend.database import SessionLocal, init_db  # noqa: E402
from sqlalchemy import func, select  # noqa: E402
from backend.document.models import Document  # noqa: E402
from backend.financial.models import Asset, FinancialProfile, Transaction  # noqa: E402
from backend.memory.models import Memory  # noqa: E402
from backend.migration.legacy_codec import (  # noqa: E402
    FINANCIAL_SALT,
    MODEL_CENTER_SALT,
    encrypt_envelope,
    encrypt_envelope_text,
)
from backend.migration.legacy_import import run_legacy_import  # noqa: E402
from backend.user.models import User  # noqa: E402


UID = "user-verify-290"
PLAIN_KEY = "sk-verify-290-abcdefghij"
PLAIN_PW = "Sup3rSecret!"
PW_SALT = os.urandom(16)
PW_HASH = hashlib.scrypt(PLAIN_PW.encode(), salt=PW_SALT, n=16384, r=8, p=1, dklen=64).hex()


def build_synthetic_data() -> Path:
    d = _TMP / ".data"
    (d / "users").mkdir(parents=True)
    (d / "financial_profiles").mkdir(parents=True)
    (d / "financial").mkdir(parents=True)
    (d / "memory").mkdir(parents=True)
    (d / "documents" / UID).mkdir(parents=True)
    (d / "models").mkdir(parents=True)

    (d / "users" / f"{UID}.json").write_text(
        json.dumps(
            {
                "id": UID,
                "email": "verify290@example.com",
                "name": "Verify",
                "passwordHash": PW_HASH,
                "passwordSalt": PW_SALT.hex(),
                "profileCompleted": True,
                "createdAt": 1700000000000,
                "updatedAt": 1700000000000,
                "avatarUrl": None,
            },
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )

    (d / "financial_profiles" / f"{UID}.json").write_text(
        json.dumps(
            {
                "id": "wp-verify-1",
                "userId": UID,
                "name": "Verify",
                "age": 30,
                "occupation": "dev",
                "city": "BJ",
                "income": 5000,
                "expense": 2000,
                "investment": 1000,
                "assets": {"cash": 10000, "stocks": 0, "funds": 0, "realEstate": 0, "other": 0},
                "liabilities": {"mortgage": 0, "loans": 0, "other": 0},
                "goals": {"retirementAge": 60, "targetAmount": 1000000, "lifeGoal": "财富自由"},
                "completed": True,
                "createdAt": 1700000000000,
                "updatedAt": 1700000000000,
            },
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )

    (d / "financial" / f"{UID}.json.enc").write_text(
        json.dumps(
            encrypt_envelope(
                {
                    "userId": UID,
                    "transactions": [
                        {"id": "tx-1", "date": "2026-01-01", "amount": 100, "direction": "income", "category": "salary", "merchant": "x", "description": "d", "rawType": "", "source": "manual", "confidence": 1, "classifiedBy": "manual", "importId": "i1"},
                        {"id": "tx-2", "date": "2026-01-02", "amount": -50, "direction": "expense", "category": "food", "merchant": "y", "description": "d", "rawType": "", "source": "manual", "confidence": 1, "classifiedBy": "manual", "importId": "i1"},
                    ],
                    "holdings": [
                        {"id": "hold-1", "userId": UID, "name": "基金A", "type": "fund", "marketValue": 8000, "source": "manual", "importId": "i1"},
                    ],
                    "policies": [
                        {"id": "pol-1", "userId": UID, "insurer": "平安", "productName": "重疾险", "coverage": 500000, "source": "manual", "importId": "i1"},
                    ],
                    "imports": [],
                    "updatedAt": "2026-01-02T00:00:00.000Z",
                    "version": 2,
                },
                "secret",
                FINANCIAL_SALT,
            ),
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )

    (d / "memory" / f"{UID}.json").write_text(
        json.dumps(
            {
                "userId": UID,
                "profile": [{"id": "mem-p1", "timestamp": 1700000000000, "note": "p"}],
                "goal": [{"id": "mem-g1", "timestamp": 1700000000000, "goalType": "退休", "label": "退休", "note": "退休"}],
                "financial": [{"id": "mem-f1", "timestamp": 1700000000000, "changeNote": "调仓"}],
                "decision": [{"id": "mem-d1", "timestamp": 1700000000000, "decision": "买入"}],
                "preferences": {"risk": "balanced"},
            },
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )

    (d / "documents" / UID / "index.json").write_text(
        json.dumps(
            [
                {"id": "doc-1", "userId": UID, "fileName": "stmt.csv", "storedName": "doc-1.csv", "mimeType": "text/csv", "size": 100, "category": "asset_proof", "uploadedAt": 1700000000000, "ragStatus": "uploaded"},
            ],
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )

    (d / "models" / f"{UID}.json.enc").write_text(
        json.dumps(
            encrypt_envelope(
                {
                    "userId": UID,
                    "configs": [
                        {
                            "id": "cfg-1",
                            "userId": UID,
                            "providerName": "openai",
                            "providerType": "openai-compatible",
                            "displayName": "GPT",
                            "modelName": "gpt-4o",
                            "modelId": "gpt-4o",
                            "baseUrl": "https://api.openai.com/v1",
                            "encryptedApiKey": encrypt_envelope_text(PLAIN_KEY, "secret", MODEL_CENTER_SALT),
                            "status": "online",
                            "isDefault": True,
                            "roles": ["default"],
                            "createdAt": "2026-01-01T00:00:00.000Z",
                            "updatedAt": "2026-01-01T00:00:00.000Z",
                        }
                    ],
                    "updatedAt": "2026-01-01T00:00:00.000Z",
                },
                "secret",
                FINANCIAL_SALT,
            ),
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )
    return d


def count(db, model) -> int:
    return db.scalar(select(func.count()).select_from(model)) or 0


def main() -> int:
    data_dir = build_synthetic_data()
    init_db()

    # 第一次
    db = SessionLocal()
    s1 = run_legacy_import(str(data_dir), db, finos_data_key="secret")
    db.commit()
    db.close()

    # 第二次（应全部 skipped）
    db = SessionLocal()
    s2 = run_legacy_import(str(data_dir), db, finos_data_key="secret")
    db.commit()
    db.close()

    db = SessionLocal()
    n_users = count(db, User)
    n_profiles = count(db, FinancialProfile)
    n_assets = count(db, Asset)
    n_tx = count(db, Transaction)
    n_mem = count(db, Memory)
    n_doc = count(db, Document)
    n_cfg = count(db, AIModelConfig)
    db.close()

    print("== 第一次统计 ==")
    print(json.dumps(s1, ensure_ascii=False))
    print("== 第二次统计 ==")
    print(json.dumps(s2, ensure_ascii=False))
    print(f"行数: users={n_users} profiles={n_profiles} assets={n_assets} "
          f"tx={n_tx} mem={n_mem} doc={n_doc} cfg={n_cfg}")

    # 校验 api_key 可解密回原文
    db = SessionLocal()
    cfg = db.scalar(select(AIModelConfig).where(AIModelConfig.user_id == UID))
    decrypted = decrypt_secret(cfg.api_key_encrypted) if cfg else None
    db.close()

    # 校验 legacy 密码回退
    db = SessionLocal()
    u = db.scalar(select(User).where(User.id == UID))
    pw_ok = verify_password(PLAIN_PW, u.password_hash) if u else False
    db.close()

    ok = (
        s2["users"] == 0 and s2["profiles"] == 0 and s2["assets"] == 0
        and s2["transactions"] == 0 and s2["memories"] == 0 and s2["documents"] == 0
        and s2["model_configs"] == 0 and s2["skipped"] > 0
        and n_users == 1 and n_profiles == 1 and n_assets == 2 and n_tx == 2
        and n_mem == 5 and n_doc == 1 and n_cfg == 1
        and decrypted == PLAIN_KEY and pw_ok
    )
    print(f"api_key 解密: {decrypted!r} == {PLAIN_KEY!r} -> {decrypted == PLAIN_KEY}")
    print(f"legacy 密码校验: {pw_ok}")
    print("RESULT:", "PASS" if ok else "FAIL")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
