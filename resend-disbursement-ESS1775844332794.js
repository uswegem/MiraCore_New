const mongoose = require('mongoose');
require('dotenv').config();

async function resendDisbursementNotification() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/ess');

    const db = mongoose.connection.db;
    const loanmappings = db.collection('loanmappings');

    // Find the specific application
    const mapping = await loanmappings.findOne({ essApplicationNumber: 'ESS1775844332794' });

    if (!mapping) {
      console.log('❌ Application ESS1775844332794 not found');
      return;
    }

    console.log('📋 Found application:', {
      applicationNumber: mapping.essApplicationNumber,
      status: mapping.status,
      disbursementDate: mapping.disbursedAt,
      requestedAmount: mapping.requestedAmount,
      loanNumber: mapping.essLoanNumberAlias
    });

    // Create disbursement notification payload
    const callbackData = {
      Data: {
        Header: {
          Sender: 'ZE DONE',
          Receiver: 'ESS_UTUMISHI',
          FSPCode: 'FL8090',
          MsgId: `LDIS_ZD${new Date().toISOString().slice(2, 16).replace(/[-:]/g, '')}${Math.random().toString(36).substr(2, 5).toUpperCase()}`,
          MessageType: 'LOAN_DISBURSEMENT_NOTIFICATION'
        },
        MessageDetails: {
          ApplicationNumber: mapping.essApplicationNumber,
          Reason: 'Loan successfully disbursed',
          FSPReferenceNumber: mapping.fspReferenceNumber,
          LoanNumber: mapping.essLoanNumberAlias,
          TotalAmountToPay: mapping.requestedAmount,
          DisbursementDate: mapping.disbursedAt ? new Date(mapping.disbursedAt).toISOString().slice(0, 19) : new Date().toISOString().slice(0, 19)
        }
      }
    };

    console.log('📤 Sending disbursement notification...');

    // Use the callback utility
    const { sendCallback } = require('./src/utils/callbackUtils');
    const result = await sendCallback(callbackData);

    console.log('✅ Disbursement notification sent successfully');

  } catch (error) {
    console.error('❌ Error resending disbursement notification:', error.message);
  } finally {
    await mongoose.disconnect();
  }
}

resendDisbursementNotification();