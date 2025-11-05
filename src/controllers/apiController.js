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
const { getMessageId } = require('../utils/messageIdGenerator');

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

// Helper function to calculate monthly installment
function calculateMonthlyInstallment(principal, annualRate, termMonths) {
    const monthlyRate = (annualRate / 100) / 12;
    const installment = principal * monthlyRate * Math.pow(1 + monthlyRate, termMonths) / 
                       (Math.pow(1 + monthlyRate, termMonths) - 1);
    return Math.ceil(installment); // Round up to nearest whole number
}

// Helper function to generate loan number
function generateLoanNumber() {
    const timestamp = Date.now().toString();
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `LOAN${timestamp}${random}`;
}

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
    const responseData = {
        Data: {
            Header: {
                "Sender": process.env.FSP_NAME || "ZE DONE",
                "Receiver": "ESS_UTUMISHI",
                "MessageType": "RESPONSE"
            },
            MessageDetails: {
                "Status": "SUCCESS",
                "StatusCode": "8000",
                "StatusDesc": "Webhook received successfully"
            }
        }
    };
    const signedResponse = digitalSignature.createSignedXML(responseData.Data);
    res.status(200).send(signedResponse);
};

const handleLoanChargesRequest = async (parsedData, res) => {
    try {
        console.log('Processing LOAN_CHARGES_REQUEST...');
        const header = parsedData.Document.Data.Header;
        const messageDetails = parsedData.Document.Data.MessageDetails;

        // Extract loan details from request
        const requestedAmount = parseFloat(messageDetails.RequestedAmount || messageDetails.LoanAmount);
        const requestedTenure = parseInt(messageDetails.RequestedTenure || messageDetails.Tenure || 12);
        const interestRate = 15.0; // 15% per annum

        // Calculate charges
        const totalProcessingFees = requestedAmount * 0.02; // 2% processing fee
        const totalInsurance = requestedAmount * 0.01; // 1% insurance
        const otherCharges = 50000; // Other charges (e.g., legal fees)
        
        // Calculate interest for the entire tenure
        const totalInterestRateAmount = (requestedAmount * interestRate * requestedTenure) / (12 * 100);
        
        // Net amount after deducting charges
        const desiredDeductibleAmount = totalProcessingFees + totalInsurance + otherCharges;
        const netLoanAmount = requestedAmount - desiredDeductibleAmount;
        
        // Total amount to pay back (principal + interest)
        const totalAmountToPay = requestedAmount + totalInterestRateAmount;
        
        // Monthly installment
        const monthlyReturnAmount = calculateMonthlyInstallment(requestedAmount, interestRate, requestedTenure);

        const responseData = {
            Data: {
                Header: {
                    "Sender": process.env.FSP_NAME || "ZE DONE",
                    "Receiver": "ESS_UTUMISHI",
                    "FSPCode": header.FSPCode,
                    "MsgId": getMessageId("LOAN_CHARGES_RESPONSE"),
                    "MessageType": "LOAN_CHARGES_RESPONSE"
                },
                MessageDetails: {
                    "DesiredDeductibleAmount": desiredDeductibleAmount,
                    "TotalInsurance": totalInsurance,
                    "TotalProcessingFees": totalProcessingFees,
                    "TotalInterestRateAmount": totalInterestRateAmount,
                    "OtherCharges": otherCharges,
                    "NetLoanAmount": netLoanAmount,
                    "TotalAmountToPay": totalAmountToPay,
                    "Tenure": requestedTenure,
                    "EligibleAmount": requestedAmount,
                    "MonthlyReturnAmount": monthlyReturnAmount
                }
            }
        };
        
        const signedResponse = digitalSignature.createSignedXML(responseData.Data);
        res.status(200).send(signedResponse);
    } catch (error) {
        console.error('Error processing loan charges request:', error);
        return sendErrorResponse(res, '8012', error.message, 'xml', parsedData);
    }
};

const handleLoanOfferRequest = async (parsedData, res) => {
    try {
        console.log('Processing LOAN_OFFER_REQUEST...');
        const header = parsedData.Document.Data.Header;
        const messageDetails = parsedData.Document.Data.MessageDetails;

        // Calculate loan offer immediately
        const loanOffer = {
            LoanAmount: messageDetails.RequestedAmount,
            InterestRate: 15.0, // 15% per annum
            Tenure: messageDetails.RequestedTenure || 12, // Default to 12 months
            MonthlyInstallment: calculateMonthlyInstallment(
                messageDetails.RequestedAmount,
                15.0,
                messageDetails.RequestedTenure || 12
            )
        };

        // Send LOAN_INITIAL_APPROVAL_NOTIFICATION immediately
        const responseData = {
            Data: {
                Header: {
                    "Sender": process.env.FSP_NAME || "ZE DONE",
                    "Receiver": "ESS_UTUMISHI",
                    "FSPCode": header.FSPCode,
                    "MsgId": getMessageId("LOAN_INITIAL_APPROVAL_NOTIFICATION"),
                    "MessageType": "LOAN_INITIAL_APPROVAL_NOTIFICATION"
                },
                MessageDetails: {
                    "ApplicationNumber": messageDetails.ApplicationNumber,
                    "FSPReferenceNumber": header.FSPReferenceNumber,
                    "ApprovedAmount": loanOffer.LoanAmount,
                    "ApprovedTenure": loanOffer.Tenure,
                    "InterestRate": loanOffer.InterestRate,
                    "MonthlyInstallment": loanOffer.MonthlyInstallment,
                    "Status": "APPROVED",
                    "StatusCode": "8000",
                    "StatusDesc": "Loan request approved"
                }
            }
        };

        // Sign and send the response
        const signedResponse = digitalSignature.createSignedXML(responseData.Data);
        res.status(200).send(signedResponse);

    } catch (error) {
        console.error('Error processing loan offer request:', error);
        return sendErrorResponse(res, '8012', error.message, 'xml', parsedData);
    }
};

