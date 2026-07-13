-- 0045: Drop duplicate FTS index. Schema only defines news_fts_idx (from 0032).
-- Migration 0004 also created news_articles_fts_idx on the same columns.
DROP INDEX IF EXISTS "news_articles_fts_idx";
