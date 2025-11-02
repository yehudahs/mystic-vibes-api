#!/bin/bash

# Clean Railway Database Script for Mystic Vibes
# This will delete ALL user data from your Railway PostgreSQL database

echo "🧹 Railway Database Cleanup Script"
echo "=================================="
echo ""
echo "⚠️  WARNING: This will delete ALL users, readings, and sessions!"
echo "   This action cannot be undone."
echo ""

# Check if psql is installed
if ! command -v psql &> /dev/null; then
    echo "❌ Error: psql is not installed"
    echo "   Install PostgreSQL client first:"
    echo "   brew install postgresql"
    exit 1
fi

# Prompt for Railway connection details
echo "📝 Enter your Railway PostgreSQL connection details:"
echo "   (You can find these in Railway > PostgreSQL > Connect)"
echo ""

read -p "DB Host (e.g., postgres.railway.internal): " DB_HOST
read -p "DB Port (default: 5432): " DB_PORT
DB_PORT=${DB_PORT:-5432}
read -p "DB Name (default: railway): " DB_NAME
DB_NAME=${DB_NAME:-railway}
read -p "DB User (default: postgres): " DB_USER
DB_USER=${DB_USER:-postgres}
read -sp "DB Password: " DB_PASSWORD
echo ""
echo ""

# Final confirmation
read -p "Are you sure you want to DELETE ALL data? (type 'yes' to continue): " confirm

if [ "$confirm" != "yes" ]; then
    echo "❌ Operation cancelled."
    exit 1
fi

echo ""
echo "🔌 Connecting to Railway database..."

# Set password for psql
export PGPASSWORD="$DB_PASSWORD"

# Execute cleanup SQL
psql -h "$DB_HOST" -U "$DB_USER" -p "$DB_PORT" -d "$DB_NAME" -f clear-all-users.sql

echo ""
echo "✅ Railway database cleanup complete!"
