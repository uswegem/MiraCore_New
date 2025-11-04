const xml2js = require('xml2js');
const { validateXML, validateMessageType } = require('../validations/xmlValidator');
const { forwardToThirdParty } = require('../services/thirdPartyService');
const digitalSignature = require('../utils/signatureUtils');
const { sendCallback } = require('../utils/callbackUtils');
const { sendErrorResponse } = require('../utils/responseUtils');
const { LoanCalculate, CreateTopUpLoanOffer, CreateTakeoverLoanOffer, CreateLoanOffer } = require('../services/loanService');
const LoanMappingService = require('../services/loanMappingService');
const cbsApi = require('../services/cbs.api');
const { formatDateForMifos } = require('../utils/dateUtils');
const { AuditLog } = require('../models/AuditLog');

/**
 * Handle LOAN_FINAL_APPROVAL_NOTIFICATION
 * This function processes the final loan approval notification and updates the loan status
 */
async function handleLoanFinalApproval(parsedData, res) {
    try {
        console.log('Processing LOAN_FINAL_APPROVAL_NOTIFICATION...');

        // Extract message details
        const messageDetails = parsedData.Document.Data.MessageDetails;
        const header = parsedData.Document.Data.Header;

        // Validate required fields
        if (!messageDetails.LoanNumber || !messageDetails.Approval || !messageDetails.ApplicationNumber) {
            throw new Error('Missing required fields: LoanNumber, Approval, and ApplicationNumber are required');
        }

        // Validate Approval value
        if (!['APPROVED', 'REJECTED'].includes(messageDetails.Approval)) {
            throw new Error('Invalid Approval value: Must be either "APPROVED" or "REJECTED"');
        }

        // Send immediate acknowledgment
        const responseData = {
            Data: {
                Header: {
                    "Sender": process.env.FSP_NAME || "ZE DONE",
                    "Receiver": "ESS_UTUMISHI",
                    "FSPCode": header.FSPCode,
                    "MsgId": `RESP_${Date.now()}`,
                    "MessageType": "RESPONSE"
                },
                MessageDetails: {
                    "ApplicationNumber": messageDetails.ApplicationNumber,
                    "LoanNumber": messageDetails.LoanNumber,
                    "FSPReferenceNumber": messageDetails.FSPReferenceNumber,
                    "Status": "SUCCESS",
                    "StatusCode": "8000",
                    "StatusDesc": "Request received successfully",
                    "Reason": "Notification is being processed"
                }
            }
        };

        // Send acknowledgment response
        const signedResponse = digitalSignature.createSignedXML(responseData.Data);
        res.status(200).send(signedResponse);

        // Process the request asynchronously
        setImmediate(async () => {
            try {
                // Create loan mapping data
                const loanMappingData = {
                    essLoanNumberAlias: messageDetails.LoanNumber,
                    fspReferenceNumber: messageDetails.FSPReferenceNumber || null,
                    status: messageDetails.Approval === 'APPROVED' ? 'FINAL_APPROVAL_RECEIVED' : 'REJECTED',
                    essApplicationNumber: messageDetails.ApplicationNumber,
                    reason: messageDetails.Reason || (messageDetails.Approval === 'REJECTED' ? 'Application rejected' : null),
                    finalApprovalReceivedAt: new Date().toISOString()
                };

                // Update loan mapping in database
                await LoanMappingService.updateLoanMapping(loanMappingData);

                if (messageDetails.Approval === 'APPROVED') {
                    // Prepare LOAN_DISBURSMENT_NOTIFICATION callback
                    const callbackData = {
                        Data: {
                            Header: {
                                "Sender": process.env.FSP_NAME || "ZE DONE",
                                "Receiver": "ESS_UTUMISHI",
                                "FSPCode": header.FSPCode,
                                "MsgId": `DISB_${Date.now()}`,
                                "MessageType": "LOAN_DISBURSMENT_NOTIFICATION"
                            },
                            MessageDetails: {
                                "ApplicationNumber": messageDetails.ApplicationNumber,
                                "LoanNumber": messageDetails.LoanNumber,
                                "FSPReferenceNumber": messageDetails.FSPReferenceNumber,
                                "DisbursementDate": new Date().toISOString(),
                                "DisbursementAmount": loanMappingData.requestedAmount,
                                "Status": "DISBURSED"
                            }
                        }
                    };

                    // Send callback notification
                    await sendCallback(callbackData);

                    // Update loan status to DISBURSED
                    await LoanMappingService.updateLoanMapping({
                        ...loanMappingData,
                        status: 'DISBURSED',
                        disbursedAt: new Date().toISOString()
                    });
                }
            } catch (error) {
                console.error('Error in async processing:', error);
                // Log the error but don't send response since we already sent acknowledgment
                await AuditLog.create({
                    eventType: 'LOAN_FINAL_APPROVAL_ERROR',
                    data: {
                        error: error.message,
                        loanNumber: messageDetails.LoanNumber,
                        applicationNumber: messageDetails.ApplicationNumber
                    }
                });
            }
        });

        // Create audit log for initial receipt
        await AuditLog.create({
            eventType: 'LOAN_FINAL_APPROVAL_RECEIVED',
            data: {
                loanNumber: messageDetails.LoanNumber,
                applicationNumber: messageDetails.ApplicationNumber,
                approval: messageDetails.Approval
            }
        });

    } catch (error) {
        console.error('Error processing loan final approval:', error);
        return sendErrorResponse(res, '8012', error.message, 'xml', parsedData);
    }
}

module.exports = {
    handleLoanFinalApproval,
    // other exports...
};