// Side-effect imports — must run before anything else.
// instrument.js initializes Sentry; config/env.js loads .env + validates required vars.
import './instrument.js'
import './config/env.js'

import * as Sentry from '@sentry/node'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import morgan from 'morgan'
// Route handlers
import authRoutes from './routes/auth.js'
import userRoutes from './routes/users.js'
import readingRoutes from './routes/readings.js'
import unifiedReadingsRoutes from './routes/unified-readings.js'
import spreadRoutes from './routes/spreads.js'
import horoscopeRoutes from './routes/horoscopes.js'
import stripeRoutes from './routes/stripe.js'
import testingRoutes from './routes/testing.js'
import aiRoutes from './routes/ai.js'
import aiStatusRoutes from './routes/ai-status.js'
import supportRoutes from './routes/support.js'
import versionRoutes from './routes/version.js'
import galleryRoutes from './routes/gallery.js'
import printfulRoutes from './routes/printful.js'

// Import middleware
import { errorHandler } from './middleware/errorHandler.js'
import { authenticateToken, optionalAuth } from './middleware/auth.js'

// Import scheduled jobs
import { startAllScheduledJobs } from './services/scheduledJobs.js'

const app = express()
const PORT = process.env.PORT || 3001

// Trust the first proxy hop (Railway + Cloudflare) so req.ip and
// X-Forwarded-For are honored correctly. express-rate-limit refuses to start
// otherwise when XFF is present, and per-IP rate limits would key off the
// proxy's IP if this wasn't set. "1" = trust exactly one hop; safer than `true`.
app.set('trust proxy', 1)

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://accounts.google.com", "https://apis.google.com", "https://js.stripe.com"],
      connectSrc: ["'self'", "https://accounts.google.com", "https://api.stripe.com"],
      frameSrc: ["'self'", "https://accounts.google.com", "https://js.stripe.com"],
      imgSrc: ["'self'", "data:", "https:", "blob:"],
    },
  },
  crossOriginEmbedderPolicy: false,
}))

// CORS configuration
const allowedOrigins = [
  'http://localhost:3000',  // Default frontend port
  'http://localhost:3002',  // Alternative frontend port
  'http://localhost:3004',  // Alternative frontend port
  'http://localhost:5173',  // Vite default port
  'http://localhost:5174',  // Vite alternative port
  'http://localhost:8080',  // Alternative Vite port
  'http://localhost:8081',  // Alternative Vite port
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3002',
  'http://127.0.0.1:3004',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174',
  'http://127.0.0.1:8080',
  'http://127.0.0.1:8081',
  process.env.FRONTEND_URL,
  'https://mystic-vibes.com',
  'https://www.mystic-vibes.com',
  'https://staging.mystic-vibes.com',
  'https://mystic-vibes-ai-production.up.railway.app',
  'https://mystic-vibes-ai-staging.up.railway.app',
].filter(Boolean) // Remove any undefined values

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (non-browser clients: curl, server-to-server,
    // mobile apps). Browsers always send Origin, so this does not weaken
    // browser CSRF protection while still permitting legitimate non-browser use.
    if (!origin) return callback(null, true)

    if (allowedOrigins.indexOf(origin) !== -1) {
      return callback(null, true)
    }

    // NOTE: previously allowed any *.lovable.app — removed. lovable.app is a
    // public hosted-preview platform, so allowing it with credentials:true
    // turned any attacker-hosted lovable.app subdomain into a CSRF foothold.
    console.log(`❌ CORS blocked origin: ${origin}`)
    callback(new Error('Not allowed by CORS'))
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-requested-with'],
  optionsSuccessStatus: 200 // some legacy browsers (IE11, various SmartTVs) choke on 204
}))

// Global rate limit (loose — applies to all routes as a backstop)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'production' ? 100 : 1000,
  message: 'Too many requests from this IP, please try again later.'
})
app.use(limiter)

// Strict per-IP limiter for auth surfaces — credential-stuffing / brute-force / OAuth-replay defense
const authLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: process.env.NODE_ENV === 'production' ? 10 : 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many auth attempts, slow down and try again shortly.' }
})

// Stripe webhook needs raw body - must be before other body parsing
app.use('/api/stripe/webhook', express.raw({ type: 'application/json' }))
// Also handle webhook at /api/webhook for Stripe Dashboard compatibility
app.use('/api/webhook', express.raw({ type: 'application/json' }))

// Body parsing middleware
app.use(express.json({ limit: '20mb' }))
app.use(express.urlencoded({ extended: true, limit: '20mb' }))

// Logging
app.use(morgan('combined'))

// robots.txt — tells crawlers not to index the API domain
app.get('/robots.txt', (req, res) => {
  res.type('text/plain')
  res.send('User-agent: *\nDisallow: /\n')
})

// Health check endpoints (both /health and /api/health)
const healthResponse = (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  })
}

app.get('/health', healthResponse)
app.get('/api/health', healthResponse)


// API routes
app.use('/api/auth', authLimiter, authRoutes)
app.use('/api/users', authenticateToken, userRoutes)
app.use('/api/readings', authenticateToken, unifiedReadingsRoutes) // NEW: Unified readings endpoint
app.use('/api/readings', authenticateToken, readingRoutes) // Keep old tarot-specific endpoint for backward compatibility
app.use('/api/spreads', spreadRoutes)
app.use('/api/horoscopes', horoscopeRoutes)
app.use('/api/stripe', stripeRoutes)
app.use('/api/ai-status', aiStatusRoutes)
app.use('/api/support', optionalAuth, supportRoutes)
app.use('/api/version', versionRoutes)
app.use('/api/gallery', galleryRoutes)
app.use('/api/printful', printfulRoutes)  // public — no auth needed

// Direct webhook route for Stripe Dashboard compatibility - redirect to stripe webhook
app.post('/api/webhook', (req, res, next) => {
  // Forward the request to the stripe webhook handler
  req.url = '/webhook'
  stripeRoutes(req, res, next)
})
app.use('/api/testing', testingRoutes)
app.use('/api/ai', aiRoutes)

// 404 handler — API is standalone; frontend is a separate service
app.use('/api', (req, res) => {
  res.status(404).json({
    error: 'API route not found',
    path: req.originalUrl
  })
})

app.use((req, res) => {
  res.status(404).json({
    error: 'Not found — the Mystic Vibes app is at https://mystic-vibes.com',
    path: req.originalUrl
  })
})

// Sentry error handler (must be before other error middleware)
Sentry.setupExpressErrorHandler(app)

// Error handling middleware (must be last)
app.use(errorHandler)

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Vibely AI Server running on port ${PORT}`)
  console.log(`📊 Health check: http://localhost:${PORT}/health`)
  console.log(`🔗 API base URL: http://localhost:${PORT}/api`)

  // Start scheduled jobs for subscription sync
  startAllScheduledJobs()
})

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('👋 SIGTERM received')
  process.exit(0)
})

process.on('SIGINT', () => {
  console.log('👋 SIGINT received')
  process.exit(0)
})