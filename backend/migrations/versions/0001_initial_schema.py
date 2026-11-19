"""Initial SUMIND-IQ schema with organisations, RBAC, workspaces, documents, chunks, RAG, feedback, and audit logs.

Revision ID: 0001_initial_schema
Revises: None
Create Date: 2026-10-22 21:50:00

"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op

from app.models import Base

revision: str = "0001_initial_schema"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    Base.metadata.create_all(bind=bind)


def downgrade() -> None:
    bind = op.get_bind()
    Base.metadata.drop_all(bind=bind)

