/**
 * Fix script: Create CBS client and loan for ESS1781692948852
 *
 * Root cause: On 2026-06-17, CBS returned 404 for POST /v1/clients because
 * genderId=15 and clientTypeId=17 do not exist in this CBS instance
 * (the Gender and ClientType code value tables are empty).
 * The error was swallowed and the loan was marked DISBURSED without any CBS record.
 *
 * Resolution applied manually on 2026-06-18:
 *   - CBS client created: ID=6 (NIN: 19940828251160000125, Japhet Protas Mauki)
 *   - CBS loan created, approved, disbursed: ID=5
 *   - MongoDB mifosClientId=6, mifosLoanId=5 updated
 *
 * Code fix applied: apiController.js and clientService.js now read genderId/clientTypeId
 * from CBS_GENDER_MALE_ID, CBS_GENDER_FEMALE_ID, CBS_CLIENT_TYPE_ID env vars (defaults
 * to omitting the fields when env vars are empty, avoiding the 404).
 * interestRatePerPeriod is now read from CBS_INTEREST_RATE_PER_PERIOD (default 28).
 *
 * This script is kept for documentation. Re-running it is safe — it will detect
 * existing mifosClientId/mifosLoanId and exit without making changes.
 */

const mongoose = require('mongoose');
require('dotenv').config();

const APPLICATION_NUMBER = 'ESS1781692948852';

async function checkFixStatus() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        const db = mongoose.connection.db;
        const mapping = await db.collection('loanmappings').findOne(
            { essApplicationNumber: APPLICATION_NUMBER },
            { projection: { essApplicationNumber: 1, status: 1, mifosClientId: 1, mifosLoanId: 1, 'metadata.cbsFixAppliedAt': 1 } }
        );

        if (!mapping) {
            console.error('Loan mapping not found for', APPLICATION_NUMBER);
        } else {
            console.log('Loan mapping status:', {
                applicationNumber: mapping.essApplicationNumber,
                status: mapping.status,
                mifosClientId: mapping.mifosClientId,
                mifosLoanId: mapping.mifosLoanId,
                cbsFixAppliedAt: mapping.metadata?.cbsFixAppliedAt
            });

            if (mapping.mifosClientId && mapping.mifosLoanId) {
                console.log('✅ Fix already applied — CBS IDs are set.');
            } else {
                console.log('⚠️  CBS IDs still missing — fix may need to be re-applied manually.');
            }
        }
    } finally {
        await mongoose.disconnect();
    }
}

checkFixStatus();
