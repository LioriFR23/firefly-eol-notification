const axios = require('axios');

const FIREFLY_BASE_URL = 'https://api.firefly.ai';

async function testSimplifiedCSV() {
    try {
        console.log('🔐 Testing simplified CSV format...');
        
        // Login
        const authResponse = await axios.post(`${FIREFLY_BASE_URL}/v2/login`, {
            accessKey: "INFLJBSKNYNDVCTIJWHZ",
            secretKey: "G9PovGBdEWPzGDKVhX3Q4NgFM1CV462LrNWjWrUgvdqU7zMXHf7twMGGssIOxOpm"
        });
        
        const accessToken = authResponse.data.accessToken;
        console.log('✅ Authentication successful');
        
        // Test the /api/inventory/sample endpoint
        const sampleResponse = await axios.post('http://localhost:3000/api/inventory/sample', {
            accessToken: accessToken,
            limit: 50
        });
        
        const sampleData = sampleResponse.data;
        
        if (sampleData.owners && sampleData.owners.length > 0) {
            console.log('👥 Owners found:', sampleData.owners.length);
            
            // Test CSV export
            console.log('\n📄 Testing simplified CSV export...');
            const csvResponse = await axios.post('http://localhost:3000/api/export-csv', {
                ownersData: sampleData.owners,
                violationsData: sampleData.violations || [],
                selectedOwners: []
            });
            
            const csvContent = csvResponse.data;
            console.log('✅ CSV generated successfully');
            
            // Analyze CSV structure
            const lines = csvContent.split('\n');
            console.log('\n📄 CSV Structure:');
            console.log('Header:', lines[0]);
            console.log('Total rows:', lines.length - 1);
            
            if (lines.length > 1) {
                console.log('\n📄 Sample rows:');
                for (let i = 1; i <= Math.min(5, lines.length - 1); i++) {
                    console.log(`Row ${i}:`, lines[i]);
                }
            }
            
            // Check for "Unknown" violation types
            const unknownCount = (csvContent.match(/"Unknown"/g) || []).length;
            console.log(`\n📊 Analysis:`);
            console.log(`   - Total data rows: ${lines.length - 1}`);
            console.log(`   - "Unknown" violation types: ${unknownCount}`);
            
            if (unknownCount === 0) {
                console.log('✅ No "Unknown" violation types found!');
            } else {
                console.log(`⚠️  Found ${unknownCount} "Unknown" violation types`);
            }
            
        } else {
            console.log('❌ No owners found in sample data');
        }
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
        if (error.response) {
            console.error('Response status:', error.response.status);
            console.error('Response data:', error.response.data);
        }
    }
}

testSimplifiedCSV();
