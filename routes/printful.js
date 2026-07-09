import express from 'express'
import axios from 'axios'
import FormData from 'form-data'
import Stripe from 'stripe'
import { authenticateToken, optionalAuth } from '../middleware/auth.js'
import { query } from '../config/database.js'

const router = express.Router()

const PRINTFUL_API = 'https://api.printful.com'
const headers = () => ({
  Authorization: `Bearer ${process.env.PRINTFUL_API_KEY}`,
  'Content-Type': 'application/json',
})

let stripe = null
const getStripe = () => {
  if (!stripe && process.env.STRIPE_SECRET_KEY) {
    stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' })
  }
  return stripe
}

// Curated product catalog with retail prices (USD cents)
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
  },
  {
    id: 380,
    name: 'Hoodie',
    emoji: '🧥',
    description: 'Premium Pullover Hoodie',
    placement: 'front',
    retailCents: 5499,
    image: 'https://files.cdn.printful.com/o/upload/product-catalog-img/b3/b3dc1a7059e5e2fa025b02c3d8fd6765_l',
    popularColors: ['Black', 'White', 'Navy'],
    popularSizes: ['S', 'M', 'L', 'XL', '2XL'],
  },
  {
    id: 19,
    name: 'Mug',
    emoji: '☕',
    description: 'White Glossy Mug',
    placement: 'front',
    retailCents: 1899,
    image: 'https://files.cdn.printful.com/o/upload/product-catalog-img/d0/d09aa3e6c86d79b2bd2fb7af7b87f9d1_l',
    popularColors: ['White'],
    popularSizes: ['11 oz', '15 oz'],
  },
  {
    id: 300,
    name: 'Black Mug',
    emoji: '🖤',
    description: 'Black Glossy Mug',
    placement: 'front',
    retailCents: 1999,
    image: 'https://files.cdn.printful.com/o/upload/product-catalog-img/c1/c1be5a16dab1a8d5d5e4d42b95dcef81_l',
    popularColors: ['Black'],
    popularSizes: ['11 oz', '15 oz'],
  },
  {
    id: 1,
    name: 'Poster',
    emoji: '🖼️',
    description: 'Enhanced Matte Paper Poster',
    placement: 'front',
    retailCents: 2499,
    image: 'https://files.cdn.printful.com/o/upload/product-catalog-img/37/374cae8c6b92a14e61a75c2c4b77ee19_l',
    popularColors: ['White'],
    popularSizes: ['A4 (8.3×11.7")', 'A3 (11.7×16.5")', 'A2 (16.5×23.4")'],
  },
  {
    id: 3,
    name: 'Canvas Print',
    emoji: '🎨',
    description: 'Stretched Canvas',
    placement: 'front',
    retailCents: 4499,
    image: 'https://files.cdn.printful.com/o/upload/product-catalog-img/99/998d5b2f4dc81f39df044ff0dbf3498b_l',
    popularColors: ['White'],
    popularSizes: ['10×10"', '11×14"', '12×18"'],
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

// POST /api/printful/upload — upload base64 PNG design, return file info
router.post('/upload', optionalAuth, async (req, res) => {
  try {
    const { imageBase64, filename = 'mystic-reading.png' } = req.body
    if (!imageBase64) return res.status(400).json({ error: 'imageBase64 is required' })

    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '')
    const buffer = Buffer.from(base64Data, 'base64')

    const form = new FormData()
    form.append('file', buffer, { filename, contentType: 'image/png' })
    form.append('type', 'default')

    const { data } = await axios.post(`${PRINTFUL_API}/files`, form, {
      headers: {
        Authorization: `Bearer ${process.env.PRINTFUL_API_KEY}`,
        ...form.getHeaders(),
      },
      maxBodyLength: Infinity,
    })

    res.json({
      success: true,
      fileId: data.result.id,
      fileUrl: data.result.url,
    })
  } catch (err) {
    console.error('Printful upload error:', err.response?.data || err.message)
    res.status(500).json({ error: 'Failed to upload design to Printful' })
  }
})

// POST /api/printful/mockup — generate mockup for product+variant+file
router.post('/mockup', optionalAuth, async (req, res) => {
  try {
    const { productId, variantIds, fileUrl, placement = 'front' } = req.body
    if (!productId || !variantIds || !fileUrl) {
      return res.status(400).json({ error: 'productId, variantIds, fileUrl are required' })
    }

    // Create mockup task
    const taskRes = await axios.post(
      `${PRINTFUL_API}/mockup-generator/create-task/${productId}`,
      {
        variant_ids: variantIds,
        files: [{ placement, image_url: fileUrl }],
        format: 'jpg',
      },
      { headers: headers() }
    )
    const taskKey = taskRes.data.result.task_key

    // Poll for result (max 45s)
    for (let i = 0; i < 15; i++) {
      await new Promise(r => setTimeout(r, 3000))
      const pollRes = await axios.get(
        `${PRINTFUL_API}/mockup-generator/task?task_key=${taskKey}`,
        { headers: headers() }
      )
      const task = pollRes.data.result
      if (task.status === 'completed') {
        const mockups = task.mockups || []
        return res.json({
          success: true,
          mockups: mockups.map(m => ({
            placement: m.placement,
            mockupUrl: m.mockup_url,
            extra: (m.extra || []).map(e => ({ title: e.title, url: e.url })),
          })),
        })
      }
      if (task.status === 'failed') {
        return res.status(500).json({ error: 'Mockup generation failed' })
      }
    }
    res.status(504).json({ error: 'Mockup generation timed out' })
  } catch (err) {
    console.error('Printful mockup error:', err.response?.data || err.message)
    res.status(500).json({ error: 'Failed to generate mockup' })
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
              url: printOrder.printful_file_url,
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
