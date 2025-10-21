import OllamaProvider from './ai/ollamaProvider.js'
import OpenAIProvider from './ai/openaiProvider.js'
import TogetherProvider from './ai/togetherProvider.js'

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
    return await this.provider.analyzeImage(imageBase64, prompt)
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

    return `You are an expert palmist and chiromancer. Analyze the palm shown in this image and provide a detailed, insightful palm reading.

In your analysis, examine:
1. **Major Lines**: Heart line (emotions, relationships), Head line (intellect, thinking), Life line (vitality, life path), and Fate line (career, destiny) if visible
2. **Minor Lines**: If visible, comment on lines like the Sun line, Mercury line, or others
3. **Mounts**: The raised areas on the palm (Venus, Jupiter, Saturn, etc.) and what they reveal
4. **Hand Shape**: Overall shape, finger length, and what these indicate about personality
5. **Special Markings**: Any significant crosses, stars, or other marks${questionSection}

Provide a mystical yet insightful reading that feels authentic and personal. Include:
- What the palm reveals about their personality and life path
- Guidance for their future based on the palm's features
- Specific insights they can apply to their life

Keep your reading between 300-500 words. Be warm, encouraging, and mystical in tone.

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