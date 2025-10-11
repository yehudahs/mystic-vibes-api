import express from 'express'
import { query } from '../config/database.js'
import { authenticateToken } from '../middleware/auth.js'

const router = express.Router()

// Development/Testing-only endpoints
if (process.env.NODE_ENV === 'development') {
  
  // Simulate successful subscription for testing
  router.post('/simulate-subscription', authenticateToken, async (req, res) => {
    try {
      const userId = req.user.id
      const { priceId } = req.body
      
      // Use default price if not provided
      const effectivePriceId = priceId || process.env.VITE_STRIPE_PRICE_ID || 'price_1S5tEGEAZEU94rdcGrFxyIfm'
      
      console.log('🧪 SIMULATING SUBSCRIPTION:', { userId, priceId: effectivePriceId })
      
      // Generate simulated subscription data
      const customerId = `cus_simulated_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      const subscriptionId = `sub_simulated_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      
      try {
        // Save simulated subscription to database
        await query(
          `UPDATE users 
           SET stripe_customer_id = $1,
               stripe_subscription_id = $2,
               stripe_price_id = $3,
               subscription_status = $4,
               subscription_current_period_start = $5,
               subscription_current_period_end = $6,
               subscription_cancel_at_period_end = $7,
               updated_at = NOW()
           WHERE id = $8`,
          [
            customerId,
            subscriptionId,
            effectivePriceId,
            'active',
            new Date(), // current time as start
            new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
            false, // not cancelled
            userId
          ]
        )
        
        console.log('✅ Simulated subscription saved to database:', {
          userId,
          subscriptionId,
          customerId,
          priceId: effectivePriceId,
          status: 'active'
        })
        
        res.json({
          success: true,
          simulation: true,
          message: 'Subscription simulation completed successfully',
          data: {
            customerId,
            subscriptionId,
            priceId: effectivePriceId,
            status: 'active'
          }
        })
        
      } catch (dbError) {
        console.error('❌ Failed to save simulated subscription:', dbError)
        res.status(500).json({ 
          error: 'Failed to save simulated subscription',
          simulation: true 
        })
      }
      
    } catch (error) {
      console.error('❌ Simulation failed:', error)
      res.status(500).json({ 
        error: 'Simulation failed',
        simulation: true 
      })
    }
  })

  // Clear subscription data for testing
  router.post('/clear-subscription', authenticateToken, async (req, res) => {
    try {
      const userId = req.user.id
      
      await query(
        `UPDATE users 
         SET stripe_customer_id = NULL,
             stripe_subscription_id = NULL,
             stripe_price_id = NULL,
             subscription_status = NULL,
             subscription_current_period_start = NULL,
             subscription_current_period_end = NULL,
             subscription_cancel_at_period_end = NULL,
             subscription_canceled_at = NULL,
             updated_at = NOW()
         WHERE id = $1`,
        [userId]
      )
      
      console.log('🧹 Cleared subscription data for user:', userId)
      
      res.json({
        success: true,
        simulation: true,
        message: 'Subscription data cleared successfully'
      })
      
    } catch (error) {
      console.error('❌ Failed to clear subscription:', error)
      res.status(500).json({ 
        error: 'Failed to clear subscription data',
        simulation: true 
      })
    }
  })
  
} else {
  // In production, return 404 for all testing endpoints
  router.all('*', (req, res) => {
    res.status(404).json({ error: 'Testing endpoints not available in production' })
  })
}

export default router