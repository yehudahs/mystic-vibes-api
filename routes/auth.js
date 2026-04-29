import express from 'express'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import jwt from 'jsonwebtoken'
import Joi from 'joi'
import { query } from '../config/database.js'
import { generateToken, createSession } from '../middleware/auth.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import { sendVerificationEmail } from '../services/emailService.js'

const router = express.Router()

// Helper function to hash tokens (same as in auth middleware)
const hashToken = (token) => {
  return crypto.createHash('sha256').update(token).digest('hex')
}

// Validation schemas
const registerSchema = Joi.object({
  name: Joi.string().min(2).max(50).required(),
  email: Joi.string().email().required(),
  password: Joi.string()
    .min(8)
    .max(128)
    .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#^()_+=\-[\]{}|\\:;"'<>,.~`])[A-Za-z\d@$!%*?&#^()_+=\-[\]{}|\\:;"'<>,.~`]+$/)
    .required()
    .messages({
      'string.min': 'Password must be at least 8 characters long',
      'string.max': 'Password must not exceed 128 characters',
      'string.pattern.base': 'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character',
      'any.required': 'Password is required'
    })
})

const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required()
})

const googleAuthSchema = Joi.object({
  token: Joi.string().required(),
  userInfo: Joi.object({
    sub: Joi.string().required(),
    name: Joi.string().required(),
    email: Joi.string().email().required(),
    picture: Joi.string().uri().optional()
  }).required()
})

// POST /api/auth/register - User registration
router.post('/register', asyncHandler(async (req, res) => {
  const { error, value } = registerSchema.validate(req.body)
  if (error) {
    return res.status(400).json({ error: error.details[0].message })
  }

  const { name, email, password } = value

  // Check if user already exists
  const existingUser = await query('SELECT id FROM users WHERE email = $1', [email])
  if (existingUser.rows.length > 0) {
    return res.status(409).json({ error: 'User already exists with this email' })
  }

  // Hash password
  const saltRounds = 12
  const hashedPassword = await bcrypt.hash(password, saltRounds)

  // Generate email verification token
  const verificationToken = crypto.randomBytes(32).toString('hex')
  const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours

  // Create user
  const userResult = await query(
    `INSERT INTO users (name, email, password_hash, provider, provider_id, email_verified, verification_token, verification_token_expires_at)
     VALUES ($1, $2, $3, 'email', $4, false, $5, $6)
     RETURNING id, name, email, avatar_url, provider, created_at`,
    [name, email, hashedPassword, email, verificationToken, verificationExpires]
  )

  const user = userResult.rows[0]

  // Send verification email (non-blocking — don't fail registration if email fails)
  sendVerificationEmail({ name: user.name, email: user.email, token: verificationToken })
    .catch(err => console.error('[auth] failed to send verification email:', err))

  res.status(201).json({
    message: 'Account created. Please check your email to verify your address.',
    emailVerificationRequired: true,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      avatar: user.avatar_url,
      provider: user.provider,
      createdAt: user.created_at
    }
  })
}))

// POST /api/auth/login - User login
router.post('/login', asyncHandler(async (req, res) => {
  const { error, value } = loginSchema.validate(req.body)
  if (error) {
    return res.status(400).json({ error: error.details[0].message })
  }

  const { email, password } = value

  // Find user
  const userResult = await query(
    'SELECT * FROM users WHERE email = $1 AND provider = $2',
    [email, 'email']
  )

  if (userResult.rows.length === 0) {
    return res.status(401).json({ error: 'Invalid email or password' })
  }

  const user = userResult.rows[0]

  // Verify password
  const isValidPassword = await bcrypt.compare(password, user.password_hash)
  if (!isValidPassword) {
    return res.status(401).json({ error: 'Invalid email or password' })
  }

  // Block unverified email accounts
  if (!user.email_verified) {
    return res.status(403).json({
      error: 'Please verify your email before logging in. Check your inbox for the verification link.',
      emailVerificationRequired: true
    })
  }

  // Update last login
  await query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id])

  // Generate token and create session
  const token = generateToken(user)
  await createSession(user.id, token, req)

  res.json({
    message: 'Login successful',
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      avatar: user.avatar_url,
      birthday: user.birthday,
      provider: user.provider,
      createdAt: user.created_at
    },
    token
  })
}))

