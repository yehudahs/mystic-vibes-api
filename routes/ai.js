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

// Run CV pipeline only (no Ollama) — fast, ~10s
router.post('/palm/pipeline', optionalAuth, async (req, res) => {
  try {
    const { image } = req.body
    if (!image) return res.status(400).json({ error: 'Image is required' })

    let imageBase64 = image
    if (image.includes('base64,')) imageBase64 = image.split('base64,')[1]

    const result = await aiService.runPalmPipeline(imageBase64)
    res.json({ success: true, features: result.features, images: result.images, image: result.image })
  } catch (error) {
    res.status(500).json({ error: 'Pipeline failed', message: error.message })
  }
})

// Interpret a single palm feature via Ollama
router.post('/palm/interpret', optionalAuth, async (req, res) => {
  try {
    const { feature_key, feature_data, question } = req.body
    if (!feature_key) return res.status(400).json({ error: 'feature_key is required' })

    const result = await aiService.interpretPalmFeature(feature_key, feature_data, question)
    res.json({ success: true, feature_key, reading: result.reading })
  } catch (error) {
    // Return 200 so the frontend promise resolves (it checks success flag itself)
    res.status(200).json({ success: false, error: error.message })
  }
})

// Generate Palm Reading from Image (using CV+SAM+AI Pipeline)
router.post('/palm/reading', optionalAuth, async (req, res) => {
  try {
    const { image, question } = req.body
    const userId = req.user?.id

    console.log('✋ AI Palm Reading Request (CV+SAM+AI Pipeline):', {
      timestamp: new Date().toISOString(),
      userId: userId,
      hasImage: !!image,
      hasQuestion: !!question
    })

    if (!image) {
      return res.status(400).json({
        error: 'Image is required (base64 encoded)'
      })
    }

    // Remove data URL prefix if present (data:image/jpeg;base64,...)
    let imageBase64 = image
    if (image.includes('base64,')) {
      imageBase64 = image.split('base64,')[1]
    }

    const reading = await aiService.generatePalmReading(imageBase64, question)

    console.log('✋ AI Palm Reading Response:', {
      timestamp: new Date().toISOString(),
      method: reading.method,
      responseLength: reading.reading?.length || 0,
      hasAnnotatedImage: !!reading.annotated_image,
      hasSegmentedHand: !!reading.segmented_hand,
      pipelineStages: Object.keys(reading.pipeline_stages || {})
    })

    res.json({
      success: true,
      reading: reading.reading,
      readings: reading.readings,
      images: reading.images,
      method: reading.method,
      pipeline_stages: reading.pipeline_stages,
      features: reading.features,
      annotated_image: reading.annotated_image,
      segmented_hand: reading.segmented_hand,
      segmentation_mask: reading.segmentation_mask,
      cropped_hand: reading.cropped_hand,
      detected_landmarks: reading.detected_landmarks,
      metadata: reading.metadata
    })
  } catch (error) {
    console.error('Palm reading error:', error)
    res.status(500).json({
      error: 'Failed to generate palm reading',
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

// Generate Personalized Content (for welcome messages, etc.)
router.post('/personalization/generate', optionalAuth, async (req, res) => {
  try {
    const { prompt, model = 'llama3.2:3b' } = req.body
    const userId = req.user?.id

    console.log('✨ AI Personalization Request:', {
      timestamp: new Date().toISOString(),
      userId: userId,
      promptLength: prompt?.length || 0
    })

    if (!prompt || prompt.trim().length === 0) {
      return res.status(400).json({
        error: 'Prompt is required'
      })
    }

    // Use the mystical content generator with personalization context
    const content = await aiService.generateMysticalContent('spiritual-guidance', {
      prompt: prompt,
      model: model
    })

    console.log('✨ AI Personalization Response:', {
      timestamp: new Date().toISOString(),
      provider: content.provider,
      responseLength: content.content?.length || 0
    })

    res.json({
      success: true,
      response: content.content,
      metadata: {
        provider: content.provider,
        model: content.model,
        usage: content.usage
      }
    })
  } catch (error) {
    console.error('Personalization generation error:', error)
    res.status(500).json({
      error: 'Failed to generate personalized content',
      message: error.message
    })
  }
})

// Generate Numerology Reading
router.post('/numerology/generate', optionalAuth, async (req, res) => {
  try {
    const { name, birth_date, question } = req.body

    if (!birth_date) {
      return res.status(400).json({ error: 'birth_date is required' })
    }

    console.log('🔢 AI Numerology Request:', {
      timestamp: new Date().toISOString(),
      userId: req.user?.id,
      hasName: !!name,
      birth_date,
    })

    const result = await aiService.generateNumerologyReading(name || '', birth_date, question || null)

    res.json({
      success: true,
      reading: result.content,
      numbers: result.numbers,
      calculation: result.calculation,
      name_breakdown: result.name_breakdown,
      meanings: result.meanings,
      metadata: { provider: result.provider, model: result.model }
    })
  } catch (error) {
    console.error('Numerology generation error:', error)
    res.status(500).json({ error: 'Failed to generate numerology reading', message: error.message })
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