const handleTopUpPayOffBalanceRequest = async (parsedData, res) => {
    // Implement top up pay off balance request
    console.log('Processing top up pay off balance request...');
    const header = parsedData.Document.Data.Header;
    const responseData = {
        Data: {
            Header: {
                "Sender": process.env.FSP_NAME || "ZE DONE",
                "Receiver": "ESS_UTUMISHI",
                "FSPCode": header.FSPCode,
                "MessageType": "RESPONSE"
            },
            MessageDetails: {
                "Status": "SUCCESS",
                "StatusCode": "8000",
                "StatusDesc": "Request received and being processed"
            }
        }
    };
    const signedResponse = digitalSignature.createSignedXML(responseData.Data);
    res.status(200).send(signedResponse);
};

const handleTopUpOfferRequest = async (parsedData, res) => {
    // Implement top up offer request
    console.log('Processing top up offer request...');
    const header = parsedData.Document.Data.Header;
    const responseData = {
        Data: {
            Header: {
                "Sender": process.env.FSP_NAME || "ZE DONE",
                "Receiver": "ESS_UTUMISHI",
                "FSPCode": header.FSPCode,
                "MessageType": "RESPONSE"
            },
            MessageDetails: {
                "Status": "SUCCESS",
                "StatusCode": "8000",
                "StatusDesc": "Request received and being processed"
            }
        }
    };
    const signedResponse = digitalSignature.createSignedXML(responseData.Data);
    res.status(200).send(signedResponse);
};

const handleTakeoverPayOffBalanceRequest = async (parsedData, res) => {
    // Implement takeover pay off balance request
    console.log('Processing takeover pay off balance request...');
    const header = parsedData.Document.Data.Header;
    const responseData = {
        Data: {
            Header: {
                "Sender": process.env.FSP_NAME || "ZE DONE",
                "Receiver": "ESS_UTUMISHI",
                "FSPCode": header.FSPCode,
                "MessageType": "RESPONSE"
            },
            MessageDetails: {
                "Status": "SUCCESS",
                "StatusCode": "8000",
                "StatusDesc": "Request received and being processed"
            }
        }
    };
    const signedResponse = digitalSignature.createSignedXML(responseData.Data);
    res.status(200).send(signedResponse);
};

const handleLoanTakeoverOfferRequest = async (parsedData, res) => {
    // Implement loan takeover offer request
    console.log('Processing loan takeover offer request...');
    const header = parsedData.Document.Data.Header;
    const responseData = {
        Data: {
            Header: {
                "Sender": process.env.FSP_NAME || "ZE DONE",
                "Receiver": "ESS_UTUMISHI",
                "FSPCode": header.FSPCode,
                "MessageType": "RESPONSE"
            },
            MessageDetails: {
                "Status": "SUCCESS",
                "StatusCode": "8000",
                "StatusDesc": "Request received and being processed"
            }
        }
    };
    const signedResponse = digitalSignature.createSignedXML(responseData.Data);
    res.status(200).send(signedResponse);
};

const handleTakeoverPaymentNotification = async (parsedData, res) => {
    // Implement takeover payment notification
    console.log('Processing takeover payment notification...');
    const header = parsedData.Document.Data.Header;
    const responseData = {
        Data: {
            Header: {
                "Sender": process.env.FSP_NAME || "ZE DONE",
                "Receiver": "ESS_UTUMISHI",
                "FSPCode": header.FSPCode,
                "MessageType": "RESPONSE"
            },
            MessageDetails: {
                "Status": "SUCCESS",
                "StatusCode": "8000",
                "StatusDesc": "Request received and being processed"
            }
        }
    };
    const signedResponse = digitalSignature.createSignedXML(responseData.Data);
    res.status(200).send(signedResponse);
};

const handleLoanCancellation = async (parsedData, res) => {
    // Implement loan cancellation
    console.log('Processing loan cancellation...');
    const header = parsedData.Document.Data.Header;
    const responseData = {
        Data: {
            Header: {
                "Sender": process.env.FSP_NAME || "ZE DONE",
                "Receiver": "ESS_UTUMISHI",
                "FSPCode": header.FSPCode,
                "MessageType": "RESPONSE"
            },
            MessageDetails: {
                "Status": "SUCCESS",
                "StatusCode": "8000",
                "StatusDesc": "Request received and being processed"
            }
        }
    };
    const signedResponse = digitalSignature.createSignedXML(responseData.Data);
    res.status(200).send(signedResponse);
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

        // Send immediate acknowledgment for LOAN_FINAL_APPROVAL_NOTIFICATION
        const responseData = {
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
                    "Description": "Success"
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