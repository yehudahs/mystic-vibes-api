import OllamaProvider from './ai/ollamaProvider.js'
import OpenAIProvider from './ai/openaiProvider.js'
import TogetherProvider from './ai/togetherProvider.js'
import PalmReadingMethods from './ai/palmReadingMethods.js'
import axios from 'axios'

class AIService {
  constructor() {
    this.provider = null
    this.providerType = null
    this.palmMethods = null
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

  async generatePalmReading(imageBase64, question = null, method = 'direct-analysis', model = 'llama3.2-vision:11b') {
    if (!this.provider) {
      this.initializeProvider()
    }

    // Initialize palm methods if not done
    if (!this.palmMethods) {
      this.palmMethods = new PalmReadingMethods(this.provider)
    }

    // Check if provider supports image analysis
    if (typeof this.provider.analyzeImage !== 'function') {
      throw new Error(`Provider ${this.providerType} does not support image analysis. Please use Ollama with a vision model like llava.`)
    }

    // Call the appropriate method
    let reading
    switch (method) {
      case 'direct-analysis':
        reading = await this.palmMethods.directAnalysis(imageBase64, question, model)
        break
      case 'two-stage-analysis':
        reading = await this.palmMethods.twoStageAnalysis(imageBase64, question, model)
        break
      case 'focused-line-analysis':
        reading = await this.palmMethods.focusedLineAnalysis(imageBase64, question, model)
        break
      case 'comparative-analysis':
        reading = await this.palmMethods.comparativeAnalysis(imageBase64, question, model, model)
        break
      case 'structured-analysis':
        reading = await this.palmMethods.structuredAnalysis(imageBase64, question, model)
        break
      default:
        throw new Error(`Unknown palm reading method: ${method}`)
    }

    // Call annotation service to add colored lines to the palm image
    try {
      const annotationUrl = process.env.PALM_ANNOTATION_URL || 'http://localhost:5001'
      console.log('🎨 Calling palm annotation service:', annotationUrl)

      const annotationResponse = await axios.post(`${annotationUrl}/annotate`, {
        image: imageBase64,
        analysis: reading.reading
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

  async getPalmReadingMethods() {
    if (!this.provider) {
      this.initializeProvider()
    }
    if (!this.palmMethods) {
      this.palmMethods = new PalmReadingMethods(this.provider)
    }
    return this.palmMethods.getAvailableMethods()
  }

  async getPalmReadingModels() {
    if (!this.provider) {
      this.initializeProvider()
    }
    if (!this.palmMethods) {
      this.palmMethods = new PalmReadingMethods(this.provider)
    }
    return await this.palmMethods.getAvailableModels()
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
      ? `\n\nSpecific Question: "${question}"\n\nIMPORTANT: Connect the palm's features to their question about "${question}" in your reading.`
      : ''

    return `You are an experienced palmist. Analyze this palm image and provide a detailed reading.

Examine these key elements:

**MAJOR LINES:**
- **Heart Line** (horizontal near fingers): path, depth, curves, breaks
- **Head Line** (middle horizontal): straight or curved, depth, length
- **Life Line** (curves around thumb): arc depth, continuity
- **Fate Line** (vertical toward middle finger): presence, continuity

**HAND FEATURES:**
- Mounts (raised pads): Venus (passion), Jupiter (leadership), Saturn (wisdom), Apollo (creativity), Mercury (communication)
- Fingers: length and shape
- Overall hand type and skin texture

**INTERPRETATION:**
Describe what you observe in the palm, then interpret the major lines and features. Provide insights about personality, relationships, career, and life path. Connect visible features to practical guidance.${questionSection}

Write 300-400 words. Be specific about what you see, maintain a warm mystical tone, and offer actionable insights.

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