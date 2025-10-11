-- Migration: Add horoscope tables for persistent storage
-- This ensures horoscope readings are saved in the database like tarot readings

-- Create horoscope_readings table (main horoscope reading record)
CREATE TABLE IF NOT EXISTS horoscope_readings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    zodiac_sign VARCHAR(20) NOT NULL,
    horoscope_type VARCHAR(20) NOT NULL, -- 'daily', 'weekly', 'monthly', 'yearly'
    reading_text TEXT NOT NULL,
    date_scope DATE NOT NULL, -- The date this horoscope is for
    ai_generated BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_horoscope_readings_user_id ON horoscope_readings(user_id);
CREATE INDEX IF NOT EXISTS idx_horoscope_readings_created_at ON horoscope_readings(created_at);
CREATE INDEX IF NOT EXISTS idx_horoscope_readings_zodiac_type ON horoscope_readings(zodiac_sign, horoscope_type);
CREATE INDEX IF NOT EXISTS idx_horoscope_readings_date_scope ON horoscope_readings(date_scope);

-- Add update trigger for updated_at
CREATE OR REPLACE FUNCTION update_horoscope_readings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_horoscope_readings_updated_at
    BEFORE UPDATE ON horoscope_readings
    FOR EACH ROW
    EXECUTE FUNCTION update_horoscope_readings_updated_at();

-- Add stats trigger to update user stats when horoscope is created
CREATE OR REPLACE FUNCTION update_user_stats_after_horoscope()
RETURNS TRIGGER AS $$
BEGIN
    -- Update user stats (create if doesn't exist)
    INSERT INTO user_stats (user_id, total_readings, last_reading_date)
    VALUES (NEW.user_id, 1, NEW.created_at)
    ON CONFLICT (user_id) 
    DO UPDATE SET 
        total_readings = user_stats.total_readings + 1,
        last_reading_date = NEW.created_at,
        updated_at = NOW();
    
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_stats_after_horoscope
    AFTER INSERT ON horoscope_readings
    FOR EACH ROW
    EXECUTE FUNCTION update_user_stats_after_horoscope();

-- Add comments for documentation
COMMENT ON TABLE horoscope_readings IS 'Stores horoscope readings with full persistence across devices and sessions';
COMMENT ON COLUMN horoscope_readings.zodiac_sign IS 'Zodiac sign: aries, taurus, gemini, cancer, leo, virgo, libra, scorpio, sagittarius, capricorn, aquarius, pisces';
COMMENT ON COLUMN horoscope_readings.horoscope_type IS 'Type of horoscope: daily, weekly, monthly, yearly';
COMMENT ON COLUMN horoscope_readings.date_scope IS 'The date this horoscope reading is for (not when it was created)';