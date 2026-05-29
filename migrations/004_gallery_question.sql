-- Migration: Add `question` column to gallery_readings
-- Part of Task 10 (Question-Driven Gallery). Each gallery row is now a focused
-- mini-article that answers one specific question — the question is the
-- primary subject of the card and the article body. Stored as TEXT so we don't
-- impose a length cap on the natural-language question.
--
-- Idempotent: safe to re-run via the start-vibely.sh migration loop.

ALTER TABLE gallery_readings
    ADD COLUMN IF NOT EXISTS question TEXT;
