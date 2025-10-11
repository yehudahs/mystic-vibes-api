import express from 'express'
import Joi from 'joi'
import { query, transaction } from '../config/database.js'
import { asyncHandler } from '../middleware/errorHandler.js'

const router = express.Router()

// Validation schemas
const createReadingSchema = Joi.object({
  spreadId: Joi.string().required(),
  question: Joi.string().allow('').max(1000),
  overallInterpretation: Joi.string().required().max(10000),
  aiGenerated: Joi.boolean().default(false),
  cards: Joi.array().items(
    Joi.object({
      cardId: Joi.string().required(),
      positionName: Joi.string().required(),
      positionIndex: Joi.number().integer().min(0).required(),
      isReversed: Joi.boolean().default(false),
      interpretation: Joi.string().required().max(2000)
    })
  ).min(1).required()
})

// GET /api/readings - Get user's readings with pagination
router.get('/', asyncHandler(async (req, res) => {
  const { page = 1, limit = 10, spreadId, search } = req.query
  const offset = (page - 1) * limit

  let whereClause = 'WHERE r.user_id = $1'
  let params = [req.user.id]
  let paramIndex = 2

  // Filter by spread
  if (spreadId) {
    whereClause += ` AND r.spread_id = $${paramIndex}`
    params.push(spreadId)
    paramIndex++
  }

  // Search in question or interpretation
  if (search) {
    whereClause += ` AND (r.question ILIKE $${paramIndex} OR r.overall_interpretation ILIKE $${paramIndex})`
    params.push(`%${search}%`)
    paramIndex++
  }

  // Get readings with spread info
  const readingsQuery = `
    SELECT 
      r.*,
      ts.name as spread_name,
      ts.description as spread_description,
      ts.positions as spread_positions,
      COUNT(*) OVER() as total_count
    FROM readings r
    JOIN tarot_spreads ts ON r.spread_id = ts.id
    ${whereClause}
    ORDER BY r.created_at DESC
    LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
  `
  
  params.push(limit, offset)
  const result = await query(readingsQuery, params)
  
  const totalCount = result.rows.length > 0 ? parseInt(result.rows[0].total_count) : 0
  const totalPages = Math.ceil(totalCount / limit)

  // Get cards for each reading
  const readingsWithCards = await Promise.all(
    result.rows.map(async (reading) => {
      const cardsResult = await query(
        `SELECT rc.*, tc.name as card_name, tc.suit, tc.keywords 
         FROM reading_cards rc
         JOIN tarot_cards tc ON rc.card_id = tc.id
         WHERE rc.reading_id = $1
         ORDER BY rc.position_index`,
        [reading.id]
      )

      return {
        id: reading.id,
        spreadId: reading.spread_id,
        question: reading.question,
        interpretation: reading.overall_interpretation,
        aiGenerated: reading.ai_generated,
        createdAt: reading.created_at,
        updatedAt: reading.updated_at,
        spread: {
          id: reading.spread_id,
          name: reading.spread_name,
          description: reading.spread_description,
          positions: reading.spread_positions
        },
        drawnCards: cardsResult.rows.map(card => ({
          card: {
            id: card.card_id,
            name: card.card_name,
            suit: card.suit,
            keywords: card.keywords || []
          },
          position: card.position_name,
          positionIndex: card.position_index,
          isReversed: card.is_reversed,
          interpretation: card.interpretation
        }))
      }
    })
  )

  res.json({
    readings: readingsWithCards,
    pagination: {
      currentPage: parseInt(page),
      totalPages,
      totalCount,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1
    }
  })
}))

