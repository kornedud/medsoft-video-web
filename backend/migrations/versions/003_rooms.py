"""rooms table

Revision ID: 003_rooms
Revises: 002_users
Create Date: 2025-03-26

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "003_rooms"
down_revision: Union[str, Sequence[str], None] = "002_users"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "rooms",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("share_token", sa.String(length=64), nullable=False),
        sa.Column("creator_user_id", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["creator_user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_rooms_share_token", "rooms", ["share_token"], unique=True)
    op.create_index("ix_rooms_creator_user_id", "rooms", ["creator_user_id"])


def downgrade() -> None:
    op.drop_index("ix_rooms_creator_user_id", table_name="rooms")
    op.drop_index("ix_rooms_share_token", table_name="rooms")
    op.drop_table("rooms")
