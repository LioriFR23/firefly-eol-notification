const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const nodemailer = require('nodemailer');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Secure local storage for tokens
const TOKEN_FILE = path.join(__dirname, '.tokens.json');

function encrypt(text) {
    const algorithm = 'aes-256-cbc';
    const key = crypto.scryptSync(process.env.ENCRYPTION_KEY || 'default-encryption-key-change-in-production', 'salt', 32);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(algorithm, key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return iv.toString('hex') + ':' + encrypted;
}

function decrypt(encryptedText) {
    const algorithm = 'aes-256-cbc';
    const key = crypto.scryptSync(process.env.ENCRYPTION_KEY || 'default-encryption-key-change-in-production', 'salt', 32);
    const textParts = encryptedText.split(':');
    const iv = Buffer.from(textParts.shift(), 'hex');
    const encrypted = textParts.join(':');
    const decipher = crypto.createDecipheriv(algorithm, key, iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}

function saveToken(tokenData) {
    try {
        const encrypted = encrypt(JSON.stringify(tokenData));
        fs.writeFileSync(TOKEN_FILE, encrypted);
    } catch (error) {
        console.error('Error saving token:', error);
    }
}

function loadToken() {
    try {
        if (fs.existsSync(TOKEN_FILE)) {
            const encrypted = fs.readFileSync(TOKEN_FILE, 'utf8');
            return JSON.parse(decrypt(encrypted));
        }
    } catch (error) {
        console.error('Error loading token:', error);
    }
    return null;
}

function isTokenExpired(tokenData) {
    if (!tokenData || !tokenData.expiresAt) return true;
    
    // expiresAt is in seconds from now, so we need to calculate the actual expiry time
    const now = Math.floor(Date.now() / 1000);
    const actualExpiryTime = tokenData.createdAt ? tokenData.createdAt + tokenData.expiresAt : now + tokenData.expiresAt;
    
    return now >= actualExpiryTime;
}

// Firefly API configuration
const FIREFLY_BASE_URL = 'https://api.firefly.ai';

// Helper function to extract tag value from asset (replacing owner email logic)
function extractTagValue(asset, tagKey = 'appsflyer.com/system') {
  // First, try to get from tfObject.tags (most reliable)
  if (asset.tfObject && asset.tfObject.tags && asset.tfObject.tags[tagKey]) {
    const tagValue = asset.tfObject.tags[tagKey];
    if (tagValue && typeof tagValue === 'string' && tagValue.trim() !== '') {
      return tagValue.trim();
    }
  }
  
  // Fallback to tfObject.tags_all
  if (asset.tfObject && asset.tfObject.tags_all && asset.tfObject.tags_all[tagKey]) {
    const tagValue = asset.tfObject.tags_all[tagKey];
    if (tagValue && typeof tagValue === 'string' && tagValue.trim() !== '') {
      return tagValue.trim();
    }
  }
  
  // Fallback to tagsList array (parse from "key: value" format)
  if (asset.tagsList && Array.isArray(asset.tagsList)) {
    for (const tagItem of asset.tagsList) {
      if (typeof tagItem === 'string' && tagItem.includes(':')) {
        const [key, ...valueParts] = tagItem.split(':');
        if (key.trim() === tagKey) {
          const value = valueParts.join(':').trim();
          if (value !== '') {
            return value;
          }
        }
      }
    }
  }
  
  // If no valid tag value found, return null to exclude this asset
  return null;
}

// Helper function to validate if a tag value is valid (replacing owner validation)
function isValidTagValue(tagValue) {
  // Must not be empty
  if (!tagValue || tagValue.trim() === '') return false;
  
  const trimmedValue = tagValue.trim();
  
  // Allow reasonable system names (letters, numbers, spaces, hyphens, underscores)
  const systemNameRegex = /^[a-zA-Z0-9\s\-_]{1,100}$/;
  if (systemNameRegex.test(trimmedValue)) return true;
  
  // Reject technical IDs, tokens, and system names that are too generic
  const technicalPatterns = [
    /^[0-9]+$/,  // Pure numbers
    /^[a-f0-9]{8,}$/i,  // Hex strings
    /^vault-token/,  // Vault tokens
    /^terraform/,  // Terraform resources
    /^eks-/,  // EKS clusters
    /^aws-/,  // AWS resources
    /^k8s-/,  // Kubernetes resources
    /^[a-z]+-[a-z]+-[0-9]+/,  // Pattern like "eks-dev-euw1-12345"
    /^[0-9]{10,}$/,  // Long numbers
    /^[a-zA-Z0-9_-]{20,}$/,  // Long alphanumeric strings
    /^unknown$/i,  // Unknown values
    /^n\/a$/i,  // N/A values
    /^none$/i,  // None values
    /^null$/i,  // Null values
    /^undefined$/i  // Undefined values
  ];
  
  for (const pattern of technicalPatterns) {
    if (pattern.test(trimmedValue)) return false;
  }
  
  return true;
}

// Email configuration
const EMAIL_CONFIG = {
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: process.env.SMTP_PORT || 587,
  secure: false, // true for 465, false for other ports
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
};

// Create email transporter
let emailTransporter = null;
if (EMAIL_CONFIG.auth.user && EMAIL_CONFIG.auth.pass) {
  emailTransporter = nodemailer.createTransport(EMAIL_CONFIG);
}

// Test API endpoints with provided keys
const testFireflyAPI = async () => {
  // Testing Firefly API endpoints
  
  try {
    // Step 1: Test Authentication
    // Testing Authentication - using environment variables for security
    const authResponse = await axios.post(`${FIREFLY_BASE_URL}/v2/login`, {
      accessKey: process.env.FIREFLY_ACCESS_KEY || 'your-access-key-here',
      secretKey: process.env.FIREFLY_SECRET_KEY || 'your-secret-key-here'
    });
    
    // Authentication successful
    
    const accessToken = authResponse.data.accessToken;
    
    if (!accessToken) {
      throw new Error('No access token received');
    }
    
    // Step 2: Test Inventory API with pagination
    // Testing Inventory API with pagination
    let allResources = [];
    let afterKey = null;
    let pageCount = 0;
    // No artificial page limits - fetch all available data
    
    do {
      pageCount++;
      // Fetching page
      
      const requestBody = afterKey ? { afterKey, assetState: "managed" } : { assetState: "managed" };
      
      const inventoryResponse = await axios.post(`${FIREFLY_BASE_URL}/api/v1.0/inventory`, requestBody, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      });
      
      const data = inventoryResponse.data;
      
      if (data.responseObjects && data.responseObjects.length > 0) {
        allResources = allResources.concat(data.responseObjects);
        // Page processed
      }
      
      afterKey = data.afterKey;
      
      // No artificial page limits - continue until no more data
      
    } while (afterKey);
    
    // Test pagination complete
    
    // Step 3: Test Governance Insights API
    // Testing Governance Insights API
    const governanceResponse = await axios.post(`${FIREFLY_BASE_URL}/v2/governance/insights`, {
      frameworks: ["EOL"],
      onlyMatchingAssets: true
    }, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });
    
    // Governance API test complete
    
    return {
      accessToken,
      inventoryData: { responseObjects: allResources, totalObjects: allResources.length },
      governanceData: governanceResponse.data
    };
    
  } catch (error) {
    console.error('API Test Error:', error.response?.data || error.message);
    throw error;
  }
};

