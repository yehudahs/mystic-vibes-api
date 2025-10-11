# Mystic Vibes API

Backend API for Mystic Vibes - A spiritual self-discovery platform powered by AI.

## Features

- **Authentication**: JWT-based auth with Google OAuth support
- **Tarot Readings**: AI-powered tarot card interpretations
- **Horoscopes**: Personalized daily horoscope readings  
- **Numerology**: Life path calculations and insights
- **Subscriptions**: Stripe integration for premium features
- **User Management**: Profile, preferences, reading history

## Tech Stack

- **Runtime**: Node.js 18+
- **Framework**: Express.js
- **Database**: PostgreSQL
- **Authentication**: JWT + bcrypt
- **Payments**: Stripe
- **AI**: Ollama / OpenAI integration

## Quick Start

### Prerequisites

- Node.js 18+
- PostgreSQL 15+
- Stripe account (for payments)

### Installation

```bash
# Install dependencies
npm install

# Copy environment template
cp .env.local.example .env

# Configure your .env file
# Add: DATABASE_URL, STRIPE_SECRET_KEY, JWT_SECRET, etc.

# Setup database
npm run setup:db

# Start development server
npm run dev
```

The API will be available at `http://localhost:3001`

## Environment Variables

Create a `.env` file with:

```env
# Server
PORT=3001
NODE_ENV=development

# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=vibely_ai
DB_USER=postgres
DB_PASSWORD=your_password

# JWT
JWT_SECRET=your_jwt_secret_key_here
JWT_EXPIRES_IN=7d

# Stripe
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Google OAuth (optional)
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret

# Frontend URL (for CORS)
FRONTEND_URL=http://localhost:3000

# AI Services (optional)
OPENAI_API_KEY=sk-...
OLLAMA_BASE_URL=http://localhost:11434
```

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `POST /api/auth/google` - Google OAuth login
- `POST /api/auth/logout` - Logout user
- `GET /api/auth/me` - Get current user

### Users
- `GET /api/users/profile` - Get user profile
- `PUT /api/users/profile` - Update user profile
- `GET /api/users/stats` - Get user statistics
- `DELETE /api/users/account` - Delete account

### Readings
- `GET /api/readings` - Get user's readings
- `GET /api/readings/:id` - Get specific reading
- `POST /api/readings` - Create new reading
- `DELETE /api/readings/:id` - Delete reading

### Horoscopes
- `GET /api/horoscopes` - Get horoscope readings
- `POST /api/horoscopes` - Generate horoscope

### Stripe
- `POST /api/stripe/create-checkout-session` - Create payment session
- `POST /api/stripe/webhook` - Handle Stripe webhooks
- `GET /api/stripe/subscription-status` - Check subscription status

### AI
- `POST /api/ai/interpret` - Get AI interpretation

### Health
- `GET /health` - Health check endpoint

## Development

```bash
# Start with auto-reload
npm run dev

# Run database migrations
npm run setup:db

# Check logs
tail -f *.log
```

## Deployment

### Railway

1. Create new Railway project
2. Add PostgreSQL database
3. Connect GitHub repo
4. Set environment variables
5. Deploy!

```bash
# Railway will automatically detect package.json
# Build command: npm install
# Start command: npm start
```

### Environment Variables on Railway

Set these in Railway dashboard:
- `DATABASE_URL` (auto-provided by Railway Postgres)
- `STRIPE_SECRET_KEY`
- `JWT_SECRET`
- `FRONTEND_URL` (your frontend URL)

## Database Schema

The database includes tables for:
- `users` - User accounts
- `readings` - Tarot readings
- `horoscopes` - Horoscope readings
- `spreads` - Tarot spread configurations
- `subscriptions` - User subscriptions

Migrations are in `/migrations` directory.

## Security

- Helmet.js for HTTP headers
- CORS configured for frontend origin
- Rate limiting on all endpoints
- JWT token expiration
- Password hashing with bcrypt
- SQL injection prevention with parameterized queries

## Scripts

- `npm start` - Start production server
- `npm run dev` - Start development server with nodemon
- `npm run staging` - Start staging server
- `npm run production` - Start production server
- `npm run setup:db` - Initialize database schema

## Project Structure

```
mystic-vibes-api/
├── config/          # Configuration files
├── controllers/     # Request handlers
├── middleware/      # Express middleware
├── migrations/      # Database migrations
├── models/          # Data models
├── routes/          # API routes
├── services/        # Business logic
├── index.js         # Entry point
├── setup-database.js # DB setup script
└── package.json
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

Private - All rights reserved

## Support

For issues or questions, contact the development team.

---

Built with ❤️ for spiritual seekers
