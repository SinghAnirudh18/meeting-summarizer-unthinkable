"""002_phase2_audio

Revision ID: 002_phase2_audio
Revises: 001_initial
Create Date: 2026-08-20

"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '002_phase2_audio'
down_revision: Union[str, None] = '001_initial'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. audio_jobs table
    op.create_table(
        'audio_jobs',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('user_id', sa.String(length=36), nullable=False),
        sa.Column('meeting_id', sa.String(length=36), nullable=True),
        sa.Column('file_name', sa.String(length=255), nullable=False),
        sa.Column('storage_path', sa.String(length=512), nullable=False),
        sa.Column(
            'status',
            sa.Enum('QUEUED', 'UPLOADING', 'TRANSCRIBING', 'EXTRACTING', 'COMPLETED', 'FAILED', name='audiojobstatus'),
            nullable=False,
        ),
        sa.Column('progress', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('error_message', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['meeting_id'], ['meetings.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_audio_jobs_user_id'), 'audio_jobs', ['user_id'], unique=False)
    op.create_index(op.f('ix_audio_jobs_meeting_id'), 'audio_jobs', ['meeting_id'], unique=False)
    op.create_index(op.f('ix_audio_jobs_status'), 'audio_jobs', ['status'], unique=False)

    # 2. transcript_segments table
    op.create_table(
        'transcript_segments',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('job_id', sa.String(length=36), nullable=False),
        sa.Column('start_time', sa.Float(), nullable=False),
        sa.Column('end_time', sa.Float(), nullable=False),
        sa.Column('speaker', sa.String(length=100), nullable=False, server_default='Speaker 1'),
        sa.Column('text', sa.Text(), nullable=False),
        sa.Column('sequence_order', sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(['job_id'], ['audio_jobs.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_transcript_segments_job_id'), 'transcript_segments', ['job_id'], unique=False)

    # 3. meeting_summaries table
    op.create_table(
        'meeting_summaries',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('job_id', sa.String(length=36), nullable=False),
        sa.Column('executive_summary', sa.Text(), nullable=False),
        sa.Column('key_topics', sa.JSON(), nullable=False),
        sa.Column('key_takeaways', sa.JSON(), nullable=False),
        sa.ForeignKeyConstraint(['job_id'], ['audio_jobs.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_meeting_summaries_job_id'), 'meeting_summaries', ['job_id'], unique=True)

    # 4. decisions table
    op.create_table(
        'decisions',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('job_id', sa.String(length=36), nullable=False),
        sa.Column('decision_text', sa.Text(), nullable=False),
        sa.Column('speaker', sa.String(length=100), nullable=False, server_default='Participant'),
        sa.Column('timestamp_seconds', sa.Float(), nullable=False, server_default='0.0'),
        sa.Column('context_snippet', sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(['job_id'], ['audio_jobs.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_decisions_job_id'), 'decisions', ['job_id'], unique=False)

    # 5. action_items table
    op.create_table(
        'action_items',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('job_id', sa.String(length=36), nullable=False),
        sa.Column('task', sa.Text(), nullable=False),
        sa.Column('owner', sa.String(length=100), nullable=False, server_default='Unassigned'),
        sa.Column('deadline', sa.String(length=100), nullable=True),
        sa.Column('timestamp_seconds', sa.Float(), nullable=False, server_default='0.0'),
        sa.Column('status', sa.String(length=50), nullable=False, server_default='Pending'),
        sa.ForeignKeyConstraint(['job_id'], ['audio_jobs.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_action_items_job_id'), 'action_items', ['job_id'], unique=False)


def downgrade() -> None:
    op.drop_table('action_items')
    op.drop_table('decisions')
    op.drop_table('meeting_summaries')
    op.drop_table('transcript_segments')
    op.drop_table('audio_jobs')
    op.execute('DROP TYPE IF EXISTS audiojobstatus')
