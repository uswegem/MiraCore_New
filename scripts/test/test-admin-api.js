#!/usr/bin/env node
/**
 * Test Admin API Connectivity
 * Tests the admin API endpoints to ensure they're working
 */

const axios = require('axios');

const BASE_URL = 'http://5.75.185.137:3002/api/v1';

async function testAdminAPI() {
    console.log('🧪 Testing Admin API Connectivity\n');
    
    try {
        // Test 1: Health check
        console.log('1️⃣ Testing API Health...');
        const healthResponse = await axios.get(`http://5.75.185.137:3002/health`);
        console.log(`   ✅ Health Status: ${healthResponse.status} - ${healthResponse.data.status}`);
        
        // Test 2: Test loan products endpoint (should work without auth for testing)
        console.log('2️⃣ Testing Loan Products Endpoint...');
        try {
            const productsResponse = await axios.get(`${BASE_URL}/loan/list-products`);
            console.log(`   ✅ Products: ${productsResponse.status} - Found ${productsResponse.data.data.products.length} products`);
        } catch (authError) {
            if (authError.response?.status === 401) {
                console.log('   ⚠️  Products endpoint requires authentication (as expected)');
            } else {
                console.log(`   ❌ Products Error: ${authError.message}`);
            }
        }
        
        // Test 3: Test employee loans endpoint
        console.log('3️⃣ Testing Employee Loans Endpoint...');
        try {
            const loansResponse = await axios.get(`${BASE_URL}/loan/list-employee-loan`);
            console.log(`   ✅ Employee Loans: ${loansResponse.status}`);
        } catch (authError) {
            if (authError.response?.status === 401) {
                console.log('   ⚠️  Employee loans endpoint requires authentication (as expected)');
            } else {
                console.log(`   ❌ Loans Error: ${authError.message}`);
            }
        }
        
        // Test 4: Check CORS headers
        console.log('4️⃣ Testing CORS Configuration...');
        try {
            const corsResponse = await axios.options(`${BASE_URL}/loan/list-products`);
            console.log(`   ✅ CORS: ${corsResponse.status} - Headers allowed`);
        } catch (corsError) {
            console.log(`   ⚠️  CORS might need configuration: ${corsError.message}`);
        }
        
        console.log('\n📋 Admin API Test Summary:');
        console.log('▫️ ESS Backend is running on 5.75.185.137:3002');
        console.log('▫️ Admin API routes are available at /api/v1/*');
        console.log('▫️ Authentication is required for protected endpoints');
        console.log('▫️ CORS configuration may be needed for browser requests');
        
        console.log('\n🔧 Next Steps for Frontend Connection:');
        console.log('1. Configure admin portal to use API_URL: http://5.75.185.137:3002/api/v1');
        console.log('2. Implement login flow to get JWT tokens');
        console.log('3. Include Authorization header in API requests');
        console.log('4. Handle CORS if needed');
        
    } catch (error) {
        console.error('❌ API Test Failed:', error.message);
        if (error.code === 'ECONNREFUSED') {
            console.log('   💡 ESS Backend might not be running on 5.75.185.137:3002');
        }
    }
}

// Run the test
testAdminAPI().catch(console.error);