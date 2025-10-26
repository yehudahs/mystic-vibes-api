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

    // Use CV+SAM+AI Pipeline (MediaPipe → SAM → OpenCV → LLM)
    console.log('🔬 Using CV+SAM+AI Pipeline for palm reading')
    return await this.generatePalmReadingWithPipeline(imageBase64, question)
  }

  async generatePalmReadingWithPipeline(imageBase64, question = null) {
    /**
     * CV+SAM+AI Pipeline Method
     * Uses: MediaPipe (hand detection) → SAM (segmentation) → OpenCV (line extraction) → Features → LLM
     * Most accurate palm reading approach
     */
    try {
      const pipelineUrl = process.env.PALM_ANNOTATION_URL || 'http://localhost:5001'
      console.log('📡 Calling palm reading pipeline:', pipelineUrl)

      // Stage 1-3: Call pipeline to analyze palm features
      const pipelineResponse = await axios.post(`${pipelineUrl}/analyze`, {
        image: imageBase64,
        question: question
      }, {
        timeout: 60000 // 60 seconds for full pipeline
      })

      if (!pipelineResponse.data.success) {
        throw new Error(pipelineResponse.data.error || 'Pipeline analysis failed')
      }

      const pipelineData = pipelineResponse.data
      console.log(`✅ Pipeline completed: ${pipelineData.pipeline_stages?.hand_detection?.handedness} hand detected`)
      console.log(`   Lines detected: ${pipelineData.pipeline_stages?.line_extraction?.total_lines}`)
      console.log(`   Confidence: ${pipelineData.pipeline_stages?.feature_interpretation?.confidence}`)

      // Stage 4: Generate mystical reading using structured features
      const readingPrompt = pipelineData.reading_prompt
      console.log('🔮 Generating reading with LLM...')

      const llmResponse = await this.provider.generateResponse(readingPrompt)

      // Return complete result
      return {
        method: 'cv-sam-pipeline',
        reading: llmResponse.content,
        pipeline_stages: pipelineData.pipeline_stages,
        features: pipelineData.features,
        annotated_image: pipelineData.visualizations?.extracted_lines,
        segmented_hand: pipelineData.visualizations?.segmented_hand,
        segmentation_mask: pipelineData.visualizations?.segmentation_mask,
        cropped_hand: pipelineData.visualizations?.cropped_hand,
        detected_landmarks: pipelineData.visualizations?.detected_landmarks,
        metadata: {
          provider: 'cv-sam-pipeline',
          hand_detection: 'MediaPipe',
          hand_segmentation: 'SAM (Segment Anything)',
          line_extraction: 'OpenCV + scikit-image',
          feature_interpretation: 'Rule-based',
          text_generation: this.providerType,
          usage: llmResponse.usage
        }
      }

    } catch (error) {
      console.error('❌ Palm reading pipeline error:', error.message)
      throw new Error(`Palm reading pipeline failed: ${error.message}`)
    }
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