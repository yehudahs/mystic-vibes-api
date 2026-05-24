import jwt from 'jsonwebtoken'
import crypto from 'crypto'
import { query } from '../config/database.js'

const JWT_SECRET = process.env.JWT_SECRET
if (!JWT_SECRET || JWT_SECRET.length < 32) {
  throw new Error('JWT_SECRET environment variable is required and must be at least 32 characters')
}

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex')

const verifyToken = (token) => {
  // Strict: only HS256, no decode fallback. Signature must be valid.
  return jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] })
}

export const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization']
    const token = authHeader && authHeader.split(' ')[1]

    if (!token) {
      return res.status(401).json({ error: 'Access token required' })
    }

    try {
      verifyToken(token)
    } catch (_e) {
      return res.status(401).json({ error: 'Invalid token' })
    }

    const tokenHash = hashToken(token)
    const sessionResult = await query(
      'SELECT s.*, u.* FROM user_sessions s JOIN users u ON s.user_id = u.id WHERE s.token_hash = $1 AND s.expires_at > NOW()',
      [tokenHash]
    )

    if (sessionResult.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid or expired session' })
    }

    await query(
      'UPDATE user_sessions SET last_used_at = NOW(), expires_at = NOW() + INTERVAL \'7 days\' WHERE token_hash = $1',
      [tokenHash]
    )

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

export const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization']
    const token = authHeader && authHeader.split(' ')[1]

    if (!token) {
      req.user = null
      return next()
    }

    try {
      verifyToken(token)
    } catch (_e) {
      req.user = null
      return next()
    }

    const tokenHash = hashToken(token)
    const sessionResult = await query(
      'SELECT s.*, u.* FROM user_sessions s JOIN users u ON s.user_id = u.id WHERE s.token_hash = $1 AND s.expires_at > NOW()',
      [tokenHash]
    )

    if (sessionResult.rows.length > 0) {
      await query(
        'UPDATE user_sessions SET last_used_at = NOW() WHERE token_hash = $1',
        [tokenHash]
      )

      req.user = {
        id: sessionResult.rows[0].user_id,
        email: sessionResult.rows[0].email,
        name: sessionResult.rows[0].name,
        avatar_url: sessionResult.rows[0].avatar_url,
        provider: sessionResult.rows[0].provider
      }
    } else {
      req.user = null
    }

    next()
  } catch (error) {
    console.error('Optional authentication error:', error)
    req.user = null
    next()
  }
}

export const generateToken = (user) => {
  return jwt.sign(
    { userId: user.id, email: user.email },
    JWT_SECRET,
    { expiresIn: '7d', algorithm: 'HS256' }
  )
}

export const createSession = async (userId, token, req) => {
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + 7)

  const tokenHash = hashToken(token)

  await query(
    `INSERT INTO user_sessions (user_id, token_hash, expires_at, ip_address, user_agent)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      userId,
      tokenHash,
      expiresAt,
      req.ip || req.connection.remoteAddress,
      req.get('User-Agent') || 'Unknown'
    ]
  )
}

export const cleanExpiredSessions = async () => {
  const result = await query('DELETE FROM user_sessions WHERE expires_at < NOW()')
  console.log(`🧹 Cleaned ${result.rowCount} expired sessions`)
}
