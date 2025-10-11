import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { pool, testConnection } from './config/database.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Sample tarot cards data
const tarotCards = [
  // Major Arcana
  { id: 'fool', name: 'The Fool', suit: 'major', number: 0, keywords: ['new beginnings', 'spontaneity', 'innocence'], upright_meaning: 'New beginnings, innocence, spontaneity', reversed_meaning: 'Holding back, recklessness, risk-taking' },
  { id: 'magician', name: 'The Magician', suit: 'major', number: 1, keywords: ['manifestation', 'resourcefulness', 'power'], upright_meaning: 'Manifestation, resourcefulness, power, inspired action', reversed_meaning: 'Manipulation, poor planning, untapped talents' },
  { id: 'high-priestess', name: 'The High Priestess', suit: 'major', number: 2, keywords: ['intuition', 'sacred knowledge', 'divine feminine'], upright_meaning: 'Intuition, sacred knowledge, divine feminine, the subconscious mind', reversed_meaning: 'Secrets, disconnected from intuition, withdrawal and silence' },
  { id: 'empress', name: 'The Empress', suit: 'major', number: 3, keywords: ['femininity', 'beauty', 'nature'], upright_meaning: 'Femininity, beauty, nature, nurturing, abundance', reversed_meaning: 'Creative block, dependence on others' },
  { id: 'emperor', name: 'The Emperor', suit: 'major', number: 4, keywords: ['authority', 'establishment', 'structure'], upright_meaning: 'Authority, establishment, structure, a father figure', reversed_meaning: 'Domination, excessive control, lack of discipline' },
  { id: 'hierophant', name: 'The Hierophant', suit: 'major', number: 5, keywords: ['spiritual wisdom', 'religious beliefs', 'conformity'], upright_meaning: 'Spiritual wisdom, religious beliefs, conformity, tradition, institutions', reversed_meaning: 'Personal beliefs, freedom, challenging the status quo' },
  { id: 'lovers', name: 'The Lovers', suit: 'major', number: 6, keywords: ['love', 'harmony', 'relationships'], upright_meaning: 'Love, harmony, relationships, values alignment, choices', reversed_meaning: 'Self-love, disharmony, imbalance, misalignment of values' },
  { id: 'chariot', name: 'The Chariot', suit: 'major', number: 7, keywords: ['control', 'willpower', 'success'], upright_meaning: 'Control, willpower, success, action, determination', reversed_meaning: 'Self-discipline, opposition, lack of direction' },
  { id: 'strength', name: 'Strength', suit: 'major', number: 8, keywords: ['strength', 'courage', 'persuasion'], upright_meaning: 'Strength, courage, persuasion, influence, compassion', reversed_meaning: 'Self doubt, low energy, raw emotion' },
  { id: 'hermit', name: 'The Hermit', suit: 'major', number: 9, keywords: ['soul searching', 'seeking truth', 'inner guidance'], upright_meaning: 'Soul searching, seeking truth, inner guidance', reversed_meaning: 'Isolation, loneliness, withdrawal' },
  { id: 'wheel-fortune', name: 'Wheel of Fortune', suit: 'major', number: 10, keywords: ['good luck', 'karma', 'life cycles'], upright_meaning: 'Good luck, karma, life cycles, destiny, a turning point', reversed_meaning: 'Bad luck, lack of control, clinging to control' },
  { id: 'justice', name: 'Justice', suit: 'major', number: 11, keywords: ['justice', 'fairness', 'truth'], upright_meaning: 'Justice, fairness, truth, cause and effect, law', reversed_meaning: 'Unfairness, lack of accountability, dishonesty' },
  { id: 'hanged-man', name: 'The Hanged Man', suit: 'major', number: 12, keywords: ['suspension', 'restriction', 'letting go'], upright_meaning: 'Suspension, restriction, letting go, sacrifice', reversed_meaning: 'Martyrdom, indecision, delay' },
  { id: 'death', name: 'Death', suit: 'major', number: 13, keywords: ['endings', 'beginnings', 'change'], upright_meaning: 'Endings, beginnings, change, transformation, transition', reversed_meaning: 'Resistance to change, unable to let go' },
  { id: 'temperance', name: 'Temperance', suit: 'major', number: 14, keywords: ['balance', 'moderation', 'patience'], upright_meaning: 'Balance, moderation, patience, purpose', reversed_meaning: 'Imbalance, excess, self-healing, re-alignment' },
  { id: 'devil', name: 'The Devil', suit: 'major', number: 15, keywords: ['shadow self', 'attachment', 'addiction'], upright_meaning: 'Shadow self, attachment, addiction, restriction, sexuality', reversed_meaning: 'Releasing limiting beliefs, exploring dark thoughts, detachment' },
  { id: 'tower', name: 'The Tower', suit: 'major', number: 16, keywords: ['sudden change', 'upheaval', 'chaos'], upright_meaning: 'Sudden change, upheaval, chaos, revelation, awakening', reversed_meaning: 'Personal transformation, fear of change, averting disaster' },
  { id: 'star', name: 'The Star', suit: 'major', number: 17, keywords: ['hope', 'faith', 'purpose'], upright_meaning: 'Hope, faith, purpose, renewal, spirituality', reversed_meaning: 'Lack of faith, despair, self-trust, disconnection' },
  { id: 'moon', name: 'The Moon', suit: 'major', number: 18, keywords: ['illusion', 'fear', 'anxiety'], upright_meaning: 'Illusion, fear, anxiety, subconscious, intuition', reversed_meaning: 'Release of fear, repressed emotion, inner confusion' },
  { id: 'sun', name: 'The Sun', suit: 'major', number: 19, keywords: ['positivity', 'fun', 'warmth'], upright_meaning: 'Positivity, fun, warmth, success, vitality, joy', reversed_meaning: 'Inner child, feeling down, overly optimistic' },
  { id: 'judgement', name: 'Judgement', suit: 'major', number: 20, keywords: ['judgement', 'rebirth', 'inner calling'], upright_meaning: 'Judgement, rebirth, inner calling, forgiveness', reversed_meaning: 'Self-doubt, inner critic, ignoring the call' },
  { id: 'world', name: 'The World', suit: 'major', number: 21, keywords: ['completion', 'accomplishment', 'travel'], upright_meaning: 'Completion, accomplishment, travel, fulfillment', reversed_meaning: 'Seeking personal closure, short-cut to success' },

  // Minor Arcana - Cups (sample)
  { id: 'ace-cups', name: 'Ace of Cups', suit: 'cups', number: 1, keywords: ['love', 'intuition', 'spirituality'], upright_meaning: 'Love, intuition, spirituality, new relationships', reversed_meaning: 'Self-love, intuition, repressed emotions' },
  { id: 'two-cups', name: 'Two of Cups', suit: 'cups', number: 2, keywords: ['unified love', 'partnership', 'mutual attraction'], upright_meaning: 'Unified love, partnership, mutual attraction', reversed_meaning: 'Self-love, break-ups, disharmony' },
  { id: 'three-cups', name: 'Three of Cups', suit: 'cups', number: 3, keywords: ['celebration', 'friendship', 'creativity'], upright_meaning: 'Celebration, friendship, creativity, collaborations', reversed_meaning: 'Independence, alone time, hardcore partying' },

  // Minor Arcana - Wands (sample)
  { id: 'ace-wands', name: 'Ace of Wands', suit: 'wands', number: 1, keywords: ['inspiration', 'creative spark', 'new initiative'], upright_meaning: 'Inspiration, creative spark, new initiative', reversed_meaning: 'Lack of energy, lack of passion, boredom' },
  { id: 'two-wands', name: 'Two of Wands', suit: 'wands', number: 2, keywords: ['future planning', 'making decisions', 'leaving comfort zone'], upright_meaning: 'Future planning, making decisions, leaving comfort zone', reversed_meaning: 'Personal goals, inner alignment, fear of unknown' },

  // Minor Arcana - Swords (sample)
  { id: 'ace-swords', name: 'Ace of Swords', suit: 'swords', number: 1, keywords: ['new ideas', 'mental clarity', 'breakthrough'], upright_meaning: 'New ideas, mental clarity, breakthrough', reversed_meaning: 'Inner clarity, re-thinking an idea, clouded judgement' },
  { id: 'two-swords', name: 'Two of Swords', suit: 'swords', number: 2, keywords: ['difficult decisions', 'weighing options', 'indecision'], upright_meaning: 'Difficult decisions, weighing options, indecision', reversed_meaning: 'Inner turmoil, conflicted feelings, personal dilemma' },

  // Minor Arcana - Pentacles (sample)
  { id: 'ace-pentacles', name: 'Ace of Pentacles', suit: 'pentacles', number: 1, keywords: ['prosperity', 'new financial opportunity', 'manifestation'], upright_meaning: 'Prosperity, new financial opportunity, manifestation', reversed_meaning: 'Lost opportunity, lack of planning, poor financial choices' },
  { id: 'two-pentacles', name: 'Two of Pentacles', suit: 'pentacles', number: 2, keywords: ['multiple priorities', 'time management', 'prioritization'], upright_meaning: 'Multiple priorities, time management, prioritization', reversed_meaning: 'Over-committed, disorganisation, reprioritisation' }
]

