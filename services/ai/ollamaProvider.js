import axios from 'axios'
import ollamaMonitor from '../ollamaMonitor.js'

class OllamaProvider {
  constructor(config) {
    this.baseUrl = config.baseUrl
    this.model = config.model
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 60000, // 60 seconds for AI responses
      headers: {
        'Content-Type': 'application/json',
        'ngrok-skip-browser-warning': 'true' // Required for ngrok free tier API requests
      }
    })
  }

  async generateResponse(prompt) {
    const startTime = Date.now()
    let requestData = {
      method: 'POST',
      endpoint: '/api/generate',
      prompt: prompt,
      model: this.model,
      success: false,
      duration: 0
    }

    try {
      console.log(`🔗 OllamaProvider making request to: ${this.baseUrl}/api/generate`)

      const response = await this.client.post('/api/generate', {
        model: this.model,
        prompt: prompt,
        stream: false,
        options: {
          temperature: 0.7,
          top_p: 0.9,
          top_k: 40
        }
      })

      const endTime = Date.now()
      const duration = endTime - startTime

      const usage = {
        prompt_tokens: response.data.prompt_eval_count || 0,
        completion_tokens: response.data.eval_count || 0,
        total_tokens: (response.data.prompt_eval_count || 0) + (response.data.eval_count || 0)
      }

      const responseContent = response.data.response.trim()

      // Update request data for monitoring
      requestData = {
        ...requestData,
        success: true,
        duration,
        usage,
        responseLength: responseContent.length,
        status: response.status
      }

      // Log to monitor
      ollamaMonitor.logRequest(requestData)

      return {
        success: true,
        content: responseContent,
        provider: 'ollama',
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

      // Log to monitor
      ollamaMonitor.logRequest(requestData)

      console.error('Ollama API Error:', error.message)

      if (error.code === 'ECONNREFUSED') {
        throw new Error('Ollama service is not running. Please start Ollama first.')
      }

      if (error.response?.status === 404) {
        throw new Error(`Model "${this.model}" not found. Please pull the model first: ollama pull ${this.model}`)
      }

      throw new Error(`Ollama API error: ${error.message}`)
    }
  }

  async healthCheck() {
    try {
      const response = await this.client.get('/api/tags')
      const models = response.data.models || []
      const modelExists = models.some(m => m.name.includes(this.model))

      if (!modelExists) {
        throw new Error(`Model "${this.model}" is not available`)
      }

      return {
        status: 'healthy',
        models: models.map(m => m.name)
      }
    } catch (error) {
      if (error.code === 'ECONNREFUSED') {
        throw new Error('Cannot connect to Ollama service')
      }
      throw error
    }
  }

  async listModels() {
    try {
      const response = await this.client.get('/api/tags')
      return response.data.models || []
    } catch (error) {
      console.error('Error listing Ollama models:', error.message)
      return []
    }
  }

  async pullModel(modelName) {
    try {
      await this.client.post('/api/pull', {
        name: modelName
      })
      return { success: true, message: `Model ${modelName} pulled successfully` }
    } catch (error) {
      throw new Error(`Failed to pull model ${modelName}: ${error.message}`)
    }
  }
}

export default OllamaProvider