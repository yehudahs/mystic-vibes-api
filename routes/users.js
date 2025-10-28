import express from 'express'
import Joi from 'joi'
import { query } from '../config/database.js'
import { asyncHandler } from '../middleware/errorHandler.js'

const router = express.Router()

// Validation schemas
const updateProfileSchema = Joi.object({
  name: Joi.string().min(2).max(50).optional(),
  avatar_url: Joi.string().uri().allow('').optional(),
  birthday: Joi.date().iso().allow('').optional()
})

const updatePreferencesSchema = Joi.object({
  preferredSpreadId: Joi.string().optional(),
  useAI: Joi.boolean().optional(),
  theme: Joi.string().valid('dark', 'light', 'auto').optional(),
  notificationsEnabled: Joi.boolean().optional()
})

// GET /api/users/profile - Get user profile
router.get('/profile', asyncHandler(async (req, res) => {
  const userResult = await query(
    'SELECT id, name, email, avatar_url, birthday, provider, created_at, updated_at, last_login_at FROM users WHERE id = $1',
    [req.user.id]
  )

  if (userResult.rows.length === 0) {
    return res.status(404).json({ error: 'User not found' })
  }

  const user = userResult.rows[0]

  res.json({
    id: user.id,
    name: user.name,
    email: user.email,
    avatar: user.avatar_url,
    birthday: user.birthday,
    provider: user.provider,
    createdAt: user.created_at,
    updatedAt: user.updated_at,
    lastLoginAt: user.last_login_at
  })
}))

// PUT /api/users/profile - Update user profile
router.put('/profile', asyncHandler(async (req, res) => {
  const { error, value } = updateProfileSchema.validate(req.body)
  if (error) {
    return res.status(400).json({ error: error.details[0].message })
  }

  const updateFields = []
  const updateValues = []
  let paramIndex = 1

  // Build dynamic update query
  Object.entries(value).forEach(([key, val]) => {
    if (val !== undefined) {
      updateFields.push(`${key} = $${paramIndex}`)
      updateValues.push(val)
      paramIndex++
    }
  })

  if (updateFields.length === 0) {
    return res.status(400).json({ error: 'No valid fields to update' })
  }

  updateFields.push(`updated_at = NOW()`)
  updateValues.push(req.user.id)

  const updateQuery = `
    UPDATE users 
    SET ${updateFields.join(', ')}
    WHERE id = $${paramIndex}
    RETURNING id, name, email, avatar_url, birthday, provider, created_at, updated_at
  `

  const result = await query(updateQuery, updateValues)
  const user = result.rows[0]

  res.json({
    message: 'Profile updated successfully',
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      avatar: user.avatar_url,
      birthday: user.birthday,
      provider: user.provider,
      createdAt: user.created_at,
      updatedAt: user.updated_at
    }
  })
}))

// GET /api/users/preferences - Get user preferences
router.get('/preferences', asyncHandler(async (req, res) => {
  const result = await query(
    'SELECT * FROM user_preferences WHERE user_id = $1',
    [req.user.id]
  )

  if (result.rows.length === 0) {
    // Return default preferences
    return res.json({
      preferredSpreadId: 'three-card',
      useAI: true,
      theme: 'dark',
      notificationsEnabled: true
    })
  }

  const prefs = result.rows[0]
  res.json({
    preferredSpreadId: prefs.preferred_spread_id,
    useAI: prefs.use_ai,
    theme: prefs.theme,
    notificationsEnabled: prefs.notifications_enabled
  })
}))

