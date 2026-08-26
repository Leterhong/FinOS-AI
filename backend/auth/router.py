"""认证接口（Phase 7.0.1 需求五 / Phase 7.6 需求四：刷新 Token）：

POST /api/auth/register — bcrypt 加密入库，返回 access + refresh Token
POST /api/auth/login    — 校验密码，返回 access + refresh Token
POST /api/auth/bootstrap — 自动恢复会话或创建隔离访客空间
POST /api/auth/refresh  — 用 Refresh Token 轮换出新的 access + refresh
POST /api/auth/logout   — 吊销当前 Refresh Token
GET  /api/auth/csrf     — 下发双提交 CSRF Token（cookie + 响应体）
GET  /api/auth/me       — 当前用户（前端恢复会话用）
"""
from __future__ import annotations

import re
import secrets
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Request, Response
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.auth.models import RefreshToken
from backend.config import get_settings
from backend.core import get_current_user, ok
from backend.core.logging_config import get_logger, log_event
from backend.core.response import fail
from backend.core.security import (
    create_access_token,
    create_refresh_token,
    decode_refresh_token,
    hash_password,
    is_legacy_password_hash,
    verify_password,
)
from backend.database import get_db
from backend.financial.models import Asset, FinancialProfile
from backend.security.audit import client_ip, write_audit, write_security_event
from backend.user.models import User

router = APIRouter(prefix="/auth", tags=["auth"])
logger = get_logger("finos.auth")
settings = get_settings()

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
CSRF_COOKIE = "finos_csrf"
REFRESH_COOKIE = "finos_refresh"


class RegisterIn(BaseModel):
    email: str = Field(min_length=5, max_length=255)
    password: str = Field(min_length=8, max_length=128)


class LoginIn(BaseModel):
    email: str
    password: str


class RefreshIn(BaseModel):
    refreshToken: str | None = None


def _user_public(u: User, db: Session) -> dict:
    has_profile = db.scalar(select(FinancialProfile.id).where(FinancialProfile.user_id == u.id)) is not None
    has_assets = db.scalar(select(Asset.id).where(Asset.user_id == u.id)) is not None
    return {
        "id": u.id,
        "email": u.email,
        "name": "体验用户" if u.email.endswith("@guest.finos.local") else u.email.split("@", 1)[0],
        "avatar": u.avatar,
        "avatarUrl": u.avatar,
        "profileCompleted": has_profile or has_assets,
        "createdAt": u.created_at.isoformat() if u.created_at else None,
    }


def _issue_tokens(db: Session, user: User) -> dict:
    """签发 access + refresh，并把 refresh 的 jti 入库（供轮换/吊销）。"""
    access = create_access_token(user.id, user.email)
    refresh, jti, expires_at = create_refresh_token(user.id, user.email)
    db.add(RefreshToken(jti=jti, user_id=user.id, expires_at=expires_at))
    return {"token": access, "refreshToken": refresh}


def _secure_request(request: Request) -> bool:
    return request.url.scheme == "https" or request.headers.get("x-forwarded-proto") == "https"


def _set_refresh_cookie(response: Response, token: str, request: Request) -> None:
    response.set_cookie(
        REFRESH_COOKIE,
        token,
        max_age=60 * 60 * 24 * settings.jwt_refresh_expire_days,
        httponly=True,
        secure=_secure_request(request),
        samesite="lax",
        path="/api/auth",
    )


def _active_refresh_user(raw: str, db: Session) -> tuple[User, RefreshToken] | None:
    """返回仍有效的刷新会话；bootstrap 使用它避免把无 cookie 当作 401。"""
    if not raw:
        return None
    payload = decode_refresh_token(raw)
    if not payload or not payload.get("jti"):
        return None
    record = db.scalar(select(RefreshToken).where(RefreshToken.jti == payload["jti"]))
    if record is None or record.revoked:
        return None
    expires_at = record.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < datetime.now(timezone.utc):
        record.revoked = True
        db.add(record)
        db.commit()
        return None
    user = db.get(User, record.user_id)
    return (user, record) if user is not None else None


