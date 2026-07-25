#!/usr/bin/env node
/**
 * Script to create customer and loan for application ESS1779215046525
 * Customer: Halima Nasibu Mchome
 * 
 * Usage: node scripts/create-customer-loan-ESS1779215046525.js
 */

require('dotenv').config();
const ClientService = require('../src/services/clientService');
const LoanService = require('../src/services/loanService');
const logger = require('../src/utils/logger');

const APPLICATION_NUMBER = 'ESS1779215046525';

const customerData = {
  fullname: 'Halima Nasibu Mchome',
  externalId: '19950227212060000312', // NIN
  gender: 'F',
  dateOfBirth: '1995-02-27',
  mobileNo: '0767476226',
  emailAddress: 'halimanasibu54@gmail.com',
  officeId: 1,
  checkNumber: '112847605',
  employmentDate: '2023-06-12',
  maritalStatus: 'D',
  physicalAddress: 'P.o.box 44 tunduru',
  swiftCode: 'NMIBTZTZ',
  bankAccountNumber: '70910056316',
  active: true,
  activationDate: '2026-05-19',
  submittedOnDate: '2026-05-19',
  dateFormat: 'yyyy-MM-dd',
  locale: 'en'
};

const loanData = {
  clientId: null, // Will be set after customer creation
  productId: 17, // ESS Loan product
  loanOfficerId: 1,
  loanType: 'individual',
  principal: 3263967.92,
  loanTermFrequency: 24, // Max tenure is now 24 months
  loanTermFrequencyType: 2, // months
  numberOfRepayments: 24,
  repaymentEvery: 1,
  repaymentFrequencyType: 2, // monthly
  interestRatePercentagePerAnnum: 24,
  amortizationType: 1,
  interestType: 1,
  interestCalculationPeriodType: 1,
  transactionProcessingStrategyId: 1,
  expectedDisbursementDate: '2026-05-20',
  submittedOnDate: '2026-05-19',
  dateFormat: 'yyyy-MM-dd',
  locale: 'en'
};

async function main() {
  try {
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log(`║ Creating Customer and Loan for ${APPLICATION_NUMBER}    ║`);
    console.log('║ Customer: Halima Nasibu Mchome                             ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');
    
    // Step 1: Create Customer
    console.log('📋 STEP 1: Creating Customer in CBS...');
    const customerResponse = await ClientService.createClient(customerData);
    const customerId = customerResponse.data.resourceId;
    console.log(`✅ Customer Created Successfully (ID: ${customerId})\n`);
    
    // Step 2: Create Loan
    console.log('📋 STEP 2: Creating Loan in CBS...');
    loanData.clientId = customerId;
    const loanResponse = await LoanService.submitLoan(loanData);
    const loanId = loanResponse.data.resourceId;
    console.log(`✅ Loan Created Successfully (ID: ${loanId})\n`);
    
    // Step 3: Approve Loan
    console.log('📋 STEP 3: Approving Loan...');
    const approvalData = {
      approvedOnDate: '2026-05-20',
      locale: 'en',
      dateFormat: 'yyyy-MM-dd'
    };
    await LoanService.approveLoan(loanId, approvalData);
    console.log('✅ Loan Approved Successfully\n');
    
    // Step 4: Disburse Loan
    console.log('📋 STEP 4: Disbursing Loan...');
    const disbursementData = {
      actualDisbursementDate: '2026-05-20',
      locale: 'en',
      dateFormat: 'yyyy-MM-dd'
    };
    await LoanService.disburseLoan(loanId, disbursementData);
    console.log('✅ Loan Disbursed Successfully\n');
    
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║ ✅ ALL STEPS COMPLETED SUCCESSFULLY                        ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
    console.log('\n📊 SUMMARY:');
    console.log(`   Application: ${APPLICATION_NUMBER}`);
    console.log(`   Customer ID: ${customerId}`);
    console.log(`   Loan ID: ${loanId}`);
    console.log('   Loan Status: DISBURSED');
    console.log('   Disbursement Date: 2026-05-20');
    console.log('   Loan Tenure: 24 months');
    console.log('   Loan Amount: 3,263,967.92 TZS');
    console.log('   Interest Rate: 24%\n');
    
    process.exit(0);
  } catch (error) {
    console.error('\n╔════════════════════════════════════════════════════════════╗');
    console.error('║ ❌ PROCESS FAILED                                          ║');
    console.error('╚════════════════════════════════════════════════════════════╝\n');
    console.error('Error:', error.message);
    if (error.response?.data) {
      console.error('Details:', JSON.stringify(error.response.data, null, 2));
    }
    logger.error('Full Error:', error);
    process.exit(1);
  }
}

main();
