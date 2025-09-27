#!/bin/bash

# Firefly EOL Automation - Quick Start Script
echo "🚀 Starting Firefly EOL Automation..."

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js first:"
    echo "   Visit: https://nodejs.org/"
    exit 1
fi

# Check if dependencies are installed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

# Kill any existing server on port 3000
echo "🔄 Checking for existing servers..."
lsof -ti:3000 | xargs kill -9 2>/dev/null || true

# Start the server (clean mode - no API testing output)
echo "🚀 Starting server..."
echo "📱 The server will start cleanly without API testing output"
echo "🔧 To see API testing, run: npm start -- --test"
echo ""
echo "🌐 Once the server starts, open your browser and go to:"
echo "   👉 http://localhost:3000"
echo "   👉 http://127.0.0.1:3000"
echo ""
echo "💡 You can click the links above to open the application directly!"
echo ""
NODE_ENV=production npm start
