#!/bin/bash

# Firefly EOL Automation - Quick Start Script
echo "🚀 Starting Firefly EOL Automation..."

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js first:"
    echo "   Visit: https://nodejs.org/"
    exit 1
fi

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed. Please install Node.js (which includes npm):"
    echo "   Visit: https://nodejs.org/"
    exit 1
fi

# Check Node.js version (requires 14+)
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 14 ]; then
    echo "❌ Node.js version 14 or higher is required. Current version: $(node -v)"
    echo "   Please update Node.js: https://nodejs.org/"
    exit 1
fi

echo "✅ Node.js $(node -v) detected"

# Check if dependencies are installed
if [ ! -d "node_modules" ] || [ ! -f "node_modules/.package-lock.json" ]; then
    echo "📦 Installing dependencies..."
    echo "   This may take a few minutes on first run..."
    npm install
    if [ $? -ne 0 ]; then
        echo "❌ Failed to install dependencies. Please check your internet connection and try again."
        exit 1
    fi
    echo "✅ Dependencies installed successfully!"
else
    echo "✅ Dependencies already installed"
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
# Start server without hardcoded keys - user will enter them via web interface
NODE_ENV=production node server.js > /dev/null 2>&1 &

# Wait a moment for server to start
sleep 2

# Check if server is running
if curl -s http://localhost:3000 > /dev/null 2>&1; then
    echo "✅ Server started successfully!"
    echo "🌐 Application is ready at: http://localhost:3000"
else
    echo "❌ Server failed to start. Check for errors."
    exit 1
fi
