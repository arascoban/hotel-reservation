-- Migration: 039_source_email.sql
-- 'email' as a booking source: guests who write in directly rather than
-- calling or coming through a portal.
--
-- ALTER TYPE ... ADD VALUE cannot run inside a transaction block in older
-- PostgreSQL, so it stands alone; IF NOT EXISTS makes re-running safe.
ALTER TYPE reservation_source ADD VALUE IF NOT EXISTS 'email';
