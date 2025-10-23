import OllamaProvider from './ai/ollamaProvider.js'
import OpenAIProvider from './ai/openaiProvider.js'
import TogetherProvider from './ai/togetherProvider.js'
import axios from 'axios'

class AIService {
  constructor() {
    this.provider = null
    this.providerType = null
    // Don't initialize immediately - wait for first request
  }

  initializeProvider() {
    // Re-read environment variables when actually needed
    this.providerType = process.env.AI_PROVIDER || 'ollama'

    switch (this.providerType.toLowerCase()) {
      case 'ollama':
        const ollamaBaseUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434'
        console.log('🔧 AI Service Debug:', {
          OLLAMA_BASE_URL: process.env.OLLAMA_BASE_URL,
          ollamaBaseUrl,
          AI_PROVIDER: process.env.AI_PROVIDER
        })
        this.provider = new OllamaProvider({
          baseUrl: ollamaBaseUrl,
          model: process.env.OLLAMA_MODEL || 'llama3.2:3b'
        })
        break
      case 'openai':
        if (!process.env.OPENAI_API_KEY) {
          throw new Error('OPENAI_API_KEY is required for OpenAI provider')
        }
        this.provider = new OpenAIProvider({
          apiKey: process.env.OPENAI_API_KEY,
          model: process.env.OPENAI_MODEL || 'gpt-3.5-turbo'
        })
        break
      case 'together':
        if (!process.env.TOGETHER_API_KEY) {
          throw new Error('TOGETHER_API_KEY is required for Together provider')
        }
        this.provider = new TogetherProvider({
          apiKey: process.env.TOGETHER_API_KEY,
          model: process.env.TOGETHER_MODEL || 'meta-llama/Llama-2-7b-chat-hf'
        })
        break
      default:
        throw new Error(`Unsupported AI provider: ${this.providerType}`)
    }
  }

  async generateTarotReading(cards, question, spread, context = null) {
    if (!this.provider) {
      this.initializeProvider()
    }
    const prompt = this.buildTarotPrompt(cards, question, spread)
    return await this.provider.generateResponse(prompt, context)
  }

  async generateHoroscope(sign, type = 'daily', question = null) {
    if (!this.provider) {
      this.initializeProvider()
    }
    const prompt = this.buildHoroscopePrompt(sign, type, question)
    return await this.provider.generateResponse(prompt)
  }

  async generateMysticalContent(type, context = {}) {
    if (!this.provider) {
      this.initializeProvider()
    }
    const prompt = this.buildMysticalPrompt(type, context)
    return await this.provider.generateResponse(prompt)
  }

  async generatePalmReading(imageBase64, question = null) {
    if (!this.provider) {
      this.initializeProvider()
    }

    // Check if provider supports image analysis
    if (typeof this.provider.analyzeImage !== 'function') {
      throw new Error(`Provider ${this.providerType} does not support image analysis. Please use Ollama with a vision model like llava.`)
    }

    const prompt = this.buildPalmReadingPrompt(question)
    const reading = await this.provider.analyzeImage(imageBase64, prompt)

    // Call annotation service to add colored lines to the palm image
    try {
      const annotationUrl = process.env.PALM_ANNOTATION_URL || 'http://localhost:5001'
      console.log('🎨 Calling palm annotation service:', annotationUrl)

      const annotationResponse = await axios.post(`${annotationUrl}/annotate`, {
        image: imageBase64,
        analysis: reading.content
      }, {
        timeout: 30000 // 30 seconds
      })

      if (annotationResponse.data.success) {
        console.log(`✅ Palm annotated successfully! Detected ${annotationResponse.data.features_detected} features`)

        // Add annotated image to the response
        reading.annotated_image = annotationResponse.data.annotated_image
        reading.features_detected = annotationResponse.data.features
      } else {
        console.warn('⚠️ Palm annotation failed:', annotationResponse.data.error)
        // Continue without annotation
      }
    } catch (error) {
      console.error('❌ Palm annotation service error:', error.message)
      // Continue without annotation - don't fail the whole request
    }

    return reading
  }

  buildTarotPrompt(cards, question, spread) {
    // Cards come as DrawnCard objects: { card: {...}, position: "...", isReversed: boolean }
    const cardDescriptions = cards.map(drawnCard => {
      const card = drawnCard.card || drawnCard // Handle both formats
      const cardName = card.name || 'Unknown Card'
      const position = drawnCard.position || 'Unknown Position'
      const reversed = drawnCard.isReversed ? ' (Reversed)' : ''
      return `${cardName}${reversed} in ${position} position`
    }).join(', ')

    return `You are a wise and intuitive tarot reader. Provide a mystical and insightful reading.

Question: "${question}"
Spread: ${spread}
Cards drawn: ${cardDescriptions}

IMPORTANT: Begin your reading by directly addressing the querent's question. Reference their specific question throughout your interpretation. Connect each card's meaning to their inquiry about "${question}".

Provide a thoughtful interpretation that clearly answers their question using the wisdom of the cards. Be mystical but practical, offering specific guidance they can apply to their situation. Keep the response between 200-400 words.

Reading:`
  }

