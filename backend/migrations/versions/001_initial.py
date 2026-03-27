"""initial empty schema

Revision ID: 001_initial
Revises:
Create Date: 2025-03-26

"""

from typing import Sequence, Union

revision: str = "001_initial"
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
