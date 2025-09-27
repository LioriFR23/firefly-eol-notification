# Firefly EOL Automation Web App

A lightweight local web application that leverages Firefly's API to automate End-of-Life (EOL) framework notifications and resource management.

## Features

- **🔐 Secure Authentication**: Encrypted token caching with automatic expiry checking
- **📊 EOL Violation Analysis**: Automatically fetch all 31 EOL policies and their violating assets
- **👥 Owner Aggregation**: Group violating assets by owner with detailed violation breakdowns
- **📧 Email Notifications**: Generate professional email templates for resource owners
- **🎨 Modern UI**: Clean, responsive interface with progress tracking
- **💾 Local Caching**: Secure token storage with AES-256 encryption
- **🔄 Auto-Refresh**: Automatic token renewal when expired
- **🌐 Cross-Platform**: Runs on any machine with Node.js 14+

## API Endpoints Tested

### 1. Authentication
- **Endpoint**: `POST https://api.firefly.ai/v2/login`
- **Input**: `accessKey`, `secretKey`
- **Output**: `accessToken` (JWT token for subsequent requests)

### 2. Inventory
- **Endpoint**: `POST https://api.firefly.ai/api/v1.0/inventory`
- **Purpose**: Retrieve all assets and group them by owner
- **Response**: Array of `responseObjects` with asset details including owner information

### 3. Governance Insights
- **Endpoint**: `POST https://api.firefly.ai/v2/governance/insights`
- **Purpose**: Identify EOL framework violations
- **Filters**: `frameworks: ["EOL"]`, `onlyMatchingAssets: true`
- **Response**: Array of `hits` with violation details, severity levels, and affected assets

## Installation & Setup

### Quick Setup (Recommended)
```bash
# Clone or download the project
cd firefly-eol-automation

# Start the application (auto-installs dependencies)
./start.sh
```

### Super Quick Start
```bash
# One command to rule them all
./start.sh
```

### Quick Start
1. **Start the application:**
   ```bash
   ./start.sh
   ```

2. **Open your browser:**
   Navigate to `http://localhost:3000`

3. **Follow the guided setup:**
   - Enter Firefly API keys
   - Analyze EOL violations
   - Generate demo notifications

### Manual Setup
1. **Prerequisites**:
   - Node.js (v14 or higher)
   - npm

2. **Install Dependencies**:
   ```bash
   npm install
   # or
   npm run setup
   ```

3. **Start the Application**:
   ```bash
   npm start
   ```

4. **Access the Application**:
   Open your browser and navigate to `http://localhost:3000`

### Cross-Platform Compatibility
✅ **Runs on any local machine with Node.js 14+**
- Windows (PowerShell/CMD)
- macOS (Terminal)
- Linux (Bash)
- Docker containers

## Usage Workflow

### Step 1: Authentication
- Enter your Firefly access key and secret key
- Click "Authenticate" to obtain access token
- The application will automatically proceed to the next step upon successful authentication

### Step 2: EOL Violation Analysis
- Click "Fetch EOL Violations" to automatically:
  - Fetch all 31 EOL policies from the Governance API
  - For each policy, retrieve the actual violating assets using the Inventory API
  - Extract owner information from each violating asset
  - Aggregate violations by owner
- View a comprehensive table showing:
  - Owner email addresses
  - Total violating assets per owner
  - Asset types and examples
  - EOL violation status with counts
  - Severity levels (Critical, High, Medium, Low)

### Step 3: Send Notifications
- Select owners from the violation table using checkboxes
- Click "Send Notifications" to generate email content
- View detailed email templates for each selected owner including:
  - Specific violation types and counts
  - Detailed asset information
  - Remediation instructions
  - Links to Firefly Governance Dashboard

## API Response Structure

### Inventory Response
```json
{
  "responseObjects": [
    {
      "assetId": "github_actions_environment_secret:global:ai-engine-gateway:dev:CI_ACCOUNT_ID",
      "assetType": "github_actions_environment_secret",
      "name": "ai-engine-gateway:dev:CI_ACCOUNT_ID",
      "owner": "ahmdsalahme@users.noreply.github.com",
      "region": "global",
      "providerId": "infralight"
    }
  ],
  "totalObjects": 198057
}
```

### Governance Insights Response
```json
{
  "hits": [
    {
      "name": "Ended - AWS Lambda Functions",
      "description": "Security patches or other updates are no longer applied...",
      "severity": 5,
      "badge": "END OF SUPPORT",
      "category": "Reliability",
      "total_assets": 95,
      "type": ["aws_lambda_function"],
      "providers": ["aws"],
      "frameworks": ["EOL"]
    }
  ],
  "total": 12
}
```

## Cache Management

The application securely caches your Firefly API tokens locally. If you need to use different API keys or clear the cache:

### Option 1: Using the Script
```bash
./clear-cache.sh
```

### Option 2: Using npm
```bash
npm run clean
```

### Option 3: Manual
```bash
rm -f .tokens.json
```

After clearing the cache, restart the application with `./start.sh` to enter new API keys.

## Email Template

The application generates professional email notifications with the following structure:

```
Subject: Action Required – EOL Resource Violations in Firefly

Hello [Owner],

Our automated governance scan has detected End-of-Life (EOL) violations in your cloud resources that require immediate attention.

📊 Summary:
• Total violating resources: [count]
• Owner: [owner@company.com]

⚠️ EOL Violation Details:
• 🚨 CRITICAL: Resources will reach End of Support within 3 months - immediate action required (X assets)
• ⚠️ URGENT: Resources have already reached End of Support - update or decommission immediately (Y assets)
• 📅 WARNING: Resources will reach End of Support in 3-9 months - plan migration now (Z assets)

🔍 Violating Resources ([count] total):
• [Resource Name] ([Type])
• [Resource Name] ([Type])
...

🔗 Next Steps:
1. Access the Firefly Governance Dashboard: https://app.firefly.ai/governance
2. Review and remediate the violating resources listed above
3. Update or decommission resources that have reached End of Support

Best regards,
Firefly Team
```

## Technical Details

- **Backend**: Node.js with Express
- **Frontend**: Vanilla JavaScript with modern CSS
- **API Client**: Axios for HTTP requests
- **Authentication**: JWT token-based
- **CORS**: Enabled for cross-origin requests

## Security Notes

- API keys are handled securely and not stored permanently
- Access tokens are used for authenticated requests
- No sensitive data is logged or persisted

## Current Implementation

The application now:
- ✅ Fetches all 31 EOL policies automatically
- ✅ Retrieves actual violating assets for each policy
- ✅ Extracts owner information from assets
- ✅ Aggregates violations by owner
- ✅ Displays comprehensive violation details
- ✅ Generates detailed email templates
- ✅ Uses actual severity levels from the API
- ✅ Filters out unassigned resources

## Future Enhancements

- Real email sending integration (SMTP/SendGrid)
- Export violating resources as CSV per owner
- Filter by provider (AWS, Azure, GCP, etc.)
- Bulk operations for multiple owners
- Advanced filtering and search capabilities
- Slack integration for notifications

## Troubleshooting

1. **Authentication Issues**: Verify your API keys are correct and have proper permissions
2. **Network Errors**: Check your internet connection and Firefly API availability
3. **Empty Results**: Ensure you have resources and EOL violations in your Firefly account

## License

MIT License - Feel free to use and modify as needed.
