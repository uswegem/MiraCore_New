const logger = require('../../utils/logger');
const digitalSignature = require('../../utils/signatureUtils');
const { sendErrorResponse } = require('../../utils/responseUtils');
const { getMessageId } = require('../../utils/messageIdGenerator');
const LOAN_CONSTANTS = require('../../utils/loanConstants');
const loanCalculations = require('../../utils/loanCalculations');
const LoanMapping = require('../../models/LoanMapping');
const cbsApi = require('../../services/cbs.api');

const path = require('path');
const loanUtilsPath = path.resolve(__dirname, '../../utils/loanUtils.js');
const loanUtils = require(loanUtilsPath);

const handleLoanRestructureAffordabilityRequest = async (parsedData, res) => {
    try {
        const header = parsedData.Document.Data.Header;
        const messageType = header.MessageType;
        logger.info(`Processing ${messageType} - TESTING MODE WITH MOCKED DATA...`);
        
        // Import metrics tracking
        let trackLoanMessage, trackLoanError;
        try {
            const metrics = require('../../../src/middleware/metricsMiddleware');
            trackLoanMessage = metrics.trackLoanMessage;
            trackLoanError = metrics.trackLoanError;
        } catch (err) {
            // Metrics middleware not available, continue without tracking
        }
        
        const messageDetails = parsedData.Document.Data.MessageDetails;
        const loanNumber = messageDetails.LoanNumber;

        if (!loanNumber) {
            logger.error('LoanNumber is required for restructure affordability request');
            return sendErrorResponse(res, '8013', 'LoanNumber is required for loan restructure affordability', 'xml', parsedData);
        }

        logger.info(`[TESTING MODE] Received affordability request for loan: ${loanNumber}`);

        // ============================================
        // MOCKED DATA FOR TESTING
        // ============================================
        const mockedData = {
            DesiredDeductibleAmount: "150000.00",
            TotalInsurance: "50000.00",
            TotalProcessingFees: "100000.00",
            TotalInterestRateAmount: "500000.00",
            OtherCharges: "10000.00",
            NetLoanAmount: "2840000.00",
            TotalAmountToPay: "3500000.00",
            Tenure: 24,
            EligibleAmount: "3000000.00",
            MonthlyReturnAmount: "150000.00"
        };

        logger.info(`[TESTING MODE] Returning mocked affordability response:`, mockedData);

        // Prepare response with mocked data
        const responseData = {
            Data: {
                Header: {
                    "Sender": process.env.FSP_NAME || "ZE DONE",
                    "Receiver": "ESS_UTUMISHI",
                    "FSPCode": header.FSPCode,
                    "MsgId": getMessageId('LOAN_RESTRUCTURE_AFFORDABILITY_RESPONSE'),
                    "MessageType": "LOAN_RESTRUCTURE_AFFORDABILITY_RESPONSE"
                },
                MessageDetails: mockedData
            }
        };

        const signedResponse = digitalSignature.createSignedXML(responseData.Data);
        
        // Track successful processing
        if (trackLoanMessage) {
            trackLoanMessage(messageType, 'success');
            trackLoanMessage('LOAN_RESTRUCTURE_AFFORDABILITY_RESPONSE', 'sent');
        }
        
        logger.info(`[TESTING MODE] LOAN_RESTRUCTURE_AFFORDABILITY_RESPONSE sent for ${loanNumber}`);
        res.status(200).set('Content-Type', 'application/xml').send(signedResponse);
        
    } catch (error) {
        logger.error('Error processing loan restructure affordability request:', error);
        
        // Track error
        if (trackLoanError) {
            trackLoanError('processing_error', 'LOAN_RESTRUCTURE_AFFORDABILITY_REQUEST');
        }
        
        return sendErrorResponse(res, '8012', error.message, 'xml', parsedData);
    }
};

module.exports = handleLoanRestructureAffordabilityRequest;
