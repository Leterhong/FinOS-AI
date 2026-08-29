"""FinOS AI Backend — FastAPI 应用入口（Phase 7.0.1）。

启动（开发）：
  cd "F:/FinOS AI"
  python -m uvicorn backend.main:app --port 8300 --reload

统一返回格式（需求十四）：
  成功 {"success": true, "data": {...}, "message": ""}
  失败 {"success": false, "error": "..."}
"""
from __future__ import annotations

from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from backend.security.middleware import SecurityMiddleware

from backend.config import get_settings
from backend.core.health import router as health_router
from backend.core.logging_config import get_logger, log_event
from backend.core.metrics import MetricsMiddleware, router as metrics_router
from backend.database import SessionLocal, init_db
from backend.migration.legacy_import import run_legacy_import
from backend.security.data_migration import encrypt_existing_sensitive_data
from backend.tasks import worker as task_worker
from backend.tasks.router import router as task_router

settings = get_settings()
logger = get_logger("finos.app")


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()  # 开发环境自动建表；生产用 Alembic
    # 开发环境：将既有明文敏感字段原地升级为 AES-256-GCM 密文（幂等）。
    if settings.database_url.startswith("sqlite"):
        try:
            with SessionLocal() as db:
                encrypt_existing_sensitive_data(db)
        except Exception as exc:  # noqa: BLE001
            # 主密钥错误 / 迁移失败绝不能静默——否则历史密文将不可解。
            logger.error("sensitive_data_migration_failed", extra={"error": str(exc)})
    # 启动期自动迁移前端 .data 历史数据（任务 #290）；失败仅记录不阻断启动。
    if settings.migrate_legacy_data:
        legacy_data = Path(__file__).resolve().parents[2] / ".data"
        if legacy_data.is_dir():
            try:
                with SessionLocal() as db:
                    stats = run_legacy_import(str(legacy_data), db)
                    db.commit()
                    logger.info("legacy_migration_done", extra={"stats": str(stats)})
            except Exception as exc:  # noqa: BLE001
                logger.error("legacy_migration_skipped", extra={"error": str(exc)})
    # 启动异步任务 Worker 与自动化调度线程（非阻塞后台线程）
    task_worker.start_worker()
    from backend.autonomous.scheduler.service import start_scheduler

    start_scheduler()
    yield
    from backend.autonomous.scheduler.service import stop_scheduler

    stop_scheduler()
    task_worker.stop_worker()


app = FastAPI(title=settings.app_name, lifespan=lifespan, docs_url="/docs")

app.add_middleware(SecurityMiddleware)
app.add_middleware(MetricsMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---- 统一错误格式（需求十四） ----
@app.exception_handler(HTTPException)
async def http_exception_handler(_: Request, exc: HTTPException):
    return JSONResponse(status_code=exc.status_code, content={"success": False, "error": str(exc.detail)})


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(_: Request, exc: RequestValidationError):
    return JSONResponse(status_code=422, content={"success": False, "error": "请求参数不合法"})


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    # 服务端记录完整异常（含类型/路径）供排障；响应体绝不暴露堆栈或内部路径。
    log_event(
        logger,
        "error",
        "unhandled_exception",
        method=request.method,
        path=request.url.path,
        exc_type=type(exc).__name__,
    )
    logger.exception("unhandled_exception at %s %s", request.method, request.url.path)
    try:
        # 同步 DB 写入放线程池执行，避免阻塞事件循环。
        import asyncio

        from backend.security.audit import write_security_event

        def _record() -> None:
            with SessionLocal() as db:
                write_security_event(
                    db,
                    user_id=None,
                    event_type="unhandled_exception",
                    severity="error",
                    details=f"{type(exc).__name__} @ {request.method} {request.url.path}",
                    request=request,
                )
                db.commit()

        await asyncio.to_thread(_record)
    except Exception:  # noqa: BLE001 记录异常本身失败也不得影响响应
        logger.debug("audit_write_for_500_failed", exc_info=True)
    return JSONResponse(status_code=500, content={"success": False, "error": "服务器内部错误"})


# ---- 路由注册 ----
from backend.auth import router as auth_router  # noqa: E402
from backend.user import router as user_router  # noqa: E402
from backend.financial import router as financial_router  # noqa: E402
from backend.ai import router as ai_router  # noqa: E402
from backend.document import router as document_router  # noqa: E402
from backend.memory import router as memory_router  # noqa: E402
from backend.notification import router as notification_router  # noqa: E402
# Phase 7.0.2 业务服务层
from backend.services.financial.router import router as svc_financial_router  # noqa: E402
from backend.services.twin.router import router as svc_twin_router  # noqa: E402
from backend.services.rag.router import router as svc_rag_router  # noqa: E402
from backend.services.agent.router import router as svc_agent_router  # noqa: E402
from backend.services.cfo.router import router as svc_cfo_router  # noqa: E402
from backend.services.monitor.router import router as svc_monitor_router  # noqa: E402
from backend.services.document.router import router as svc_document_router  # noqa: E402
from backend.security.router import router as security_router  # noqa: E402
# Phase 7.1 Wealth Intelligence Engine
from backend.intelligence.router import router as intelligence_router  # noqa: E402
# Phase 7.2 Multimodal Intelligence + AI Agent Ecosystem
from backend.multimodal.api import router as multimodal_router  # noqa: E402
from backend.agents.api import router as agents_router  # noqa: E402
from backend.report.api import router as report_router  # noqa: E402
from backend.personal_os.router import router as personal_os_router  # noqa: E402  Phase 7.3
from backend.autonomous.router import router as autonomic_router  # noqa: E402  Phase 7.4
from backend.backup import router as backup_router  # noqa: E402  Phase 7.6 备份/导出
from backend.enterprise import router as enterprise_router  # noqa: E402  2.1 企业工作区持久化

for r in (
    auth_router,
    user_router,
    financial_router,
    ai_router,
    document_router,
    memory_router,
    notification_router,
    svc_financial_router,
    svc_twin_router,
    svc_rag_router,
    svc_agent_router,
    svc_cfo_router,
    svc_monitor_router,
    svc_document_router,
    security_router,
    intelligence_router,
    multimodal_router,
    agents_router,
    report_router,
    personal_os_router,
    autonomic_router,
    backup_router,
    enterprise_router,
    task_router,
    health_router,
    metrics_router,
):
    app.include_router(r, prefix=settings.api_prefix)
