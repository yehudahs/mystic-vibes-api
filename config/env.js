import path from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'
import Joi from 'joi'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

dotenv.config({ path: path.join(__dirname, '..', '.env') })
dotenv.config()

const schema = Joi.object({
  RESEND_API_KEY: Joi.string().pattern(/^re_/).required(),
  SUPPORT_EMAIL: Joi.string().email().required(),
  FRONTEND_URL: Joi.string().uri().required(),
  JWT_SECRET: Joi.string().min(32).required(),
  AI_SERVICES: Joi.string().uri().required(),
  AI_SERVICES_KEY: Joi.string().min(16).required(),
  // Required in production; without it, /api/auth/google returns 503.
  GOOGLE_CLIENT_ID: Joi.string().optional(),
}).unknown(true)

const { error, value } = schema.validate(process.env, { abortEarly: false })

if (error) {
  const details = error.details.map((d) => `  - ${d.message}`).join('\n')
  console.error(`\n❌ Invalid environment configuration:\n${details}\n`)
  process.exit(1)
}

export const config = {
  RESEND_API_KEY: value.RESEND_API_KEY,
  SUPPORT_EMAIL: value.SUPPORT_EMAIL,
  FRONTEND_URL: value.FRONTEND_URL,
  JWT_SECRET: value.JWT_SECRET,
  AI_SERVICES: value.AI_SERVICES,
  AI_SERVICES_KEY: value.AI_SERVICES_KEY,
  GOOGLE_CLIENT_ID: value.GOOGLE_CLIENT_ID,
}
