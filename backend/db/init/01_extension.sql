-- Runs once on first DB init (mounted into /docker-entrypoint-initdb.d).
-- Alembic migrations (task #3) own the tables; this only guarantees the
-- pgvector extension exists before any migration runs.
CREATE EXTENSION IF NOT EXISTS vector;
