import express from 'express'
import { query } from '../config/database.js'
import { asyncHandler } from '../middleware/errorHandler.js'

const router = express.Router()

// GET /api/gallery — all gallery readings, ordered for homepage display.
//
// Returns a TRIMMED projection. Full reading_data (which embeds palm CV
// overlays as base64 — up to 4MB per palm row) is omitted: with 210
// articles the full response is ~175MB, the trimmed one is ~200KB. The
// modal calls GET /:slug to fetch the full row when a card is opened.
//
// Card display only needs: slug, type, question/title, generated_at,
// input_image_url, og_image_url (one scalar from reading_data), and a
// short interpretation excerpt for the no-image fallback card preview.
router.get('/', asyncHandler(async (req, res) => {
  const { type } = req.query
  const params = []
  let where = ''
  if (type) {
    params.push(type)
    where = `WHERE reading_type = $1`
  }
  // We DO return the full interpretation here. It's the dominant text field
  // (~6KB per row × 210 = ~1.5MB total) but the article body is what the
  // modal renders immediately on open; truncating it makes the modal show
  // a cut-off paragraph that then pops to full text when bySlug resolves.
  // What we still strip is `reading_data` — the palm CV blobs (overlay
  // images base64'd into jsonb, up to 4MB per palm row) which the modal
  // only needs after the user clicks a palm card.
  const result = await query(
    `SELECT id, slug, reading_type, question, title, description, display_order, featured,
            interpretation, input_image_url, generated_at,
            jsonb_build_object(
              'og_image_url', reading_data->>'og_image_url'
            ) AS reading_data
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
