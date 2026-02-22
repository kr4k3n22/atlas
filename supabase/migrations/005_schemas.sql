-- Migration 005: Create PostgreSQL schemas for welfare claims data
-- ref    = code/lookup tables
-- app    = operational/fact tables
-- audit  = audit trail tables
-- reporting = views for downstream consumers

CREATE SCHEMA IF NOT EXISTS ref;
CREATE SCHEMA IF NOT EXISTS app;
CREATE SCHEMA IF NOT EXISTS audit;
CREATE SCHEMA IF NOT EXISTS reporting;
