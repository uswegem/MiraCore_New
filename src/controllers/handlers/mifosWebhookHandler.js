const logger = require('../../utils/logger');
const digitalSignature = require('../../utils/signatureUtils');
const axios = require('axios');
const LoanMappings = require('../../models/LoanMappings');
const { AuditLog } = require('../../models/AuditLog');
const { getMessageId } = require('../../utils/messageIdGenerator');

const handleMifosWebhook = async (req, res) => {
    try {
        logger.info('📥 MIFOS Webhook received:', {
            body: req.body,
            headers: req.headers
        });

        const webhookData = req.body;
        
        // Generate message ID
        const generateMessageId = () => `ESS${Date.now()}${Math.random().toString(36).substr(2, 9)}`;
        
        // Send immediate ACK
        const responseData = {
            Data: {
                Header: {
                    "Sender": process.env.FSP_NAME || "ZE DONE",
                    "Receiver": "MIFOS",
                    "FSPCode": process.env.FSP_CODE || "FL8090",
                    "MsgId": generateMessageId(),
                    "MessageType": "RESPONSE"
                },
                MessageDetails: {
                    "ResponseCode": "8000",
                    "Description": "Webhook received successfully"
                }
            }
        };
        const signedResponse = digitalSignature.createSignedXML(responseData.Data);
        res.status(200).send(signedResponse);

        // Process webhook asynchronously
        setImmediate(async () => {
            try {
                await processWebhookEvent(webhookData);
            } catch (error) {
                logger.error('Error processing webhook event:', error);
            }
        });

    } catch (error) {
        logger.error('Error in webhook handler:', error);
        res.status(500).json({ error: 'Webhook processing failed' });
    }
};

/**
 * Process MIFOS webhook events
 */
async function processWebhookEvent(webhookData) {
    const { entityName, actionName, entity } = webhookData;

    logger.info('Processing webhook event:', {
        entityName,
        actionName,
        entityId: entity?.id
    });

    // Handle loan reschedule approval
    if (entityName === 'RESCHEDULELOAN' && actionName === 'APPROVE') {
        await handleRescheduleApproval(webhookData);
    }
    // Handle loan disbursement
    else if (entityName === 'LOAN' && actionName === 'DISBURSE') {
        await handleLoanDisbursement(webhookData);
    }
    // Add other webhook event handlers as needed
}

/**
 * Handle reschedule approval webhook
 * Triggers LOAN_INITIAL_APPROVAL_NOTIFICATION callback
 */
async function handleRescheduleApproval(webhookData) {
    try {
        const rescheduleId = webhookData.entity?.id;
        const loanId = webhookData.entity?.loanId;

        logger.info('🎯 Reschedule approved:', {
            rescheduleId: rescheduleId,
            loanId: loanId
        });

        // Find loan mapping with this reschedule ID
        const loanMapping = await LoanMappings.findOne({
            rescheduleId: rescheduleId,
            'pendingCallback.type': 'LOAN_INITIAL_APPROVAL_NOTIFICATION'
        });

        if (!loanMapping) {
            logger.warn('No pending callback found for reschedule:', rescheduleId);
            return;
        }

        logger.info('Found loan mapping with pending callback:', {
            checkNumber: loanMapping.checkNumber,
            loanNumber: loanMapping.loanNumber,
            applicationNumber: loanMapping.applicationNumber
        });

        // Send LOAN_INITIAL_APPROVAL_NOTIFICATION callback
        await sendLoanInitialApprovalNotification(loanMapping);

        // Update loan mapping
        await LoanMappings.updateOne(
            { _id: loanMapping._id },
            {
                $set: {
                    status: 'RESTRUCTURE_APPROVED',
                    restructureApprovedDate: new Date()
                },
                $unset: {
                    pendingCallback: ""
                }
            }
        );

        // Create audit log
        await AuditLog.create({
            eventType: 'LOAN_RESTRUCTURE_APPROVED',
            messageType: 'MIFOS_WEBHOOK',
            direction: 'incoming',
            requestData: webhookData,
            status: 'success',
            checkNumber: loanMapping.checkNumber,
            loanNumber: loanMapping.loanNumber,
            mifosLoanId: loanId,
            rescheduleId: rescheduleId
        });

    } catch (error) {
        logger.error('Error handling reschedule approval:', error);
        throw error;
    }
}

