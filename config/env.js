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
}