async function setupDatabase() {
  console.log('🚀 Starting Vibely AI database setup...')

  // Test connection first
  const isConnected = await testConnection()
  if (!isConnected) {
    console.error('❌ Cannot connect to database. Please check your configuration.')
    process.exit(1)
  }

  try {
    // Read and execute schema
    const schemaPath = path.join(__dirname, '..', 'database-schema.sql')
    const schema = fs.readFileSync(schemaPath, 'utf8')
    
    console.log('📋 Creating database schema...')
    await pool.query(schema)
    console.log('✅ Database schema created successfully')

    // Check and add subscription columns if they don't exist (for Railway compatibility)
    console.log('🔄 Ensuring subscription columns exist...')
    try {
      const subscriptionColumns = [
        'ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_customer_id VARCHAR(255)',
        'ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_subscription_id VARCHAR(255)',
        'ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_price_id VARCHAR(255)',
        'ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_status VARCHAR(50)',
        'ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_current_period_start TIMESTAMP WITH TIME ZONE',
        'ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_current_period_end TIMESTAMP WITH TIME ZONE',
        'ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_cancel_at_period_end BOOLEAN DEFAULT false',
        'ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_canceled_at TIMESTAMP WITH TIME ZONE'
      ]

      for (const sql of subscriptionColumns) {
        await pool.query(sql)
      }

      // Add indexes for subscription columns
      const subscriptionIndexes = [
        'CREATE INDEX IF NOT EXISTS idx_users_stripe_customer_id ON users(stripe_customer_id)',
        'CREATE INDEX IF NOT EXISTS idx_users_stripe_subscription_id ON users(stripe_subscription_id)',
        'CREATE INDEX IF NOT EXISTS idx_users_subscription_status ON users(subscription_status)'
      ]

      for (const sql of subscriptionIndexes) {
        await pool.query(sql)
      }
      
      console.log('✅ Subscription columns ensured')
    } catch (subscriptionError) {
      console.log('⚠️  Could not add subscription columns (may already exist):', subscriptionError.message)
    }

    // Insert tarot cards
    console.log('🃏 Inserting tarot cards...')
    for (const card of tarotCards) {
      await pool.query(
        `INSERT INTO tarot_cards (id, name, suit, number, keywords, upright_meaning, reversed_meaning)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (id) DO NOTHING`,
        [card.id, card.name, card.suit, card.number, card.keywords, card.upright_meaning, card.reversed_meaning]
      )
    }
    console.log(`✅ Inserted ${tarotCards.length} tarot cards`)

    // Verify setup
    const userCount = await pool.query('SELECT COUNT(*) FROM users')
    const cardCount = await pool.query('SELECT COUNT(*) FROM tarot_cards')
    const spreadCount = await pool.query('SELECT COUNT(*) FROM tarot_spreads')

    console.log('\n📊 Database Setup Complete!')
    console.log(`   👥 Users: ${userCount.rows[0].count}`)
    console.log(`   🃏 Cards: ${cardCount.rows[0].count}`)
    console.log(`   🔮 Spreads: ${spreadCount.rows[0].count}`)
    console.log('\n🎉 Your Vibely AI database is ready!')
    console.log('💡 Next steps:')
    console.log('   1. Start the server: npm run server:dev')
    console.log('   2. Test API: curl http://localhost:3001/health')

  } catch (error) {
    if (error.code === '42P07') {
      console.log('💡 Tables already exist. Database is already set up!')

      // Still run the subscription columns check and tarot cards insert
      try {
        console.log('🔄 Ensuring subscription columns exist...')
        const subscriptionColumns = [
          'ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_customer_id VARCHAR(255)',
          'ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_subscription_id VARCHAR(255)',
          'ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_price_id VARCHAR(255)',
          'ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_status VARCHAR(50)',
          'ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_current_period_start TIMESTAMP WITH TIME ZONE',
          'ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_current_period_end TIMESTAMP WITH TIME ZONE',
          'ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_cancel_at_period_end BOOLEAN DEFAULT false',
          'ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_canceled_at TIMESTAMP WITH TIME ZONE'
        ]

        for (const sql of subscriptionColumns) {
          await pool.query(sql)
        }

        // Add indexes for subscription columns
        const subscriptionIndexes = [
          'CREATE INDEX IF NOT EXISTS idx_users_stripe_customer_id ON users(stripe_customer_id)',
          'CREATE INDEX IF NOT EXISTS idx_users_stripe_subscription_id ON users(stripe_subscription_id)',
          'CREATE INDEX IF NOT EXISTS idx_users_subscription_status ON users(subscription_status)'
        ]

        for (const sql of subscriptionIndexes) {
          await pool.query(sql)
        }

        console.log('✅ Subscription columns ensured')

        // Insert tarot cards
        console.log('🃏 Inserting tarot cards...')
        for (const card of tarotCards) {
          await pool.query(
            `INSERT INTO tarot_cards (id, name, suit, number, keywords, upright_meaning, reversed_meaning)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             ON CONFLICT (id) DO NOTHING`,
            [card.id, card.name, card.suit, card.number, card.keywords, card.upright_meaning, card.reversed_meaning]
          )
        }
        console.log(`✅ Inserted ${tarotCards.length} tarot cards`)
      } catch (updateError) {
        console.log('⚠️  Could not update existing database:', updateError.message)
      }
    } else {
      console.error('❌ Database setup failed:', error.message)
      process.exit(1)
    }
  } finally {
    await pool.end()
  }
}

// Run setup if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  setupDatabase()
}

export default setupDatabase