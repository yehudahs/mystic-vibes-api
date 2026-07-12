import express from 'express'
import axios from 'axios'
import Stripe from 'stripe'
import { writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { randomUUID } from 'crypto'
import { authenticateToken, optionalAuth } from '../middleware/auth.js'
import { query } from '../config/database.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

const router = express.Router()

const PRINTFUL_API = 'https://api.printful.com'
const headers = () => ({
  Authorization: `Bearer ${process.env.PRINTFUL_API_KEY}`,
  'Content-Type': 'application/json',
})
const backendUrl = (process.env.BACKEND_URL || 'http://localhost:3001').replace(/\/$/, '')

let stripe = null
const getStripe = () => {
  if (!stripe && process.env.STRIPE_SECRET_KEY) {
    stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' })
  }
  return stripe
}

// Curated product catalog with retail prices (USD cents)
// printArea: dimensions from GET /mockup-generator/printfiles/{id} (first printfile)
// position: where to place our square design within the print area (centered)
const PRODUCTS = [
  {
    id: 71,
    name: 'T-Shirt',
    emoji: '👕',
    description: 'Bella + Canvas Unisex Tee',
    placement: 'front',
    retailCents: 2999,
    image: 'https://files.cdn.printful.com/o/upload/product-catalog-img/20/2079a3ee4cc472ad952fe16654f274cd_l',
    popularColors: ['Black', 'White', 'Navy'],
    popularSizes: ['S', 'M', 'L', 'XL', '2XL'],
    printfulUrl: 'https://www.printful.com/custom/t-shirts',
    mockupPosition: { area_width: 1800, area_height: 2400, width: 1800, height: 1800, top: 300, left: 0 },
  },
  {
    id: 380,
    name: 'Hoodie',
    emoji: '🧥',
    description: 'Premium Pullover Hoodie',
    placement: 'front',
    retailCents: 5499,
    image: 'https://files.cdn.printful.com/o/upload/product-catalog-img/0e/0e62ae87da7d32dfb60d6dadc3744346_l',
    popularColors: ['Black', 'White', 'Navy'],
    popularSizes: ['S', 'M', 'L', 'XL', '2XL'],
    printfulUrl: 'https://www.printful.com/custom/hoodies',
    mockupPosition: { area_width: 1800, area_height: 2400, width: 1800, height: 1800, top: 300, left: 0 },
  },
]

// GET /api/printful/products
router.get('/products', (req, res) => {
  res.json({ success: true, products: PRODUCTS })
})

// GET /api/printful/variants/:productId
router.get('/variants/:productId', async (req, res) => {
  try {
    const { productId } = req.params
    const product = PRODUCTS.find(p => p.id === parseInt(productId))
    if (!product) return res.status(404).json({ error: 'Product not found' })

    const { data } = await axios.get(`${PRINTFUL_API}/products/${productId}`, { headers: headers() })
    const allVariants = data.result.variants

    // Filter to popular colors and sizes
    const filtered = allVariants.filter(v => {
      const name = v.name
      const hasColor = product.popularColors.length === 0 ||
        product.popularColors.some(c => name.includes(c))
      const hasSize = product.popularSizes.length === 0 ||
        product.popularSizes.some(s => name.includes(s))
      return hasColor && hasSize
    })

    const variants = filtered.map(v => ({
      id: v.id,
      name: v.name,
      price: v.price,
      color: v.color || extractColor(v.name),
      size: v.size || extractSize(v.name),
      colorCode: v.color_code,
      inStock: v.in_stock,
      image: v.preview_url || null,
    }))

    res.json({ success: true, variants })
  } catch (err) {
    console.error('Printful variants error:', err.message)
    res.status(500).json({ error: 'Failed to fetch variants' })
  }
})

function extractColor(name) {
  const parts = name.match(/\(([^/]+)/)
  return parts ? parts[1].trim() : ''
}

function extractSize(name) {
  const sizeMatch = name.match(/\/ ([^)]+)\)$/)
  if (sizeMatch) return sizeMatch[1].trim()
  const ozMatch = name.match(/(\d+ oz)/)
  if (ozMatch) return ozMatch[1]
  const sizeSimple = name.match(/(A\d|[\d"×]+|XS|S|M|L|XL|2XL|3XL)/)
  return sizeSimple ? sizeSimple[1] : name
}

// POST /api/printful/upload — save base64 PNG locally, upload to Printful via public URL
// In production (Railway), backend URL is public so Printful can download directly.
// In local dev, falls back to a temporary public file host (0x0.st) so Printful can reach the file.
router.post('/upload', optionalAuth, async (req, res) => {
  try {
    const { imageBase64, filename = 'mystic-reading.png' } = req.body
    if (!imageBase64) return res.status(400).json({ error: 'imageBase64 is required' })

    // Detect MIME type from data URL prefix; default to jpeg
    const mimeMatch = imageBase64.match(/^data:image\/(\w+);base64,/)
    const ext = mimeMatch?.[1] === 'png' ? 'png' : 'jpg'
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '')
    const buffer = Buffer.from(base64Data, 'base64')

    // Save to local temp directory
    const uuid = randomUUID()
    const tempDir = join(__dirname, '..', 'public', 'temp-designs')
    mkdirSync(tempDir, { recursive: true })
    writeFileSync(join(tempDir, `${uuid}.${ext}`), buffer)

    // Build the primary public URL (works in production)
    let publicUrl = `${backendUrl}/temp-designs/${uuid}.${ext}`

    // Helper: try uploading to Printful with a given URL
    const uploadToPrintful = async (url) => {
      const { data } = await axios.post(`${PRINTFUL_API}/files`, {
        url,
        filename,
        type: 'default',
        visible: false,
      }, {
        headers: {
          Authorization: `Bearer ${process.env.PRINTFUL_API_KEY}`,
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      })
      return data.result
    }

    let printfulResult = null

    // Fallback public file hosts tried in order when the backend URL isn't reachable (local dev).
    // Each host returns a direct-download URL that Printful can fetch.
    const mimeType = ext === 'jpg' ? 'image/jpeg' : 'image/png'
    const fallbackHosts = [
      {
        name: 'catbox.moe',
        upload: async () => {
          const form = new FormData()
          form.append('reqtype', 'fileupload')
          form.append('fileToUpload', new Blob([buffer], { type: mimeType }), filename)
          const res = await fetch('https://catbox.moe/user/api.php', {
            method: 'POST', body: form, signal: AbortSignal.timeout(30000),
          })
          const url = (await res.text()).trim()
          if (!url.startsWith('https://files.catbox.moe/')) throw new Error(`catbox.moe returned: "${url}"`)
          return url
        },
      },
      {
        name: '0x0.st',
        upload: async () => {
          const form = new FormData()
          form.append('file', new Blob([buffer], { type: mimeType }), filename)
          const res = await fetch('https://0x0.st', {
            method: 'POST', body: form, signal: AbortSignal.timeout(30000),
          })
          const url = (await res.text()).trim()
          if (!url.startsWith('https://0x0.st/')) throw new Error(`0x0.st returned: "${url}"`)
          return url
        },
      },
      {
        name: 'litterbox.catbox.moe',
        upload: async () => {
          const form = new FormData()
          form.append('reqtype', 'fileupload')
          form.append('time', '24h')
          form.append('fileToUpload', new Blob([buffer], { type: mimeType }), filename)
          const res = await fetch('https://litterbox.catbox.moe/resources/internals/api.php', {
            method: 'POST', body: form, signal: AbortSignal.timeout(30000),
          })
          const url = (await res.text()).trim()
          if (!url.startsWith('https://litter.catbox.moe/')) throw new Error(`litterbox returned: "${url}"`)
          return url
        },
      },
    ]

    // First attempt: use the backend's own public URL (works in production on Railway)
    try {
      printfulResult = await uploadToPrintful(publicUrl)
    } catch (firstErr) {
      const errMsg = String(firstErr.response?.data?.result || firstErr.message)
      console.warn(`[upload] Backend URL failed: ${errMsg}`)

      // Try each fallback host in order until one succeeds
      let uploaded = false
      for (const host of fallbackHosts) {
        try {
          console.log(`[upload] Trying fallback: ${host.name}...`)
          const hostUrl = await host.upload()
          publicUrl = hostUrl
          console.log(`[upload] ${host.name} success: ${hostUrl}`)
          printfulResult = await uploadToPrintful(publicUrl)
          uploaded = true
          break
        } catch (hostErr) {
          console.warn(`[upload] ${host.name} failed: ${hostErr.message}`)
        }
      }
      if (!uploaded) {
        throw new Error('All public fallback hosts failed — cannot upload design to Printful in local dev')
      }
    }

    res.json({
      success: true,
      fileId: String(printfulResult.id),
      fileUrl: publicUrl,  // use the public host URL (catbox/backend), not printful.url which is just the input URL
    })
  } catch (err) {
    console.error('Printful upload error:', err.response?.data || err.message)
    res.status(500).json({ error: 'Failed to upload design to Printful', detail: err.response?.data?.result || err.message })
  }
})

// POST /api/printful/mockup — generate mockup for product+variant+file
router.post('/mockup', optionalAuth, async (req, res) => {
  try {
    const { productId, variantIds, fileUrl } = req.body
    if (!productId || !variantIds || !fileUrl) {
      return res.status(400).json({ error: 'productId, variantIds, fileUrl are required' })
    }

    const product = PRODUCTS.find(p => p.id === productId)
    const placement = product?.placement || 'front'
    let position = product?.mockupPosition || null

    // For products without a fixed mockupPosition (e.g. mugs where 11oz vs 15oz have
    // different printfile heights), query Printful's printfiles API to get the exact
    // dimensions for the selected variant and construct a centered square position.
    if (!position && variantIds?.length > 0) {
      try {
        const { data: pfData } = await axios.get(
          `${PRINTFUL_API}/mockup-generator/printfiles/${productId}`,
          { headers: headers(), timeout: 10000 }
        )
        const pfResult = pfData.result
        const variantId = variantIds[0]
        const variantPf = pfResult.variant_printfiles?.find(vp => vp.variant_id === variantId)
        const pfId = variantPf?.placements?.[placement]
        const printfile = pfResult.printfiles?.find(p => p.printfile_id === pfId)

        if (printfile?.width && printfile?.height) {
          const aW = printfile.width
          const aH = printfile.height
          // Square design centered: size = area height (or half width, whichever is smaller)
          const side = Math.min(aH, Math.floor(aW / 2))
          position = {
            area_width: aW,
            area_height: aH,
            width: side,
            height: side,
            top: Math.floor((aH - side) / 2),
            left: Math.floor((aW - side) / 2),
          }
          console.log(`[mockup] dynamic position for product=${productId} variant=${variantId}:`, position)
        }
      } catch (pfErr) {
        console.warn('[mockup] printfile lookup failed, using auto-placement:', pfErr.message)
      }
    }

    // Use image_url — Printful files uploaded with type:'default' can't be referenced by id
    // in the mockup generator. fileUrl is already a public CDN URL (catbox.moe in dev,
    // or the Railway backend URL in production).
    const fileEntry = { placement, image_url: fileUrl }
    if (position) fileEntry.position = position

    console.log(`[mockup] product=${productId} variants=${variantIds} fileUrl=${fileUrl?.substring(0,60)}`)

    // Create mockup task — auto-retry once on Printful rate limit (429).
    // Printful throttles after ~2 rapid task creations; error message includes the wait time.
    let taskRes
    for (let attempt = 0; attempt <= 1; attempt++) {
      try {
        taskRes = await axios.post(
          `${PRINTFUL_API}/mockup-generator/create-task/${productId}`,
          { variant_ids: variantIds, files: [fileEntry], format: 'jpg' },
          { headers: headers() }
        )
        break
      } catch (createErr) {
        const detail = String(createErr.response?.data?.result || createErr.message)
        const waitMatch = detail.match(/after (\d+) seconds?/i)
        if (waitMatch && attempt === 0) {
          const waitMs = (parseInt(waitMatch[1]) + 3) * 1000
          console.log(`[mockup] rate limited — waiting ${waitMs / 1000}s before retry`)
          await new Promise(r => setTimeout(r, waitMs))
        } else {
          throw createErr
        }
      }
    }
    const taskKey = taskRes.data.result.task_key
    console.log(`[mockup] task created: ${taskKey}`)

    // Poll for result (max 60s)
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 3000))
      const pollRes = await axios.get(
        `${PRINTFUL_API}/mockup-generator/task?task_key=${taskKey}`,
        { headers: headers() }
      )
      const task = pollRes.data.result
      console.log(`[mockup] poll ${i + 1}: status=${task.status}`)
      if (task.status === 'completed') {
        const rawMockups = task.mockups || []

        // Download and re-host each mockup image so the URL never expires.
        // Printful's S3 tmp URLs expire in minutes; serving from our own /temp-designs
        // gives the frontend a stable URL that works in new tabs and for sharing.
        const tempDir = join(__dirname, '..', 'public', 'temp-designs')
        const stableMockups = await Promise.all(rawMockups.map(async m => {
          try {
            const imgResp = await fetch(m.mockup_url, { signal: AbortSignal.timeout(20000) })
            if (!imgResp.ok) throw new Error(`HTTP ${imgResp.status}`)
            const buffer = Buffer.from(await imgResp.arrayBuffer())
            const uuid = randomUUID()
            writeFileSync(join(tempDir, `${uuid}.jpg`), buffer)
            return {
              placement: m.placement,
              mockupUrl: `${backendUrl}/temp-designs/${uuid}.jpg`,
              extra: (m.extra || []).map(e => ({ title: e.title, url: e.url })),
            }
          } catch (dlErr) {
            console.warn('[mockup] image download failed, using S3 URL:', dlErr.message)
            return {
              placement: m.placement,
              mockupUrl: m.mockup_url,
              extra: (m.extra || []).map(e => ({ title: e.title, url: e.url })),
            }
          }
        }))

        return res.json({ success: true, mockups: stableMockups })
      }
      if (task.status === 'failed') {
        console.error('[mockup] task failed:', JSON.stringify(task))
        return res.status(500).json({ error: 'Mockup generation failed', detail: task.error || JSON.stringify(task) })
      }
    }
    res.status(504).json({ error: 'Mockup generation timed out' })
  } catch (err) {
    const detail = err.response?.data?.result || err.response?.data || err.message
    console.error('Printful mockup error:', detail)
    res.status(500).json({ error: 'Failed to generate mockup', detail: String(typeof detail === 'object' ? JSON.stringify(detail) : detail) })
  }
})

