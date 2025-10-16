import cron from 'node-cron'
import Stripe from 'stripe'
import { query } from '../config/database.js'

let stripe = null

function initializeStripe() {
  if (!stripe && process.env.STRIPE_SECRET_KEY) {
    stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' })
  }
  return stripe
}

/**
 * Daily subscription reconciliation job
 * Runs every day at 2 AM to catch any missed webhooks
 */
export function startDailyReconciliation() {
  // Run at 2 AM every day
  cron.schedule('0 2 * * *', async () => {
    console.log('🔄 Starting daily subscription reconciliation job...')
    await reconcileAllSubscriptions()
  }, {
    timezone: "America/New_York"
  })

  console.log('✅ Daily reconciliation job scheduled (2 AM daily)')
}

/**
 * Hourly check for subscriptions in "unknown" state
 * Runs every hour to resolve pending states quickly
 */
export function startUnknownStateCheck() {
  // Run every hour
  cron.schedule('0 * * * *', async () => {
    console.log('🔍 Checking subscriptions in unknown state...')
    await checkUnknownSubscriptions()
  })

  console.log('✅ Unknown state check scheduled (hourly)')
}

/**
 * Grace period cleanup job
 * Runs every 6 hours to handle grace periods
 */
export function startGracePeriodCheck() {
  // Run every 6 hours
  cron.schedule('0 */6 * * *', async () => {
    console.log('⏰ Checking grace periods...')
    await handleGracePeriods()
  })

  console.log('✅ Grace period check scheduled (every 6 hours)')
}

/**
 * Reconcile all subscriptions with Stripe
 */
async function reconcileAllSubscriptions() {
  const stripeInstance = initializeStripe()
  if (!stripeInstance) {
    console.error('❌ Stripe not configured for reconciliation')
    return
  }

  try {
    // Get all users with subscription data or in "unknown" state
    const usersResult = await query(`
      SELECT id, email, stripe_customer_id, subscription_state, last_state_check
      FROM users
      WHERE stripe_customer_id IS NOT NULL
         OR subscription_state = 'unknown'
         OR subscription_state = 'subscribed'
    `)

    let updated = 0
    let noChange = 0
    let errors = 0

    for (const user of usersResult.rows) {
      try {
        // Find customer in Stripe by email
        let customerId = user.stripe_customer_id
        if (!customerId) {
          const customers = await stripeInstance.customers.list({
            email: user.email,
            limit: 1
          })
          if (customers.data.length > 0) {
            customerId = customers.data[0].id
          }
        }

        if (!customerId) {
          continue
        }

        // Get active subscription
        const subscriptions = await stripeInstance.subscriptions.list({
          customer: customerId,
          status: 'active',
          limit: 1
        })

        if (subscriptions.data.length > 0) {
          const subscription = subscriptions.data[0]
          const priceId = subscription.items.data[0].price.id

          // Update database
          await query(`
            UPDATE users
            SET stripe_customer_id = $1,
                stripe_subscription_id = $2,
                stripe_price_id = $3,
                subscription_status = $4,
                subscription_current_period_start = $5,
                subscription_current_period_end = $6,
                subscription_cancel_at_period_end = $7,
                subscription_state = 'subscribed',
                last_state_check = NOW(),
                state_change_reason = 'Daily reconciliation',
                updated_at = NOW()
            WHERE id = $8
          `, [
            customerId,
            subscription.id,
            priceId,
            subscription.status,
            new Date(subscription.current_period_start * 1000),
            new Date(subscription.current_period_end * 1000),
            subscription.cancel_at_period_end,
            user.id
          ])

          updated++
        } else {
          // No active subscription - mark as unsubscribed
          await query(`
            UPDATE users
            SET subscription_state = 'unsubscribed',
                last_state_check = NOW(),
                state_change_reason = 'Daily reconciliation - no active subscription',
                updated_at = NOW()
            WHERE id = $1
          `, [user.id])

          noChange++
        }
      } catch (error) {
        console.error(`Error reconciling user ${user.email}:`, error.message)
        errors++
      }
    }

    console.log(`✅ Daily reconciliation complete: ${updated} updated, ${noChange} no change, ${errors} errors`)
  } catch (error) {
    console.error('❌ Daily reconciliation failed:', error)
  }
}

/**
 * Check subscriptions in "unknown" state
 */
