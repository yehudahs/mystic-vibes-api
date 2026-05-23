import express from 'express'
import Joi from 'joi'
import { asyncHandler } from '../middleware/errorHandler.js'
import { sendSupportEmail } from '../services/emailService.js'
import { VERSION_INFO } from './version.js'

const router = express.Router()

const supportSchema = Joi.object({
  type: Joi.string().valid('Feedback', 'Bug Report', 'Suggestion').required(),
  message: Joi.string().min(10).max(2000).required(),
  name: Joi.string().min(1).max(120).optional(),
  email: Joi.string().email().optional(),
  // Honeypot: legitimate users won't fill this; bots typically do
  website: Joi.string().allow('').optional(),
  // Frontend version metadata, sent automatically by the support form
  clientVersion: Joi.object({
    version: Joi.string().max(40).optional(),
    commit: Joi.string().max(40).optional(),
    environment: Joi.string().max(40).optional(),
    builtAt: Joi.string().max(40).optional(),
  }).optional(),
})

router.post('/', asyncHandler(async (req, res) => {
  const { error, value } = supportSchema.validate(req.body)
  if (error) {
    return res.status(400).json({ success: false, error: error.details[0].message })
  }

  if (value.website) {
    // Honeypot tripped — pretend success, drop the request
    return res.json({ success: true, message: 'Your message has been sent. Thank you!' })
  }

  const name = req.user?.name || value.name
  const email = req.user?.email || value.email

  if (!name || !email) {
    return res.status(400).json({
      success: false,
      error: 'Name and email are required when not signed in',
    })
  }

  await sendSupportEmail({
    name,
    email,
    type: value.type,
    message: value.message,
    clientVersion: value.clientVersion,
    serverVersion: VERSION_INFO,
  })

  res.json({ success: true, message: 'Your message has been sent. Thank you!' })
}))

export default router
