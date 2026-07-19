import express from 'express'
import { randomUUID } from 'crypto'
import aiService from '../services/aiService.js'
import ollamaMonitor from '../services/ollamaMonitor.js'
import { authenticateToken, optionalAuth } from '../middleware/auth.js'
import { pool } from '../config/database.js'

const router = express.Router()

// In-memory store for async palm pipeline jobs (Railway's 60s proxy timeout requires async pattern)
const _palmJobs = new Map()
const _JOB_TTL_MS = 10 * 60 * 1000 // 10 min — clean up uncollected jobs

function _cleanOldJobs() {
  const now = Date.now()
  for (const [id, job] of _palmJobs) {
    if (now - job.createdAt > _JOB_TTL_MS) _palmJobs.delete(id)
  }
}

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

// Test endpoint — was previously UNAUTHENTICATED, which let any visitor
// burn Ollama compute on demand. Now requires a valid session and is
// disabled outside development to remove the abuse vector entirely.
router.post('/test/reading', authenticateToken, async (req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).json({ error: 'Not found' })
  }
  try {
    const cards = [
      { name: 'The Fool', position: 'Past' },
      { name: 'The Magician', position: 'Present' },
      { name: 'The Star', position: 'Future' }
    ]
    const question = 'Test question for debugging'
    const spread = 'Three Card'

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
      sources:       reading.sources || [],
      trait_sources: reading.trait_sources || [],
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
router.post('/horoscope/generate', optionalAuth, async (req, res) => {
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
      horoscope:     horoscope.content,
      sign:          sign,
      type:          type,
      sources:       horoscope.sources || [],
      trait_sources: horoscope.trait_sources || [],
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

// Start CV pipeline job — returns jobId immediately to avoid Railway's 60s proxy timeout.
// Pipeline takes ~120s on CPU; polling pattern keeps connections short.
router.post('/palm/pipeline', optionalAuth, (req, res) => {
  const { image } = req.body
  if (!image) return res.status(400).json({ error: 'Image is required' })

  let imageBase64 = image
  if (image.includes('base64,')) imageBase64 = image.split('base64,')[1]

  _cleanOldJobs()
  const jobId = randomUUID()
  _palmJobs.set(jobId, { status: 'pending', createdAt: Date.now() })

  // Run pipeline in background — do not await
  aiService.runPalmPipeline(imageBase64)
    .then(result => {
      if (result.ok === false) {
        // Validation failure — pass through as-is
        _palmJobs.set(jobId, { status: 'done', result, createdAt: Date.now() })
      } else {
        _palmJobs.set(jobId, {
          status: 'done',
          createdAt: Date.now(),
          result: {
            success: true,
            measurements: result.measurements,
            mounts: result.mounts,
            images: result.images,
            image: result.image,
            handedness: result.handedness,
            measurement_source: result.measurement_source,
            base_image: result.base_image,
            base_size: result.base_size,
            mount_base_image: result.mount_base_image,
            mount_base_size: result.mount_base_size,
            overlay: result.overlay,
          },
        })
      }
    })
    .catch(error => {
      _palmJobs.set(jobId, { status: 'error', error: error.message, createdAt: Date.now() })
    })

  res.json({ jobId })
})

// Poll for palm pipeline job result
router.get('/palm/pipeline/:jobId', optionalAuth, (req, res) => {
  const job = _palmJobs.get(req.params.jobId)
  if (!job) return res.status(404).json({ error: 'Job not found or expired' })
  if (job.status === 'pending') return res.json({ status: 'pending' })
  if (job.status === 'error') {
    _palmJobs.delete(req.params.jobId)
    return res.status(500).json({ error: 'Pipeline failed', message: job.error })
  }
  // Done — return result and clean up
  _palmJobs.delete(req.params.jobId)
  res.json(job.result)
})

// Interpret a single palm feature via Ollama
router.post('/palm/interpret', optionalAuth, async (req, res) => {
  try {
    const { feature_key, feature_data, question, handedness, reading_id } = req.body
    if (!feature_key) return res.status(400).json({ error: 'feature_key is required' })

    const result = await aiService.interpretPalmFeature(feature_key, feature_data, question, handedness, reading_id)
    res.json({
      success: true,
      feature_key,
      reading:       result.reading,
      sources:       result.sources || [],
      trait_sources: result.trait_sources || [],
    })
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


// Switch AI Provider — comment said "admin only" but used only authenticateToken,
// so any logged-in user could change the global provider for everyone.
// Removed the runtime endpoint entirely; provider is set via env config at boot.
router.post('/provider/switch', authenticateToken, (_req, res) => {
  res.status(410).json({ error: 'Provider is now configured via environment, not at runtime' })
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
    // Don't hardcode a model here — the Python service picks the model from
    // OLLAMA_MODEL (AI-service/.env), which is the single source of truth.
    const { prompt } = req.body
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

    // Use the mystical content generator with personalization context.
    // Python service picks the model from its env (OLLAMA_MODEL).
    const content = await aiService.generateMysticalContent('spiritual-guidance', {
      prompt: prompt,
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
      sources:       result.sources || [],
      trait_sources: result.trait_sources || [],
      metadata: { provider: result.provider, model: result.model }
    })
  } catch (error) {
    console.error('Numerology generation error:', error)
    res.status(500).json({ error: 'Failed to generate numerology reading', message: error.message })
  }
})

// ===== Ollama Monitoring Endpoints (auth required) =====
// Previously unauthenticated — leaked per-user request history and stats.

router.get('/monitor/requests', authenticateToken, (req, res) => {
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

router.get('/monitor/stats', authenticateToken, (req, res) => {
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