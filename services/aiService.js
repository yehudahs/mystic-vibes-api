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
    const aiServicesUrl = process.env.AI_SERVICES

    if (!aiServicesUrl) {
      throw new Error('AI_SERVICES environment variable is required')
    }

    switch (this.providerType.toLowerCase()) {
      case 'ollama':
        console.log('🔧 AI Service Configuration:', {
          AI_SERVICES: aiServicesUrl,
          AI_PROVIDER: this.providerType
        })
        this.provider = new OllamaProvider({
          baseUrl: aiServicesUrl  // Use unified AI services gateway
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
      // Call unified AI services gateway (which forwards to palm pipeline)
      const aiServicesUrl = process.env.AI_SERVICES

      if (!aiServicesUrl) {
        throw new Error('AI_SERVICES environment variable is required')
      }

      console.log('📡 Calling AI services palm endpoint:', `${aiServicesUrl}/palm/analyze`)

      // Stage 1-3: Call pipeline to analyze palm features
      const pipelineResponse = await axios.post(`${aiServicesUrl}/palm/analyze`, {
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

    return `You are a wise and intuitive tarot reader. Provide a DIRECT, CONCISE, and PRACTICAL reading.

Question: "${question}"
Spread: ${spread}
Cards drawn: ${cardDescriptions}

CRITICAL INSTRUCTIONS:
1. Answer their question DIRECTLY in the first 1-2 sentences
2. Give a CLEAR, SPECIFIC answer (not vague or philosophical)
3. Connect each card BRIEFLY to their question
4. End with ONE concrete action they can take
5. Be mystical but PRACTICAL - they want real guidance, not just poetry

Style: Direct, warm, actionable. Maximum 150-200 words.

Reading:`
  }

  buildHoroscopePrompt(sign, type, question = null) {
    const today = new Date().toLocaleDateString()
    const questionSection = question
      ? `\nSpecific Question: "${question}"\n\nCRITICAL: Answer their question DIRECTLY in the first sentence. Give a CLEAR, SPECIFIC answer about "${question}" using astrological insights.`
      : '\nProvide CONCISE insights about love, career, health, and general guidance.'

    return `You are a mystical astrologer. Create a ${type} horoscope for ${sign}.

Date: ${today}
Sign: ${sign}
Type: ${type}${questionSection}

Style: Direct, optimistic, actionable. Maximum 120-150 words. Start with the most important message.

Horoscope:`
  }

  buildMysticalPrompt(type, context) {
    const questionSection = context.question
      ? `\nSpecific Question: "${context.question}"\n\nCRITICAL: Answer their question DIRECTLY in the first 1-2 sentences. Give a CLEAR, SPECIFIC answer about "${context.question}" using ${type} insights. Be direct, not vague.`
      : ''

    return `You are a mystical guide providing ${type} insights.
Context: ${JSON.stringify(context)}${questionSection}

Style: Direct, wise, practical. Maximum 100-150 words. Focus on actionable guidance.

Guidance:`
  }

  buildPalmReadingPrompt(question = null) {
    const questionSection = question
      ? `\n\nSpecific Question: "${question}"\n\nCRITICAL: Answer their question DIRECTLY in the first 2-3 sentences. Give a CLEAR, SPECIFIC answer about "${question}" based on what you see in the palm.`
      : ''

    return `You are an experienced palmist. Provide a DIRECT and PRACTICAL palm reading.

Analyze these key elements:
- **Heart Line** (emotions/relationships): path, depth, curves
- **Head Line** (thinking/decisions): straight or curved, depth
- **Life Line** (vitality/direction): arc depth, continuity
- **Fate Line** (career/purpose): presence, continuity
- **Mounts & Fingers**: Venus (passion), Jupiter (leadership), Mercury (communication)

CRITICAL INSTRUCTIONS:
1. Start with 2-3 KEY observations about what you see
2. Connect these observations DIRECTLY to their life situation
3. Give SPECIFIC insights about personality, relationships, career
4. End with ONE concrete piece of guidance${questionSection}

Style: Direct, specific, warm. Maximum 200-250 words. Focus on actionable insights, not just descriptions.

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