import express from 'express'
import { query } from '../config/database.js'
import { asyncHandler } from '../middleware/errorHandler.js'

const router = express.Router()

// GET /api/spreads - Get all available tarot spreads
router.get('/', asyncHandler(async (req, res) => {
  const result = await query(
    'SELECT * FROM tarot_spreads ORDER BY card_count ASC, name ASC'
  )

  const spreads = result.rows.map(spread => ({
    id: spread.id,
    name: spread.name,
    description: spread.description,
    cardCount: spread.card_count,
    positions: spread.positions
  }))

  res.json(spreads)
}))

// GET /api/spreads/:id - Get specific spread
router.get('/:id', asyncHandler(async (req, res) => {
  const { id } = req.params

  const result = await query(
    'SELECT * FROM tarot_spreads WHERE id = $1',
    [id]
  )

  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'Spread not found' })
  }

  const spread = result.rows[0]
  res.json({
    id: spread.id,
    name: spread.name,
    description: spread.description,
    cardCount: spread.card_count,
    positions: spread.positions
  })
}))

export default router