-- Migration: Clarify subscription column naming
-- Rename subscription_status to stripe_subscription_status (this comes from Stripe: 'active', 'canceled', 'past_due', etc.)
-- Add subscription_state for internal access control ('subscribed', 'unsubscribed', 'unknown')

-- Step 1: Rename subscription_status to stripe_subscription_status
ALTER TABLE users RENAME COLUMN subscription_status TO stripe_subscription_status;

-- Step 2: Add subscription_state column for internal state tracking
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_state VARCHAR(50) DEFAULT 'unsubscribed';

-- Step 3: Populate subscription_state based on stripe_subscription_status
-- Convert existing Stripe statuses to our internal states
UPDATE users 
SET subscription_state = CASE 
  WHEN stripe_subscription_status IN ('active', 'trialing') THEN 'subscribed'
  WHEN stripe_subscription_status = 'past_due' THEN 
    CASE 
      -- If within 3 day grace period, keep as subscribed
      WHEN subscription_current_period_end > NOW() - INTERVAL '3 days' THEN 'subscribed'
      ELSE 'unsubscribed'
    END
  WHEN stripe_subscription_status IS NULL THEN 'unsubscribed'
  ELSE 'unsubscribed'
END
WHERE subscription_state IS NULL OR subscription_state = 'unsubscribed';

-- Step 4: Update index to use new column name
DROP INDEX IF EXISTS idx_users_subscription_status;
CREATE INDEX IF NOT EXISTS idx_users_stripe_subscription_status ON users(stripe_subscription_status);
CREATE INDEX IF NOT EXISTS idx_users_subscription_state ON users(subscription_state);

-- Step 5: Display updated schema
SELECT column_name, data_type, is_nullable, column_default 
FROM information_schema.columns 
WHERE table_name = 'users' 
AND (column_name LIKE '%subscription%' OR column_name LIKE '%state%' OR column_name LIKE '%stripe%')
ORDER BY ordinal_position;