// PUT /api/users/preferences - Update user preferences
router.put('/preferences', asyncHandler(async (req, res) => {
  const { error, value } = updatePreferencesSchema.validate(req.body)
  if (error) {
    return res.status(400).json({ error: error.details[0].message })
  }

  // Upsert preferences
  const result = await query(
    `INSERT INTO user_preferences (user_id, preferred_spread_id, use_ai, theme, notifications_enabled)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (user_id) DO UPDATE SET
       preferred_spread_id = COALESCE($2, user_preferences.preferred_spread_id),
       use_ai = COALESCE($3, user_preferences.use_ai),
       theme = COALESCE($4, user_preferences.theme),
       notifications_enabled = COALESCE($5, user_preferences.notifications_enabled),
       updated_at = NOW()
     RETURNING *`,
    [
      req.user.id,
      value.preferredSpreadId || null,
      value.useAI !== undefined ? value.useAI : null,
      value.theme || null,
      value.notificationsEnabled !== undefined ? value.notificationsEnabled : null
    ]
  )

  const prefs = result.rows[0]
  res.json({
    message: 'Preferences updated successfully',
    preferences: {
      preferredSpreadId: prefs.preferred_spread_id,
      useAI: prefs.use_ai,
      theme: prefs.theme,
      notificationsEnabled: prefs.notifications_enabled
    }
  })
}))

// GET /api/users/stats - Get user statistics
router.get('/stats', asyncHandler(async (req, res) => {
  const result = await query(
    'SELECT * FROM user_stats WHERE user_id = $1',
    [req.user.id]
  )

  if (result.rows.length === 0) {
    return res.json({
      totalReadings: 0,
      favoriteSpreadId: null,
      lastReadingDate: null,
      readingsThisMonth: 0,
      readingsByMonth: {},
      readingsBySpread: {}
    })
  }

  const stats = result.rows[0]
  res.json({
    totalReadings: stats.total_readings,
    favoriteSpreadId: stats.favorite_spread_id,
    lastReadingDate: stats.last_reading_date,
    readingsThisMonth: stats.readings_this_month,
    readingsByMonth: stats.readings_by_month,
    readingsBySpread: stats.readings_by_spread
  })
}))

// GET /api/users/subscription - Get user subscription from database
router.get('/subscription', asyncHandler(async (req, res) => {
  const result = await query(
    `SELECT
      stripe_customer_id,
      stripe_subscription_id,
      stripe_price_id,
      stripe_subscription_status,
      subscription_state,
      subscription_current_period_start,
      subscription_current_period_end,
      subscription_cancel_at_period_end,
      subscription_canceled_at,
      last_state_check,
      state_change_reason,
      created_at,
      updated_at
    FROM users
    WHERE id = $1`,
    [req.user.id]
  )

  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'User not found' })
  }

  const subscription = result.rows[0]

  // Ensure subscription_state is never null (should have DEFAULT in database)
  // This is defensive coding in case migration hasn't run or manual DB changes
  const subscriptionState = subscription.subscription_state || 'unsubscribed'
  
  if (!subscription.subscription_state) {
    console.warn('⚠️ User has NULL subscription_state, using fallback:', {
      userId: subscription.id,
      email: subscription.email
    })
  }

  // Return subscription data even if no active Stripe subscription
  // This allows the frontend to handle all subscription states properly
  res.json({
    stripe_customer_id: subscription.stripe_customer_id,
    stripe_subscription_id: subscription.stripe_subscription_id,
    stripe_price_id: subscription.stripe_price_id,
    stripe_subscription_status: subscription.stripe_subscription_status, // Stripe status: 'active', 'canceled', 'past_due', etc.
    subscription_state: subscriptionState, // Internal state: 'subscribed', 'unsubscribed', 'unknown'
    subscription_current_period_start: subscription.subscription_current_period_start,
    subscription_current_period_end: subscription.subscription_current_period_end,
    subscription_cancel_at_period_end: subscription.subscription_cancel_at_period_end,
    subscription_canceled_at: subscription.subscription_canceled_at,
    last_state_check: subscription.last_state_check,
    state_change_reason: subscription.state_change_reason,
    created_at: subscription.created_at,
    updated_at: subscription.updated_at
  })
}))

// DELETE /api/users/account - Delete user account
router.delete('/account', asyncHandler(async (req, res) => {
  // This will cascade delete all related data due to foreign key constraints
  await query('DELETE FROM users WHERE id = $1', [req.user.id])

  res.json({ message: 'Account deleted successfully' })
}))

export default router