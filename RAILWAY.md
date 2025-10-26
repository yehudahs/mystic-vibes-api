# Railway Deployment Guide

This document provides instructions for deploying the Vibely AI backend to Railway and connecting it to the local AI services.

## Architecture Overview

The production setup consists of:

1. **Railway Backend** (mystic-vibes-api) - Deployed on Railway
2. **Local AI Services** - Running on your development machine
   - Unified AI Service (port 11435)
   - Palm Reading Pipeline (port 5001)
   - Ollama LLM (port 11434)

The Railway backend connects to your local AI services via your public IP address.

## Required Environment Variables for Railway

Add these environment variables to your Railway backend service:

### Core Configuration

```bash
# Server
PORT=3001
NODE_ENV=production

# Database (use Railway's PostgreSQL service)
DB_HOST=<railway-postgres-host>
DB_PORT=5432
DB_NAME=railway
DB_USER=postgres
DB_PASSWORD=<railway-postgres-password>

# JWT Authentication
JWT_SECRET=<generate-a-secure-secret>
JWT_EXPIRES_IN=7d

# Stripe (use production keys for Railway)
STRIPE_SECRET_KEY=<your-stripe-secret-key>
STRIPE_WEBHOOK_SECRET=<your-stripe-webhook-secret>
STRIPE_PRICE_ID_MONTHLY=<your-stripe-price-id>

# AI Configuration - CRITICAL
AI_PROVIDER=ollama

# Unified AI Services - Single endpoint for ALL AI requests
# This is the ONLY AI-related variable you need to set
# It points to your local machine's public IP on port 11435
AI_SERVICES=http://YOUR_PUBLIC_IP:11435

# Example:
# AI_SERVICES=http://69.159.76.20:11435

OLLAMA_MODEL=llama3.2:3b

# Frontend URL (use your Railway frontend URL)
FRONTEND_URL=https://<your-frontend>.railway.app
```

### Critical: AI_SERVICES Variable

The `AI_SERVICES` variable is the **single gateway** for all AI requests:

- ✅ **Tarot readings** → Routed internally to Ollama (via `/api/generate`)
- ✅ **Horoscope readings** → Routed internally to Ollama (via `/api/generate`)
- ✅ **Palm readings** → Routed internally to Python pipeline (via `/palm/analyze`)

**You only need to set ONE variable**, and the unified AI service handles all routing automatically.

## Local Machine Setup

### 1. Ensure Services are Running

```bash
# Start Ollama
ollama serve

# Start unified AI service
cd /Users/yehudahs/work/private/AI-service
npm run dev

# Start palm pipeline (in separate terminal)
cd /Users/yehudahs/work/private/AI-service
./start-palm-service.sh
```

### 2. Configure Port Forwarding

You need to forward port 11435 on your router to your local machine:

1. Access your router's admin panel (usually http://192.168.1.1)
2. Navigate to Port Forwarding settings
3. Create a new port forwarding rule:
   - **External Port**: 11435
   - **Internal Port**: 11435
   - **Internal IP**: Your machine's local IP (e.g., 192.168.1.100)
   - **Protocol**: TCP

### 3. Find Your Public IP

```bash
curl ifconfig.me
# Or visit: https://whatismyipaddress.com/
```

Use this IP address for the `AI_SERVICES` variable in Railway.

### 4. Verify External Access

From an external network (or using a mobile hotspot):

```bash
# Test health check
curl http://YOUR_PUBLIC_IP:11435/health

# Should return:
# {"status":"ok","proxy":"ollama-monitoring-proxy",...}
```

If this fails, check:
- Port forwarding is correctly configured
- Computer is not sleeping (disable sleep mode)
- Firewall allows port 11435
- ISP doesn't block incoming connections on this port

## Testing Railway Connection

### Option 1: Railway CLI

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login and link project
railway login
railway link

# Set the AI_SERVICES variable
railway variables set AI_SERVICES=http://YOUR_PUBLIC_IP:11435

# Deploy
railway up
```

### Option 2: Railway Dashboard

1. Go to your Railway project
2. Navigate to your backend service
3. Click on "Variables" tab
4. Add `AI_SERVICES` with value `http://YOUR_PUBLIC_IP:11435`
5. Trigger a redeployment

### Verify Connection

Watch your local AI service logs for incoming requests:

```bash
# In AI-service directory
tail -f ai-service.log

# You should see Railway's IP making requests when users interact with the app
```

## Troubleshooting

### Railway Can't Connect to AI Services

**Symptoms:**
- Palm readings timeout (500 errors)
- Railway logs show connection errors

