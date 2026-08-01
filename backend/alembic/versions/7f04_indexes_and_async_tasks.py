"""phase704 performance optimization: indexes + async_tasks

Revision ID: 7f04perf
Revises: 7f03security
"""
from alembic import op
import sqlalchemy as sa

revision = "7f04perf"
down_revision = "7f03security"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # --- async_tasks 表（Phase 7.0.4 异步任务系统） ---
    op.create_table(
        "async_tasks",
        sa.Column("id", sa.String(length=32), nullable=False),
        sa.Column("user_id", sa.String(length=32), nullable=True),
        sa.Column("task_type", sa.String(length=40), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("payload", sa.Text(), nullable=False),
        sa.Column("result", sa.Text(), nullable=True),
        sa.Column("progress", sa.Integer(), nullable=False),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_async_tasks_user_id", "async_tasks", ["user_id"])
    op.create_index("ix_async_tasks_task_type", "async_tasks", ["task_type"])
    op.create_index("ix_async_tasks_status", "async_tasks", ["status"])
    op.create_index("ix_async_tasks_created_at", "async_tasks", ["created_at"])
    op.create_index("ix_async_tasks_user_created", "async_tasks", ["user_id", "created_at"])

    # --- 性能索引（user_id / created_at / 关联列） ---
    op.create_index("ix_users_created", "users", ["created_at"])
    op.create_index("ix_financial_profiles_user_created", "financial_profiles", ["user_id", "created_at"])
    op.create_index("ix_assets_user_created", "assets", ["user_id", "created_at"])
    op.create_index("ix_assets_type", "assets", ["type"])
    op.create_index("ix_transactions_user_date", "transactions", ["user_id", "date"])
    op.create_index("ix_transactions_type", "transactions", ["type"])
    op.create_index("ix_documents_user_created", "documents", ["user_id", "created_at"])
    op.create_index("ix_memories_user_created", "memories", ["user_id", "created_at"])
    op.create_index("ix_memories_memory_type", "memories", ["memory_type"])
    op.create_index("ix_ai_usage_user_created", "ai_usage_logs", ["user_id", "created_at"])
    op.create_index("ix_ai_model_configs_created_at", "ai_model_configs", ["created_at"])
    op.create_index("ix_notifications_user_created", "notifications", ["user_id", "created_at"])
    op.create_index("ix_notifications_severity", "notifications", ["severity"])
    op.create_index("ix_financial_twins_user_created", "financial_twins", ["user_id", "created_at"])
    op.create_index("ix_agent_tasks_user_created", "agent_tasks", ["user_id", "created_at"])
    op.create_index("ix_agent_tasks_task_type", "agent_tasks", ["task_type"])
    op.create_index("ix_agent_tasks_status", "agent_tasks", ["status"])
    op.create_index("ix_knowledge_chunks_user_doc", "knowledge_chunks", ["user_id", "document_id"])
    op.create_index("ix_knowledge_chunks_category", "knowledge_chunks", ["category"])
    op.create_index("ix_knowledge_chunks_created_at", "knowledge_chunks", ["created_at"])
    op.create_index("ix_audit_logs_action_created", "audit_logs", ["action", "created_at"])
    op.create_index("ix_security_events_type_created", "security_events", ["event_type", "created_at"])
    op.create_index("ix_security_events_severity", "security_events", ["severity"])


def downgrade() -> None:
    op.drop_index("ix_security_events_severity", table_name="security_events")
    op.drop_index("ix_security_events_type_created", table_name="security_events")
    op.drop_index("ix_audit_logs_action_created", table_name="audit_logs")
    op.drop_index("ix_knowledge_chunks_created_at", table_name="knowledge_chunks")
    op.drop_index("ix_knowledge_chunks_category", table_name="knowledge_chunks")
    op.drop_index("ix_knowledge_chunks_user_doc", table_name="knowledge_chunks")
    op.drop_index("ix_agent_tasks_status", table_name="agent_tasks")
    op.drop_index("ix_agent_tasks_task_type", table_name="agent_tasks")
    op.drop_index("ix_agent_tasks_user_created", table_name="agent_tasks")
    op.drop_index("ix_financial_twins_user_created", table_name="financial_twins")
    op.drop_index("ix_notifications_severity", table_name="notifications")
    op.drop_index("ix_notifications_user_created", table_name="notifications")
    op.drop_index("ix_ai_model_configs_created_at", table_name="ai_model_configs")
    op.drop_index("ix_ai_usage_user_created", table_name="ai_usage_logs")
    op.drop_index("ix_memories_memory_type", table_name="memories")
    op.drop_index("ix_memories_user_created", table_name="memories")
    op.drop_index("ix_documents_user_created", table_name="documents")
    op.drop_index("ix_transactions_type", table_name="transactions")
    op.drop_index("ix_transactions_user_date", table_name="transactions")
    op.drop_index("ix_assets_type", table_name="assets")
    op.drop_index("ix_assets_user_created", table_name="assets")
    op.drop_index("ix_financial_profiles_user_created", table_name="financial_profiles")
    op.drop_index("ix_users_created", table_name="users")
    op.drop_index("ix_async_tasks_user_created", table_name="async_tasks")
    op.drop_index("ix_async_tasks_created_at", table_name="async_tasks")
    op.drop_index("ix_async_tasks_status", table_name="async_tasks")
    op.drop_index("ix_async_tasks_task_type", table_name="async_tasks")
    op.drop_index("ix_async_tasks_user_id", table_name="async_tasks")
    op.drop_table("async_tasks")
