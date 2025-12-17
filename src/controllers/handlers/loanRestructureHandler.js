const logger = require('../../utils/logger');
const { maker } = require('../../services/cbs.api');
const digitalSignature = require('../../utils/signatureUtils');
const { getMessageId } = require('../../utils/messageIdGenerator');
const LoanMappings = require('../../models/LoanMappings');
const { AuditLog } = require('../../models/AuditLog');

/**
 * Handle LOAN_RESTRUCTURE_REQUEST
 * Calls MIFOS reschedule API and sets up webhook to send LOAN_INITIAL_APPROVAL_NOTIFICATION
 */
const handleLoanRestructureRequest = async (parsedData, res) => {
    let responseSent = false;

    try {
        const data = parsedData.Document.Data;
        const header = data.Header;
        const messageDetails = data.MessageDetails;

        logger.info('🔄 Processing LOAN_RESTRUCTURE_REQUEST:', {
            checkNumber: messageDetails.CheckNumber,
            loanNumber: messageDetails.LoanNumber || 'Not provided',
            tenure: messageDetails.Tenure,
            requestedAmount: messageDetails.RequestedAmount
        });

        // Extract request parameters
        const checkNumber = messageDetails.CheckNumber;
        const requestedAmount = parseFloat(messageDetails.RequestedAmount || 0);
        const tenure = parseInt(messageDetails.Tenure || 0);
        const desiredDeductibleAmount = parseFloat(messageDetails.DesiredDeductibleAmount || 0);

        // Validate required fields
        if (!checkNumber) {
            throw new Error('CheckNumber is required');
        }

        if (!requestedAmount || requestedAmount <= 0) {
            throw new Error('RequestedAmount must be greater than 0');
        }

        if (!tenure || tenure <= 0) {
            throw new Error('Tenure must be greater than 0');
        }

        // Find the loan mapping using check number
        const loanMapping = await LoanMappings.findOne({ checkNumber });

        if (!loanMapping) {
            logger.warn('Loan mapping not found for checkNumber:', checkNumber);
            throw new Error(`No active loan found for check number: ${checkNumber}`);
        }

        if (!loanMapping.mifosLoanId) {
            throw new Error('MIFOS Loan ID not found in loan mapping');
        }

        logger.info('Found loan mapping:', {
            checkNumber,
            mifosLoanId: loanMapping.mifosLoanId,
            applicationNumber: loanMapping.applicationNumber
        });

        // Step 1: Send immediate ACK response
        const ackResponseData = {
            Data: {
                Header: {
                    "Sender": process.env.FSP_NAME || "ZE DONE",
                    "Receiver": "ESS_UTUMISHI",
                    "FSPCode": header.FSPCode,
                    "MsgId": getMessageId("RESPONSE"),
                    "MessageType": "RESPONSE"
                },
                MessageDetails: {
                    "ResponseCode": "8000",
                    "Description": "Loan restructure request received and being processed"
                }
            }
        };

        const signedResponse = digitalSignature.createSignedXML(ackResponseData.Data);
        res.status(200).send(signedResponse);
        responseSent = true;
        logger.info('✅ Sent immediate ACK response for LOAN_RESTRUCTURE_REQUEST');

        // Step 2: Call MIFOS reschedule API
        logger.info('📞 Calling MIFOS reschedule API for loan:', loanMapping.mifosLoanId);

        const reschedulePayload = {
            dateFormat: "dd MMMM yyyy",
            locale: "en",
            rescheduleFromDate: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }),
            rescheduleReasonId: 1, // Reason: Customer request
            submittedOnDate: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }),
            adjustedDueDate: calculateAdjustedDueDate(tenure), // Calculate new due date based on tenure
            graceOnPrincipal: 0,
            graceOnInterest: 0,
            extraTerms: 0,
            newInterestRate: messageDetails.InterestRate || null,
            rescheduleReasonComment: `Loan restructure requested by customer. New tenure: ${tenure} months, New amount: ${requestedAmount}`
        };

        const rescheduleResponse = await maker.post(
            `/v1/loans/${loanMapping.mifosLoanId}/schedule`,
            reschedulePayload
        );

        logger.info('✅ MIFOS reschedule API response:', {
            resourceId: rescheduleResponse.data.resourceId,
            loanId: rescheduleResponse.data.loanId
        });

        // Update loan mapping with restructure info
        await LoanMappings.updateOne(
            { _id: loanMapping._id },
            {
                $set: {
                    restructureRequested: true,
                    restructureDate: new Date(),
                    newTenure: tenure,
                    newAmount: requestedAmount,
                    rescheduleId: rescheduleResponse.data.resourceId,
                    status: 'RESTRUCTURE_PENDING'
                }
            }
        );

        // Create audit log
        await AuditLog.create({
            eventType: 'LOAN_RESTRUCTURE_REQUESTED',
            messageType: 'LOAN_RESTRUCTURE_REQUEST',
            direction: 'incoming',
            requestData: data,
            status: 'processing',
            checkNumber,
            loanNumber: loanMapping.loanNumber,
            mifosLoanId: loanMapping.mifosLoanId,
            rescheduleId: rescheduleResponse.data.resourceId,
            requestedAmount,
            tenure
        });

        // Step 3: Schedule LOAN_INITIAL_APPROVAL_NOTIFICATION callback
        // This will be triggered by MIFOS webhook when reschedule is approved
        logger.info('⏰ Waiting for MIFOS webhook to trigger LOAN_INITIAL_APPROVAL_NOTIFICATION...');
        
        // Store callback details in loan mapping for webhook handler
        await LoanMappings.updateOne(
            { _id: loanMapping._id },
            {
                $set: {
                    pendingCallback: {
                        type: 'LOAN_INITIAL_APPROVAL_NOTIFICATION',
                        originalMessage: data,
                        scheduledAt: new Date()
                    }
                }
            }
        );

    } catch (error) {
        logger.error('❌ Error processing LOAN_RESTRUCTURE_REQUEST:', error);
        
        if (!responseSent) {
            // Send error response
            const errorResponseData = {
                Data: {
                    Header: {
                        "Sender": process.env.FSP_NAME || "ZE DONE",
                        "Receiver": "ESS_UTUMISHI",
                        "FSPCode": parsedData.Document.Data.Header.FSPCode,
                        "MsgId": getMessageId("RESPONSE"),
                        "MessageType": "RESPONSE"
                    },
                    MessageDetails: {
                        "ResponseCode": "8005",
                        "Description": `Loan restructure failed: ${error.message}`
                    }
                }
            };
            
            const signedErrorResponse = digitalSignature.createSignedXML(errorResponseData.Data);
            res.set('Content-Type', 'application/xml');
            res.status(200).send(signedErrorResponse);
        }
    }
};

/**
 * Calculate adjusted due date based on new tenure
 */
function calculateAdjustedDueDate(tenureMonths) {
    const today = new Date();
    const adjustedDate = new Date(today.setMonth(today.getMonth() + tenureMonths));
    return adjustedDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
}

module.exports = handleLoanRestructureRequest;