**Solutions:**

1. **Check port forwarding:**
   ```bash
   # From external network
   curl http://YOUR_PUBLIC_IP:11435/health
   ```

2. **Check AI services are running:**
   ```bash
   # From local machine
   curl http://localhost:11435/health
   curl http://localhost:5001/health
   curl http://localhost:11434/api/version
   ```

3. **Check Railway environment variable:**
   - Verify `AI_SERVICES` is set correctly in Railway
   - Make sure it uses `http://` not `https://`
   - Confirm public IP matches your current IP

4. **Check firewall:**
   ```bash
   # macOS - Allow incoming on port 11435
   sudo /usr/libexec/ApplicationFirewall/socketfilterfw --add /path/to/node
   ```

5. **Check computer power settings:**
   - Disable sleep mode
   - Keep computer running 24/7 or use wake-on-LAN

### Palm Readings Work Locally but Not on Railway

1. **Different IP configuration:**
   - Local: Uses `AI_SERVICES=http://localhost:11435`
   - Railway: Uses `AI_SERVICES=http://YOUR_PUBLIC_IP:11435`

2. **Verify local .env:**
   ```bash
   # In mystic-vibes-api/.env (local)
   AI_SERVICES=http://localhost:11435
   ```

3. **Verify Railway variables:**
   ```bash
   # In Railway dashboard
   AI_SERVICES=http://69.159.76.20:11435  # Your public IP
   ```

### High Latency

Palm readings from Railway will be slower than local due to:
- Network latency (request → your home)
- Image upload size (~100KB-500KB)
- Processing time (8-10 seconds)
- Response download (6-7MB with images)

Typical times:
- Local: 8-10 seconds
- Railway: 12-20 seconds (depending on your internet)

## Monitoring

### Dashboard

Access the monitoring dashboard at:
```
http://YOUR_PUBLIC_IP:11435/dashboard
```

This shows:
- Real-time request logs
- Response times
- Request/response bodies (including Railway requests)

### Health Checks

```bash
# Unified service
curl http://YOUR_PUBLIC_IP:11435/health

# Palm pipeline
curl http://YOUR_PUBLIC_IP:11435/palm/health

# Ollama
curl http://YOUR_PUBLIC_IP:11435/api/version
```

## Security Considerations

### Current Setup (Development)

⚠️ **WARNING**: The current setup exposes your AI services publicly without authentication.

**Risks:**
- Anyone with your public IP can use your AI services
- Unlimited usage could consume resources
- LLM responses are not rate-limited

### Recommendations for Production

1. **API Key Authentication:**
   - Add API key verification to unified service
   - Share secret key between Railway backend and local service

2. **IP Whitelisting:**
   - Configure firewall to only allow Railway's IP ranges
   - Get Railway's IP ranges from their docs

3. **Rate Limiting:**
   - Add rate limiting to unified service
   - Prevent abuse and resource exhaustion

4. **HTTPS/VPN:**
   - Set up HTTPS with Let's Encrypt
   - Or use Cloudflare Tunnel for secure connection
   - Or use Tailscale/WireGuard VPN

## Alternative Deployment Options

If exposing your local machine is not ideal:

### Option 1: Deploy AI Services to Cloud

1. **Railway ML Service:**
   - Deploy Ollama to Railway (if they support GPU)
   - Deploy palm pipeline as separate service

2. **GPU Cloud Providers:**
   - RunPod, Vast.ai, Lambda Labs
   - Deploy Ollama + palm pipeline
   - Update `AI_SERVICES` to cloud URL

### Option 2: Use Cloud AI APIs

1. **OpenAI GPT-4 Vision:**
   - Replace palm pipeline with GPT-4 Vision API
   - Update palm reading to use OpenAI

2. **Replicate:**
   - Use their Llama 3.2 Vision API
   - Pay per request instead of hosting

## Summary

**For Railway to work, you need:**

1. ✅ Local AI services running (unified service, palm pipeline, Ollama)
2. ✅ Port 11435 forwarded on router
3. ✅ Public IP address (from `curl ifconfig.me`)
4. ✅ One Railway environment variable:
   ```
   AI_SERVICES=http://YOUR_PUBLIC_IP:11435
   ```

**That's it!** The unified AI service handles all routing automatically.

## Quick Verification Script

Run this before deploying to Railway:

```bash
cd /Users/yehudahs/work/private/AI-service
./verify-railway-ready.sh
```

This checks:
- All services are running
- Health checks pass
- Displays the exact variable to add to Railway
