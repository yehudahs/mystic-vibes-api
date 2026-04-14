import express from 'express'
import Joi from 'joi'
import { asyncHandler } from '../middleware/errorHandler.js'
import { sendSupportEmail } from '../services/emailService.js'

const router = express.Router()

const supportSchema = Joi.object({
  type: Joi.string().valid('Feedback', 'Bug Report', 'Suggestion').required(),
  message: Joi.string().min(10).max(2000).required(),
})

router.post('/', asyncHandler(async (req, res) => {
  const { error, value } = supportSchema.validate(req.body)
  if (error) {
    return res.status(400).json({ success: false, error: error.details[0].message })
  }

  const name = req.user.name || 'Unknown'
  const email = req.user.email

  await sendSupportEmail({ name, email, type: value.type, message: value.message })

  res.json({ success: true, message: 'Your message has been sent. Thank you!' })
}))

export default router
