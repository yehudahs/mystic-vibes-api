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

  async generateTarotReading(cards, question, spread) {
    if (!this.provider) {
      this.initializeProvider()
    }
    const prompt = this.buildTarotPrompt(cards, question, spread)
    return await this.provider.generateResponse(prompt)
  }

  async generateHoroscope(sign, type = 'daily') {
    if (!this.provider) {
      this.initializeProvider()
    }
    const prompt = this.buildHoroscopePrompt(sign, type)
    return await this.provider.generateResponse(prompt)
  }

  async generateMysticalContent(type, context = {}) {
    if (!this.provider) {
      this.initializeProvider()
    }
    const prompt = this.buildMysticalPrompt(type, context)
    return await this.provider.generateResponse(prompt)
  }

  buildTarotPrompt(cards, question, spread) {
    return `You are a wise and intuitive tarot reader. Provide a mystical and insightful reading.

Question: ${question}
Spread: ${spread}
Cards drawn: ${cards.map(card => `${card.name} (${card.position})`).join(', ')}

Provide a thoughtful interpretation that connects the cards to the question. Be mystical but helpful, offering guidance and reflection. Keep the response between 200-400 words.

Reading:`
  }

  buildHoroscopePrompt(sign, type) {
    const today = new Date().toLocaleDateString()
    return `You are a mystical astrologer. Create a ${type} horoscope for ${sign}.

Date: ${today}
Sign: ${sign}
Type: ${type}

Provide insights about love, career, health, and general guidance. Be optimistic yet realistic. Include specific advice they can act on. Keep it between 150-250 words.

Horoscope:`
  }

  buildMysticalPrompt(type, context) {
    return `You are a mystical guide providing ${type} insights.
Context: ${JSON.stringify(context)}

Provide wise, mystical guidance that feels authentic and helpful. Keep response between 100-300 words.

Guidance:`
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