def _seed_guest_financial_data(db: Session, user: User) -> None:
    """为全新访客提供可探索的示例数据；数据仍按随机 user_id 独立存储。"""
    db.add(
        FinancialProfile(
            user_id=user.id,
            age=31,
            income=32_000,
            expense=14_500,
            risk_level="balanced",
            goal="2038 年实现财务自由",
        )
    )
    db.add_all(
        [
            Asset(user_id=user.id, type="cash", name="现金与应急储备", amount=186_000, source="demo"),
            Asset(user_id=user.id, type="fund", name="指数基金组合", amount=428_000, source="demo"),
            Asset(user_id=user.id, type="stock", name="长期权益组合", amount=236_000, source="demo"),
            Asset(user_id=user.id, type="bond", name="稳健债券配置", amount=120_000, source="demo"),
        ]
    )


@router.post("/bootstrap")
def bootstrap(request: Request, response: Response, db: Session = Depends(get_db)):
    """免登录入口：恢复现有刷新会话，或为当前浏览器创建隔离访客空间。

    与直接调用 ``/refresh`` 不同，本端点在首次访问时始终返回 200，避免浏览器
    控制台出现预期内的 401；现有真实账户的 refresh cookie 仍会被正常恢复。
    """
    raw = (request.cookies.get(REFRESH_COOKIE) or "").strip()
    active = _active_refresh_user(raw, db)
    if active:
        user, record = active
        record.revoked = True
        db.add(record)
        tokens = _issue_tokens(db, user)
        _set_refresh_cookie(response, tokens["refreshToken"], request)
        db.commit()
        return ok({"token": tokens["token"], "user": _user_public(user, db), "guest": user.email.endswith("@guest.finos.local")})

    guest_id = secrets.token_hex(12)
    user = User(
        email=f"guest-{guest_id}@guest.finos.local",
        password_hash=hash_password(secrets.token_urlsafe(32)),
    )
    db.add(user)
    db.flush()
    _seed_guest_financial_data(db, user)
    db.commit()
    db.refresh(user)
    tokens = _issue_tokens(db, user)
    _set_refresh_cookie(response, tokens["refreshToken"], request)
    db.commit()
    log_event(logger, "info", "auth.bootstrap.guest", user_id=user.id, ip=client_ip(request))
    return ok({"token": tokens["token"], "user": _user_public(user, db), "guest": True}, "体验空间已就绪")


@router.post("/register")
def register(body: RegisterIn, request: Request, response: Response, db: Session = Depends(get_db)):
    email = body.email.strip().lower()
    if not EMAIL_RE.match(email):
        return fail("邮箱格式不正确")
    exists = db.scalar(select(User).where(User.email == email))
    if exists:
        log_event(logger, "warning", "auth.register.duplicate", email=email, ip=client_ip(request))
        return fail("该邮箱已注册", status_code=409)

    user = User(email=email, password_hash=hash_password(body.password))
    db.add(user)
    db.commit()
    db.refresh(user)
    write_audit(db, user_id=user.id, action="auth.register", resource="account", request=request)
    tokens = _issue_tokens(db, user)
    _set_refresh_cookie(response, tokens["refreshToken"], request)
    db.commit()
    log_event(logger, "info", "auth.register.ok", user_id=user.id, ip=client_ip(request))
    return ok({"token": tokens["token"], "user": _user_public(user, db)}, "注册成功，欢迎创建你的财富数字分身")


@router.post("/login")
def login(body: LoginIn, request: Request, response: Response, db: Session = Depends(get_db)):
    email = body.email.strip().lower()
    user = db.scalar(select(User).where(User.email == email))
    if user is None or not verify_password(body.password, user.password_hash):
        write_security_event(
            db,
            user_id=user.id if user else None,
            event_type="failed_login",
            severity="warn",
            details=f"登录验证失败: {email[:3]}***",
            request=request,
        )
        db.commit()
        log_event(logger, "warning", "auth.login.failed", email=email, ip=client_ip(request))
        return fail("邮箱或密码错误", status_code=401)

    # 历史 scrypt 账户首次成功登录即升级为 bcrypt，不保留旧密码派生值。
    if is_legacy_password_hash(user.password_hash):
        user.password_hash = hash_password(body.password)
        db.add(user)
        db.commit()

    write_audit(db, user_id=user.id, action="auth.login", resource="account", request=request)
    tokens = _issue_tokens(db, user)
    _set_refresh_cookie(response, tokens["refreshToken"], request)
    db.commit()
    log_event(logger, "info", "auth.login.ok", user_id=user.id, ip=client_ip(request))
    return ok({"token": tokens["token"], "user": _user_public(user, db)}, "登录成功")


