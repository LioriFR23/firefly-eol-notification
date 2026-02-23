#!/bin/bash

# Clear Firefly EOL Client Demo cache (cached tokens, if any)
# Use this before switching to different Firefly API keys

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "🧹 Clearing Firefly EOL Client Demo cache..."

if [ -f ".tokens.json" ]; then
    rm -f .tokens.json
    echo "✅ Cached tokens cleared."
else
    echo "ℹ️  No cached tokens found."
fi

echo "💡 Run ./start.sh to restart the demo with fresh authentication."
