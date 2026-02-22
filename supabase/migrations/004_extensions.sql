-- Migration 004: Enable required PostgreSQL extensions
-- Note: file numbered 004 to avoid conflict with existing 001-003 migrations

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;