@router.post("/refresh")
def refresh(body: RefreshIn, request: Request, response: Response, db: Session = Depends(get_db)):
    """Refresh Token 轮换：校验 → 吊销旧 jti → 签发新 access+refresh。"""
    raw = (body.refreshToken or request.cookies.get("finos_refresh") or "").strip()
    if not raw:
        return fail("缺少刷新令牌", status_code=401)
    payload = decode_refresh_token(raw)
    if not payload:
        return fail("刷新令牌无效或已过期", status_code=401)

    jti = payload.get("jti")
    record = db.scalar(select(RefreshToken).where(RefreshToken.jti == jti))
    if record is None or record.revoked:
        # jti 不存在或已吊销：疑似重放，记安全事件。
        write_security_event(
            db,
            user_id=payload.get("sub"),
            event_type="refresh_reuse",
            severity="warn",
            details="检测到已吊销/未知的刷新令牌",
            request=request,
        )
        db.commit()
        log_event(logger, "warning", "auth.refresh.reuse", user_id=payload.get("sub"), ip=client_ip(request))
        return fail("刷新令牌无效或已过期", status_code=401)

    expires_at = record.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < datetime.now(timezone.utc):
        record.revoked = True
        db.commit()
        return fail("刷新令牌已过期", status_code=401)

    user = db.get(User, record.user_id)
    if user is None:
        return fail("账号不存在", status_code=401)

    # 轮换：吊销旧 jti，签发新对。
    record.revoked = True
    db.add(record)
    tokens = _issue_tokens(db, user)
    _set_refresh_cookie(response, tokens["refreshToken"], request)
    db.commit()
    log_event(logger, "info", "auth.refresh.ok", user_id=user.id, ip=client_ip(request))
    return ok({"token": tokens["token"], "user": _user_public(user, db)}, "令牌已刷新")


@router.post("/logout")
def logout(body: RefreshIn, request: Request, response: Response, db: Session = Depends(get_db)):
    """退出登录：吊销传入的 Refresh Token（幂等，无 token 也返回成功）。"""
    raw = (body.refreshToken or request.cookies.get("finos_refresh") or "").strip()
    if raw:
        payload = decode_refresh_token(raw)
        if payload and payload.get("jti"):
            record = db.scalar(select(RefreshToken).where(RefreshToken.jti == payload["jti"]))
            if record and not record.revoked:
                record.revoked = True
                db.add(record)
                write_audit(db, user_id=record.user_id, action="auth.logout", resource="account", request=request)
                db.commit()
                log_event(logger, "info", "auth.logout.ok", user_id=record.user_id, ip=client_ip(request))
    response.delete_cookie(REFRESH_COOKIE, path="/api/auth", secure=_secure_request(request), samesite="lax")
    return ok({"loggedOut": True}, "已退出登录")


@router.get("/csrf")
def csrf(request: Request):
    """下发双提交 CSRF Token：写入非 httpOnly cookie，并在响应体返回同值。

    前端对基于 cookie 认证的变更请求，需在 X-CSRF-Token 头回传此值。
    """
    token = secrets.token_urlsafe(32)
    resp = ok({"csrfToken": token}, "")
    from fastapi.responses import JSONResponse

    is_https = request.url.scheme == "https" or request.headers.get("x-forwarded-proto") == "https"
    json_resp = JSONResponse(content=resp)
    json_resp.set_cookie(
        CSRF_COOKIE,
        token,
        max_age=60 * 60 * 8,
        httponly=False,  # 双提交模式需前端 JS 可读
        samesite="lax",
        secure=is_https,
        path="/",
    )
    return json_resp


@router.get("/me")
def me(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return ok({"user": _user_public(user, db)})
