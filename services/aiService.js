import axios from 'axios'

class AIService {
  getUrl() {
    const url = process.env.AI_SERVICES
    if (!url) throw new Error('AI_SERVICES environment variable is required')
    return url
  }

  async call(route, data) {
    const response = await axios.post(`${this.getUrl()}${route}`, data, { timeout: 120000 })
    return response.data
  }

  async generateTarotReading(cards, question, spread, context = null) {
    const data = await this.call('/tarot', { cards, question, spread })
    return { content: data.reading, provider: 'python-ai-service', model: 'ollama' }
  }

  async generateHoroscope(sign, type = 'daily', question = null) {
    const data = await this.call('/horoscope', { sign, type, question })
    return { content: data.horoscope, provider: 'python-ai-service', model: 'ollama' }
  }

  async generateMysticalContent(type, context = {}) {
    const data = await this.call('/greeting', { type, context })
    return { content: data.reading, provider: 'python-ai-service', model: 'ollama' }
  }

  async generatePalmReading(imageBase64, question = null) {
    const response = await axios.post(`${this.getUrl()}/palm/analyze`, {
      image: imageBase64,
      question
    }, { timeout: 60000 })

    if (!response.data.success) {
      throw new Error(response.data.error || 'Pipeline analysis failed')
    }

    const d = response.data
    return {
      method: 'cv-sam-pipeline',
      reading: d.reading,
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