// Test endpoint to show governance API output
app.get('/api/test-governance', async (req, res) => {
  try {
    const tokenData = loadToken();
    if (!tokenData || !tokenData.accessToken) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    const { accessToken } = tokenData;
    if (!accessToken) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Testing Governance API with EOL framework filter
    
    // Test 1: Get EOL policies (what we currently do)
    // Test 1: EOL Policies
    const governanceResponse = await axios.post(`${FIREFLY_BASE_URL}/v2/governance/insights`, {
      frameworks: ["EOL"]
    }, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });
    
    // EOL policies retrieved
    
    // Test 2: Get EOL policies with onlyMatchingAssets
    // Test 2: EOL Policies with onlyMatchingAssets
    const governanceResponse2 = await axios.post(`${FIREFLY_BASE_URL}/v2/governance/insights`, {
      frameworks: ["EOL"],
      onlyMatchingAssets: true
    }, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });
    
    // EOL policies with matching assets retrieved
    
    res.json({
      success: true,
      test1: {
        status: governanceResponse.status,
        totalPolicies: governanceResponse.data.hits?.length || 0,
        policies: governanceResponse.data.hits?.slice(0, 5).map(p => ({
          name: p.name,
          total_assets: p.total_assets,
          type: p.type,
          severity: p.severity
        }))
      },
      test2: {
        status: governanceResponse2.status,
        totalPolicies: governanceResponse2.data.hits?.length || 0,
        policies: governanceResponse2.data.hits?.slice(0, 5).map(p => ({
          name: p.name,
          total_assets: p.total_assets,
          type: p.type,
          severity: p.severity
        }))
      }
    });
    
  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
    res.status(500).json({ error: error.response?.data || error.message });
  }
});

