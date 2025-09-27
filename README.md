# Firefly EOL Notification Tool

Simple web app to find EOL violations and send notifications to resource owners.

## Quick Start

```bash
./start.sh
```

That's it! Opens at `http://localhost:3000`

## What You Need

- Node.js 14+ ([download here](https://nodejs.org/))
- Firefly API keys

## How It Works

1. **Login** - Enter your Firefly API keys
2. **Scan** - Finds all EOL violations and groups by owner  
3. **Notify** - Generate email templates for owners

## Features

- Finds EOL violations across all your resources
- Groups violations by owner
- Generates email templates
- No data stored locally (except encrypted tokens)

## Clear Cache

```bash
./clear-cache.sh
```

## License

MIT