import express from 'express'
import { query, transaction } from '../config/database.js'
import { authenticateToken } from '../middleware/auth.js'

const router = express.Router()

// All horoscope routes require authentication
router.use(authenticateToken)

/**
 * GET /api/horoscopes
 * Get all horoscope readings for the authenticated user
 */
router.get('/', async (req, res) => {
  try {
    const userId = req.user.id
    const { limit = 50, offset = 0, zodiac_sign, horoscope_type } = req.query

    let queryText = `
      SELECT 
        id,
        user_id,
        zodiac_sign,
        horoscope_type,
        reading_text,
        date_scope,
        ai_generated,
        created_at,
        updated_at
      FROM horoscope_readings 
      WHERE user_id = $1
    `
    
    const queryParams = [userId]
    let paramIndex = 2

    // Add optional filters
    if (zodiac_sign) {
      queryText += ` AND zodiac_sign = $${paramIndex}`
      queryParams.push(zodiac_sign)
      paramIndex++
    }

    if (horoscope_type) {
      queryText += ` AND horoscope_type = $${paramIndex}`
      queryParams.push(horoscope_type)
      paramIndex++
    }

    queryText += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`
    queryParams.push(parseInt(limit), parseInt(offset))

    const result = await query(queryText, queryParams)

    res.json({
      horoscopes: result.rows,
      total: result.rows.length,
      limit: parseInt(limit),
      offset: parseInt(offset)
    })
  } catch (error) {
    console.error('Error fetching horoscopes:', error)
    res.status(500).json({ error: 'Failed to fetch horoscope readings' })
  }
})

/**
 * POST /api/horoscopes
 * Create a new horoscope reading
 */
router.post('/', async (req, res) => {
  try {
    const userId = req.user.id
    const { 
      zodiac_sign, 
      horoscope_type, 
      reading_text, 
      date_scope, 
      ai_generated = true 
    } = req.body

    // Validate required fields
    if (!zodiac_sign || !horoscope_type || !reading_text || !date_scope) {
      return res.status(400).json({ 
        error: 'Missing required fields: zodiac_sign, horoscope_type, reading_text, date_scope' 
      })
    }

    // Validate zodiac sign
    const validZodiacSigns = [
      'aries', 'taurus', 'gemini', 'cancer', 'leo', 'virgo',
      'libra', 'scorpio', 'sagittarius', 'capricorn', 'aquarius', 'pisces'
    ]
    if (!validZodiacSigns.includes(zodiac_sign.toLowerCase())) {
      return res.status(400).json({ 
        error: 'Invalid zodiac sign' 
      })
    }

    // Validate horoscope type
    const validTypes = ['daily', 'weekly', 'monthly', 'yearly']
    if (!validTypes.includes(horoscope_type.toLowerCase())) {
      return res.status(400).json({ 
        error: 'Invalid horoscope type. Must be: daily, weekly, monthly, or yearly' 
      })
    }

    const insertResult = await query(
      `INSERT INTO horoscope_readings 
       (user_id, zodiac_sign, horoscope_type, reading_text, date_scope, ai_generated)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [userId, zodiac_sign.toLowerCase(), horoscope_type.toLowerCase(), reading_text, date_scope, ai_generated]
    )

    const horoscope = insertResult.rows[0]

    res.status(201).json({
      message: 'Horoscope reading saved successfully',
      horoscope
    })
  } catch (error) {
    console.error('Error saving horoscope:', error)
    res.status(500).json({ error: 'Failed to save horoscope reading' })
  }
})

/**
 * GET /api/horoscopes/:id
 * Get a specific horoscope reading by ID
 */
router.get('/:id', async (req, res) => {
  try {
    const userId = req.user.id
    const horoscopeId = req.params.id

    const result = await query(
      `SELECT * FROM horoscope_readings 
       WHERE id = $1 AND user_id = $2`,
      [horoscopeId, userId]
    )

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Horoscope reading not found' })
    }

    res.json({ horoscope: result.rows[0] })
  } catch (error) {
    console.error('Error fetching horoscope:', error)
    res.status(500).json({ error: 'Failed to fetch horoscope reading' })
  }
})

/**
 * DELETE /api/horoscopes/:id
 * Delete a specific horoscope reading
 */
router.delete('/:id', async (req, res) => {
  try {
    const userId = req.user.id
    const horoscopeId = req.params.id

    const result = await query(
      `DELETE FROM horoscope_readings 
       WHERE id = $1 AND user_id = $2
       RETURNING *`,
      [horoscopeId, userId]
    )

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Horoscope reading not found' })
    }

    res.json({ 
      message: 'Horoscope reading deleted successfully',
      deleted_horoscope: result.rows[0]
    })
  } catch (error) {
    console.error('Error deleting horoscope:', error)
    res.status(500).json({ error: 'Failed to delete horoscope reading' })
  }
})

/**
 * GET /api/horoscopes/stats/summary
 * Get horoscope reading statistics for the user
 */
router.get('/stats/summary', async (req, res) => {
  try {
    const userId = req.user.id

    const statsResult = await query(
      `SELECT 
        COUNT(*) as total_horoscopes,
        COUNT(DISTINCT zodiac_sign) as zodiac_signs_read,
        COUNT(DISTINCT horoscope_type) as types_read,
        MAX(created_at) as last_reading_date,
        MIN(created_at) as first_reading_date
       FROM horoscope_readings 
       WHERE user_id = $1`,
      [userId]
    )

    const typeBreakdown = await query(
      `SELECT horoscope_type, COUNT(*) as count
       FROM horoscope_readings 
       WHERE user_id = $1
       GROUP BY horoscope_type
       ORDER BY count DESC`,
      [userId]
    )

    const zodiacBreakdown = await query(
      `SELECT zodiac_sign, COUNT(*) as count
       FROM horoscope_readings 
       WHERE user_id = $1
       GROUP BY zodiac_sign
       ORDER BY count DESC`,
      [userId]
    )

    res.json({
      summary: statsResult.rows[0],
      by_type: typeBreakdown.rows,
      by_zodiac: zodiacBreakdown.rows
    })
  } catch (error) {
    console.error('Error fetching horoscope stats:', error)
    res.status(500).json({ error: 'Failed to fetch horoscope statistics' })
  }
})

export default router