// API Routes
app.post('/api/auth', async (req, res) => {
  try {
    const { accessKey, secretKey } = req.body;
    
    // Check if we have a valid cached token first
    const cachedToken = loadToken();
    if (cachedToken && !isTokenExpired(cachedToken)) {
      // Using cached token
      return res.json(cachedToken);
    }
    
    const response = await axios.post(`${FIREFLY_BASE_URL}/v2/login`, {
      accessKey,
      secretKey
    });
    
    // Save token securely with creation time
    const tokenData = {
      ...response.data,
      createdAt: Math.floor(Date.now() / 1000)
    };
    saveToken(tokenData);
    
    res.json(response.data);
  } catch (error) {
    console.error('Auth error:', error.response?.data || error.message);
    res.status(400).json({ error: error.response?.data || error.message });
  }
});

// Check token status
app.get('/api/token-status', (req, res) => {
  try {
    const cachedToken = loadToken();
    if (cachedToken && !isTokenExpired(cachedToken)) {
      // Valid cached token found
      res.json({ valid: true, expiresAt: cachedToken.expiresAt, accessToken: cachedToken.accessToken });
    } else {
      // No valid cached token
      res.json({ valid: false });
    }
  } catch (error) {
    console.error('Token status error:', error);
    res.json({ valid: false });
  }
});

app.post('/api/inventory', async (req, res) => {
  try {
    const { accessToken, limit = 1000 } = req.body; // Default limit of 1000 resources
    
    // Starting efficient inventory fetch
    
    // First, get a sample to understand the data structure
    const sampleResponse = await axios.post(`${FIREFLY_BASE_URL}/api/v1.0/inventory`, { assetState: "managed" }, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });
    
    const sampleData = sampleResponse.data;
    // Sample response processed
    
    // If we have a reasonable number of resources per page, use sequential fetching
    // Otherwise, implement parallel fetching strategy
    const resourcesPerPage = sampleData.responseObjects?.length || 10;
    // No artificial page limits - fetch all available data
    
    let allResources = [];
    let afterKey = null;
    let pageCount = 0;
    
    // Sequential fetching for now (can be optimized to parallel later)
    do {
      pageCount++;
      
      const requestBody = afterKey ? { afterKey, assetState: "managed" } : { assetState: "managed" };
      
      const response = await axios.post(`${FIREFLY_BASE_URL}/api/v1.0/inventory`, requestBody, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      });
      
      const data = response.data;
      
      if (data.responseObjects && data.responseObjects.length > 0) {
        allResources = allResources.concat(data.responseObjects);
        
        // Log progress every 10 pages
        if (pageCount % 10 === 0) {
          // Progress tracking for large datasets
        }
      }
      
      // Check if we've reached our limit
      if (allResources.length >= limit) {
        break;
      }
      
      // Check if there's a next page
      afterKey = data.afterKey;
      
      // No artificial page limits - continue until no more data
      
    } while (afterKey);
    
    // Pagination complete
    
    // Return the aggregated data
    res.json({
      responseObjects: allResources,
      totalObjects: allResources.length,
      paginationComplete: !afterKey,
      pagesFetched: pageCount,
      limit: limit,
      hasMore: !!afterKey,
      resourcesPerPage: resourcesPerPage
    });
    
  } catch (error) {
    const errorMessage = error.response?.data || error.message || 'Unknown error occurred';
    res.status(400).json({ 
      error: errorMessage,
      timestamp: new Date().toISOString(),
      endpoint: '/api/inventory'
    });
  }
});

