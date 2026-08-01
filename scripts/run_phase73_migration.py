# -*- coding: utf-8 -*-
"""
以编程方式运行 Alembic 迁移到 head。
解决 alembic CLI 在 Git-Bash 下 prepend_sys_path 含 '..' 不生效的问题：
在 import alembic 之前把项目根加入 sys.path。
"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]  # F:/FinOS AI
sys.path.insert(0, str(ROOT))

from alembic.config import Config
from alembic import command

cfg = Config(str(ROOT / "backend" / "alembic.ini"))
cfg.set_main_option("script_location", str(ROOT / "backend" / "alembic"))
cfg.set_main_option("prepend_sys_path", str(ROOT))
command.upgrade(cfg, "head")
print("MIGRATION OK -> head")
