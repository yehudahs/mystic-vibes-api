import express from 'express'
import Stripe from 'stripe'
import { authenticateToken } from '../middleware/auth.js'
import { query } from '../config/database.js'

const router = express.Router()

// Initialize Stripe - will be set after environment variables are loaded
let stripe = null

// Function to initialize Stripe after environment variables are loaded
function initializeStripe() {
  if (!stripe && process.env.STRIPE_SECRET_KEY) {
    stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' })
    console.log('✅ Stripe initialized successfully')
  }
  return stripe
}

// Create Stripe Checkout Session
router.post('/create-checkout-session', authenticateToken, async (req, res) => {
  try {
    const { priceId, userId, successUrl, cancelUrl } = req.body

    if (!priceId || !userId) {
      return res.status(400).json({ 
        error: 'Missing required fields: priceId and userId are required' 
      })
    }

    // Skip mock payments - using real Stripe to debug session creation issue

    const stripeInstance = initializeStripe()
    if (!stripeInstance) {
      return res.status(500).json({ 
        error: 'Stripe not configured - missing STRIPE_SECRET_KEY environment variable' 
      })
    }

    console.log('🔍 CHECKOUT SESSION CREATION DEBUG:')
    console.log('- Request data:', { priceId, userId, successUrl, cancelUrl })
    console.log('- User email:', req.user?.email)
    console.log('- Request origin:', req.headers.origin)
    console.log('- Stripe mode:', stripeInstance.apiVersion)
    console.log('- Environment:', process.env.NODE_ENV)

    const sessionParams = {
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: successUrl || `${req.headers.origin}/profile?payment=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancelUrl || `${req.headers.origin}/pricing?payment=cancelled`,
      client_reference_id: userId,
      customer_email: req.user?.email, // Optional: pre-fill customer email
    }

    console.log('- Session parameters:', JSON.stringify(sessionParams, null, 2))

    const session = await stripeInstance.checkout.sessions.create(sessionParams)

    console.log('✅ Checkout session created successfully:')
    console.log('- Session ID:', session.id)
    console.log('- Session URL:', session.url)
    console.log('- Session mode:', session.mode)
    console.log('- Session status:', session.payment_status)
    console.log('- Session expires at:', new Date(session.expires_at * 1000).toISOString())
    res.json({ 
      id: session.id, 
      url: session.url 
    })

  } catch (error) {
    console.error('Stripe checkout error:', error)
    res.status(500).json({ 
      error: 'Failed to create checkout session',
      details: error.message 
    })
  }
})

// Create Customer Portal Session
// Verify Stripe checkout session and activate subscription
router.post('/verify-session', authenticateToken, async (req, res) => {
  try {
    const { sessionId } = req.body
    const userId = req.user.id

    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID is required' })
    }

    console.log('🔍 VERIFYING STRIPE SESSION:', { sessionId, userId })

    const stripeInstance = initializeStripe()
    if (!stripeInstance) {
      return res.status(500).json({ error: 'Stripe not configured' })
    }

    // Retrieve the session from Stripe to verify it's legitimate
    const session = await stripeInstance.checkout.sessions.retrieve(sessionId)
    
    console.log('📋 Session details:', {
      id: session.id,
      payment_status: session.payment_status,
      customer_email: session.customer_email,
      client_reference_id: session.client_reference_id,
      mode: session.mode,
      created: new Date(session.created * 1000).toISOString()
    })

    // Verify session belongs to this user
    if (session.client_reference_id !== userId) {
      console.log('❌ Session user mismatch:', {
        sessionUserId: session.client_reference_id,
        requestUserId: userId
      })
      return res.status(403).json({ error: 'Session does not belong to user' })
    }

    // Verify payment was successful
    if (session.payment_status !== 'paid') {
      console.log('❌ Payment not completed:', { payment_status: session.payment_status })
      return res.status(400).json({ 
        error: 'Payment not completed',
        payment_status: session.payment_status 
      })
    }

    // Get the subscription details
    if (session.mode !== 'subscription') {
      return res.status(400).json({ error: 'Session is not for a subscription' })
    }

    // Extract price ID from line items
    const lineItems = await stripeInstance.checkout.sessions.listLineItems(sessionId)
    const priceId = lineItems.data[0]?.price?.id

    if (!priceId) {
      return res.status(400).json({ error: 'Could not determine subscription plan' })
    }

    // Get the subscription details from Stripe and save to database
    let subscriptionSaved = false
    if (session.subscription) {
      try {
        const subscription = await stripeInstance.subscriptions.retrieve(session.subscription)

        // Save subscription to users table and update state to 'subscribed'
        await query(
          `UPDATE users
           SET stripe_customer_id = $1,
               stripe_subscription_id = $2,
               stripe_price_id = $3,
               subscription_status = $4,
               subscription_current_period_start = $5,
               subscription_current_period_end = $6,
               subscription_cancel_at_period_end = $7,
               subscription_state = 'subscribed',
               last_state_check = NOW(),
               state_change_reason = 'Payment verified successfully',
               updated_at = NOW()
           WHERE id = $8`,
          [
            session.customer,
            subscription.id,
            priceId,
            subscription.status,
            new Date(subscription.current_period_start * 1000),
            new Date(subscription.current_period_end * 1000),
            subscription.cancel_at_period_end,
            userId
          ]
        )

        subscriptionSaved = true
        console.log('✅ Subscription saved to database via verification:', {
          userId,
          subscriptionId: subscription.id,
          priceId,
          status: subscription.status
        })
      } catch (dbError) {
        console.error('❌ Failed to save subscription during verification:', dbError)
      }
    }

    console.log('✅ Session verified successfully:', {
      sessionId,
      userId,
      priceId,
      customerEmail: session.customer_email,
      subscriptionSaved
    })

    res.json({
      success: true,
      sessionId,
      priceId,
      customerEmail: session.customer_email,
      paymentStatus: session.payment_status,
      subscriptionSaved
    })

  } catch (error) {
    console.error('❌ Session verification failed:', error)
    res.status(500).json({ 
      error: 'Failed to verify session',
      details: error.message 
    })
  }
})


// Sync subscription from Stripe and save to database
router.post('/sync-subscription', authenticateToken, async (req, res) => {
  try {
    const stripeInstance = initializeStripe()
    if (!stripeInstance) {
      return res.status(500).json({
        error: 'Stripe not configured'
      })
    }

    const userId = req.user.id
    const userEmail = req.user.email

    console.log('🔄 SYNCING SUBSCRIPTION FROM STRIPE:', { userId, userEmail })

    // Find customer by email
    const existingCustomers = await stripeInstance.customers.list({
      email: userEmail,
      limit: 1
    })

    if (existingCustomers.data.length === 0) {
      return res.json({
        success: false,
        message: 'No Stripe customer found for this email'
      })
    }

    const customer = existingCustomers.data[0]

    // Get active subscriptions for this customer
    const subscriptions = await stripeInstance.subscriptions.list({
      customer: customer.id,
      status: 'active',
      limit: 1
    })

    if (subscriptions.data.length === 0) {
      return res.json({
        success: false,
        message: 'No active subscriptions found'
      })
    }

    // Save the subscription to database
    const subscription = subscriptions.data[0]
    const priceId = subscription.items.data[0].price.id

    await query(
      `UPDATE users
       SET stripe_customer_id = $1,
           stripe_subscription_id = $2,
           stripe_price_id = $3,
           subscription_status = $4,
           subscription_current_period_start = $5,
           subscription_current_period_end = $6,
           subscription_cancel_at_period_end = $7,
           subscription_state = 'subscribed',
           last_state_check = NOW(),
           state_change_reason = 'Synced from Stripe',
           updated_at = NOW()
       WHERE id = $8`,
      [
        customer.id,
        subscription.id,
        priceId,
        subscription.status,
        new Date(subscription.current_period_start * 1000),
        new Date(subscription.current_period_end * 1000),
        subscription.cancel_at_period_end,
        userId
      ]
    )

    console.log('✅ Subscription synced successfully:', {
      userId,
      subscriptionId: subscription.id,
      priceId,
      status: subscription.status
    })

    res.json({
      success: true,
      message: 'Subscription synced successfully',
      subscription: {
        stripe_customer_id: customer.id,
        stripe_subscription_id: subscription.id,
        stripe_price_id: priceId,
        subscription_status: subscription.status,
        subscription_current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
        subscription_current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
        subscription_cancel_at_period_end: subscription.cancel_at_period_end
      }
    })

  } catch (error) {
    console.error('❌ Failed to sync subscription:', error)
    res.status(500).json({
      error: 'Failed to sync subscription',
      details: error.message
    })
  }
})

// Check real subscription status from Stripe
router.get('/subscription-status', authenticateToken, async (req, res) => {
  try {
    const stripeInstance = initializeStripe()
    if (!stripeInstance) {
      return res.status(500).json({ 
        error: 'Stripe not configured' 
      })
    }

    const userEmail = req.user.email
    console.log('🔍 CHECKING SUBSCRIPTION STATUS:', { userEmail })

    try {
      // Find customer by email
      const existingCustomers = await stripeInstance.customers.list({
        email: userEmail,
        limit: 1
      })

      if (existingCustomers.data.length === 0) {
        return res.json({
          hasSubscription: false,
          status: 'no_customer'
        })
      }

      const customer = existingCustomers.data[0]
      
      // Get active subscriptions for this customer
      const subscriptions = await stripeInstance.subscriptions.list({
        customer: customer.id,
        status: 'active',
        limit: 10
      })

      if (subscriptions.data.length === 0) {
        // Check for canceled subscriptions
        const canceledSubs = await stripeInstance.subscriptions.list({
          customer: customer.id,
          status: 'canceled',
          limit: 5
        })

        return res.json({
          hasSubscription: false,
          status: 'canceled',
          lastCanceled: canceledSubs.data.length > 0 ? canceledSubs.data[0].canceled_at : null
        })
      }

      // Return active subscription details
      const activeSub = subscriptions.data[0]
      res.json({
        hasSubscription: true,
        status: activeSub.status,
        subscriptionId: activeSub.id,
        priceId: activeSub.items.data[0].price.id,
        currentPeriodEnd: new Date(activeSub.current_period_end * 1000).toISOString(),
        cancelAtPeriodEnd: activeSub.cancel_at_period_end
      })

    } catch (stripeError) {
      console.error('❌ Stripe subscription check error:', stripeError)
      res.status(500).json({ 
        error: 'Failed to check subscription status',
        details: stripeError.message 
      })
    }

  } catch (error) {
    console.error('❌ Subscription status check failed:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

router.post('/create-portal-session', authenticateToken, async (req, res) => {
  try {
    const stripeInstance = initializeStripe()
    if (!stripeInstance) {
      return res.status(500).json({ 
        error: 'Stripe not configured - missing STRIPE_SECRET_KEY environment variable' 
      })
    }

    const userId = req.user.id
    const userEmail = req.user.email
    
    // Return URL with success parameter to trigger sync
    const returnUrl = `${req.headers.origin}/profile?tab=subscription&portal_return=true`

    console.log('🔍 CREATING CUSTOMER PORTAL SESSION:', { 
      userId, 
      userEmail, 
      returnUrl,
      origin: req.headers.origin 
    })

    // Set user subscription state to 'unknown' when they access the portal
    // This ensures we track when they might be making changes
    try {
      await query(
        `UPDATE users
         SET subscription_state = 'unknown',
             last_state_check = NOW(),
             state_change_reason = 'Customer portal session initiated',
             updated_at = NOW()
         WHERE id = $1`,
        [userId]
      )
      console.log('📝 Updated user subscription state to unknown for portal access')
    } catch (dbError) {
      console.warn('⚠️ Failed to update subscription state for portal access:', dbError)
      // Continue with portal creation even if state update fails
    }

    // For now, since we don't store Stripe customer IDs in our system,
    // we'll need to find existing customers or create one
    // This is a limitation of our current local-storage-only subscription system

    try {
      // First, try to find existing customers with this email
      const existingCustomers = await stripeInstance.customers.list({
        email: userEmail,
        limit: 1
      })

      let customerId = null

      if (existingCustomers.data.length > 0) {
        customerId = existingCustomers.data[0].id
        console.log('📋 Found existing Stripe customer:', customerId)
      } else {
        // Create a new customer for portal access
        const customer = await stripeInstance.customers.create({
          email: userEmail,
          metadata: {
            userId: userId,
            source: 'vibely_portal_access'
          }
        })
        customerId = customer.id
        console.log('👤 Created new Stripe customer:', customerId)
      }

      console.log('📤 Creating Stripe portal session with parameters:', {
        customer: customerId,
        return_url: returnUrl
      })

      const session = await stripeInstance.billingPortal.sessions.create({
        customer: customerId,
        return_url: returnUrl,
      })
      
      console.log('📥 Stripe portal session response:', {
        sessionUrl: session.url,
        returnUrlInResponse: session.return_url || 'not included in response'
      })

      console.log('✅ Customer portal session created:', session.url)
      res.json({ url: session.url })

    } catch (stripeError) {
      console.error('❌ Stripe Customer Portal error:', stripeError)
      
      // Fallback: redirect to profile with instructions
      res.json({ 
        url: returnUrl,
        message: 'Unable to access customer portal. Please contact support for subscription management.',
        fallback: true
      })
    }

  } catch (error) {
    console.error('❌ Portal session error:', error)
    res.status(500).json({ 
      error: 'Failed to create portal session',
      details: error.message 
    })
  }
})

// Stripe Webhook (for handling successful payments)
router.post('/webhook', async (req, res) => {
  const stripeInstance = initializeStripe()
  if (!stripeInstance) {
    console.log('⚠️ Stripe webhook received but Stripe not configured')
    return res.status(500).json({ 
      error: 'Stripe not configured - missing STRIPE_SECRET_KEY environment variable' 
    })
  }

  const sig = req.headers['stripe-signature']
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET

  if (!endpointSecret) {
    console.log('⚠️ Webhook received but STRIPE_WEBHOOK_SECRET not configured')
    return res.status(500).json({ 
      error: 'Webhook secret not configured - missing STRIPE_WEBHOOK_SECRET environment variable' 
    })
  }

  let event

  try {
    event = stripeInstance.webhooks.constructEvent(req.body, sig, endpointSecret)
  } catch (err) {
    console.log(`⚠️  Webhook signature verification failed.`, err.message)
    return res.status(400).send(`Webhook Error: ${err.message}`)
  }

  // Handle the event
  switch (event.type) {
    case 'checkout.session.completed':
      const session = event.data.object
      console.log('✅ Payment successful via webhook:', {
        sessionId: session.id,
        customerId: session.customer,
        userId: session.client_reference_id,
        paymentStatus: session.payment_status
      })
      
      try {
        const userId = session.client_reference_id
        const customerId = session.customer
        
        if (userId && session.payment_status === 'paid') {
          // Get subscription details from line items
          const lineItems = await stripeInstance.checkout.sessions.listLineItems(session.id)
          const priceId = lineItems.data[0]?.price?.id
          
          if (priceId) {
            // Get subscription details from Stripe
            const subscriptions = await stripeInstance.subscriptions.list({
              customer: customerId,
              status: 'active',
              limit: 1
            })
            
            const subscription = subscriptions.data[0]
            if (subscription) {
              // Save subscription to users table and update state to 'subscribed'
              await query(
                `UPDATE users
                 SET stripe_customer_id = $1,
                     stripe_subscription_id = $2,
                     stripe_price_id = $3,
                     subscription_status = $4,
                     subscription_current_period_start = $5,
                     subscription_current_period_end = $6,
                     subscription_cancel_at_period_end = $7,
                     subscription_state = 'subscribed',
                     last_state_check = NOW(),
                     state_change_reason = 'Payment completed via webhook',
                     updated_at = NOW()
                 WHERE id = $8`,
                [
                  customerId,
                  subscription.id,
                  priceId,
                  subscription.status,
                  new Date(subscription.current_period_start * 1000),
                  new Date(subscription.current_period_end * 1000),
                  subscription.cancel_at_period_end,
                  userId
                ]
              )
              
              console.log('✅ Subscription saved to database:', {
                userId,
                subscriptionId: subscription.id,
                priceId,
                status: subscription.status
              })
            }
          }
        }
      } catch (dbError) {
        console.error('❌ Failed to save subscription to database:', dbError)
      }
      
      break
    
    case 'invoice.payment_succeeded':
      console.log('Subscription payment succeeded')
      break
      
    case 'customer.subscription.updated':
      const updatedSubscription = event.data.object
      
      console.log('🔄 Subscription updated via webhook:', {
        subscriptionId: updatedSubscription.id,
        customerId: updatedSubscription.customer,
        status: updatedSubscription.status,
        cancelAtPeriodEnd: updatedSubscription.cancel_at_period_end,
        canceledAt: updatedSubscription.canceled_at ? new Date(updatedSubscription.canceled_at * 1000).toISOString() : 'null',
        currentPeriodEnd: updatedSubscription.current_period_end ? new Date(updatedSubscription.current_period_end * 1000).toISOString() : 'null'
      })
      
      try {
        // When current_period_end is null in the webhook (common during cancellation),
        // we should preserve the existing period end date from the database
        let periodEndToUpdate = null
        if (updatedSubscription.current_period_end) {
          periodEndToUpdate = new Date(updatedSubscription.current_period_end * 1000)
        } else {
          // If current_period_end is null, don't update it (preserve existing value)
          // Use a conditional update to only update the period end if we have a value
        }
        
        // Update subscription details in users table
        // If the subscription is being cancelled (cancel_at_period_end = true) and we have a canceled_at timestamp,
        // also update the subscription_canceled_at field
        // Determine subscription state based on status and cancellation
        let subscriptionState = 'subscribed'
        let stateChangeReason = 'Updated via webhook'

        if (updatedSubscription.status === 'canceled') {
          subscriptionState = 'unsubscribed'
          stateChangeReason = 'Subscription canceled'
        } else if (updatedSubscription.cancel_at_period_end) {
          subscriptionState = 'subscribed' // Still active until period ends
          stateChangeReason = 'Subscription set to cancel at period end'
        }

        const updateResult = await query(
          periodEndToUpdate
            ? `UPDATE users
               SET subscription_status = $1,
                   subscription_cancel_at_period_end = $2,
                   subscription_current_period_end = $3,
                   subscription_canceled_at = $4,
                   subscription_state = $5,
                   last_state_check = NOW(),
                   state_change_reason = $6,
                   updated_at = NOW()
               WHERE stripe_subscription_id = $7`
            : `UPDATE users
               SET subscription_status = $1,
                   subscription_cancel_at_period_end = $2,
                   subscription_canceled_at = $3,
                   subscription_state = $4,
                   last_state_check = NOW(),
                   state_change_reason = $5,
                   updated_at = NOW()
               WHERE stripe_subscription_id = $6`,
          periodEndToUpdate
            ? [
                updatedSubscription.status,
                updatedSubscription.cancel_at_period_end,
                periodEndToUpdate,
                updatedSubscription.canceled_at ? new Date(updatedSubscription.canceled_at * 1000) : null,
                subscriptionState,
                stateChangeReason,
                updatedSubscription.id
              ]
            : [
                updatedSubscription.status,
                updatedSubscription.cancel_at_period_end,
                updatedSubscription.canceled_at ? new Date(updatedSubscription.canceled_at * 1000) : null,
                subscriptionState,
                stateChangeReason,
                updatedSubscription.id
              ]
        )
        
        if (updateResult.rowCount > 0) {
          console.log('✅ Subscription updated in database:', {
            subscriptionId: updatedSubscription.id,
            status: updatedSubscription.status,
            cancelAtPeriodEnd: updatedSubscription.cancel_at_period_end,
            rowsUpdated: updateResult.rowCount
          })
        } else {
          console.log('⚠️ No user found with subscription ID:', {
            subscriptionId: updatedSubscription.id
          })
        }
      } catch (dbError) {
        console.error('❌ Failed to update subscription in database:', dbError)
      }
      
      break
      
    case 'customer.subscription.deleted':
      const deletedSubscription = event.data.object
      const customerId = deletedSubscription.customer
      
      console.log('🗑️ Subscription cancelled via webhook:', {
        subscriptionId: deletedSubscription.id,
        customerId: customerId,
        canceledAt: new Date(deletedSubscription.canceled_at * 1000).toISOString()
      })
      
      try {
        // Update subscription status in users table
        // For immediate cancellations, also set cancel_at_period_end = true so the UI shows cancellation details
        const updateResult = await query(
          `UPDATE users
           SET subscription_status = 'canceled',
               subscription_cancel_at_period_end = true,
               subscription_canceled_at = $1,
               subscription_state = 'unsubscribed',
               last_state_check = NOW(),
               state_change_reason = 'Subscription deleted via webhook',
               updated_at = NOW()
           WHERE stripe_subscription_id = $2`,
          [
            new Date(deletedSubscription.canceled_at * 1000),
            deletedSubscription.id
          ]
        )
        
        if (updateResult.rowCount > 0) {
          console.log('✅ Subscription status updated in database:', {
            subscriptionId: deletedSubscription.id,
            rowsUpdated: updateResult.rowCount
          })
        } else {
          console.log('⚠️ No user found with subscription ID:', {
            subscriptionId: deletedSubscription.id
          })
        }
      } catch (dbError) {
        console.error('❌ Failed to update subscription in database:', dbError)
      }
      
      break
      
    default:
      console.log(`Unhandled event type ${event.type}`)
  }

  res.json({ received: true })
})

// Update subscription state
router.post('/subscription/state', authenticateToken, async (req, res) => {
  try {
    const { userId, subscriptionState, stateChangeReason } = req.body
    const authenticatedUserId = req.user.id

    // Ensure user can only update their own subscription state
    if (userId !== authenticatedUserId) {
      return res.status(403).json({ error: 'Can only update your own subscription state' })
    }

    if (!subscriptionState || !['unsubscribed', 'unknown', 'subscribed'].includes(subscriptionState)) {
      return res.status(400).json({
        error: 'Invalid subscription state. Must be: unsubscribed, unknown, or subscribed'
      })
    }

    console.log('🔄 UPDATING SUBSCRIPTION STATE:', {
      userId,
      subscriptionState,
      stateChangeReason
    })

    await query(
      `UPDATE users
       SET subscription_state = $1,
           last_state_check = $2,
           state_change_reason = $3,
           updated_at = NOW()
       WHERE id = $4`,
      [
        subscriptionState,
        new Date(),
        stateChangeReason || null,
        userId
      ]
    )

    console.log('✅ Subscription state updated:', {
      userId,
      subscriptionState,
      stateChangeReason
    })

    res.json({ success: true })

  } catch (error) {
    console.error('❌ Failed to update subscription state:', error)
    res.status(500).json({
      error: 'Failed to update subscription state',
      details: error.message
    })
  }
})

// Check subscription status with Stripe and update state
router.post('/subscription/check-status', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.body
    const authenticatedUserId = req.user.id

    // Ensure user can only check their own subscription status
    if (userId !== authenticatedUserId) {
      return res.status(403).json({ error: 'Can only check your own subscription status' })
    }

    const stripeInstance = initializeStripe()
    if (!stripeInstance) {
      return res.status(500).json({ error: 'Stripe not configured' })
    }

    const userEmail = req.user.email

    console.log('🔍 CHECKING SUBSCRIPTION STATUS FOR STATE MANAGEMENT:', {
      userId,
      userEmail
    })

    // Find customer by email
    const existingCustomers = await stripeInstance.customers.list({
      email: userEmail,
      limit: 1
    })

    let hasActiveSubscription = false
    let subscriptionDetails = null

    if (existingCustomers.data.length > 0) {
      const customer = existingCustomers.data[0]

      // Get active subscriptions for this customer
      const subscriptions = await stripeInstance.subscriptions.list({
        customer: customer.id,
        status: 'active',
        limit: 1
      })

      if (subscriptions.data.length > 0) {
        hasActiveSubscription = true
        const subscription = subscriptions.data[0]

        subscriptionDetails = {
          subscriptionId: subscription.id,
          customerId: customer.id,
          priceId: subscription.items.data[0].price.id,
          status: subscription.status,
          currentPeriodStart: new Date(subscription.current_period_start * 1000),
          currentPeriodEnd: new Date(subscription.current_period_end * 1000),
          cancelAtPeriodEnd: subscription.cancel_at_period_end
        }

        // Update database with current subscription details and set state to 'subscribed'
        await query(
          `UPDATE users
           SET stripe_customer_id = $1,
               stripe_subscription_id = $2,
               stripe_price_id = $3,
               subscription_status = $4,
               subscription_current_period_start = $5,
               subscription_current_period_end = $6,
               subscription_cancel_at_period_end = $7,
               subscription_state = 'subscribed',
               last_state_check = NOW(),
               state_change_reason = 'Confirmed active by Stripe status check',
               updated_at = NOW()
           WHERE id = $8`,
          [
            customer.id,
            subscription.id,
            subscriptionDetails.priceId,
            subscription.status,
            subscriptionDetails.currentPeriodStart,
            subscriptionDetails.currentPeriodEnd,
            subscription.cancel_at_period_end,
            userId
          ]
        )

        console.log('✅ Database updated with current Stripe subscription details and state set to subscribed')
      } else {
        // No active subscription found - set state to 'unsubscribed'
        await query(
          `UPDATE users
           SET subscription_state = 'unsubscribed',
               last_state_check = NOW(),
               state_change_reason = 'No active subscription found in Stripe',
               updated_at = NOW()
           WHERE id = $1`,
          [userId]
        )

        console.log('✅ No active subscription found - state set to unsubscribed')
      }
    } else {
      // No customer found in Stripe - set state to 'unsubscribed'
      await query(
        `UPDATE users
         SET subscription_state = 'unsubscribed',
             last_state_check = NOW(),
             state_change_reason = 'No customer found in Stripe',
             updated_at = NOW()
         WHERE id = $1`,
        [userId]
      )

      console.log('✅ No customer found in Stripe - state set to unsubscribed')
    }

    console.log('📋 Status check result:', {
      hasActiveSubscription,
      subscriptionDetails: subscriptionDetails ? 'present' : 'none'
    })

    res.json({
      hasActiveSubscription,
      subscriptionDetails
    })

  } catch (error) {
    console.error('❌ Failed to check subscription status:', error)
    res.status(500).json({
      error: 'Failed to check subscription status',
      details: error.message
    })
  }
})

export default router