// POST /api/printful/checkout — create Stripe checkout session for print order
router.post('/checkout', optionalAuth, async (req, res) => {
  try {
    const { productId, variantId, fileId, fileUrl, tagline, successUrl, cancelUrl } = req.body
    if (!productId || !variantId || !fileId || !fileUrl) {
      return res.status(400).json({ error: 'productId, variantId, fileId, fileUrl are required' })
    }

    const product = PRODUCTS.find(p => p.id === productId)
    if (!product) return res.status(400).json({ error: 'Unknown product' })

    const s = getStripe()
    if (!s) return res.status(500).json({ error: 'Stripe not configured' })

    const session = await s.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            unit_amount: product.retailCents,
            product_data: {
              name: `Mystic Reading ${product.name}`,
              description: tagline || 'Your personal mystic reading',
              images: [product.image],
            },
          },
          quantity: 1,
        },
      ],
      shipping_address_collection: {
        allowed_countries: ['US', 'CA', 'GB', 'AU', 'DE', 'FR', 'ES', 'IT', 'NL', 'SE', 'NO', 'DK', 'FI', 'BE', 'AT', 'CH', 'PT', 'IE', 'NZ', 'IL'],
      },
      metadata: {
        type: 'print_order',
        product_id: String(productId),
        variant_id: String(variantId),
        file_id: String(fileId),
        file_url: fileUrl.substring(0, 490),
        tagline: (tagline || '').substring(0, 100),
      },
      success_url: successUrl || `${process.env.FRONTEND_URL}/print-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancelUrl || `${process.env.FRONTEND_URL}/pricing`,
    })

    // Save pending order to DB
    const userId = req.user?.id || null
    await query(
      `INSERT INTO print_orders
        (user_id, stripe_session_id, printful_file_id, printful_file_url, product_id, variant_id, tagline, retail_price_cents, currency, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'usd','pending_payment')
       ON CONFLICT (stripe_session_id) DO NOTHING`,
      [userId, session.id, fileId, fileUrl, productId, variantId, tagline || null, product.retailCents]
    )

    res.json({ success: true, checkoutUrl: session.url, sessionId: session.id })
  } catch (err) {
    console.error('Printful checkout error:', err.message)
    res.status(500).json({ error: 'Failed to create checkout session' })
  }
})

// POST /api/printful/confirm — called after Stripe payment success, creates Printful order
router.post('/confirm', optionalAuth, async (req, res) => {
  try {
    const { sessionId } = req.body
    if (!sessionId) return res.status(400).json({ error: 'sessionId is required' })

    // Get print order from DB
    const orderResult = await query(
      'SELECT * FROM print_orders WHERE stripe_session_id = $1',
      [sessionId]
    )
    if (orderResult.rows.length === 0) {
      return res.status(404).json({ error: 'Print order not found' })
    }
    const printOrder = orderResult.rows[0]

    // If already fulfilled, return existing order
    if (printOrder.printful_order_id) {
      return res.json({ success: true, printfulOrderId: printOrder.printful_order_id, alreadyFulfilled: true })
    }

    // Verify Stripe payment
    const s = getStripe()
    const session = await s.checkout.sessions.retrieve(sessionId, {
      expand: ['shipping_details'],
    })
    if (session.payment_status !== 'paid') {
      return res.status(402).json({ error: 'Payment not completed' })
    }

    const shipping = session.shipping_details
    if (!shipping?.address) {
      return res.status(400).json({ error: 'No shipping address in session' })
    }

    // Create Printful order
    const printfulOrder = {
      recipient: {
        name: shipping.name,
        address1: shipping.address.line1,
        address2: shipping.address.line2 || '',
        city: shipping.address.city,
        state_code: shipping.address.state || '',
        country_code: shipping.address.country,
        zip: shipping.address.postal_code,
        email: session.customer_details?.email || '',
      },
      items: [
        {
          variant_id: printOrder.variant_id,
          quantity: 1,
          files: [
            {
              type: 'front',
              // Use the Printful file ID — it was already uploaded, no URL expiry risk
              id: parseInt(printOrder.printful_file_id),
            },
          ],
        },
      ],
      retail_costs: {
        currency: 'USD',
        subtotal: (printOrder.retail_price_cents / 100).toFixed(2),
      },
    }

    const { data } = await axios.post(
      `${PRINTFUL_API}/orders`,
      printfulOrder,
      { headers: headers() }
    )

    const printfulOrderId = String(data.result.id)

    // Update DB
    await query(
      `UPDATE print_orders SET printful_order_id=$1, status='confirmed', updated_at=NOW() WHERE stripe_session_id=$2`,
      [printfulOrderId, sessionId]
    )

    // Confirm (submit) the order so Printful starts production
    await axios.post(
      `${PRINTFUL_API}/orders/${printfulOrderId}/confirm`,
      {},
      { headers: headers() }
    )

    res.json({
      success: true,
      printfulOrderId,
      estimatedDelivery: '5-10 business days',
    })
  } catch (err) {
    console.error('Printful confirm error:', err.response?.data || err.message)
    res.status(500).json({ error: 'Failed to create Printful order', detail: err.message })
  }
})

export default router
