import axios from 'axios'

class OpenAIProvider {
  constructor(config) {
    this.apiKey = config.apiKey
    this.model = config.model
    this.client = axios.create({
      baseURL: 'https://api.openai.com/v1',
      timeout: 60000,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      }
    })
  }

  async generateResponse(prompt) {
    const startTime = Date.now()
    let requestData = {
      method: 'POST',
      endpoint: '/chat/completions',
      prompt: prompt,
      model: this.model,
      success: false,
      duration: 0
    }

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

      const endTime = Date.now()
      const duration = endTime - startTime

      const choice = response.data.choices[0]
      const usage = {
        prompt_tokens: response.data.usage.prompt_tokens,
        completion_tokens: response.data.usage.completion_tokens,
        total_tokens: response.data.usage.total_tokens
      }

      const responseContent = choice.message.content.trim()

      // Update request data for monitoring
      requestData = {
        ...requestData,
        success: true,
        duration,
        usage,
        responseLength: responseContent.length,
        status: response.status
      }

      return {
        success: true,
        content: responseContent,
        provider: 'openai',
        model: this.model,
        usage
      }
    } catch (error) {
      const endTime = Date.now()
      const duration = endTime - startTime

      // Update request data for monitoring (error case)
      requestData = {
        ...requestData,
        success: false,
        duration,
        error: error.message,
        status: error.response?.status || 0
      }
      console.error('OpenAI API Error:', error.response?.data || error.message)

      if (error.response?.status === 401) {
        throw new Error('Invalid OpenAI API key')
      }

      if (error.response?.status === 429) {
        throw new Error('OpenAI API rate limit exceeded')
      }

      if (error.response?.status === 402) {
        throw new Error('OpenAI API quota exceeded')
      }

      throw new Error(`OpenAI API error: ${error.response?.data?.error?.message || error.message}`)
    }
  }

  async healthCheck() {
    try {
      const response = await this.client.get('/models')
      const models = response.data.data || []
      const modelExists = models.some(m => m.id === this.model)

      if (!modelExists) {
        throw new Error(`Model "${this.model}" is not available`)
      }

      return {
        status: 'healthy',
        models: models.map(m => m.id)
      }
    } catch (error) {
      if (error.response?.status === 401) {
        throw new Error('Invalid OpenAI API key')
      }
      throw error
    }
  }
}

export default OpenAIProvider