async function checkUnknownSubscriptions() {
  const stripeInstance = initializeStripe()
  if (!stripeInstance) {
    console.error('❌ Stripe not configured for unknown state check')
    return
  }

  try {
    const usersResult = await query(`
      SELECT id, email, stripe_customer_id
      FROM users
      WHERE subscription_state = 'unknown'
    `)

    if (usersResult.rows.length === 0) {
      console.log('✅ No subscriptions in unknown state')
      return
    }

    let resolved = 0

    for (const user of usersResult.rows) {
      try {
        let customerId = user.stripe_customer_id
        if (!customerId) {
          const customers = await stripeInstance.customers.list({
            email: user.email,
            limit: 1
          })
          if (customers.data.length > 0) {
            customerId = customers.data[0].id
          }
        }

        if (!customerId) {
          await query(`
            UPDATE users
            SET subscription_state = 'unsubscribed',
                last_state_check = NOW(),
                state_change_reason = 'No customer found in Stripe',
                updated_at = NOW()
            WHERE id = $1
          `, [user.id])
          resolved++
          continue
        }

        const subscriptions = await stripeInstance.subscriptions.list({
          customer: customerId,
          status: 'active',
          limit: 1
        })

        if (subscriptions.data.length > 0) {
          const subscription = subscriptions.data[0]
          const priceId = subscription.items.data[0].price.id

          await query(`
            UPDATE users
            SET stripe_customer_id = $1,
                stripe_subscription_id = $2,
                stripe_price_id = $3,
                subscription_status = $4,
                subscription_current_period_start = $5,
                subscription_current_period_end = $6,
                subscription_cancel_at_period_end = $7,
                subscription_state = 'subscribed',
                last_state_check = NOW(),
                state_change_reason = 'Resolved from unknown state',
                updated_at = NOW()
            WHERE id = $8
          `, [
            customerId,
            subscription.id,
            priceId,
            subscription.status,
            new Date(subscription.current_period_start * 1000),
            new Date(subscription.current_period_end * 1000),
            subscription.cancel_at_period_end,
            user.id
          ])
          resolved++
        } else {
          await query(`
            UPDATE users
            SET subscription_state = 'unsubscribed',
                last_state_check = NOW(),
                state_change_reason = 'No active subscription in Stripe',
                updated_at = NOW()
            WHERE id = $1
          `, [user.id])
          resolved++
        }
      } catch (error) {
        console.error(`Error checking user ${user.email}:`, error.message)
      }
    }

    console.log(`✅ Unknown state check complete: ${resolved} subscriptions resolved`)
  } catch (error) {
    console.error('❌ Unknown state check failed:', error)
  }
}

/**
 * Handle grace periods for failed payments
 * Users get 3 days of access after payment failure
 */
async function handleGracePeriods() {
  try {
    // Find users whose subscription has expired but within grace period (3 days)
    const gracePeriodResult = await query(`
      SELECT id, email, subscription_current_period_end
      FROM users
      WHERE subscription_status = 'past_due'
        AND subscription_current_period_end > NOW() - INTERVAL '3 days'
        AND subscription_state != 'subscribed'
    `)

    if (gracePeriodResult.rows.length > 0) {
      for (const user of gracePeriodResult.rows) {
        await query(`
          UPDATE users
          SET subscription_state = 'subscribed',
              state_change_reason = 'Grace period active (3 days)',
              last_state_check = NOW()
          WHERE id = $1
        `, [user.id])
      }

      console.log(`✅ Applied grace period to ${gracePeriodResult.rows.length} users`)
    }

    // Find users whose grace period has expired
    const expiredGraceResult = await query(`
      SELECT id, email
      FROM users
      WHERE subscription_status = 'past_due'
        AND subscription_current_period_end < NOW() - INTERVAL '3 days'
        AND subscription_state = 'subscribed'
    `)

    if (expiredGraceResult.rows.length > 0) {
      for (const user of expiredGraceResult.rows) {
        await query(`
          UPDATE users
          SET subscription_state = 'unsubscribed',
              state_change_reason = 'Grace period expired',
              last_state_check = NOW()
          WHERE id = $1
        `, [user.id])
      }

      console.log(`✅ Expired grace period for ${expiredGraceResult.rows.length} users`)
    }

    if (gracePeriodResult.rows.length === 0 && expiredGraceResult.rows.length === 0) {
      console.log('✅ No grace periods to process')
    }
  } catch (error) {
    console.error('❌ Grace period check failed:', error)
  }
}

/**
 * Start all scheduled jobs
 */
export function startAllScheduledJobs() {
  console.log('🚀 Starting scheduled jobs...')
  startDailyReconciliation()
  startUnknownStateCheck()
  startGracePeriodCheck()
  console.log('✅ All scheduled jobs started')
}