// Get EOL violations and their violating assets, then aggregate by owner
app.post('/api/inventory/sample', async (req, res) => {
  try {
    const { accessToken } = loadToken();
    if (!accessToken) {
      return res.status(401).json({ error: 'Authentication required. No access token found.' });
    }
    
    const { minViolations = 1 } = req.body; // Configurable minimum violations threshold
    
    // Fetching EOL violations and their violating assets
    
    // Step 1: Get ALL EOL violations with pagination
    // Fetching all EOL violations with pagination
    let allViolations = [];
    let afterKey = null;
    let pageCount = 0;
    
    do {
      pageCount++;
      // Fetching EOL violations page
      
      const requestBody = {
        frameworks: ["EOL"],
        onlyMatchingAssets: true
      };
      
      if (afterKey) {
        requestBody.afterKey = afterKey;
      }
      
      const governanceResponse = await axios.post(`${FIREFLY_BASE_URL}/v2/governance/insights`, requestBody, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      });
      
      const data = governanceResponse.data;
      const pageViolations = data.hits || [];
      
      if (pageViolations.length > 0) {
        allViolations = allViolations.concat(pageViolations);
        // Page violations processed
      }
      
      afterKey = data.afterKey;
      
      // Safety limit to prevent infinite loops (increased for large datasets)
      if (pageCount >= 100) {
        // Reached safety limit for governance API
        break;
      }
      
    } while (afterKey);
    
    const violations = allViolations;
    // EOL violation types retrieved
    
    // Step 2: For each EOL violation policy, get its violating assets, then get owners
    const ownerStats = {};
    let totalViolatingAssets = 0;
    
    // Getting violating assets for each EOL policy
    
        // Step 2: Get actual violating assets using the correct approach
        // Getting actual violating assets for each EOL policy
        
        const violatingAssets = [];
        let totalProcessedPolicies = 0;
        
        // Process each EOL policy to get its actual violating assets
        for (const policy of violations) {
          if (policy.total_assets > 0) {
            totalProcessedPolicies++;
            // Processing policy
            
            try {
              // Use the exact approach you described: assetTypes, size, and governance filters
              const inventoryResponse = await axios.post(`${FIREFLY_BASE_URL}/api/v1.0/inventory`, {
                assetTypes: policy.type,
                size: policy.total_assets,
                governance: policy.name,
                assetState: "managed"
              }, {
                headers: {
                  'Authorization': `Bearer ${accessToken}`,
                  'Content-Type': 'application/json'
                }
              });
              
              const inventoryData = inventoryResponse.data;
              const policyAssets = inventoryData.responseObjects || [];
              
              // Found violating assets for policy
              
              // Add these assets as violating assets with real owner extraction
              policyAssets.forEach(asset => {
                violatingAssets.push({
                  ...asset,
                  violations: [{
                    name: policy.name,
                    severity: policy.severity,
                    badge: policy.badge,
                    category: policy.category
                  }]
                });
              });
              
              // Added violating assets for policy
    
            } catch (error) {
              console.error(`  Error fetching assets for policy ${policy.name}:`, error.message);
              // Continue with next policy
            }
          }
        }

        // Found total violating assets across policies
    
        // Extract actual tag values from assets using the extractTagValue function
        const processedAssets = violatingAssets
          .map(asset => {
            const tagValue = extractTagValue(asset, 'appsflyer.com/system');
            return {
              ...asset,
              owner: tagValue  // Using 'owner' field to maintain compatibility with existing logic
            };
          })
          .filter(asset => asset.owner !== null && isValidTagValue(asset.owner)); // Only include assets with valid tag values
    
    // Processed assets with extracted owners
    
    // Mapped violating assets to governance rules
    
    // Group assets by violation type for processing
    const violationGroups = {};
    processedAssets.forEach(asset => {
      asset.violations.forEach(violation => {
        let cleanViolationName = violation.name;
        if (cleanViolationName.includes(' - ')) {
          cleanViolationName = cleanViolationName.split(' - ')[0];
        }
        cleanViolationName = cleanViolationName.trim();
        
        if (!violationGroups[cleanViolationName]) {
          violationGroups[cleanViolationName] = [];
        }
        violationGroups[cleanViolationName].push(asset);
      });
    });
    
    // Process each violation type
    const violationPromises = Object.entries(violationGroups).map(async ([violationType, assets]) => {
      // Processing assets for violation type
      return { violation: { name: violationType }, assets: assets };
    });
    
    // Wait for all violation processing to complete in parallel (with timeout)
    // Processing violations in parallel
    const violationResults = await Promise.allSettled(violationPromises);
    
    // Filter out failed promises and log errors
    const successfulResults = violationResults
      .filter(result => result.status === 'fulfilled')
      .map(result => result.value);
    
    const failedResults = violationResults.filter(result => result.status === 'rejected');
    if (failedResults.length > 0) {
      // Some violation processing failed, continuing with successful ones
    }
    
    // Process all successful results
    // First pass: collect all unique assets per owner
    const ownerAssets = {};
    
    successfulResults.forEach(({ violation, assets }) => {
      assets.forEach(asset => {
        // Extract tag value instead of owner email
        const tagValue = extractTagValue(asset, 'appsflyer.com/system');
        
        // Skip assets without valid tag values
        if (!tagValue || !isValidTagValue(tagValue)) {
          return;
        }
        
        if (!ownerAssets[tagValue]) {
          ownerAssets[tagValue] = {};
        }
        
        // Use asset ID as unique key to avoid counting same asset multiple times
        const assetKey = asset.assetId || asset.name || `${asset.assetType}-${Math.random()}`;
        
        if (!ownerAssets[tagValue][assetKey]) {
          ownerAssets[tagValue][assetKey] = {
            asset: asset,
            violationTypes: new Set()
          };
        }
        
        // Add this violation type to the asset
        let cleanViolationName = violation.name;
        if (cleanViolationName.includes(' - ')) {
          cleanViolationName = cleanViolationName.split(' - ')[0];
        }
        cleanViolationName = cleanViolationName.trim();
        ownerAssets[tagValue][assetKey].violationTypes.add(cleanViolationName);
        
      });
    });
    
    // Second pass: aggregate by owner
    Object.keys(ownerAssets).forEach(owner => {
      if (!ownerStats[owner]) {
        ownerStats[owner] = { 
          count: 0, 
          types: new Set(),
          violations: 0,
          violationTypes: new Set(),
          violationTypeCounts: {},
          violatingAssets: new Set(),
          assetArns: new Set(),
          originalOwner: null
        };
      }
      
      // Process each unique asset for this owner
      Object.values(ownerAssets[owner]).forEach(({ asset, violationTypes }) => {
        ownerStats[owner].count++;
        totalViolatingAssets++;
        
        // Count violations by type, not just by asset
        violationTypes.forEach(violationType => {
          ownerStats[owner].violations++;
        });
        
        // Store asset with type information and ARN
        const assetName = asset.name || asset.assetId || 'Unknown Asset';
        const assetType = asset.assetType || 'Unknown Type';
        const assetArn = asset.arn || asset.resourceId || asset.assetId || 'No ARN';
        ownerStats[owner].violatingAssets.add(`${assetName} (${assetType})`);
        
        // Store ARN separately for CSV export
        ownerStats[owner].assetArns.add(assetArn);
        
        // Store original owner information (from asset.owner field) - only if not already set
        if (asset.owner && asset.owner.trim() !== '' && !ownerStats[owner].originalOwner) {
          ownerStats[owner].originalOwner = asset.owner.trim();
        }
        
        // Track asset types
        if (asset.assetType) {
          ownerStats[owner].types.add(asset.assetType);
        }
        
        // Track violation types and their counts
        violationTypes.forEach(violationType => {
          ownerStats[owner].violationTypes.add(violationType);
          if (!ownerStats[owner].violationTypeCounts[violationType]) {
            ownerStats[owner].violationTypeCounts[violationType] = 0;
          }
          ownerStats[owner].violationTypeCounts[violationType]++;
        });
        
      });
    });
    
    // Convert to array format and filter out owners with no violations
    const allOwners = Object.keys(ownerStats).map(owner => ({
      owner,
      originalOwner: ownerStats[owner].originalOwner || 'No Owner', // Store original owner info
      count: ownerStats[owner].count,
      types: Array.from(ownerStats[owner].types),
      violations: ownerStats[owner].violations,
      violationTypes: Array.from(ownerStats[owner].violationTypes),
      violationTypeCounts: ownerStats[owner].violationTypeCounts,
      violatingAssets: Array.from(ownerStats[owner].violatingAssets),
      assetArns: Array.from(ownerStats[owner].assetArns || [])
    }));
    
    // Filter out tag values with violations below threshold (spam reduction)
    const owners = allOwners.filter(owner => 
      owner.violations >= minViolations
    );
    
    const filteredOut = allOwners.length - owners.length;
    
    // Filtered out owners below threshold
    
    // EOL violation analysis complete
    
    
    res.json({
      owners,
      totalViolatingAssets,
      uniqueOwners: owners.length,
      totalViolations: violations.length,
      governancePages: pageCount,
      filteredOwners: allOwners.length - owners.length,
      minViolations: minViolations,
      violations: violations.map(v => ({
        name: v.name,
        severity: v.severity,
        total_assets: v.total_assets,
        type: v.type
      }))
    });
    
  } catch (error) {
    console.error('EOL violation analysis error:', error.response?.data || error.message);
    res.status(400).json({ error: error.response?.data || error.message });
  }
});