  buildHoroscopePrompt(sign, type, question = null) {
    const today = new Date().toLocaleDateString()
    const questionSection = question
      ? `\nSpecific Question: "${question}"\n\nIMPORTANT: Address their question about "${question}" in the context of their ${type} horoscope. Focus your guidance on their specific inquiry while still providing general insights.`
      : '\nProvide insights about love, career, health, and general guidance.'

    return `You are a mystical astrologer. Create a ${type} horoscope for ${sign}.

Date: ${today}
Sign: ${sign}
Type: ${type}${questionSection}

Be optimistic yet realistic. Include specific advice they can act on. Keep it between 150-250 words.

Horoscope:`
  }

  buildMysticalPrompt(type, context) {
    const questionSection = context.question
      ? `\nSpecific Question: "${context.question}"\n\nIMPORTANT: Address their question about "${context.question}" in the context of your ${type} reading. Focus on how the insights relate to their specific inquiry.`
      : ''

    return `You are a mystical guide providing ${type} insights.
Context: ${JSON.stringify(context)}${questionSection}

Provide wise, mystical guidance that feels authentic and helpful. Keep response between 100-300 words.

Guidance:`
  }

  buildPalmReadingPrompt(question = null) {
    const questionSection = question
      ? `\n\nSpecific Question: "${question}"\n\nIMPORTANT: Analyze the palm in the context of their question about "${question}". Connect the palm's features to their specific inquiry while providing a comprehensive reading.`
      : ''

    return `You are a master palmist with decades of experience in chiromancy and palm reading. Carefully examine EVERY detail visible in this palm image and provide an exceptionally thorough, accurate analysis.

CRITICAL INSTRUCTIONS:
1. Study the image carefully before responding
2. Describe EXACTLY what you see in the palm - specific line positions, curves, breaks, depth
3. Be highly detailed and specific about each line's characteristics
4. Note the precise location where lines start and end
5. Identify ALL visible lines, not just major ones

DETAILED PALM ANALYSIS FRAMEWORK:

**MAJOR LINES** (Examine each carefully):
- **Heart Line** (horizontal line near fingers): Describe its exact path, depth, length, any branches or breaks. Does it curve upward or stay straight? Are there any chains, islands, or crosses on it?
- **Head Line** (middle horizontal line): Note if it's straight or curved, deep or faint, long or short. Look for breaks, forks at the end, or unusual formations.
- **Life Line** (curves around thumb): Trace its exact arc. Is it deep and strong or faint? Are there breaks, chains, or sister lines parallel to it?
- **Fate Line** (vertical from wrist toward middle finger): Does it exist? If yes, where does it start and end? Is it continuous or broken?

**MINOR LINES** (if visible):
- Sun Line (Apollo Line): vertical toward ring finger
- Mercury Line (Health Line): from wrist toward pinky
- Marriage/Relationship Lines: small horizontal lines on edge of palm under pinky
- Children Lines: small vertical lines above marriage lines
- Travel Lines: horizontal lines on edge of palm opposite thumb
- Intuition Line: curved line on lunar mount

**MOUNTS** (raised pads on palm):
- Mount of Venus (base of thumb): fullness indicates passion
- Mount of Jupiter (base of index): leadership qualities
- Mount of Saturn (base of middle): wisdom and responsibility
- Mount of Apollo (base of ring): creativity and success
- Mount of Mercury (base of pinky): communication skills
- Luna Mount (opposite thumb): imagination and intuition
- Mars Mounts (between thumb/index and below Mercury): courage and resilience

**HAND CHARACTERISTICS**:
- Fingers: length relative to palm, straightness, flexibility
- Thumb: size, angle, flexibility (indicates willpower)
- Nails: shape and condition
- Skin texture: smooth vs rough
- Overall hand shape: earth, air, fire, or water type

**SPECIAL MARKINGS**:
- Stars, crosses, triangles, squares, grilles
- Islands, chains, breaks in lines
- Color variations or unusual features${questionSection}

RESPONSE FORMAT:
1. Start with a detailed description of what you actually see in the image
2. Interpret each major line with specific observations
3. Discuss notable features and their meanings
4. Provide personalized insights based on the unique palm characteristics
5. Offer practical guidance aligned with the palm's indications

Write 400-600 words. Be specific, detailed, and reference actual visible features. Maintain a warm, mystical, yet authoritative tone.

Palm Reading:`
  }

  async healthCheck() {
    if (!this.provider) {
      this.initializeProvider()
    }
    try {
      await this.provider.healthCheck()
      return {
        status: 'healthy',
        provider: this.providerType,
        model: this.provider.model
      }
    } catch (error) {
      return {
        status: 'unhealthy',
        provider: this.providerType,
        error: error.message
      }
    }
  }

  switchProvider(newProvider) {
    this.providerType = newProvider
    this.initializeProvider()
  }
}

export default new AIService()