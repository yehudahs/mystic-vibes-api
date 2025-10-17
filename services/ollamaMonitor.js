/**
 * Ollama Request Monitor
 * Tracks all requests to Ollama API for debugging and monitoring
 */

class OllamaMonitor {
  constructor() {
    this.requests = []
    this.maxRequests = 100 // Keep last 100 requests
  }

  /**
   * Log a request to Ollama
   */
  logRequest(data) {
    const request = {
      id: `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      ...data
    }

    this.requests.unshift(request)

    // Keep only the last maxRequests
    if (this.requests.length > this.maxRequests) {
      this.requests = this.requests.slice(0, this.maxRequests)
    }

    // Log to console
    if (request.success) {
      console.log('✅ Ollama Request Success:', {
        id: request.id,
        method: request.method,
        endpoint: request.endpoint,
        duration: `${request.duration}ms`,
        model: request.model
      })
    } else {
      console.error('❌ Ollama Request Failed:', {
        id: request.id,
        method: request.method,
        endpoint: request.endpoint,
        duration: `${request.duration}ms`,
        error: request.error
      })
    }

    return request
  }

  /**
   * Get all logged requests
   */
  getRequests(limit = 50) {
    return this.requests.slice(0, limit)
  }

  /**
   * Get summary statistics
   */
  getStats() {
    const total = this.requests.length
    const successful = this.requests.filter(r => r.success).length
    const failed = this.requests.filter(r => r.success === false).length

    const durations = this.requests
      .filter(r => r.success && r.duration)
      .map(r => r.duration)

    const avgDuration = durations.length > 0
      ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
      : 0

    const maxDuration = durations.length > 0 ? Math.max(...durations) : 0
    const minDuration = durations.length > 0 ? Math.min(...durations) : 0

    // Calculate total tokens
    const totalTokens = this.requests
      .filter(r => r.success && r.usage)
      .reduce((sum, r) => sum + (r.usage?.total_tokens || 0), 0)

    return {
      total,
      successful,
      failed,
      successRate: total > 0 ? ((successful / total) * 100).toFixed(1) + '%' : '0%',
      avgDuration: `${avgDuration}ms`,
      maxDuration: `${maxDuration}ms`,
      minDuration: `${minDuration}ms`,
      totalTokens,
      lastRequest: this.requests[0]?.timestamp || null
    }
  }

  /**
   * Clear all logged requests
   */
  clear() {
    this.requests = []
    console.log('🗑️  Ollama monitor cleared')
  }
}

// Create singleton instance
const ollamaMonitor = new OllamaMonitor()

export default ollamaMonitor