app.post('/api/governance/insights', async (req, res) => {
  try {
    const { accessToken, frameworks = ["EOL"], onlyMatchingAssets = true } = req.body;
    
    const response = await axios.post(`${FIREFLY_BASE_URL}/v2/governance/insights`, {
      frameworks,
      onlyMatchingAssets
    }, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });
    
    res.json(response.data);
  } catch (error) {
    console.error('Governance error:', error.response?.data || error.message);
    res.status(400).json({ error: error.response?.data || error.message });
  }
});

// Save email configuration
app.post('/api/email-config', async (req, res) => {
  try {
    const { smtpHost, smtpPort, smtpUser, smtpPass, testEmail } = req.body;
    
    // Update email configuration
    EMAIL_CONFIG.host = smtpHost;
    EMAIL_CONFIG.port = smtpPort;
    EMAIL_CONFIG.auth.user = smtpUser;
    EMAIL_CONFIG.auth.pass = smtpPass;
    
    // Recreate email transporter with new config
    emailTransporter = nodemailer.createTransport(EMAIL_CONFIG);
    
    // Store test email for redirecting
    global.testEmail = testEmail;
    
    // Email configuration updated
    
    res.json({ success: true, message: 'Email configuration saved' });
    
  } catch (error) {
    console.error('Email config error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Demo notification endpoint (no actual sending)
app.post('/api/send-emails', async (req, res) => {
  try {
    const { selectedOwners, ownersData, violationsData } = req.body;
    
    // Demo notification requested
    
    if (!selectedOwners || selectedOwners.length === 0) {
      return res.status(400).json({ error: 'No owners selected' });
    }
    
    // Demo mode - just return success
    const results = selectedOwners.map(owner => ({
      owner: owner,
      success: true,
      messageId: 'demo-' + Date.now()
    }));
    
    res.json({
      success: true,
      sent: results.length,
      total: selectedOwners.length,
      results: results,
      errors: []
    });
    
  } catch (error) {
    console.error('Demo notification error:', error);
    res.status(500).json({ error: error.message });
  }
});

// CSV Export endpoint
app.post('/api/export-csv', async (req, res) => {
  try {
    const { ownersData, violationsData, selectedOwners } = req.body;
    
    if (!ownersData || ownersData.length === 0) {
      return res.status(400).json({ error: 'No data to export' });
    }
    
    // Filter owners if specific owners are selected
    let filteredOwners = ownersData;
    if (selectedOwners && selectedOwners.length > 0) {
      filteredOwners = ownersData.filter(owner => selectedOwners.includes(owner.owner));
      console.log(`📊 Filtering CSV export: ${filteredOwners.length} selected owners out of ${ownersData.length} total`);
    }
    
    // Prepare CSV data - one row per asset instead of aggregated
    const csvData = [];
    
    filteredOwners.forEach(owner => {
      const assetArns = owner.assetArns || [];
      const violatingAssets = owner.violatingAssets || [];
      const violationTypes = owner.violationTypes || [];
      
      console.log(`📊 Processing owner: ${owner.owner}`);
      console.log(`   - Asset ARNs: ${assetArns.length}`);
      console.log(`   - Violating Assets: ${violatingAssets.length}`);
      console.log(`   - Violation Types: ${violationTypes.length}`);
      
      // Create one row per asset - ensure we have exactly the same number of rows as assets
      assetArns.forEach((arn, index) => {
        const assetName = violatingAssets[index] || `Asset ${index + 1}`;
        
        // Get violation type for this specific asset - prioritize by severity
        let violationType = 'Unknown';
        if (violationTypes && violationTypes.length > 0) {
          // Priority order: Ended > Imminent > Upcoming
          const priorityOrder = ['Ended', 'Imminent', 'Upcoming'];
          let selectedType = null;
          
          // Find the highest priority violation type available
          for (const priority of priorityOrder) {
            const matchingType = violationTypes.find(type => type.includes(priority));
            if (matchingType) {
              selectedType = matchingType;
              break;
            }
          }
          
          // If no priority match found, use the first available type
          violationType = selectedType || violationTypes[0] || 'Unknown';
        }
        
        csvData.push({
          team_name: owner.owner,
          asset_name: assetName,
          asset_arn: arn,
          violation_type: violationType
        });
      });
    });
    
    // Create CSV content
    const csvContent = [
      // Header row - simplified
      'Team Name,Asset Name,Asset ARN,Violation Type',
      // Data rows
      ...csvData.map(row => [
        `"${row.team_name}"`,
        `"${row.asset_name}"`,
        `"${row.asset_arn}"`,
        `"${row.violation_type}"`
      ].join(','))
    ].join('\n');
    
    // Set headers for CSV download
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="eol-violations-${new Date().toISOString().split('T')[0]}.csv"`);
    
    // Send CSV content
    res.send(csvContent);
    
  } catch (error) {
    console.error('CSV export error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Serve the main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server and test API
const server = app.listen(PORT, async () => {
  console.log(`🚀 Firefly EOL Automation Server running on http://localhost:${PORT}`);
  console.log(`📱 Open your browser and navigate to: http://localhost:${PORT}`);
  
  // Check if API keys are provided via environment variables
  if (process.env.FIREFLY_ACCESS_KEY && process.env.FIREFLY_SECRET_KEY) {
    console.log(`🔐 Using API keys from environment variables`);
    try {
      // Auto-authenticate with environment variables
      const authResponse = await axios.post(`${FIREFLY_BASE_URL}/v2/login`, {
        accessKey: process.env.FIREFLY_ACCESS_KEY,
        secretKey: process.env.FIREFLY_SECRET_KEY
      });
      
      const tokenData = {
        ...authResponse.data,
        createdAt: Math.floor(Date.now() / 1000)
      };
      saveToken(tokenData);
      console.log(`✅ Auto-authentication successful`);
    } catch (error) {
      console.log(`⚠️  Auto-authentication failed: ${error.message}`);
      console.log(`🔐 Please enter your Firefly API keys manually`);
    }
  } else {
    console.log(`🔐 Enter your Firefly API keys to begin`);
  }
  
  // Test the API with provided keys (only in development mode)
  if (process.env.NODE_ENV === 'development' || process.argv.includes('--test')) {
    try {
      await testFireflyAPI();
      // API Testing Complete
    } catch (error) {
      console.error('API testing failed:', error.message);
    }
  }
});

// Handle port conflicts gracefully
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    // Port in use, trying alternative port
    const altPort = PORT + 1;
    const altServer = app.listen(altPort, () => {
      console.log(`🚀 Server running on http://localhost:${altPort}`);
      console.log(`📱 Open your browser and navigate to: http://localhost:${altPort}`);
    });
  } else {
    console.error('Server error:', err);
  }
});
