const mongoose = require('mongoose');
const axios = require('axios');
const { getHttpsAgent } = require('./src/utils/httpsAgentManager');
const digitalSignature = require('./src/utils/signatureUtils');
const logger = require('./src/utils/logger');
require('dotenv').config();

const generateFSPReferenceNumber = () => `FSP${Date.now()}`;
const generateLoanNumber = () => `LOAN${Date.now()}${Math.floor(Math.random() * 1000)}`;

async function resendApprovalForESS1775844332794() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        logger.info('✅ Connected to MongoDB');

        const LoanMapping = require('./src/models/LoanMapping');
        const loan = await LoanMapping.findOne({ essApplicationNumber: 'ESS1775844332794' });

        if (!loan) {
            logger.error('❌ Loan not found for ESS1775844332794');
            await mongoose.disconnect();
            process.exit(1);
        }

        logger.info('✅ Found loan:', {
            applicationNumber: loan.essApplicationNumber,
            requestedAmount: loan.requestedAmount,
            tenure: loan.tenure,
            status: loan.status
        });

        // Generate new reference numbers
        const fspReferenceNumber = generateFSPReferenceNumber();
        const loanNumber = generateLoanNumber();

        // Use actual loan data or defaults
        const requestedAmount = loan.requestedAmount || 3232611.09;
        const tenure = loan.tenure || 24;
        
        // Calculate charges (approx 28% annual interest)
        const interestRate = requestedAmount * 0.28 * tenure / 12;
        const processingFee = requestedAmount * 0.02;
        const insurance = requestedAmount * 0.0157;
        const otherCharges = processingFee + insurance;
        const totalAmountToPay = requestedAmount + interestRate + processingFee + insurance;

        logger.info('📊 Calculated charges:', {
            requestedAmount: requestedAmount.toFixed(2),
            tenure,
            interestRate: interestRate.toFixed(2),
            processingFee: processingFee.toFixed(2),
            insurance: insurance.toFixed(2),
            otherCharges: otherCharges.toFixed(2),
            totalAmountToPay: totalAmountToPay.toFixed(2)
        });

        // Create approval message
        const messageData = {
            Data: {
                Header: {
                    Sender: 'ZE DONE',
                    Receiver: 'ESS_UTUMISHI',
                    FSPCode: process.env.FSP_CODE || 'FL8090',
                    MsgId: `LIAN_ZD${Date.now()}`,
                    MessageType: 'LOAN_INITIAL_APPROVAL_NOTIFICATION'
                },
                MessageDetails: {
                    ApplicationNumber: 'ESS1775844332794',
                    Reason: 'Loan Request Approved',
                    FSPReferenceNumber: fspReferenceNumber,
                    LoanNumber: loanNumber,
                    TotalAmountToPay: totalAmountToPay.toFixed(2),
                    OtherCharges: otherCharges.toFixed(2),
                    Approval: 'APPROVED'
                }
            }
        };

        logger.info('📝 Approval message created:', JSON.stringify(messageData, null, 2));

        // Sign the message using createSignedXML
        const signedXml = digitalSignature.createSignedXML(messageData.Data);
        logger.info('✅ XML signed successfully');

        // Send to UTUMISHI with the fixed HTTPS agent
        const callbackUrl = process.env.ESS_CALLBACK_URL || 'https://gateway.ess.utumishi.go.tz/ess-loans/mvtyztwq/consume';
        
        logger.info('🚀 Sending LOAN_INITIAL_APPROVAL_NOTIFICATION to UTUMISHI:', { url: callbackUrl });

        const response = await axios.post(callbackUrl, signedXml, {
            headers: {
                'Content-Type': 'application/xml',
                'X-Request-ID': `RESEND_${Date.now()}`
            },
            timeout: 30000,
            httpsAgent: getHttpsAgent()
        });

        logger.info('✅ UTUMISHI Response received:', {
            status: response.status,
            statusText: response.statusText,
            dataLength: response.data ? response.data.length : 0,
            data: response.data ? response.data.substring(0, 500) : 'No data'
        });

        // Update loan mapping with new loan number if needed
        if (response.status === 200 || response.status === 202) {
            await LoanMapping.updateOne(
                { essApplicationNumber: 'ESS1775844332794' },
                {
                    $set: {
                        essLoanNumberAlias: loanNumber,
                        fspReferenceNumber: fspReferenceNumber,
                        totalAmountToPay: totalAmountToPay,
                        status: 'APPROVED',
                        lastApprovalNotificationSent: new Date(),
                        approvalNotificationAttempts: (loan.approvalNotificationAttempts || 0) + 1
                    }
                }
            );
            logger.info('✅ Loan mapping updated with new reference numbers');
        }

        logger.info('========================================');
        logger.info('✅ APPROVAL RESUBMISSION SUCCESSFUL');
        logger.info('========================================');
        logger.info('Application Number: ESS1775844332794');
        logger.info('FSP Reference Number:', fspReferenceNumber);
        logger.info('Loan Number:', loanNumber);
        logger.info('Total Amount to Pay:', totalAmountToPay.toFixed(2));
        logger.info('Approval Status: APPROVED');
        logger.info('========================================');

        await mongoose.disconnect();
        process.exit(0);

    } catch (error) {
        logger.error('❌ Error during approval resubmission:', {
            message: error.message,
            code: error.code,
            response: error.response ? {
                status: error.response.status,
                statusText: error.response.statusText,
                data: error.response.data ? error.response.data.substring(0, 500) : 'No data'
            } : null,
            stack: error.stack
        });

        await mongoose.disconnect();
        process.exit(1);
    }
}

// Run the function
resendApprovalForESS1775844332794();
