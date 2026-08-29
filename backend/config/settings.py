"""FinOS AI Backend — 全局配置（Phase 7.0.1）

所有敏感配置来自环境变量 / backend/.env，禁止硬编码。
DATABASE_URL 支持 PostgreSQL（生产）与 SQLite（本地开发降级）。
"""
from __future__ import annotations

import os
import secrets
import warnings
from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BACKEND_DIR / "data"
UPLOAD_DIR = DATA_DIR / "uploads"

# 历史占位值与常见弱口令：一旦命中即视为「未配置」
WEAK_JWT_SECRETS = frozenset(
    {
        "",
        "change_me_in_env",
        "changeme",
        "change-me",
        "secret",
        "jwt_secret",
        "your-secret-key",
        "please-change-me",
        # 仓库自带的 .env.example / backend/.env.example 占位值——长度够但人人可见，
        # 同样必须视为「未配置」，否则示例文件直接抄进生产就能绕过本守卫。
        "please-change-me-to-a-long-random-string",
        "change_me_jwt_secret_at_least_32_bytes_long",
    }
)
MIN_JWT_SECRET_LENGTH = 32

# 占位值特征：命中任意子串即视为未配置（防止未来新增模板值漏登记）。
PLACEHOLDER_MARKERS = ("change_me", "change-me", "changeme", "placeholder", "your-", "<", ">" )

# JWT 允许的算法白名单：禁止 none / RS-HS 混淆等配置引入的算法降级。
ALLOWED_JWT_ALGORITHMS = frozenset({"HS256", "HS384", "HS512"})
# Access Token 有效期上下限：短期令牌 + 静默续期是本项目的安全模型。
MIN_JWT_EXPIRE_MINUTES = 1
MAX_JWT_EXPIRE_MINUTES = 1440

DEV_ENV_NAMES = frozenset({"dev", "development", "local", "test", "testing"})


