"""密码安全入口，统一复用 bcrypt 实现。"""
from backend.core.security import hash_password, is_legacy_password_hash, verify_password

__all__ = ["hash_password", "verify_password", "is_legacy_password_hash"]
