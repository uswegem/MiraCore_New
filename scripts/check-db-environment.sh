#!/bin/bash
# Database Setup Script for UAT and Production Environments

echo "🗄️ ESS Database Environment Setup"
echo "=================================="
echo ""

# Check which server we're on
CURRENT_IP=$(hostname -I | awk '{print $1}')
echo "Current Server IP: $CURRENT_IP"

if [ "$CURRENT_IP" = "135.181.33.13" ]; then
    ENV="UAT"
    DB_NAME="ess_uat"
elif [ "$CURRENT_IP" = "5.75.185.137" ]; then
    ENV="PRODUCTION"
    DB_NAME="ess_prod"
else
    ENV="UNKNOWN"
    DB_NAME="ess_db"
fi

echo "Environment: $ENV"
echo "Database: $DB_NAME"
echo ""

# Check MongoDB status
echo "📊 MongoDB Status:"
systemctl is-active --quiet mongod && echo "✅ MongoDB is running" || echo "❌ MongoDB is not running"
echo ""

# Check if database exists
echo "📁 Checking database '$DB_NAME':"
mongosh --quiet --eval "db.getMongo().getDBNames()" mongodb://localhost:27017 | grep -q "$DB_NAME" && \
    echo "✅ Database '$DB_NAME' exists" || \
    echo "ℹ️  Database '$DB_NAME' will be created on first use"

# Show collections in the database
echo ""
echo "📋 Collections in '$DB_NAME':"
mongosh --quiet --eval "db.getCollectionNames()" mongodb://localhost:27017/$DB_NAME 2>/dev/null | grep -E '^\[' || echo "No collections yet"

echo ""
echo "📝 Database Connection String:"
echo "   mongodb://localhost:27017/$DB_NAME"
echo ""

# Show current .env configuration
if [ -f /opt/ess/.env ]; then
    echo "🔧 Current .env configuration:"
    grep -E "^(NODE_ENV|MONGODB_URI)" /opt/ess/.env | sed 's/^/   /'
else
    echo "⚠️  No .env file found at /opt/ess/.env"
fi

echo ""
echo "✅ Setup complete!"
