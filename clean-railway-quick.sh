#!/bin/bash

# Quick Railway Database Cleanup for Mystic Vibes
# Uses your Railway PostgreSQL connection details

echo "🧹 Railway Database Cleanup"
echo "=================================="
echo ""
echo "⚠️  WARNING: This will delete ALL users, readings, and sessions!"
echo "   This action cannot be undone."
echo ""

# Final confirmation
read -p "Are you sure you want to DELETE ALL data from Railway? (type 'yes' to continue): " confirm

if [ "$confirm" != "yes" ]; then
    echo "❌ Operation cancelled."
    exit 1
fi

echo ""
echo "🔌 Connecting to Railway database..."
echo "   Host: crossover.proxy.rlwy.net"
echo "   Port: 26724"
echo ""

# You'll need to enter your Railway database password when prompted
psql -h crossover.proxy.rlwy.net -U postgres -p 26724 -d railway -f clear-all-users.sql

echo ""
echo "✅ Railway database cleanup complete!"
