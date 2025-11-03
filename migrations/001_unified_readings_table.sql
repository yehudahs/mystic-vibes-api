-- Migration: Create unified readings table for all reading types
-- This consolidates tarot, horoscope, palm, numerology, and other readings into one table

-- Create the unified user_readings table
CREATE TABLE IF NOT EXISTS user_readings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Reading type and metadata
    reading_type VARCHAR(50) NOT NULL, -- 'tarot', 'horoscope', 'palm', 'numerology', 'mystical'
    title VARCHAR(255) NOT NULL,
    question TEXT, -- User's question (optional)
    interpretation TEXT NOT NULL, -- Main reading text/interpretation
    
    -- Type-specific data stored as JSONB
    reading_data JSONB NOT NULL DEFAULT '{}',
    -- Examples:
    -- Tarot: {"spread_id": "three-card", "cards": [...], "spread_name": "Three Card"}
    -- Horoscope: {"zodiac_sign": "aries", "horoscope_type": "daily", "date_scope": "2024-01-15"}
    -- Palm: {"image_url": "...", "features": [...], "analysis_method": "two-stage"}
    -- Numerology: {"life_path": 7, "expression": 3, "soul_urge": 5, "birth_date": "1990-01-15"}
    
    -- AI metadata
    ai_generated BOOLEAN DEFAULT true,
    ai_provider VARCHAR(50), -- 'ollama', 'openai', etc.
    ai_model VARCHAR(100), -- Model used for generation
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Optional: Make public for sharing
    is_public BOOLEAN DEFAULT false,
    public_slug VARCHAR(255) UNIQUE
);

-- Indexes for performance
CREATE INDEX idx_user_readings_user_id ON user_readings(user_id);
CREATE INDEX idx_user_readings_type ON user_readings(reading_type);
CREATE INDEX idx_user_readings_created_at ON user_readings(created_at DESC);
CREATE INDEX idx_user_readings_user_type ON user_readings(user_id, reading_type);
CREATE INDEX idx_user_readings_public_slug ON user_readings(public_slug) WHERE public_slug IS NOT NULL;

-- GIN index for JSONB data queries
CREATE INDEX idx_user_readings_data ON user_readings USING GIN (reading_data);

-- Update trigger
CREATE TRIGGER update_user_readings_updated_at BEFORE UPDATE ON user_readings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Migrate existing tarot readings to unified table
INSERT INTO user_readings (
    id,
    user_id,
    reading_type,
    title,
    question,
    interpretation,
    reading_data,
    ai_generated,
    created_at,
    updated_at
)
SELECT 
    r.id,
    r.user_id,
    'tarot' as reading_type,
    COALESCE(r.question, s.name, 'Tarot Reading') as title,
    r.question,
    r.overall_interpretation as interpretation,
    jsonb_build_object(
        'spread_id', r.spread_id,
        'spread_name', s.name,
        'cards', (
            SELECT jsonb_agg(
                jsonb_build_object(
                    'card_id', rc.card_id,
                    'position_name', rc.position_name,
                    'position_index', rc.position_index,
                    'is_reversed', rc.is_reversed,
                    'interpretation', rc.interpretation
                ) ORDER BY rc.position_index
            )
            FROM reading_cards rc
            WHERE rc.reading_id = r.id
        )
    ) as reading_data,
    r.ai_generated,
    r.created_at,
    r.updated_at
FROM readings r
LEFT JOIN tarot_spreads s ON r.spread_id = s.id
WHERE NOT EXISTS (
    SELECT 1 FROM user_readings ur WHERE ur.id = r.id
);

-- Migrate existing horoscope readings to unified table
INSERT INTO user_readings (
    id,
    user_id,
    reading_type,
    title,
    question,
    interpretation,
    reading_data,
    ai_generated,
    created_at,
    updated_at
)
SELECT 
    id,
    user_id,
    'horoscope' as reading_type,
    CONCAT(INITCAP(zodiac_sign), ' ', INITCAP(horoscope_type), ' Horoscope') as title,
    NULL as question,
    reading_text as interpretation,
    jsonb_build_object(
        'zodiac_sign', zodiac_sign,
        'horoscope_type', horoscope_type,
        'date_scope', date_scope
    ) as reading_data,
    ai_generated,
    created_at,
    updated_at
FROM horoscope_readings
WHERE NOT EXISTS (
    SELECT 1 FROM user_readings ur WHERE ur.id = horoscope_readings.id
);

-- Update user_stats function to work with unified table
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

-- Create trigger for unified readings table
CREATE TRIGGER update_stats_after_unified_reading AFTER INSERT ON user_readings
    FOR EACH ROW EXECUTE FUNCTION update_user_stats_after_reading();

-- Create a view for backward compatibility with old readings table
CREATE OR REPLACE VIEW readings_view AS
SELECT 
    id,
    user_id,
    (reading_data->>'spread_id')::VARCHAR(50) as spread_id,
    question,
    interpretation as overall_interpretation,
    ai_generated,
    created_at,
    updated_at
FROM user_readings
WHERE reading_type = 'tarot';

-- Create a view for backward compatibility with horoscope_readings table
CREATE OR REPLACE VIEW horoscope_readings_view AS
SELECT 
    id,
    user_id,
    (reading_data->>'zodiac_sign')::VARCHAR(50) as zodiac_sign,
    (reading_data->>'horoscope_type')::VARCHAR(50) as horoscope_type,
    interpretation as reading_text,
    (reading_data->>'date_scope')::VARCHAR(50) as date_scope,
    ai_generated,
    created_at,
    updated_at
FROM user_readings
WHERE reading_type = 'horoscope';

COMMENT ON TABLE user_readings IS 'Unified table storing all reading types (tarot, horoscope, palm, numerology, mystical)';
COMMENT ON COLUMN user_readings.reading_type IS 'Type of reading: tarot, horoscope, palm, numerology, mystical';
COMMENT ON COLUMN user_readings.reading_data IS 'Type-specific data stored as JSONB for flexibility';
