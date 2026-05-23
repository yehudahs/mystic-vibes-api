import express from 'express'
import { readFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const pkg = JSON.parse(readFileSync(path.join(__dirname, '..', 'package.json'), 'utf-8'))

// Captured once at boot — RAILWAY_GIT_COMMIT_SHA is set during build/deploy.
// Container start time is the best approximation for build time we have at runtime.
export const VERSION_INFO = Object.freeze({
  version: pkg.version,
  commit: (process.env.RAILWAY_GIT_COMMIT_SHA || 'dev').slice(0, 7),
  commitFull: process.env.RAILWAY_GIT_COMMIT_SHA || null,
  branch: process.env.RAILWAY_GIT_BRANCH || null,
  environment: process.env.RAILWAY_ENVIRONMENT_NAME || process.env.NODE_ENV || 'development',
  startedAt: new Date().toISOString(),
})

const router = express.Router()

router.get('/', (req, res) => res.json(VERSION_INFO))

export default router