// GET /api/readings/:id - Get specific reading
router.get('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params

  // Get reading with spread info
  const readingResult = await query(
    `SELECT r.*, ts.name as spread_name, ts.description as spread_description, ts.positions as spread_positions
     FROM readings r
     JOIN tarot_spreads ts ON r.spread_id = ts.id
     WHERE r.id = $1 AND r.user_id = $2`,
    [id, req.user.id]
  )

  if (readingResult.rows.length === 0) {
    return res.status(404).json({ error: 'Reading not found' })
  }

  const reading = readingResult.rows[0]

  // Get cards for the reading
  const cardsResult = await query(
    `SELECT rc.*, tc.name as card_name, tc.suit, tc.keywords 
     FROM reading_cards rc
     JOIN tarot_cards tc ON rc.card_id = tc.id
     WHERE rc.reading_id = $1
     ORDER BY rc.position_index`,
    [id]
  )

  const readingWithCards = {
    id: reading.id,
    spreadId: reading.spread_id,
    question: reading.question,
    interpretation: reading.overall_interpretation,
    aiGenerated: reading.ai_generated,
    createdAt: reading.created_at,
    updatedAt: reading.updated_at,
    spread: {
      id: reading.spread_id,
      name: reading.spread_name,
      description: reading.spread_description,
      positions: reading.spread_positions
    },
    drawnCards: cardsResult.rows.map(card => ({
      card: {
        id: card.card_id,
        name: card.card_name,
        suit: card.suit,
        keywords: card.keywords || []
      },
      position: card.position_name,
      positionIndex: card.position_index,
      isReversed: card.is_reversed,
      interpretation: card.interpretation
    }))
  }

  res.json(readingWithCards)
}))

// POST /api/readings - Create new reading
router.post('/', asyncHandler(async (req, res) => {
  const { error, value } = createReadingSchema.validate(req.body)
  if (error) {
    return res.status(400).json({ error: error.details[0].message })
  }

  const { spreadId, question, overallInterpretation, aiGenerated, cards } = value

  // Verify spread exists
  const spreadResult = await query('SELECT id FROM tarot_spreads WHERE id = $1', [spreadId])
  if (spreadResult.rows.length === 0) {
    return res.status(400).json({ error: 'Invalid spread ID' })
  }

  // Create reading in transaction
  const result = await transaction(async (client) => {
    // Insert reading
    const readingResult = await client.query(
      `INSERT INTO readings (user_id, spread_id, question, overall_interpretation, ai_generated)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [req.user.id, spreadId, question, overallInterpretation, aiGenerated]
    )

    const readingId = readingResult.rows[0].id

    // Insert cards
    for (const card of cards) {
      await client.query(
        `INSERT INTO reading_cards (reading_id, card_id, position_name, position_index, is_reversed, interpretation)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [readingId, card.cardId, card.positionName, card.positionIndex, card.isReversed, card.interpretation]
      )
    }

    return readingResult.rows[0]
  })

  res.status(201).json({
    message: 'Reading created successfully',
    readingId: result.id
  })
}))

// DELETE /api/readings/:id - Delete reading
router.delete('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params

  const result = await query(
    'DELETE FROM readings WHERE id = $1 AND user_id = $2 RETURNING id',
    [id, req.user.id]
  )

  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'Reading not found' })
  }

  res.json({ message: 'Reading deleted successfully' })
}))

// GET /api/readings/stats - Get user reading statistics  
router.get('/stats', asyncHandler(async (req, res) => {
  const statsResult = await query(
    'SELECT * FROM user_stats WHERE user_id = $1',
    [req.user.id]
  )

  if (statsResult.rows.length === 0) {
    return res.json({
      totalReadings: 0,
      favoriteSpreadId: null,
      lastReadingDate: null,
      readingsThisMonth: 0,
      readingsByMonth: {},
      readingsBySpread: {}
    })
  }

  const stats = statsResult.rows[0]
  res.json({
    totalReadings: stats.total_readings,
    favoriteSpreadId: stats.favorite_spread_id,
    lastReadingDate: stats.last_reading_date,
    readingsThisMonth: stats.readings_this_month,
    readingsByMonth: stats.readings_by_month,
    readingsBySpread: stats.readings_by_spread
  })
}))

export default router