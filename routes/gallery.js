import express from 'express'
import { query } from '../config/database.js'
import { asyncHandler } from '../middleware/errorHandler.js'

const router = express.Router()

// GET /api/gallery — all gallery readings, ordered for homepage display
router.get('/', asyncHandler(async (req, res) => {
  const { type } = req.query
  const params = []
  let where = ''
  if (type) {
    params.push(type)
    where = `WHERE reading_type = $1`
  }
  const result = await query(
    `SELECT id, slug, reading_type, question, title, description, display_order, featured,
            interpretation, reading_data, input_image_url, ai_provider, ai_model,
            generated_at, updated_at
       FROM gallery_readings
       ${where}
       ORDER BY featured DESC, display_order ASC, generated_at DESC`,
    params,
  )
  res.json({ samples: result.rows })
}))

// GET /api/gallery/:slug — single gallery reading by slug
router.get('/:slug', asyncHandler(async (req, res) => {
  const { slug } = req.params
  const result = await query(
    `SELECT id, slug, reading_type, question, title, description, display_order, featured,
            interpretation, reading_data, input_image_url, ai_provider, ai_model,
            generated_at, updated_at
       FROM gallery_readings
       WHERE slug = $1
       LIMIT 1`,
    [slug],
  )
  if (result.rows.length === 0) return res.status(404).json({ error: 'Sample not found' })
  res.json(result.rows[0])
}))

export default router
