-- Add subscription tracking columns to users table
-- These columns track subscription state changes and last check times

ALTER TABLE users ADD COLUMN IF NOT EXISTS last_state_check TIMESTAMP WITH TIME ZONE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS state_change_reason VARCHAR(500);

-- Add index for performance on last_state_check queries
CREATE INDEX IF NOT EXISTS idx_users_last_state_check ON users(last_state_check);

-- Display current schema to verify
SELECT column_name, data_type, is_nullable, column_default 
FROM information_schema.columns 
WHERE table_name = 'users' 
AND (column_name LIKE '%state%' OR column_name LIKE '%subscription%')
ORDER BY ordinal_position;
