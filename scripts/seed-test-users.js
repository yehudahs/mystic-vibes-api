import bcrypt from 'bcryptjs'
import { query } from '../config/database.js'

/**
 * Seed script to create test users with strong passwords
 * Usage: node scripts/seed-test-users.js
 */

const TEST_USERS = [
  {
    name: 'Test User',
    email: 'test@example.com',
    password: 'Test123!@#'  // Meets all requirements
  },
  {
    name: 'Admin User',
    email: 'admin@example.com',
    password: 'Admin123!@#'
  },
  {
    name: 'Demo User',
    email: 'demo@example.com',
    password: 'Demo123!@#'
  },
  {
    name: 'Jane Doe',
    email: 'jane@example.com',
    password: 'Jane123!@#'
  },
  {
    name: 'John Smith',
    email: 'john@example.com',
    password: 'John123!@#'
  }
]

async function seedTestUsers() {
  console.log('🌱 Starting test user seeding...\n')

  const saltRounds = 12
  let created = 0
  let skipped = 0

  for (const user of TEST_USERS) {
    try {
      // Check if user already exists
      const existingUser = await query(
        'SELECT id, email FROM users WHERE email = $1',
        [user.email]
      )

      if (existingUser.rows.length > 0) {
        console.log(`⏭️  Skipped: ${user.email} (already exists)`)
        skipped++
        continue
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(user.password, saltRounds)

      // Create user
      const result = await query(
        `INSERT INTO users (name, email, password_hash, provider, provider_id, created_at, updated_at)
         VALUES ($1, $2, $3, 'email', $4, NOW(), NOW())
         RETURNING id, name, email, created_at`,
        [user.name, user.email, hashedPassword, user.email]
      )

      const createdUser = result.rows[0]
      console.log(`✅ Created: ${createdUser.email}`)
      console.log(`   Name: ${createdUser.name}`)
      console.log(`   Password: ${user.password}`)
      console.log(`   ID: ${createdUser.id}`)
      console.log(`   Created: ${createdUser.created_at}\n`)
      created++

    } catch (error) {
      console.error(`❌ Error creating ${user.email}:`, error.message)
    }
  }

  console.log('\n' + '='.repeat(60))
  console.log(`📊 Summary:`)
  console.log(`   ✅ Created: ${created}`)
  console.log(`   ⏭️  Skipped: ${skipped}`)
  console.log(`   📝 Total: ${TEST_USERS.length}`)
  console.log('='.repeat(60))

  console.log('\n💡 Test Credentials:')
  console.log('   Email: test@example.com')
  console.log('   Password: Test123!@#')
  console.log('\n🎉 Done!')

  process.exit(0)
}

// Run the seeder
seedTestUsers().catch(error => {
  console.error('❌ Seeding failed:', error)
  process.exit(1)
})
