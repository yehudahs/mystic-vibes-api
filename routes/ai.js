import express from 'express'
import aiService from '../services/aiService.js'
import ollamaMonitor from '../services/ollamaMonitor.js'
import { authenticateToken, optionalAuth } from '../middleware/auth.js'
import { pool } from '../config/database.js'

const router = express.Router()

// AI Health Check
router.get('/health', async (req, res) => {
  try {
    const health = await aiService.healthCheck()
    res.json(health)
  } catch (error) {
    res.status(500).json({
      error: 'AI service health check failed',
      message: error.message
    })
  }
})

// Test endpoint - no auth required
router.post('/test/reading', async (req, res) => {
  try {
    const cards = [
      { name: 'The Fool', position: 'Past' },
      { name: 'The Magician', position: 'Present' },
      { name: 'The Star', position: 'Future' }
    ]
    const question = 'Test question for debugging'
    const spread = 'Three Card'

    console.log('🧪 Test reading request received')

    const reading = await aiService.generateTarotReading(cards, question, spread)

    res.json({
      success: true,
      reading: reading.content,
      message: 'Test reading generated successfully',
      metadata: {
        provider: reading.provider,
        model: reading.model,
        usage: reading.usage
      }
    })
  } catch (error) {
    console.error('Test reading error:', error)
    res.status(500).json({
      error: 'Failed to generate test reading',
      message: error.message
    })
  }
})

// Generate Tarot Reading
router.post('/tarot/reading', optionalAuth, async (req, res) => {
  try {
    const { cards, question, spread } = req.body
    const userId = req.user?.id

    console.log('🔮 AI Tarot Request:', {
      timestamp: new Date().toISOString(),
      userId: userId,
      cards: cards?.length || 0,
      question: question?.substring(0, 50) + '...',
      spread: spread
    })

    if (!cards || !Array.isArray(cards) || cards.length === 0) {
      return res.status(400).json({
        error: 'Cards array is required'
      })
    }

    if (!question || question.trim().length === 0) {
      return res.status(400).json({
        error: 'Question is required'
      })
    }

    // Load user's context from database if authenticated
    let userContext = null
    if (userId) {
      const contextResult = await pool.query(
        'SELECT ai_context FROM users WHERE id = $1',
        [userId]
      )
      const contextJson = contextResult.rows[0]?.ai_context
      if (contextJson) {
        // Parse JSON string back to array
        userContext = typeof contextJson === 'string' ? JSON.parse(contextJson) : contextJson
        console.log('💭 Loaded user context:', userContext.length, 'tokens')
      }
    }

    // Generate reading with context
    const reading = await aiService.generateTarotReading(cards, question, spread, userContext)

    // Save updated context back to database if authenticated and context was returned
    if (userId && reading.context) {
      await pool.query(
        'UPDATE users SET ai_context = $1 WHERE id = $2',
        [JSON.stringify(reading.context), userId]
      )
      console.log('💾 Saved new context:', reading.context.length, 'tokens')
    }

    console.log('🔮 AI Tarot Response:', {
      timestamp: new Date().toISOString(),
      provider: reading.provider,
      model: reading.model,
      responseLength: reading.content?.length || 0,
      contextSaved: !!reading.context
    })

    res.json({
      success: true,
      reading: reading.content,
      metadata: {
        provider: reading.provider,
        model: reading.model,
        usage: reading.usage
      }
    })
  } catch (error) {
    console.error('Tarot reading error:', error)
    res.status(500).json({
      error: 'Failed to generate tarot reading',
      message: error.message
    })
  }
})

