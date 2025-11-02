import express from 'express'
import axios from 'axios'

const router = express.Router()
const AI_SERVICES = process.env.AI_SERVICES

/**
 * GET /api/ai-status
 * Check if AI service is online
 * Returns:
 * - online: boolean
 * - responseTime: number (ms)
 * - details: object (only in non-production)
 */
router.get('/', async (req, res) => {
  const startTime = Date.now()
  const isProduction = process.env.NODE_ENV === 'production'
  
  // Check if AI_SERVICES is configured
  if (!AI_SERVICES) {
    return res.json({
      online: false,
      responseTime: 0,
      timestamp: new Date().toISOString(),
      details: !isProduction ? {
        error: 'AI_SERVICES environment variable not configured',
        environment: process.env.NODE_ENV || 'development'
      } : undefined
    })
  }
  
  try {
    const response = await axios.get(`${AI_SERVICES}/health`, {
      timeout: 5000,
      validateStatus: () => true // Accept any status code
    })
    
    const responseTime = Date.now() - startTime
    const isOnline = response.status === 200
    
    const result = {
      online: isOnline,
      responseTime,
      timestamp: new Date().toISOString()
    }
    
    // Include detailed info only for non-production
    if (!isProduction) {
      result.details = {
        status: response.status,
        aiServiceUrl: AI_SERVICES,
        data: response.data,
        environment: process.env.NODE_ENV || 'development'
      }
    }
    
    res.json(result)
    
  } catch (error) {
    const responseTime = Date.now() - startTime
    
    const result = {
      online: false,
      responseTime,
      timestamp: new Date().toISOString()
    }
    
    // Include error details only for non-production
    if (!isProduction) {
      result.details = {
        error: error.message,
        code: error.code,
        aiServiceUrl: AI_SERVICES,
        environment: process.env.NODE_ENV || 'development'
      }
    }
    
    res.json(result)
  }
})

export default router
