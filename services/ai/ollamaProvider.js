import axios from 'axios'
import ollamaMonitor from '../ollamaMonitor.js'

class OllamaProvider {
  constructor(config) {
    this.baseUrl = config.baseUrl
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 60000, // 60 seconds for AI responses
      headers: {
        'Content-Type': 'application/json',
        'ngrok-skip-browser-warning': 'true' // Required for ngrok free tier API requests
      }
    })
  }

  async generateResponse(prompt, context = null) {
    const startTime = Date.now()
    let requestData = {
      method: 'POST',
      endpoint: '/api/generate',
      prompt: prompt,
      success: false,
      duration: 0
    }

    try {
      console.log(`🔗 OllamaProvider making request to: ${this.baseUrl}/api/generate`)

      const requestBody = {
        // Model will be injected by AI service gateway if not provided
        prompt: prompt,
        stream: false,
        options: {
          temperature: 0.7,
          top_p: 0.9,
          top_k: 40
        }
      }

      // Add context if provided for conversation continuity
      if (context && Array.isArray(context) && context.length > 0) {
        requestBody.context = context
        console.log('📝 Using context from previous conversation:', context.length, 'tokens')
      }

      const response = await this.client.post('/api/generate', requestBody)

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
        model: response.data.model || 'unknown', // Use model from response
        usage,
        context: response.data.context || null // Return context for next conversation
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
        throw new Error(`Model not found on AI service. Please check AI service configuration.`)
      }

      throw new Error(`Ollama API error: ${error.message}`)
    }
  }

  async healthCheck() {
    try {
      const response = await this.client.get('/api/tags')
      const models = response.data.models || []

      return {
        status: 'healthy',
        models: models.map(m => m.name)
      }
    } catch (error) {
      if (error.code === 'ECONNREFUSED') {
        throw new Error('Cannot connect to AI service')
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

  async analyzeImage(imageBase64, prompt, visionModel = 'llama3.2-vision:11b') {
    const startTime = Date.now()
    let requestData = {
      method: 'POST',
      endpoint: '/api/chat',
      prompt: prompt,
      model: visionModel,
      success: false,
      duration: 0,
      hasImage: true
    }

    try {
      console.log(`🔗 OllamaProvider analyzing image with: ${this.baseUrl}/api/chat`)

      const requestBody = {
        model: visionModel,
        messages: [
          {
            role: 'user',
            content: prompt,
            images: [imageBase64]
          }
        ],
        stream: false,
        options: {
          temperature: 0.7,
          top_p: 0.9,
          top_k: 40
        }
      }

      // Vision models need more time - use 3 minute timeout instead of default 60 seconds
      const response = await this.client.post('/api/chat', requestBody, {
        timeout: 180000 // 3 minutes for vision processing
      })

      const endTime = Date.now()
      const duration = endTime - startTime

      const usage = {
        prompt_tokens: response.data.prompt_eval_count || 0,
        completion_tokens: response.data.eval_count || 0,
        total_tokens: (response.data.prompt_eval_count || 0) + (response.data.eval_count || 0)
      }

      const responseContent = response.data.message?.content?.trim() || ''

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
        model: visionModel,
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

      console.error('Ollama Vision API Error:', error.message)

      if (error.code === 'ECONNREFUSED') {
        throw new Error('Ollama service is not running. Please start Ollama first.')
      }

      if (error.response?.status === 404) {
        throw new Error(`Vision model "${visionModel}" not found. Please pull the model first: ollama pull ${visionModel}`)
      }

      throw new Error(`Ollama Vision API error: ${error.message}`)
    }
  }
}

export default OllamaProvider