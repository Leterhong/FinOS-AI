"""迁移前端 Node 侧 .data 历史数据到后端数据库（任务 #290）。

用法：
  python deploy/scripts/migrate_legacy.py [--data-dir DIR] [--user UID]
      [--dry-run] [--finos-data-key KEY]

- 默认 data-dir 为项目根 .data
- FINOS_DATA_KEY 解析顺序：--finos-data-key > 环境变量 FINOS_DATA_KEY >
  .env.local 中的 FINOS_DATA_KEY > 开发降级密钥
- --dry-run：跑统计但不落库（事务回滚）
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from pathlib import Path

# 让脚本可直接以 `python deploy/scripts/migrate_legacy.py` 运行
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from backend.config import get_settings  # noqa: E402
from backend.database import SessionLocal, init_db  # noqa: E402
from backend.migration.legacy_import import run_legacy_import  # noqa: E402


def _resolve_finos_data_key(cli_value: str | None) -> str | None:
    if cli_value:
        return cli_value
    env = os.environ.get("FINOS_DATA_KEY")
    if env:
        return env
    env_local = ROOT / ".env.local"
    if env_local.is_file():
        text = env_local.read_text(encoding="utf-8")
        m = re.search(r"^FINOS_DATA_KEY\s*=\s*(.+?)\s*$", text, re.MULTILINE)
        if m:
            return m.group(1).strip().strip('"').strip("'")
    return None


def main() -> int:
    parser = argparse.ArgumentParser(description="迁移前端 .data 历史数据（任务 #290）")
    parser.add_argument("--data-dir", default=str(ROOT / ".data"), help=".data 根目录")
    parser.add_argument("--user", default=None, help="仅迁移指定 userId")
    parser.add_argument("--dry-run", action="store_true", help="只统计不落库（事务回滚）")
    parser.add_argument("--finos-data-key", default=None, help="FINOS_DATA_KEY；缺省读环境变量/.env.local")
    args = parser.parse_args()

    finos_data_key = _resolve_finos_data_key(args.finos_data_key)

    init_db()
    db = SessionLocal()
    try:
        stats = run_legacy_import(
            args.data_dir,
            db,
            finos_data_key=finos_data_key,
            user_filter=args.user,
        )
        if args.dry_run:
            db.rollback()
            stats["dry_run"] = True
        else:
            db.commit()
            stats["dry_run"] = False
        print(json.dumps(stats, ensure_ascii=False, indent=2))
        return 0
    except Exception as exc:  # noqa: BLE001
        db.rollback()
        print(json.dumps({"error": str(exc), "errors": []}, ensure_ascii=False, indent=2))
        return 1
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