/**
 * Send LOAN_INITIAL_APPROVAL_NOTIFICATION to ESS_UTUMISHI
 */
async function sendLoanInitialApprovalNotification(loanMapping) {
    try {
        const callbackUrl = process.env.ESS_CALLBACK_URL || 'http://localhost:3001/api/loan';
        
        const originalMessage = loanMapping.pendingCallback?.originalMessage || {};
        const header = originalMessage.Header || {};

        const notificationData = {
            Data: {
                Header: {
                    "Sender": process.env.FSP_NAME || "ZE DONE",
                    "Receiver": "ESS_UTUMISHI",
                    "FSPCode": header.FSPCode || process.env.FSP_CODE || "FL8090",
                    "MsgId": getMessageId("LOAN_INITIAL_APPROVAL_NOTIFICATION"),
                    "MessageType": "LOAN_INITIAL_APPROVAL_NOTIFICATION"
                },
                MessageDetails: {
                    "CheckNumber": loanMapping.checkNumber,
                    "LoanNumber": loanMapping.loanNumber,
                    "ApplicationNumber": loanMapping.applicationNumber,
                    "FSPCode": process.env.FSP_CODE || "FL8090",
                    "ApprovedAmount": loanMapping.newAmount?.toString() || loanMapping.approvedAmount?.toString() || "0",
                    "Tenure": loanMapping.newTenure?.toString() || loanMapping.tenure?.toString() || "0",
                    "MonthlyInstallment": loanMapping.monthlyInstallment?.toString() || "0",
                    "InterestRate": loanMapping.interestRate?.toString() || "24",
                    "ProcessingFee": loanMapping.processingFee?.toString() || "0",
                    "Insurance": loanMapping.insurance?.toString() || "0",
                    "ApprovalDate": new Date().toISOString().split('T')[0],
                    "DisbursementDate": new Date().toISOString().split('T')[0]
                }
            }
        };

        const signedXml = digitalSignature.createSignedXML(notificationData.Data);

        logger.info('📤 Sending LOAN_INITIAL_APPROVAL_NOTIFICATION callback:', {
            checkNumber: loanMapping.checkNumber,
            loanNumber: loanMapping.loanNumber,
            url: callbackUrl
        });

        const response = await axios.post(callbackUrl, signedXml, {
            headers: {
                'Content-Type': 'application/xml'
            },
            timeout: 30000
        });

        logger.info('✅ LOAN_INITIAL_APPROVAL_NOTIFICATION sent successfully:', {
            status: response.status,
            checkNumber: loanMapping.checkNumber
        });

        // Create audit log for sent notification
        await AuditLog.create({
            eventType: 'LOAN_INITIAL_APPROVAL_SENT',
            messageType: 'LOAN_INITIAL_APPROVAL_NOTIFICATION',
            direction: 'outgoing',
            requestData: notificationData.Data,
            responseData: response.data,
            status: 'success',
            checkNumber: loanMapping.checkNumber,
            loanNumber: loanMapping.loanNumber
        });

    } catch (error) {
        logger.error('❌ Error sending LOAN_INITIAL_APPROVAL_NOTIFICATION:', error);
        
        // Log failure
        await AuditLog.create({
            eventType: 'LOAN_INITIAL_APPROVAL_SEND_FAILED',
            messageType: 'LOAN_INITIAL_APPROVAL_NOTIFICATION',
            direction: 'outgoing',
            status: 'failed',
            errorMessage: error.message,
            checkNumber: loanMapping.checkNumber,
            loanNumber: loanMapping.loanNumber
        });
        
        throw error;
    }
}

/**
 * Handle loan disbursement webhook (optional - for future use)
 */
async function handleLoanDisbursement(webhookData) {
    logger.info('Loan disbursement webhook received:', webhookData.entity?.id);
    // Implement disbursement handling if needed
}

module.exports = handleMifosWebhook;