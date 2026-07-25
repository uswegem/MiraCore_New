const mongoose = require('mongoose');
require('dotenv').config();

const LoanMapping = require('./src/models/LoanMapping');

async function extractAccounts() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB\n');

    // Get all DISBURSED applications
    const loans = await LoanMapping.find({ status: 'DISBURSED' });

    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║ DISBURSEMENT ACCOUNT DETAILS                              ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    console.log(`📊 Total DISBURSED Applications: ${loans.length}\n`);

    const accounts = [];
    loans.forEach((loan, idx) => {
      const metadata = loan.metadata || {};
      const clientData = metadata.clientData || {};
      const accountNumber = clientData.bankAccountNumber;
      
      if (accountNumber) {
        accounts.push({
          application: loan.essApplicationNumber,
          customer: clientData.fullName,
          accountNumber: accountNumber,
          amount: loan.requestedAmount,
          status: loan.status
        });
      }
    });

    console.log('🏦 BANK ACCOUNTS FOR DISBURSEMENT:\n');
    console.log('═══════════════════════════════════════════════════════════════════════════════════');
    console.log('App #              | Customer Name              | Account Number | Amount (TZS)');
    console.log('═══════════════════════════════════════════════════════════════════════════════════');
    
    accounts.forEach(acc => {
      const appNo = acc.application.padEnd(18);
      const name = acc.customer.substring(0, 26).padEnd(26);
      const acctNo = acc.accountNumber.padEnd(14);
      const amt = acc.amount.toFixed(2).padStart(15);
      console.log(`${appNo} | ${name} | ${acctNo} | ${amt}`);
    });
    
    console.log('═══════════════════════════════════════════════════════════════════════════════════\n');

    console.log(`\n📋 DETAILED ACCOUNT INFORMATION:\n`);
    accounts.forEach((acc, idx) => {
      console.log(`${idx + 1}. ${acc.application}`);
      console.log(`   Customer: ${acc.customer}`);
      console.log(`   Account: ${acc.accountNumber}`);
      console.log(`   Amount: ${acc.amount} TZS\n`);
    });

    if (accounts.length === 0) {
      console.log('❌ No disbursement accounts found\n');
    }

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    await mongoose.disconnect();
    process.exit(1);
  }
}

extractAccounts();
