# Railway Deployment Guide - Backend API

This guide will help you deploy the Mystic Vibes API to Railway with staging and production environments.

## Prerequisites

1. Install Railway CLI:
   ```bash
   npm install -g @railway/cli
   ```

2. Login to Railway:
   ```bash
   railway login
   ```

## Initial Setup

### 1. Create Railway Project

```bash
railway init
# Select: Create new project
# Name: mystic-vibes-api
```

### 2. Create Postgres Database

```bash
railway add
# Select: PostgreSQL
```

Railway will automatically inject the `DATABASE_URL` environment variable.

### 3. Set Up Staging Environment

1. Create a new environment in Railway dashboard:
   - Go to your project settings
   - Click "Environments"
   - Create "staging" environment

2. Set environment variables from `.env.staging.example`:
   ```bash
   # Switch to staging environment
   railway environment staging

   # Set variables (use Railway dashboard or CLI)
   railway variables set NODE_ENV=staging
   railway variables set PORT=3001
   railway variables set JWT_SECRET=your-staging-jwt-secret
   railway variables set STRIPE_SECRET_KEY=sk_test_...
   railway variables set STRIPE_WEBHOOK_SECRET=whsec_...
   railway variables set AI_PROVIDER=ollama
   railway variables set OLLAMA_BASE_URL=https://your-ollama-staging.ngrok-free.dev
   railway variables set OLLAMA_MODEL=llama3.2:3b
   railway variables set FRONTEND_URL=https://your-staging-frontend.railway.app
   ```

3. Run database migrations:
   ```bash
   railway run npm run setup:db:staging
   ```

### 4. Set Up Production Environment

1. Create production environment in Railway dashboard

2. Set environment variables from `.env.production.example`:
   ```bash
   # Switch to production environment
   railway environment production

   # Set variables
   railway variables set NODE_ENV=production
   railway variables set PORT=3001
   railway variables set JWT_SECRET=your-production-jwt-secret-strong-random
   railway variables set STRIPE_SECRET_KEY=sk_live_...
   railway variables set STRIPE_WEBHOOK_SECRET=whsec_...
   railway variables set AI_PROVIDER=ollama
   railway variables set OLLAMA_BASE_URL=https://your-ollama-production.yourdomain.com
   railway variables set OLLAMA_MODEL=llama3.2:3b
   railway variables set FRONTEND_URL=https://your-production-frontend.railway.app
   ```

3. Run database migrations:
   ```bash
   railway run npm run setup:db:production
   ```

## Deployment

### Deploy to Staging

```bash
# Switch to staging environment
railway environment staging

# Deploy
railway up
```

### Deploy to Production

```bash
# Switch to production environment
railway environment production

# Deploy
railway up
```

## Configure Stripe Webhooks

After deployment, you need to configure Stripe webhooks:

### Staging Webhooks

1. Go to Stripe Dashboard (Test Mode)
2. Navigate to Developers → Webhooks
3. Click "Add endpoint"
4. Set URL to: `https://your-staging-api.railway.app/api/stripe/webhook`
5. Select events to listen to:
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
6. Copy the signing secret and update `STRIPE_WEBHOOK_SECRET` in Railway

### Production Webhooks

Repeat the same process but:
- Use Live Mode in Stripe Dashboard
- Set URL to: `https://your-production-api.railway.app/api/stripe/webhook`
- Update production `STRIPE_WEBHOOK_SECRET`

## Post-Deployment

### Verify Deployment

```bash
# Check staging
curl https://your-staging-api.railway.app/health

# Check production
curl https://your-production-api.railway.app/health
```

### View Logs

```bash
# Staging logs
railway environment staging
railway logs

# Production logs
railway environment production
railway logs
```

## Environment Variables Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `NODE_ENV` | Yes | Environment name (staging/production) |
| `PORT` | Yes | Server port (Railway sets automatically, usually 3001) |
| `DATABASE_URL` | Yes | Auto-injected by Railway Postgres |
| `JWT_SECRET` | Yes | Secret for JWT tokens |
| `JWT_EXPIRES_IN` | No | Token expiration (default: 7d) |
| `STRIPE_SECRET_KEY` | Yes | Stripe secret key (test/live) |
| `STRIPE_WEBHOOK_SECRET` | Yes | Stripe webhook signing secret |
| `AI_PROVIDER` | Yes | AI provider (ollama/openai) |
| `OLLAMA_BASE_URL` | If using Ollama | Ollama instance URL |
| `OLLAMA_MODEL` | If using Ollama | Model name |
| `OPENAI_API_KEY` | If using OpenAI | OpenAI API key |
| `FRONTEND_URL` | Yes | Frontend URL for CORS |

## Automatic Deployments

Railway automatically deploys when you push to GitHub:

- **Staging**: Deploys from `develop` branch
- **Production**: Deploys from `main` branch

Configure this in:
1. Railway Dashboard → Project Settings
2. GitHub App → Connect Repository
3. Set branch triggers per environment

## Troubleshooting

### Database Connection Issues

```bash
# Check DATABASE_URL is set
railway variables

# Test connection
railway run node -e "console.log(process.env.DATABASE_URL)"
```

### AI Service Issues

```bash
# Check Ollama connectivity
railway run curl $OLLAMA_BASE_URL/api/tags
```

### View Real-time Logs

```bash
railway logs --follow
```

## Useful Commands

```bash
# List all environments
railway environment

# Switch environment
railway environment <staging|production>

# View all variables
railway variables

# Delete variable
railway variables delete VARIABLE_NAME

# Open project in browser
railway open

# SSH into running service
railway shell
```
