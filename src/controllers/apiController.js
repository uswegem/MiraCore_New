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

// Export all functions before they are used
exports.processRequest = async (req, res) => {
    const contentType = req.get('Content-Type');
    console.log('Processing request in AUTO-SIGNATURE mode');
    console.log('Content-Type:', contentType);
    console.log('Raw body type:', typeof req.body);
    console.log('Raw body:', req.body);

    try {
        let xmlData;
        let parsedData;

        if (contentType && contentType.includes('application/json')) {
            console.log('🔄 Converting JSON to XML...');
            if (!req.body || typeof req.body !== 'object') {
                return sendErrorResponse(res, '8001', 'Invalid JSON data', 'json', null);
            }
            xmlData = convertProductJSONToXML(req.body);
            try {
                parsedData = await parser.parseStringPromise(xmlData);
            } catch (parseError) {
                return sendErrorResponse(res, '8001', 'Failed to convert JSON to XML: ' + parseError.message, 'json', null);
            }
        } else if (contentType && (contentType.includes('application/xml') || contentType.includes('text/xml'))) {
            console.log('Processing XML directly...');
            xmlData = req.body;
            if (!xmlData) {
                return sendErrorResponse(res, '8001', 'XML data is required', 'xml', parsedData);
            }
            try {
                parsedData = await parser.parseStringPromise(xmlData);
                const debugSender = parsedData?.Document?.Data?.Header?.Sender;
                console.log('DEBUG: Parsed <Sender> from request:', debugSender);
                const TypeMessage = parsedData?.Document?.Data.Header?.MessageType;
                
                switch (TypeMessage) {
                    case 'LOAN_CHARGES_REQUEST':
                        return await handleLoanChargesRequest(parsedData, res);
                    case 'LOAN_OFFER_REQUEST':
                        return await handleLoanOfferRequest(parsedData, res);
                    case 'LOAN_FINAL_APPROVAL_NOTIFICATION':
                        return await handleLoanFinalApproval(parsedData, res);
                    case 'LOAN_CANCELLATION_NOTIFICATION':
                        return await handleLoanCancellation(parsedData, res);
                    case 'TOP_UP_PAY_0FF_BALANCE_REQUEST':
                        return await handleTopUpPayOffBalanceRequest(parsedData, res);
                    case 'TOP_UP_OFFER_REQUEST':
                        return await handleTopUpOfferRequest(parsedData, res);
                    case 'TAKEOVER_PAY_OFF_BALANCE_REQUEST':
                        return await handleTakeoverPayOffBalanceRequest(parsedData, res);
                    case 'LOAN_TAKEOVER_OFFER_REQUEST':
                        return await handleLoanTakeoverOfferRequest(parsedData, res);
                    case 'TAKEOVER_PAYMENT_NOTIFICATION':
                        return await handleTakeoverPaymentNotification(parsedData, res);
                    default:
                        return await forwardToESS(parsedData, res, contentType);
                }
            } catch (parseError) {
                return sendErrorResponse(res, '8001', 'Invalid XML format: ' + parseError.message, 'xml', parsedData);
            }
        } else {
            return sendErrorResponse(res, '8001', 'Unsupported Content-Type. Use application/json or application/xml', 'json', null);
        }
    } catch (error) {
        console.error('Controller error:', error);
        const contentType = req.get('Content-Type');
        return sendErrorResponse(res, '8011', 'Error processing request: ' + error.message, contentType.includes('json') ? 'json' : 'xml', null);
    }
};

const parser = new xml2js.Parser({
    explicitArray: false,
    mergeAttrs: true,
    normalize: true,
    trim: true
});

const builder = new xml2js.Builder({
    rootName: 'Document',
    renderOpts: { pretty: false }
});

