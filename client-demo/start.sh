#!/bin/bash

# Firefly EOL/EOS Client Demo - Quick Start Script
echo "🚀 Starting Firefly EOL Client Demo..."

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js first: https://nodejs.org/"
    exit 1
fi
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed. Please install Node.js (which includes npm): https://nodejs.org/"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 14 ]; then
    echo "❌ Node.js version 14 or higher is required. Current: $(node -v)"
    exit 1
fi
echo "✅ Node.js $(node -v) detected"

if [ ! -d "node_modules" ] || [ ! -f "node_modules/.package-lock.json" ]; then
    echo "📦 Installing dependencies..."
    npm install
    if [ $? -ne 0 ]; then
        echo "❌ Failed to install dependencies."
        exit 1
    fi
    echo "✅ Dependencies installed"
else
    echo "✅ Dependencies already installed"
fi

echo "🔄 Checking for existing server on port 3001..."
lsof -ti:3001 | xargs kill -9 2>/dev/null || true

echo "🚀 Starting demo server..."
echo "🌐 Once started, open: http://localhost:3001"
echo "💡 To clear cache (e.g. before using different API keys), run: ./clear-cache.sh"
echo ""
NODE_ENV=production node server.js > /dev/null 2>&1 &
sleep 2
if curl -s http://localhost:3001 > /dev/null 2>&1; then
    echo "✅ Server started at http://localhost:3001"
else
    echo "❌ Server failed to start. Check for errors."
    exit 1
fi
