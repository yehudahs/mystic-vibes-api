import axios from 'axios'

class AIService {
  getUrl() {
    const url = process.env.AI_SERVICES
    if (!url) throw new Error('AI_SERVICES environment variable is required')
    return url
  }

  getAuthHeaders() {
    const key = process.env.AI_SERVICES_KEY
    if (!key) throw new Error('AI_SERVICES_KEY environment variable is required')
    return {
      'Content-Type': 'application/json',
      'X-Service-Auth': key,
    }
  }

  async call(route, data) {
    const response = await axios.post(`${this.getUrl()}${route}`, data, {
      timeout: 300000,
      headers: this.getAuthHeaders(),
    })
    return response.data
  }

  async generateTarotReading(cards, question, spread, context = null) {
    const data = await this.call('/tarot', { cards, question, spread })
    return {
      content:       data.reading,
      sources:       data.sources || [],
      trait_sources: data.trait_sources || [],
      provider:      'python-ai-service',
      model:         'ollama',
    }
  }

  async generateHoroscope(sign, type = 'daily', question = null) {
    const data = await this.call('/horoscope', { sign, type, question })
    return {
      content:       data.horoscope,
      sources:       data.sources || [],
      trait_sources: data.trait_sources || [],
      provider:      'python-ai-service',
      model:         'ollama',
    }
  }

  async generateMysticalContent(type, context = {}) {
    const data = await this.call('/greeting', { type, context })
    return { content: data.reading, provider: 'python-ai-service', model: 'ollama' }
  }

  async generateNumerologyReading(name, birthDate, question = null) {
    const data = await this.call('/numerology', { name, birth_date: birthDate, question })
    return {
      content: data.reading,
      numbers: data.numbers,
      calculation: data.calculation,
      name_breakdown: data.name_breakdown,
      meanings: data.meanings,
      sources:       data.sources || [],
      trait_sources: data.trait_sources || [],
      provider: 'python-ai-service',
      model: 'ollama'
    }
  }

  async runPalmPipeline(imageBase64) {
    const response = await axios.post(`${this.getUrl()}/palm/pipeline`, {
      image: imageBase64
    }, { timeout: 120000, headers: this.getAuthHeaders() })
    if (response.data.ok === false) return response.data  // validation failure — pass through
    if (!response.data.success) throw new Error(response.data.error || 'Pipeline failed')
    return response.data
  }

  async interpretPalmFeature(featureKey, featureData, question = null, handedness = null, readingId = null) {
    const response = await axios.post(`${this.getUrl()}/palm/interpret`, {
      feature_key: featureKey,
      feature_data: featureData,
      question,
      handedness,
      reading_id: readingId,
    }, { timeout: 660000, headers: this.getAuthHeaders() })
    if (!response.data.success) throw new Error(response.data.error || 'Interpret failed')
    return response.data
  }

  async generatePalmReading(imageBase64, question = null) {
    const response = await axios.post(`${this.getUrl()}/palm/analyze`, {
      image: imageBase64,
      question
    }, { timeout: 300000, headers: this.getAuthHeaders() })

    if (!response.data.success) {
      throw new Error(response.data.error || 'Pipeline analysis failed')
    }

    const d = response.data
    return {
      method: 'cv-sam-pipeline',
      reading: d.reading,
      readings: d.readings,
      images: d.images,
      pipeline_stages: d.pipeline_stages,
      features: d.features,
      annotated_image: d.image,
      metadata: { provider: 'cv-sam-pipeline', text_generation: 'ollama' }
    }
  }

  async healthCheck() {
    try {
      await axios.get(`${this.getUrl()}/health`, { timeout: 5000 })
      return { status: 'healthy', provider: 'python-ai-service', model: 'ollama' }
    } catch (error) {
      return { status: 'unhealthy', provider: 'python-ai-service', error: error.message }
    }
  }
}

export default new AIService()
