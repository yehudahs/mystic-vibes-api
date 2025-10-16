-- Vibely AI Database Schema
-- PostgreSQL Database Design

-- Users table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255), -- For email authentication
    avatar_url VARCHAR(500),
    provider VARCHAR(50) NOT NULL DEFAULT 'email', -- 'email' or 'google'
    provider_id VARCHAR(255), -- Google sub or email hash
    
    -- Subscription fields
    stripe_customer_id VARCHAR(255),
    stripe_subscription_id VARCHAR(255),
    stripe_price_id VARCHAR(255),
    subscription_status VARCHAR(50), -- 'active', 'canceled', 'past_due', etc.
    subscription_current_period_start TIMESTAMP WITH TIME ZONE,
    subscription_current_period_end TIMESTAMP WITH TIME ZONE,
    subscription_cancel_at_period_end BOOLEAN DEFAULT false,
    subscription_canceled_at TIMESTAMP WITH TIME ZONE,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_login_at TIMESTAMP WITH TIME ZONE
);

-- Tarot spreads reference table
CREATE TABLE tarot_spreads (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    card_count INTEGER NOT NULL,
    positions JSONB NOT NULL, -- Array of position objects
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tarot cards reference table  
CREATE TABLE tarot_cards (
    id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    suit VARCHAR(20), -- 'major', 'cups', 'wands', 'swords', 'pentacles'
    number INTEGER,
    keywords TEXT[], -- Array of keywords
    upright_meaning TEXT,
    reversed_meaning TEXT,
    image_url VARCHAR(500),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User readings
CREATE TABLE readings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    spread_id VARCHAR(50) NOT NULL REFERENCES tarot_spreads(id),
    question TEXT,
    overall_interpretation TEXT,
    ai_generated BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Individual cards drawn in each reading
CREATE TABLE reading_cards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reading_id UUID NOT NULL REFERENCES readings(id) ON DELETE CASCADE,
    card_id VARCHAR(50) NOT NULL REFERENCES tarot_cards(id),
    position_name VARCHAR(100) NOT NULL,
    position_index INTEGER NOT NULL,
    is_reversed BOOLEAN DEFAULT false,
    interpretation TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User preferences
CREATE TABLE user_preferences (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    preferred_spread_id VARCHAR(50) REFERENCES tarot_spreads(id),
    use_ai BOOLEAN DEFAULT true,
    theme VARCHAR(20) DEFAULT 'dark',
    notifications_enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User statistics (materialized view for performance)
CREATE TABLE user_stats (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    total_readings INTEGER DEFAULT 0,
    favorite_spread_id VARCHAR(50),
    last_reading_date TIMESTAMP WITH TIME ZONE,
    readings_this_month INTEGER DEFAULT 0,
    readings_by_month JSONB DEFAULT '{}', -- {"2024-01": 5, "2024-02": 3}
    readings_by_spread JSONB DEFAULT '{}', -- {"three-card": 10, "celtic-cross": 5}
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Sessions for authentication
CREATE TABLE user_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_used_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    ip_address INET,
    user_agent TEXT
);

-- Indexes for performance
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_provider_id ON users(provider_id);
CREATE INDEX idx_users_stripe_customer_id ON users(stripe_customer_id);
CREATE INDEX idx_users_stripe_subscription_id ON users(stripe_subscription_id);
CREATE INDEX idx_users_subscription_status ON users(subscription_status);
CREATE INDEX idx_readings_user_id ON readings(user_id);
CREATE INDEX idx_readings_created_at ON readings(created_at);
CREATE INDEX idx_reading_cards_reading_id ON reading_cards(reading_id);
CREATE INDEX idx_user_sessions_token_hash ON user_sessions(token_hash);
CREATE INDEX idx_user_sessions_user_id ON user_sessions(user_id);

-- Update triggers
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_readings_updated_at BEFORE UPDATE ON readings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_preferences_updated_at BEFORE UPDATE ON user_preferences
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- Function to update user stats after new reading
CREATE OR REPLACE FUNCTION update_user_stats_after_reading()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO user_stats (user_id, total_readings, last_reading_date, updated_at)
    VALUES (NEW.user_id, 1, NEW.created_at, NOW())
    ON CONFLICT (user_id) DO UPDATE SET
        total_readings = user_stats.total_readings + 1,
        last_reading_date = NEW.created_at,
        readings_this_month = CASE 
            WHEN EXTRACT(YEAR FROM user_stats.last_reading_date) = EXTRACT(YEAR FROM NEW.created_at)
            AND EXTRACT(MONTH FROM user_stats.last_reading_date) = EXTRACT(MONTH FROM NEW.created_at)
            THEN user_stats.readings_this_month + 1
            ELSE 1
        END,
        updated_at = NOW();
    
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_stats_after_reading AFTER INSERT ON readings
    FOR EACH ROW EXECUTE FUNCTION update_user_stats_after_reading();

-- Sample data for tarot spreads
INSERT INTO tarot_spreads (id, name, description, card_count, positions) VALUES 
('three-card', 'Three Card Spread', 'Past, Present, Future - A simple yet powerful reading', 3, 
 '[{"name": "Past", "x": 25, "y": 50}, {"name": "Present", "x": 50, "y": 50}, {"name": "Future", "x": 75, "y": 50}]'),
('love-triangle', 'Love Triangle', 'Explore relationships and emotional connections', 3,
 '[{"name": "You", "x": 50, "y": 75}, {"name": "Partner", "x": 25, "y": 25}, {"name": "Relationship", "x": 75, "y": 25}]'),
('celtic-cross', 'Celtic Cross', 'Comprehensive life guidance with 10 cards', 10,
 '[{"name": "Present", "x": 50, "y": 50}, {"name": "Challenge", "x": 50, "y": 35}, {"name": "Distant Past", "x": 35, "y": 50}, {"name": "Recent Past", "x": 50, "y": 65}, {"name": "Possible Outcome", "x": 65, "y": 50}, {"name": "Near Future", "x": 50, "y": 20}, {"name": "Your Approach", "x": 80, "y": 80}, {"name": "External Influences", "x": 80, "y": 60}, {"name": "Hopes and Fears", "x": 80, "y": 40}, {"name": "Final Outcome", "x": 80, "y": 20}]');