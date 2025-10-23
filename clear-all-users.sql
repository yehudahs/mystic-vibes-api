-- ⚠️  WARNING: This script DELETES ALL USER DATA
-- This is useful for testing/development environments
-- DO NOT run this on production databases without proper backups

-- Clear all user-related data
-- Order matters due to foreign key constraints, but CASCADE handles it automatically

BEGIN;

-- Show counts before deletion
SELECT 'Before deletion:' as status;
SELECT COUNT(*) as user_count FROM users;
SELECT COUNT(*) as session_count FROM user_sessions;
SELECT COUNT(*) as reading_count FROM readings;
SELECT COUNT(*) as reading_cards_count FROM reading_cards;
SELECT COUNT(*) as preferences_count FROM user_preferences;
SELECT COUNT(*) as stats_count FROM user_stats;

-- Delete all user data (CASCADE will handle related records)
TRUNCATE TABLE users CASCADE;

-- Verify - also manually clear dependent tables to be safe
TRUNCATE TABLE user_sessions CASCADE;
TRUNCATE TABLE readings CASCADE;
TRUNCATE TABLE reading_cards CASCADE;
TRUNCATE TABLE user_preferences CASCADE;
TRUNCATE TABLE user_stats CASCADE;

-- Show counts after deletion
SELECT 'After deletion:' as status;
SELECT COUNT(*) as user_count FROM users;
SELECT COUNT(*) as session_count FROM user_sessions;
SELECT COUNT(*) as reading_count FROM readings;
SELECT COUNT(*) as reading_cards_count FROM reading_cards;
SELECT COUNT(*) as preferences_count FROM user_preferences;
SELECT COUNT(*) as stats_count FROM user_stats;

COMMIT;

-- Note: This does NOT delete reference data (tarot_spreads, tarot_cards)
-- Those are preserved for the application to function
