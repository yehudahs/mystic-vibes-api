-- Migration: Create gallery_readings table for admin-curated sample/gallery readings
-- These are public, non-user-owned readings shown on the homepage and /how-it-works
-- to demonstrate the quality of each reading type. Separate from user_readings to
-- avoid mixing public marketing data with private user history.

CREATE TABLE IF NOT EXISTS gallery_readings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Stable identifier (e.g. 'palm-1', 'tarot-three-card-1')
    slug VARCHAR(100) NOT NULL UNIQUE,

    -- Reading type — matches user_readings convention
    reading_type VARCHAR(50) NOT NULL,
    -- 'palm' | 'tarot' | 'numerology' | 'horoscope'

    -- Display metadata
    title VARCHAR(255),                    -- e.g. 'Right hand, long heart line'
    description TEXT,                      -- 1-line teaser for cards
    display_order INTEGER NOT NULL DEFAULT 0,
    featured BOOLEAN NOT NULL DEFAULT false,

    -- The reading content
    interpretation TEXT NOT NULL,          -- AI-generated prose
    reading_data JSONB NOT NULL DEFAULT '{}',
    -- Examples (mirrors user_readings.reading_data shape):
    -- Palm: { measurements, mounts, overlay, sources, trait_sources, ... }
    -- Tarot: { cards, spread, sources, trait_sources, ... }
    -- Horoscope: { sign, type, sources, trait_sources, ... }
    -- Numerology: { numbers, name_breakdown, sources, trait_sources, ... }

    -- Palm-only: path to the overlay PNG saved as a static asset
    input_image_url TEXT,

    -- Provenance
    ai_provider VARCHAR(50),               -- 'ollama'
    ai_model VARCHAR(100),                 -- 'qwen2.5:7b'

    -- Timestamps
    generated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for filtering by reading type
CREATE INDEX IF NOT EXISTS idx_gallery_readings_type
    ON gallery_readings(reading_type);

-- Index for the homepage gallery query (featured + ordered)
CREATE INDEX IF NOT EXISTS idx_gallery_readings_featured_order
    ON gallery_readings(featured DESC, display_order ASC);

-- Auto-update updated_at on row changes
CREATE OR REPLACE FUNCTION trigger_gallery_readings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_gallery_readings_updated_at ON gallery_readings;
CREATE TRIGGER set_gallery_readings_updated_at
    BEFORE UPDATE ON gallery_readings
    FOR EACH ROW
    EXECUTE FUNCTION trigger_gallery_readings_updated_at();
