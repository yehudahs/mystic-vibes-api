import jwt from 'jsonwebtoken'
import crypto from 'crypto'
import { query } from '../config/database.js'

// Helper function to hash tokens
const hashToken = (token) => {
  return crypto.createHash('sha256').update(token).digest('hex')
}

// Authentication middleware
export const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization']
    const token = authHeader && authHeader.split(' ')[1] // Bearer TOKEN

    if (!token) {
      return res.status(401).json({ error: 'Access token required' })
    }

    // Verify JWT token - be more lenient with algorithms to handle different token types
    let decoded
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET || 'mystic-vibes-secret-key', { algorithms: ['HS256'] })
    } catch (algoError) {
      // If algorithm error, try without algorithm restriction for Google tokens
      try {
        decoded = jwt.verify(token, process.env.JWT_SECRET || 'mystic-vibes-secret-key')
      } catch (generalError) {
        // If still failing, check if it's a session token we stored directly
        decoded = jwt.decode(token)
        if (!decoded || typeof decoded === 'string') {
          throw new Error('Invalid token format')
        }
      }
    }
    
    // Check if session exists and is valid (using token hash for security)
    const tokenHash = hashToken(token)
    const sessionResult = await query(
      'SELECT s.*, u.* FROM user_sessions s JOIN users u ON s.user_id = u.id WHERE s.token_hash = $1 AND s.expires_at > NOW()',
      [tokenHash]
    )

    if (sessionResult.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid or expired session' })
    }

    // Update last used timestamp AND extend session expiration (sliding window)
    await query(
      'UPDATE user_sessions SET last_used_at = NOW(), expires_at = NOW() + INTERVAL \'7 days\' WHERE token_hash = $1',
      [tokenHash]
    )

    // Add user info to request
    req.user = {
      id: sessionResult.rows[0].user_id,
      email: sessionResult.rows[0].email,
      name: sessionResult.rows[0].name,
      avatar_url: sessionResult.rows[0].avatar_url,
      provider: sessionResult.rows[0].provider
    }

    next()
  } catch (error) {
    console.error('Authentication error:', error)
    return res.status(403).json({ error: 'Invalid token' })
  }
}

// Optional authentication middleware - doesn't fail if no token
export const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization']
    const token = authHeader && authHeader.split(' ')[1] // Bearer TOKEN

    if (!token) {
      // No token provided - continue as anonymous user
      req.user = null
      return next()
    }

    // Try to verify and get user info if token exists
    try {
      let decoded
      try {
        decoded = jwt.verify(token, process.env.JWT_SECRET || 'mystic-vibes-secret-key', { algorithms: ['HS256'] })
      } catch (algoError) {
        try {
          decoded = jwt.verify(token, process.env.JWT_SECRET || 'mystic-vibes-secret-key')
        } catch (generalError) {
          decoded = jwt.decode(token)
          if (!decoded || typeof decoded === 'string') {
            throw new Error('Invalid token format')
          }
        }
      }

      // Check if session exists and is valid (using token hash for security)
      const tokenHash = hashToken(token)
      const sessionResult = await query(
        'SELECT s.*, u.* FROM user_sessions s JOIN users u ON s.user_id = u.id WHERE s.token_hash = $1 AND s.expires_at > NOW()',
        [tokenHash]
      )

      if (sessionResult.rows.length > 0) {
        // Update last used timestamp
        await query(
          'UPDATE user_sessions SET last_used_at = NOW() WHERE token_hash = $1',
          [tokenHash]
        )

        // Add user info to request
        req.user = {
          id: sessionResult.rows[0].user_id,
          email: sessionResult.rows[0].email,
          name: sessionResult.rows[0].name,
          avatar_url: sessionResult.rows[0].avatar_url,
          provider: sessionResult.rows[0].provider
        }
      } else {
        // Invalid session - continue as anonymous
        req.user = null
      }
    } catch (error) {
      // Token verification failed - continue as anonymous
      req.user = null
    }

    next()
  } catch (error) {
    console.error('Optional authentication error:', error)
    req.user = null
    next()
  }
}

// Generate JWT token
export const generateToken = (user) => {
  return jwt.sign(
    { 
      userId: user.id, 
      email: user.email 
    },
    process.env.JWT_SECRET || 'mystic-vibes-secret-key',
    { expiresIn: '7d', algorithm: 'HS256' }
  )
}

// Create user session
export const createSession = async (userId, token, req) => {
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + 7) // 7 days

  // Hash the token before storing for security
  const tokenHash = hashToken(token)

  await query(
    `INSERT INTO user_sessions (user_id, token_hash, expires_at, ip_address, user_agent)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      userId,
      tokenHash,  // Store hash, not plain token
      expiresAt,
      req.ip || req.connection.remoteAddress,
      req.get('User-Agent') || 'Unknown'
    ]
  )
}

// Clean expired sessions
export const cleanExpiredSessions = async () => {
  const result = await query('DELETE FROM user_sessions WHERE expires_at < NOW()')
  console.log(`🧹 Cleaned ${result.rowCount} expired sessions`)
}