// POST /api/auth/google - Google OAuth login
router.post('/google', asyncHandler(async (req, res) => {
  const { error, value } = googleAuthSchema.validate(req.body)
  if (error) {
    return res.status(400).json({ error: error.details[0].message })
  }

  const { token, userInfo } = value

  // Check if user exists by Google provider_id or email
  let userResult = await query(
    'SELECT * FROM users WHERE provider_id = $1 AND provider = $2',
    [userInfo.sub, 'google']
  )

  // Fallback: match by email (handles users who previously registered with email)
  if (userResult.rows.length === 0) {
    userResult = await query('SELECT * FROM users WHERE email = $1', [userInfo.email])
    if (userResult.rows.length > 0) {
      // Link existing account to Google
      await query(
        `UPDATE users SET provider = 'google', provider_id = $1, avatar_url = $2, last_login_at = NOW(), updated_at = NOW() WHERE id = $3`,
        [userInfo.sub, userInfo.picture, userResult.rows[0].id]
      )
      userResult = await query('SELECT * FROM users WHERE id = $1', [userResult.rows[0].id])
    }
  }

  let user

  if (userResult.rows.length === 0) {
    // Create new Google user
    userResult = await query(
      `INSERT INTO users (name, email, avatar_url, provider, provider_id, last_login_at)
       VALUES ($1, $2, $3, 'google', $4, NOW())
       RETURNING *`,
      [userInfo.name, userInfo.email, userInfo.picture, userInfo.sub]
    )
    user = userResult.rows[0]
  } else {
    // Update existing user info
    user = userResult.rows[0]
    await query(
      `UPDATE users 
       SET name = $1, email = $2, avatar_url = $3, last_login_at = NOW(), updated_at = NOW()
       WHERE id = $4`,
      [userInfo.name, userInfo.email, userInfo.picture, user.id]
    )
    
    // Fetch updated user
    const updatedResult = await query('SELECT * FROM users WHERE id = $1', [user.id])
    user = updatedResult.rows[0]
  }

  // Generate our own session token (not the Google token)
  const sessionToken = generateToken(user)
  await createSession(user.id, sessionToken, req)

  res.json({
    message: 'Google login successful',
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      avatar: user.avatar_url,
      birthday: user.birthday,
      provider: user.provider,
      createdAt: user.created_at
    },
    token: sessionToken
  })
}))

// GET /api/auth/verify-email?token=... — verify email address
router.get('/verify-email', asyncHandler(async (req, res) => {
  const { token } = req.query
  if (!token) return res.status(400).json({ error: 'Token is required' })

  const result = await query(
    `UPDATE users
     SET email_verified = true, verification_token = NULL, verification_token_expires_at = NULL
     WHERE verification_token = $1 AND verification_token_expires_at > NOW() AND email_verified = false
     RETURNING id, name, email, avatar_url, provider, created_at`,
    [token]
  )

  if (result.rows.length === 0) {
    return res.status(400).json({ error: 'Invalid or expired verification link.' })
  }

  const user = result.rows[0]
  const sessionToken = generateToken(user)
  await createSession(user.id, sessionToken, req)

  res.json({
    message: 'Email verified successfully.',
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      avatar: user.avatar_url,
      provider: user.provider,
      createdAt: user.created_at
    },
    token: sessionToken
  })
}))

// POST /api/auth/logout - User logout
router.post('/logout', asyncHandler(async (req, res) => {
  const authHeader = req.headers['authorization']
  const token = authHeader && authHeader.split(' ')[1]

  if (token) {
    // Hash the token before querying (tokens are stored hashed for security)
    const tokenHash = hashToken(token)
    // Remove session
    await query('DELETE FROM user_sessions WHERE token_hash = $1', [tokenHash])
  }

  res.json({ message: 'Logout successful' })
}))

