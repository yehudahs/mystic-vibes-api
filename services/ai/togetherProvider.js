import axios from 'axios'

class TogetherProvider {
  constructor(config) {
    this.apiKey = config.apiKey
    this.model = config.model
    this.client = axios.create({
      baseURL: 'https://api.together.xyz/v1',
      timeout: 60000,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      }
    })
  }

  async generateResponse(prompt) {
    try {
      const response = await this.client.post('/chat/completions', {
        model: this.model,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 1000
      })

      const choice = response.data.choices[0]

      return {
        success: true,
        content: choice.message.content.trim(),
        provider: 'together',
        model: this.model,
        usage: {
          prompt_tokens: response.data.usage?.prompt_tokens || 0,
          completion_tokens: response.data.usage?.completion_tokens || 0,
          total_tokens: response.data.usage?.total_tokens || 0
        }
      }
    } catch (error) {
      console.error('Together API Error:', error.response?.data || error.message)

      if (error.response?.status === 401) {
        throw new Error('Invalid Together API key')
      }

      if (error.response?.status === 429) {
        throw new Error('Together API rate limit exceeded')
      }

      throw new Error(`Together API error: ${error.response?.data?.error?.message || error.message}`)
    }
  }

  async healthCheck() {
    try {
      // Together API doesn't have a models endpoint, so we'll try a simple completion
      await this.client.post('/chat/completions', {
        model: this.model,
        messages: [{ role: 'user', content: 'Hi' }],
        max_tokens: 1
      })

      return {
        status: 'healthy',
        model: this.model
      }
    } catch (error) {
      if (error.response?.status === 401) {
        throw new Error('Invalid Together API key')
      }
      throw error
    }
  }
}

export default TogetherProvider