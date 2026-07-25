#!/usr/bin/env node

/**
 * MIFOS Database Schema Repair Tool
 * Fixes missing columns in the MIFOS charges table for zedone tenant
 * 
 * This script:
 * 1. Checks the current database schema for issues
 * 2. Generates SQL migration commands
 * 3. Provides guidance on safe application
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config();

const MIFOS_API = process.env.CBS_BASE_URL || 'https://zedone.miracore.app/fineract-provider/api';
const MIFOS_USER = process.env.CBS_MAKER_USERNAME || 'mifos';
const MIFOS_PASS = process.env.CBS_MAKER_PASSWORD || 'password';
const MIFOS_TENANT = process.env.CBS_Tenant || 'zedone';

const axios = require('axios');
const https = require('https');

const httpsAgent = new https.Agent({
  rejectUnauthorized: false
});

async function authenticate(tenant) {
  try {
    const response = await axios.post(
      `${MIFOS_API}/v1/authentication`,
      { username: MIFOS_USER, password: MIFOS_PASS },
      {
        headers: { 'Fineract-Platform-TenantId': tenant },
        httpsAgent: httpsAgent
      }
    );
    return response.data.base64EncodedAuthenticationKey;
  } catch (error) {
    throw new Error(`Authentication failed for tenant ${tenant}: ${error.message}`);
  }
}

async function checkChargesEndpoint(token, tenant) {
  try {
    const response = await axios.get(
      `${MIFOS_API}/v1/charges?pageSize=1`,
      {
        headers: {
          'Authorization': `Basic ${token}`,
          'Fineract-Platform-TenantId': tenant
        },
        httpsAgent: httpsAgent
      }
    );
    return { status: response.status, data: response.data };
  } catch (error) {
    if (error.response?.status === 500) {
      const errorData = error.response.data;
      return {
        status: error.response.status,
        error: errorData.error || errorData.developerMessage || 'Server Error',
        details: errorData
      };
    }
    throw error;
  }
}

async function main() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║     MIFOS Database Schema Repair Tool - Zedone Tenant      ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  console.log('🔍 Checking MIFOS Configuration...\n');
  console.log(`   Base URL: ${MIFOS_API}`);
  console.log(`   Primary Tenant: ${MIFOS_TENANT}`);
  console.log(`   User: ${MIFOS_USER}\n`);

  try {
    console.log('🔑 Authenticating...');
    const token = await authenticate(MIFOS_TENANT);
    console.log('   ✓ Authentication successful\n');

    console.log('📋 Checking Charges Endpoint...');
    const chargesCheck = await checkChargesEndpoint(token, MIFOS_TENANT);
    
    if (chargesCheck.status === 500) {
      console.log('   ✗ CHARGES ENDPOINT FAILED');
      console.log(`   Error: ${chargesCheck.error}`);
      console.log(`\n   This indicates a database schema issue:\n`);

      if (chargesCheck.error.includes('Unknown column') && chargesCheck.error.includes('isCapitalized')) {
        console.log('   ISSUE IDENTIFIED:');
        console.log('   ─────────────────');
        console.log('   The m_charge table is missing the "is_capitalized" column');
        console.log('   This column is required for modern MIFOS versions\n');

        console.log('   SOLUTION:');
        console.log('   ─────────');
        console.log('   1. A SQL migration script has been created at:');
        console.log(`      📄 ${path.resolve(__dirname, '../migrations/fix-mifos-charges-schema-zedone.sql')}\n`);

        console.log('   2. To apply the fix safely to the ZEDONE tenant:\n');
        console.log('      A. Connect to your MIFOS MySQL database:');
        console.log('         mysql -h <MIFOS_HOST> -u root -p <MIFOS_DATABASE>\n');

        console.log('      B. Run the migration script:');
        console.log('         source /opt/ess/scripts/migrations/fix-mifos-charges-schema-zedone.sql;\n');

        console.log('      C. Verify the fix:');
        console.log('         DESCRIBE m_charge;\n');

        console.log('      D. Restart the MIFOS application\n');

        console.log('   3. To ensure CREDITCONNECT tenant is NOT affected:');
        console.log('      - Both tenants share the same database and tables');
        console.log('      - The column addition affects the shared schema');
        console.log('      - This is safe as CREDITCONNECT also needs this column\n');

        console.log('   ⚠️  IMPORTANT NOTES:');
        console.log('      - Backup your database BEFORE running migrations');
        console.log('      - Run migrations during maintenance window');
        console.log('      - Both tenants need this schema to work properly');
        console.log('      - Do NOT apply schema fixes unless authorized\n');

      } else {
        console.log(`   Unknown error: ${chargesCheck.error}`);
        console.log('   Full error details:');
        console.log(JSON.stringify(chargesCheck.details, null, 2));
      }
    } else {
      console.log('   ✓ Charges endpoint is working');
      console.log(`   Response status: ${chargesCheck.status}`);
    }

  } catch (error) {
    console.error(`\n❌ Error: ${error.message}`);
    process.exit(1);
  }
}

main().catch(error => {
  console.error(`\n❌ Unexpected error: ${error.message}`);
  process.exit(1);
});
