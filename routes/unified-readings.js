import express from 'express'
import { authenticateToken } from '../middleware/auth.js'
import readingService from '../services/readingService.js'

const router = express.Router()

// All routes require authentication
router.use(authenticateToken)

/**
 * POST /api/readings/save
 * Save any type of reading (tarot, horoscope, palm, numerology, mystical)
 * Central endpoint for all reading saves
 */
router.post('/save', async (req, res) => {
  try {
    const userId = req.user.id
    const { type, ...readingData } = req.body

    console.log(`📝 Saving ${type} reading for user ${userId}`)

    let savedReading

    switch (type) {
      case 'tarot':
        savedReading = await readingService.saveTarotReading({
          userId,
          ...readingData
        })
        break

      case 'horoscope':
        savedReading = await readingService.saveHoroscopeReading({
          userId,
          ...readingData
        })
        break

      case 'palm':
        savedReading = await readingService.savePalmReading({
          userId,
          ...readingData
        })
        break

      case 'numerology':
        savedReading = await readingService.saveNumerologyReading({
          userId,
          ...readingData
        })
        break

      case 'mystical':
        savedReading = await readingService.saveMysticalReading({
          userId,
          ...readingData
        })
        break

      default:
        return res.status(400).json({
          error: `Invalid reading type: ${type}. Must be one of: tarot, horoscope, palm, numerology, mystical`
        })
    }

    res.status(201).json({
      success: true,
      message: 'Reading saved successfully',
      reading: savedReading
    })
  } catch (error) {
    console.error('❌ Error saving reading:', error)
    res.status(500).json({
      error: 'Failed to save reading',
      details: error.message
    })
  }
})

/**
 * GET /api/readings/all
 * Get all readings for the authenticated user
 */
router.get('/all', async (req, res) => {
  try {
    const userId = req.user.id
    const { limit = 50, offset = 0, type } = req.query

    const readings = await readingService.getUserReadings(userId, {
      limit: parseInt(limit),
      offset: parseInt(offset),
      readingType: type || null
    })

    res.json({
      success: true,
      readings,
      count: readings.length
    })
  } catch (error) {
    console.error('❌ Error fetching readings:', error)
    res.status(500).json({
      error: 'Failed to fetch readings',
      details: error.message
    })
  }
})

/**
 * GET /api/readings/stats
 * Get reading statistics for the authenticated user
 */
router.get('/stats', async (req, res) => {
  try {
    const userId = req.user.id
    const stats = await readingService.getUserReadingStats(userId)

    res.json({
      success: true,
      stats
    })
  } catch (error) {
    console.error('❌ Error fetching reading stats:', error)
    res.status(500).json({
      error: 'Failed to fetch reading statistics',
      details: error.message
    })
  }
})

/**
 * GET /api/readings/:id
 * Get a specific reading by ID
 */
router.get('/:id', async (req, res) => {
  try {
    const userId = req.user.id
    const { id } = req.params

    const reading = await readingService.getReadingById(id, userId)

    res.json({
      success: true,
      reading
    })
  } catch (error) {
    console.error('❌ Error fetching reading:', error)
    res.status(error.message === 'Reading not found' ? 404 : 500).json({
      error: error.message
    })
  }
})

/**
 * DELETE /api/readings/:id
 * Delete a reading
 */
router.delete('/:id', async (req, res) => {
  try {
    const userId = req.user.id
    const { id } = req.params

    const deletedReading = await readingService.deleteReading(id, userId)

    res.json({
      success: true,
      message: 'Reading deleted successfully',
      reading: deletedReading
    })
  } catch (error) {
    console.error('❌ Error deleting reading:', error)
    res.status(error.message === 'Reading not found or not authorized' ? 404 : 500).json({
      error: error.message
    })
  }
})

export default router
