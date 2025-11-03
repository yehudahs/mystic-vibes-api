import { query, transaction } from '../config/database.js'

/**
 * Unified Reading Service
 * Central place for saving all types of readings to the database
 */

class ReadingService {
  /**
   * Save any type of reading to the unified user_readings table
   * @param {Object} reading - Reading data
   * @param {string} reading.userId - User ID
   * @param {string} reading.readingType - Type: 'tarot', 'horoscope', 'palm', 'numerology', 'mystical'
   * @param {string} reading.title - Reading title
   * @param {string} [reading.question] - Optional user question
   * @param {string} reading.interpretation - Main reading text/interpretation
   * @param {Object} reading.data - Type-specific data (will be stored as JSONB)
   * @param {boolean} [reading.aiGenerated=true] - Whether AI generated
   * @param {string} [reading.aiProvider] - AI provider (e.g., 'ollama')
   * @param {string} [reading.aiModel] - AI model used
   * @param {boolean} [reading.isPublic=false] - Whether reading is public
   * @returns {Promise<Object>} Created reading
   */
  async saveReading(reading) {
    const {
      userId,
      readingType,
      title,
      question = null,
      interpretation,
      data = {},
      aiGenerated = true,
      aiProvider = null,
      aiModel = null,
      isPublic = false
    } = reading

    // Validate required fields
    if (!userId || !readingType || !title || !interpretation) {
      throw new Error('Missing required fields: userId, readingType, title, interpretation')
    }

    // Validate reading type
    const validTypes = ['tarot', 'horoscope', 'palm', 'numerology', 'mystical']
    if (!validTypes.includes(readingType)) {
      throw new Error(`Invalid reading type. Must be one of: ${validTypes.join(', ')}`)
    }

    try {
      const result = await query(
        `INSERT INTO user_readings (
          user_id, reading_type, title, question, interpretation,
          reading_data, ai_generated, ai_provider, ai_model, is_public
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *`,
        [
          userId,
          readingType,
          title,
          question,
          interpretation,
          JSON.stringify(data),
          aiGenerated,
          aiProvider,
          aiModel,
          isPublic
        ]
      )

      console.log(`✅ Saved ${readingType} reading for user ${userId}:`, result.rows[0].id)
      return result.rows[0]
    } catch (error) {
      console.error('❌ Failed to save reading:', error)
      throw new Error(`Failed to save reading: ${error.message}`)
    }
  }

  /**
   * Save a tarot reading
   */
  async saveTarotReading({ userId, spreadId, spreadName, question, interpretation, cards, aiGenerated = true, aiProvider, aiModel }) {
    return this.saveReading({
      userId,
      readingType: 'tarot',
      title: question || spreadName || 'Tarot Reading',
      question,
      interpretation,
      data: {
        spread_id: spreadId,
        spread_name: spreadName,
        cards: cards // Array of card objects
      },
      aiGenerated,
      aiProvider,
      aiModel
    })
  }

  /**
   * Save a horoscope reading
   */
  async saveHoroscopeReading({ userId, zodiacSign, horoscopeType, question, interpretation, dateScope, aiGenerated = true, aiProvider, aiModel }) {
    return this.saveReading({
      userId,
      readingType: 'horoscope',
      title: `${zodiacSign.charAt(0).toUpperCase() + zodiacSign.slice(1)} ${horoscopeType} Horoscope`,
      question,
      interpretation,
      data: {
        zodiac_sign: zodiacSign,
        horoscope_type: horoscopeType,
        date_scope: dateScope
      },
      aiGenerated,
      aiProvider,
      aiModel
    })
  }

  /**
   * Save a palm reading
   */
  async savePalmReading({ userId, question, interpretation, imageUrl, features, analysisMethod, aiGenerated = true, aiProvider, aiModel }) {
    return this.saveReading({
      userId,
      readingType: 'palm',
      title: question || 'Palm Reading',
      question,
      interpretation,
      data: {
        image_url: imageUrl,
        features: features, // Array of detected features
        analysis_method: analysisMethod
      },
      aiGenerated,
      aiProvider,
      aiModel
    })
  }

  /**
   * Save a numerology reading
   */
  async saveNumerologyReading({ userId, name, birthDate, lifePath, expression, soulUrge, interpretation, aiGenerated = true, aiProvider, aiModel }) {
    return this.saveReading({
      userId,
      readingType: 'numerology',
      title: `Numerology Reading for ${name}`,
      question: null,
      interpretation,
      data: {
        name,
        birth_date: birthDate,
        life_path: lifePath,
        expression_number: expression,
        soul_urge: soulUrge
      },
      aiGenerated,
      aiProvider,
      aiModel
    })
  }

  /**
   * Save a mystical reading (meditation, affirmation, spiritual guidance, etc.)
   */
  async saveMysticalReading({ userId, mysticalType, question, interpretation, context = {}, aiGenerated = true, aiProvider, aiModel }) {
    return this.saveReading({
      userId,
      readingType: 'mystical',
      title: question || `${mysticalType} Reading`,
      question,
      interpretation,
      data: {
        mystical_type: mysticalType, // 'meditation', 'affirmation', 'spiritual-guidance', etc.
        context
      },
      aiGenerated,
      aiProvider,
      aiModel
    })
  }

  /**
   * Get all readings for a user
   */
  async getUserReadings(userId, { limit = 50, offset = 0, readingType = null } = {}) {
    let queryText = `
      SELECT 
        id, user_id, reading_type, title, question, interpretation,
        reading_data, ai_generated, ai_provider, ai_model, is_public,
        created_at, updated_at
      FROM user_readings
      WHERE user_id = $1
    `
    const params = [userId]

    if (readingType) {
      queryText += ` AND reading_type = $2`
      params.push(readingType)
      queryText += ` ORDER BY created_at DESC LIMIT $3 OFFSET $4`
      params.push(limit, offset)
    } else {
      queryText += ` ORDER BY created_at DESC LIMIT $2 OFFSET $3`
      params.push(limit, offset)
    }

    const result = await query(queryText, params)
    return result.rows
  }

  /**
   * Get a specific reading by ID
   */
  async getReadingById(readingId, userId) {
    const result = await query(
      `SELECT * FROM user_readings WHERE id = $1 AND user_id = $2`,
      [readingId, userId]
    )
    
    if (result.rows.length === 0) {
      throw new Error('Reading not found')
    }
    
    return result.rows[0]
  }

  /**
   * Delete a reading
   */
  async deleteReading(readingId, userId) {
    const result = await query(
      `DELETE FROM user_readings WHERE id = $1 AND user_id = $2 RETURNING *`,
      [readingId, userId]
    )
    
    if (result.rows.length === 0) {
      throw new Error('Reading not found or not authorized')
    }
    
    return result.rows[0]
  }

  /**
   * Get reading statistics for a user
   */
  async getUserReadingStats(userId) {
    const result = await query(
      `SELECT 
        reading_type,
        COUNT(*) as count,
        MAX(created_at) as last_reading
      FROM user_readings
      WHERE user_id = $1
      GROUP BY reading_type
      ORDER BY count DESC`,
      [userId]
    )
    
    const stats = {
      total: 0,
      by_type: {}
    }
    
    result.rows.forEach(row => {
      stats.total += parseInt(row.count)
      stats.by_type[row.reading_type] = {
        count: parseInt(row.count),
        last_reading: row.last_reading
      }
    })
    
    return stats
  }
}

export default new ReadingService()