// Main request processor
const processRequest = async (req, res) => {
    const contentType = req.get('Content-Type');
    console.log('Processing request in AUTO-SIGNATURE mode');
    console.log('Content-Type:', contentType);
    console.log('Raw body type:', typeof req.body);
    console.log('Raw body:', req.body);

    try {
        let xmlData;
        let parsedData;

        if (contentType && contentType.includes('application/json')) {
            console.log('🔄 Converting JSON to XML...');
            if (!req.body || typeof req.body !== 'object') {
                return sendErrorResponse(res, '8001', 'Invalid JSON data', 'json', null);
            }
            xmlData = convertProductJSONToXML(req.body);
            try {
                parsedData = await parser.parseStringPromise(xmlData);
            } catch (parseError) {
                return sendErrorResponse(res, '8001', 'Failed to convert JSON to XML: ' + parseError.message, 'json', null);
            }
        } else if (contentType && (contentType.includes('application/xml') || contentType.includes('text/xml'))) {
            console.log('Processing XML directly...');
            xmlData = req.body;
            if (!xmlData) {
                return sendErrorResponse(res, '8001', 'XML data is required', 'xml', parsedData);
            }
            try {
                parsedData = await parser.parseStringPromise(xmlData);
                const debugSender = parsedData?.Document?.Data?.Header?.Sender;
                console.log('DEBUG: Parsed <Sender> from request:', debugSender);
                const TypeMessage = parsedData?.Document?.Data.Header?.MessageType;
                
                switch (TypeMessage) {
                    case 'LOAN_CHARGES_REQUEST':
                        return await handleLoanChargesRequest(parsedData, res);
                    case 'LOAN_OFFER_REQUEST':
                        return await handleLoanOfferRequest(parsedData, res);
                    case 'LOAN_FINAL_APPROVAL_NOTIFICATION':
                        return await handleLoanFinalApproval(parsedData, res);
                    case 'LOAN_CANCELLATION_NOTIFICATION':
                        return await handleLoanCancellation(parsedData, res);
                    case 'TOP_UP_PAY_0FF_BALANCE_REQUEST':
                        return await handleTopUpPayOffBalanceRequest(parsedData, res);
                    case 'TOP_UP_OFFER_REQUEST':
                        return await handleTopUpOfferRequest(parsedData, res);
                    case 'TAKEOVER_PAY_OFF_BALANCE_REQUEST':
                        return await handleTakeoverPayOffBalanceRequest(parsedData, res);
                    case 'LOAN_TAKEOVER_OFFER_REQUEST':
                        return await handleLoanTakeoverOfferRequest(parsedData, res);
                    case 'TAKEOVER_PAYMENT_NOTIFICATION':
                        return await handleTakeoverPaymentNotification(parsedData, res);
                    default:
                        return await forwardToESS(parsedData, res, contentType);
                }
            } catch (parseError) {
                return sendErrorResponse(res, '8001', 'Invalid XML format: ' + parseError.message, 'xml', parsedData);
            }
        } else {
            return sendErrorResponse(res, '8001', 'Unsupported Content-Type. Use application/json or application/xml', 'json', null);
        }
    } catch (error) {
        console.error('Controller error:', error);
        const contentType = req.get('Content-Type');
        return sendErrorResponse(res, '8011', 'Error processing request: ' + error.message, contentType.includes('json') ? 'json' : 'xml', null);
    }
};

const handleMifosWebhook = async (req, res) => {
    // Implement webhook handling
    console.log('Processing Mifos webhook...');
    res.status(200).json({ status: 'received' });
};

const handleLoanChargesRequest = async (parsedData, res) => {
    // Implement loan charges request
    console.log('Processing loan charges request...');
    res.status(200).json({ status: 'processing' });
};

const handleLoanOfferRequest = async (parsedData, res) => {
    // Implement loan offer request
    console.log('Processing loan offer request...');
    res.status(200).json({ status: 'processing' });
};

const handleTopUpPayOffBalanceRequest = async (parsedData, res) => {
    // Implement top up pay off balance request
    console.log('Processing top up pay off balance request...');
    res.status(200).json({ status: 'processing' });
};

const handleTopUpOfferRequest = async (parsedData, res) => {
    // Implement top up offer request
    console.log('Processing top up offer request...');
    res.status(200).json({ status: 'processing' });
};

const handleTakeoverPayOffBalanceRequest = async (parsedData, res) => {
    // Implement takeover pay off balance request
    console.log('Processing takeover pay off balance request...');
    res.status(200).json({ status: 'processing' });
};

const handleLoanTakeoverOfferRequest = async (parsedData, res) => {
    // Implement loan takeover offer request
    console.log('Processing loan takeover offer request...');
    res.status(200).json({ status: 'processing' });
};

const handleTakeoverPaymentNotification = async (parsedData, res) => {
    // Implement takeover payment notification
    console.log('Processing takeover payment notification...');
    res.status(200).json({ status: 'processing' });
};

const handleLoanCancellation = async (parsedData, res) => {
    // Implement loan cancellation
    console.log('Processing loan cancellation...');
    res.status(200).json({ status: 'processing' });
};

const handleLoanFinalApproval = async (parsedData, res) => {
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
};

// Export each handler
exports.handleLoanFinalApproval = handleLoanFinalApproval;
exports.handleLoanOfferRequest = handleLoanOfferRequest;
exports.handleLoanChargesRequest = handleLoanChargesRequest;
exports.handleLoanCancellation = handleLoanCancellation;
exports.handleTopUpPayOffBalanceRequest = handleTopUpPayOffBalanceRequest;
exports.handleTopUpOfferRequest = handleTopUpOfferRequest;
exports.handleTakeoverPayOffBalanceRequest = handleTakeoverPayOffBalanceRequest;
exports.handleLoanTakeoverOfferRequest = handleLoanTakeoverOfferRequest;
exports.handleTakeoverPaymentNotification = handleTakeoverPaymentNotification;
exports.handleMifosWebhook = handleMifosWebhook;