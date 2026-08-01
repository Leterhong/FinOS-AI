"""phase703 security enhancement

Revision ID: 7f03security
Revises: 0808e2a909f1
"""
from alembic import op
import sqlalchemy as sa

revision = "7f03security"
down_revision = "0808e2a909f1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "audit_logs",
        sa.Column("id", sa.String(length=32), nullable=False),
        sa.Column("user_id", sa.String(length=32), nullable=True),
        sa.Column("action", sa.String(length=80), nullable=False),
        sa.Column("resource", sa.String(length=300), nullable=False),
        sa.Column("ip", sa.String(length=64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_audit_logs_user_id", "audit_logs", ["user_id"])
    op.create_index("ix_audit_logs_action", "audit_logs", ["action"])
    op.create_table(
        "security_events",
        sa.Column("id", sa.String(length=32), nullable=False),
        sa.Column("user_id", sa.String(length=32), nullable=True),
        sa.Column("event_type", sa.String(length=80), nullable=False),
        sa.Column("severity", sa.String(length=20), nullable=False),
        sa.Column("details", sa.Text(), nullable=False),
        sa.Column("ip", sa.String(length=64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_security_events_user_id", "security_events", ["user_id"])
    op.create_index("ix_security_events_event_type", "security_events", ["event_type"])

    # 敏感数值和路径改为可容纳 AES-256-GCM 密文的 TEXT。
    with op.batch_alter_table("financial_profiles") as batch:
        batch.alter_column("income", existing_type=sa.Float(), type_=sa.Text(), existing_nullable=False)
        batch.alter_column("expense", existing_type=sa.Float(), type_=sa.Text(), existing_nullable=False)
    with op.batch_alter_table("assets") as batch:
        batch.alter_column("amount", existing_type=sa.Float(), type_=sa.Text(), existing_nullable=False)
    with op.batch_alter_table("transactions") as batch:
        batch.alter_column("amount", existing_type=sa.Float(), type_=sa.Text(), existing_nullable=False)
    with op.batch_alter_table("documents") as batch:
        batch.alter_column("storage_path", existing_type=sa.String(length=600), type_=sa.Text(), existing_nullable=False)


def downgrade() -> None:
    # 已加密数据不能安全地自动回退为 Float；先由运维执行解密迁移。
    op.drop_index("ix_security_events_event_type", table_name="security_events")
    op.drop_index("ix_security_events_user_id", table_name="security_events")
    op.drop_table("security_events")
    op.drop_index("ix_audit_logs_action", table_name="audit_logs")
    op.drop_index("ix_audit_logs_user_id", table_name="audit_logs")
    op.drop_table("audit_logs")