def is_dev_environment() -> bool:
    """仅当显式声明为开发/测试环境时返回 True。

    默认按生产处理——「没说是开发」一律当生产，避免漏配环境变量时
    静默降级为弱密钥。
    """
    env = (os.getenv("ENV") or os.getenv("ENVIRONMENT") or "").strip().lower()
    return env in DEV_ENV_NAMES


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(BACKEND_DIR / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # --- 基础 ---
    app_name: str = "FinOS AI Backend"
    api_prefix: str = "/api"
    debug: bool = False

    # --- 数据库：生产用 PostgreSQL，本地开发默认 SQLite ---
    database_url: str = f"sqlite:///{(DATA_DIR / 'finos.db').as_posix()}"

    # --- Redis（可选，不可用时自动降级为进程内缓存） ---
    redis_url: str = "redis://localhost:6379/0"

    # --- JWT ---
    # 无默认可用值：未配置时开发环境生成随机临时密钥，生产环境直接 fail-fast。
    # 绝不允许回退到「人人可见的固定字符串」——那等同于任何人都能伪造 token。
    jwt_secret: str = ""
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 15  # Access Token 短期有效；由 HttpOnly Refresh Cookie 静默续期
    jwt_refresh_expire_days: int = 30  # Refresh Token 有效期：30 天

    # --- 整库备份接口保护（/api/backup/database 需携带此 Key） ---
    backup_api_key: str = ""

    # --- AES-256-GCM 主密钥：URL-safe Base64 编码的 32 字节随机值 ---
    encryption_master_key: str = ""

    # --- 模型端点：是否允许本机/内网地址（自托管 Ollama 等场景） ---
    # 支持 "true"/"false"/"1"/"0"；留空或未配置时按环境自动决定：
    # 开发环境放行，生产环境默认禁止，云元数据段任何模式下都禁止。
    ai_allow_private_endpoints: str | None = None

    # --- 安全限制 ---
    api_rate_limit_per_minute: int = 300
    ai_rate_limit_per_minute: int = 30
    ai_max_tokens: int = 8192
    ai_max_input_chars: int = 100_000

    # --- CORS：Next.js 前端 ---
    cors_origins: str = "http://localhost:3000,http://localhost:3001,http://localhost:3002"
    # 只有来自这些反向代理的请求才信任 X-Forwarded-For；默认不信任任何代理。
    trusted_proxy_ips: str = ""

    # --- 启动期自动迁移前端 Node 侧 .data 历史数据（任务 #290，默认关闭） ---
    migrate_legacy_data: bool = False

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def trusted_proxy_ip_set(self) -> set[str]:
        return {o.strip() for o in self.trusted_proxy_ips.split(",") if o.strip()}

    def model_post_init(self, __context) -> None:  # noqa: D105
        # .env 中留空时回退默认值（SQLite 开发降级）
        if not self.database_url.strip():
            object.__setattr__(
                self, "database_url", f"sqlite:///{(DATA_DIR / 'finos.db').as_posix()}"
            )
        if self.ai_allow_private_endpoints is None:
            object.__setattr__(self, "ai_allow_private_endpoints", is_dev_environment())
        else:
            raw = str(self.ai_allow_private_endpoints).strip().lower()
            if raw in {"true", "1", "yes"}:
                object.__setattr__(self, "ai_allow_private_endpoints", True)
            elif raw in {"false", "0", "no"}:
                object.__setattr__(self, "ai_allow_private_endpoints", False)
            else:
                object.__setattr__(self, "ai_allow_private_endpoints", is_dev_environment())
        self._guard_jwt_secret()
        self._guard_jwt_algorithm()
        self._guard_jwt_expire()

    def _guard_jwt_secret(self) -> None:
        """JWT 密钥强度守卫。

        生产环境缺失或使用弱密钥时立即 fail-fast；开发/测试环境生成
        进程内随机密钥（重启即失效，仅供本地调试）。
        """
        current = (self.jwt_secret or "").strip()
        lowered = current.lower()
        too_weak = (
            lowered in WEAK_JWT_SECRETS
            or len(current) < MIN_JWT_SECRET_LENGTH
            or any(marker in lowered for marker in PLACEHOLDER_MARKERS)
        )
        if not too_weak:
            return

        if not is_dev_environment():
            raise RuntimeError(
                "JWT_SECRET 未配置或强度不足，拒绝启动。\n"
                f"要求：至少 {MIN_JWT_SECRET_LENGTH} 个字符的高熵随机值。\n"
                "生成方式：python -c \"import secrets;print(secrets.token_urlsafe(48))\"\n"
                "然后写入 backend/.env 的 JWT_SECRET=...\n"
                "（本地开发可设置环境变量 ENV=development 以使用临时随机密钥）"
            )

        object.__setattr__(self, "jwt_secret", secrets.token_urlsafe(48))
        warnings.warn(
            "JWT_SECRET 未配置，已生成进程内临时密钥（仅限开发环境）。"
            "服务重启后所有已签发的令牌都会失效。",
            RuntimeWarning,
            stacklevel=2,
        )

    def _guard_jwt_algorithm(self) -> None:
        """JWT 算法白名单守卫：拒绝 none / 非对称-对称混淆等危险配置。"""
        if self.jwt_algorithm not in ALLOWED_JWT_ALGORITHMS:
            raise RuntimeError(
                f"JWT_ALGORITHM 仅允许 {sorted(ALLOWED_JWT_ALGORITHMS)}，"
                f"当前配置 {self.jwt_algorithm!r} 会引入算法混淆/unsigned token 风险，拒绝启动。"
            )

    def _guard_jwt_expire(self) -> None:
        """Access Token 有效期守卫：短期令牌 + Refresh 静默续期是既定安全模型。"""
        if not (MIN_JWT_EXPIRE_MINUTES <= self.jwt_expire_minutes <= MAX_JWT_EXPIRE_MINUTES):
            raise RuntimeError(
                "JWT_EXPIRE_MINUTES 必须在 "
                f"{MIN_JWT_EXPIRE_MINUTES}–{MAX_JWT_EXPIRE_MINUTES} 分钟之间"
                "（超长 Access Token 会使刷新轮换与重放检测形同虚设），拒绝启动。"
            )


@lru_cache
def get_settings() -> Settings:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    return Settings()
