#!/bin/bash

# Clear Firefly EOL Automation Cache
# This script removes cached authentication tokens

echo "🧹 Clearing Firefly EOL Automation cache..."

if [ -f ".tokens.json" ]; then
    rm -f .tokens.json
    echo "✅ Cached tokens cleared successfully!"
    echo "💡 You can now use different Firefly API keys"
else
    echo "ℹ️  No cached tokens found - nothing to clear"
fi

echo ""
echo "🚀 Run './start.sh' to restart the application with fresh authentication"
