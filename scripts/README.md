# Database Scripts

Utility scripts for database management and testing.

## Test User Seeding

### Quick Start

Create test users with strong passwords:

```bash
cd /Users/yehudahs/work/private/mystic-vibes-api
node scripts/seed-test-users.js
```

### Test Credentials

After running the seed script, you can use these credentials for testing:

| Email | Password | Name |
|-------|----------|------|
| test@example.com | Test123!@# | Test User |
| admin@example.com | Admin123!@# | Admin User |
| demo@example.com | Demo123!@# | Demo User |
| jane@example.com | Jane123!@# | Jane Doe |
| john@example.com | John123!@# | John Smith |

### Password Requirements

All test passwords meet the following security requirements:
- ✅ Minimum 8 characters
- ✅ At least one uppercase letter
- ✅ At least one lowercase letter
- ✅ At least one number
- ✅ At least one special character

### Clear Database

To clear all user data before reseeding:

```bash
PGPASSWORD=password psql -h localhost -p 5432 -U postgres -d vibely_ai -f clear-all-users.sql
```

Then run the seed script to populate fresh test users.

## Notes

- The seed script will skip users that already exist
- Passwords are securely hashed using bcrypt with 12 salt rounds
- All users are created with the 'email' provider (not OAuth)