// GET /api/auth/me - Get current user info
router.get('/me', asyncHandler(async (req, res) => {
  const authHeader = req.headers['authorization']
  const token = authHeader && authHeader.split(' ')[1]

  if (!token) {
    return res.status(401).json({ error: 'No token provided' })
  }

  // Hash the token before querying (tokens are stored hashed for security)
  const tokenHash = hashToken(token)

  // Get user from session
  const sessionResult = await query(
    `SELECT s.*, u.* FROM user_sessions s
     JOIN users u ON s.user_id = u.id
     WHERE s.token_hash = $1 AND s.expires_at > NOW()`,
    [tokenHash]
  )

  if (sessionResult.rows.length === 0) {
    return res.status(401).json({ error: 'Invalid or expired session' })
  }

  const user = sessionResult.rows[0]

  res.json({
    user: {
      id: user.user_id,
      name: user.name,
      email: user.email,
      avatar: user.avatar_url,
      provider: user.provider,
      createdAt: user.created_at
    }
  })
}))

// POST /api/auth/refresh-token - Refresh an expired or expiring token
router.post('/refresh-token', asyncHandler(async (req, res) => {
  const authHeader = req.headers['authorization']
  const oldToken = authHeader && authHeader.split(' ')[1]

  if (!oldToken) {
    return res.status(401).json({ error: 'No token provided' })
  }

  try {
    // Try to decode the token (even if expired)
    // Don't verify signature yet - just extract the payload
    const decoded = jwt.decode(oldToken)
    
    if (!decoded || typeof decoded === 'string' || !decoded.userId) {
      return res.status(401).json({ error: 'Invalid token format' })
    }

    // Verify the user still exists and is active
    const userResult = await query(
      'SELECT * FROM users WHERE id = $1',
      [decoded.userId]
    )

    if (userResult.rows.length === 0) {
      return res.status(401).json({ error: 'User not found' })
    }

    const user = userResult.rows[0]

    // Check if the old session exists (even if expired)
    // This prevents refresh attacks with stolen tokens that were never valid
    const oldTokenHash = hashToken(oldToken)
    const oldSessionResult = await query(
      'SELECT * FROM user_sessions WHERE token_hash = $1',
      [oldTokenHash]
    )

    if (oldSessionResult.rows.length === 0) {
      return res.status(401).json({ error: 'Session not found - please login again' })
    }

    const oldSession = oldSessionResult.rows[0]

    // Check if session expired within the last 7 days (grace period)
    // This prevents indefinite refresh after long inactivity
    const gracePeriod = 7 * 24 * 60 * 60 * 1000 // 7 days in milliseconds
    const sessionExpiredAt = new Date(oldSession.expires_at)
    const now = new Date()
    const timeSinceExpiry = now - sessionExpiredAt

    if (timeSinceExpiry > gracePeriod) {
      // Session expired too long ago - force re-login
      await query('DELETE FROM user_sessions WHERE token_hash = $1', [oldTokenHash])
      return res.status(401).json({ 
        error: 'Session expired too long ago - please login again',
        requiresLogin: true 
      })
    }

    // Generate new token and session
    const newToken = generateToken(user)
    await createSession(user.id, newToken, req)

    // Delete the old session
    await query('DELETE FROM user_sessions WHERE token_hash = $1', [oldTokenHash])

    console.log(`🔄 Token refreshed for user ${user.email}`)

    res.json({
      message: 'Token refreshed successfully',
      token: newToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        avatar: user.avatar_url,
        provider: user.provider
      }
    })
  } catch (error) {
    console.error('Token refresh error:', error)
    return res.status(401).json({ 
      error: 'Failed to refresh token',
      requiresLogin: true 
    })
  }
}))

export default router