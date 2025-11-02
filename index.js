import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import dotenv from 'dotenv'
import rateLimit from 'express-rate-limit'
import morgan from 'morgan'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Load environment variables from server/.env and root .env FIRST
dotenv.config({ path: path.join(__dirname, '.env') }) // Load server-specific .env
dotenv.config() // Load root .env as fallback

// Import routes AFTER environment variables are loaded
import authRoutes from './routes/auth.js'
import userRoutes from './routes/users.js'
import readingRoutes from './routes/readings.js'
import spreadRoutes from './routes/spreads.js'
import horoscopeRoutes from './routes/horoscopes.js'
import stripeRoutes from './routes/stripe.js'
import testingRoutes from './routes/testing.js'
import aiRoutes from './routes/ai.js'
import aiStatusRoutes from './routes/ai-status.js'

// Import middleware
import { errorHandler } from './middleware/errorHandler.js'
import { authenticateToken } from './middleware/auth.js'

// Import scheduled jobs
import { startAllScheduledJobs } from './services/scheduledJobs.js'

const app = express()
const PORT = process.env.PORT || 3001

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://accounts.google.com", "https://apis.google.com", "https://js.stripe.com"],
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
  process.env.FRONTEND_URL
].filter(Boolean) // Remove any undefined values

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true)

    // Check if origin is in allowed list
    if (allowedOrigins.indexOf(origin) !== -1) {
      return callback(null, true)
    }

    // Allow Lovable.app preview URLs (for Railway deployments)
    if (origin && origin.includes('.lovable.app')) {
      console.log(`✅ Allowing Lovable preview: ${origin}`)
      return callback(null, true)
    }

    // Block everything else
    console.log(`❌ CORS blocked origin: ${origin}`)
    console.log(`✅ Allowed origins:`, allowedOrigins)
    callback(new Error('Not allowed by CORS'))
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-requested-with'],
  optionsSuccessStatus: 200 // some legacy browsers (IE11, various SmartTVs) choke on 204
}))

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'production' ? 100 : 1000, // Higher limit for development
  message: 'Too many requests from this IP, please try again later.'
})
app.use(limiter)

// Stripe webhook needs raw body - must be before other body parsing
app.use('/api/stripe/webhook', express.raw({ type: 'application/json' }))
// Also handle webhook at /api/webhook for Stripe Dashboard compatibility
app.use('/api/webhook', express.raw({ type: 'application/json' }))

// Body parsing middleware
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

// Logging
app.use(morgan('combined'))

// Serve static files in production/staging
if (process.env.NODE_ENV !== 'development') {
  app.use(express.static(path.join(__dirname, '../dist')))
}

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
app.use('/api/auth', authRoutes)
app.use('/api/users', authenticateToken, userRoutes)
app.use('/api/readings', authenticateToken, readingRoutes)
app.use('/api/spreads', spreadRoutes)
app.use('/api/horoscopes', horoscopeRoutes)
app.use('/api/stripe', stripeRoutes)
app.use('/api/ai-status', aiStatusRoutes)

// Direct webhook route for Stripe Dashboard compatibility - redirect to stripe webhook
app.post('/api/webhook', (req, res, next) => {
  // Forward the request to the stripe webhook handler
  req.url = '/webhook'
  stripeRoutes(req, res, next)
})
app.use('/api/testing', testingRoutes)
app.use('/api/ai', aiRoutes)

// Serve React app for all non-API routes in production/staging
if (process.env.NODE_ENV !== 'development') {
  // Serve React app for routes that are not API or static files
  app.get(/^(?!\/api).*/, (req, res, next) => {
    // If it's a request for a file extension, let it 404
    if (req.url.includes('.') && !req.url.endsWith('/')) {
      return next()
    }
    res.sendFile(path.join(__dirname, '../dist/index.html'))
  })
  
  // 404 handler for API routes
  app.use('/api', (req, res) => {
    res.status(404).json({ 
      error: 'API route not found',
      path: req.originalUrl 
    })
  })
} else {
  // 404 handler for development
  app.use((req, res) => {
    res.status(404).json({ 
      error: 'Route not found',
      path: req.originalUrl 
    })
  })
}

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