// Generate Horoscope
router.post('/horoscope/generate', authenticateToken, async (req, res) => {
  try {
    const { sign, type = 'daily', question = null } = req.body

    console.log('🌟 AI Horoscope Request:', {
      timestamp: new Date().toISOString(),
      userId: req.user?.id,
      sign: sign,
      type: type,
      hasQuestion: !!question
    })

    if (!sign) {
      return res.status(400).json({
        error: 'Zodiac sign is required'
      })
    }

    const validSigns = ['aries', 'taurus', 'gemini', 'cancer', 'leo', 'virgo',
                        'libra', 'scorpio', 'sagittarius', 'capricorn', 'aquarius', 'pisces']

    if (!validSigns.includes(sign.toLowerCase())) {
      return res.status(400).json({
        error: 'Invalid zodiac sign'
      })
    }

    const validTypes = ['daily', 'weekly', 'monthly']
    if (!validTypes.includes(type.toLowerCase())) {
      return res.status(400).json({
        error: 'Invalid horoscope type. Must be daily, weekly, or monthly'
      })
    }

    const horoscope = await aiService.generateHoroscope(sign, type, question)

    res.json({
      success: true,
      horoscope: horoscope.content,
      sign: sign,
      type: type,
      metadata: {
        provider: horoscope.provider,
        model: horoscope.model,
        usage: horoscope.usage
      }
    })
  } catch (error) {
    console.error('Horoscope generation error:', error)
    res.status(500).json({
      error: 'Failed to generate horoscope',
      message: error.message
    })
  }
})

// Generate Mystical Content
router.post('/mystical/generate', authenticateToken, async (req, res) => {
  try {
    const { type, context = {} } = req.body

    if (!type) {
      return res.status(400).json({
        error: 'Content type is required'
      })
    }

    const validTypes = ['meditation', 'affirmation', 'spiritual-guidance', 'numerology', 'crystal-guidance']
    if (!validTypes.includes(type)) {
      return res.status(400).json({
        error: `Invalid content type. Must be one of: ${validTypes.join(', ')}`
      })
    }

    const content = await aiService.generateMysticalContent(type, context)

    res.json({
      success: true,
      content: content.content,
      type: type,
      metadata: {
        provider: content.provider,
        model: content.model,
        usage: content.usage
      }
    })
  } catch (error) {
    console.error('Mystical content generation error:', error)
    res.status(500).json({
      error: 'Failed to generate mystical content',
      message: error.message
    })
  }
})

// Switch AI Provider (admin only)
router.post('/provider/switch', authenticateToken, async (req, res) => {
  try {
    const { provider } = req.body

    if (!provider) {
      return res.status(400).json({
        error: 'Provider is required'
      })
    }

    const validProviders = ['ollama', 'openai', 'together']
    if (!validProviders.includes(provider.toLowerCase())) {
      return res.status(400).json({
        error: `Invalid provider. Must be one of: ${validProviders.join(', ')}`
      })
    }

    aiService.switchProvider(provider)

    res.json({
      success: true,
      message: `Switched to ${provider} provider`,
      currentProvider: provider
    })
  } catch (error) {
    console.error('Provider switch error:', error)
    res.status(500).json({
      error: 'Failed to switch provider',
      message: error.message
    })
  }
})

// Get Current Provider Info
router.get('/provider/current', async (req, res) => {
  try {
    const health = await aiService.healthCheck()
    res.json({
      provider: health.provider,
      model: health.model,
      status: health.status
    })
  } catch (error) {
    res.status(500).json({
      error: 'Failed to get provider info',
      message: error.message
    })
  }
})

// ===== Ollama Monitoring Endpoints =====

// Get Ollama request history
router.get('/monitor/requests', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50
    const requests = ollamaMonitor.getRequests(limit)

    res.json({
      success: true,
      count: requests.length,
      requests: requests
    })
  } catch (error) {
    res.status(500).json({
      error: 'Failed to get request history',
      message: error.message
    })
  }
})

// Get Ollama monitoring statistics
router.get('/monitor/stats', (req, res) => {
  try {
    const stats = ollamaMonitor.getStats()

    res.json({
      success: true,
      stats: stats
    })
  } catch (error) {
    res.status(500).json({
      error: 'Failed to get monitoring stats',
      message: error.message
    })
  }
})

// Clear monitoring history (admin only - can be protected with auth if needed)
router.post('/monitor/clear', authenticateToken, (req, res) => {
  try {
    ollamaMonitor.clear()

    res.json({
      success: true,
      message: 'Monitoring history cleared'
    })
  } catch (error) {
    res.status(500).json({
      error: 'Failed to clear monitoring history',
      message: error.message
    })
  }
})

export default router