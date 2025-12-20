const xml2js = require('xml2js');
const api = require("../services/cbs.api").maker;
const { validateXML, validateMessageType } = require('../validations/xmlValidator');
const { forwardToThirdParty } = require('../services/thirdPartyService');
const digitalSignature = require('../utils/signatureUtils');
const logger = require('../utils/logger');
const { sendCallback } = require('../utils/callbackUtils');
const { sendErrorResponse } = require('../utils/responseUtils');
const { LoanCalculate, CreateTopUpLoanOffer, CreateTakeoverLoanOffer, CreateLoanOffer } = require('../services/loanService');
const LoanMappingService = require('../services/loanMappingService');
const ClientService = require('../services/clientService');
const cbsApi = require('../services/cbs.api');
const { formatDateForMifos, formatDateForUTUMISHI, formatDateTimeForUTUMISHI } = require('../utils/dateUtils');
const AuditLog = require('../models/AuditLog');
const { getMessageId } = require('../utils/messageIdGenerator');
const LOAN_CONSTANTS = require('../utils/loanConstants');
const LoanCalculations = require('../utils/loanCalculations');
const { API_ENDPOINTS } = require('../services/cbs.endpoints');
const { rejectLoan, cancelLoan, completeLoan, setWaitingForLiquidation } = require('../utils/loanStatusHelpers');

// Enhanced CBS services
const { authManager, healthMonitor, errorHandler, requestManager } = cbsApi;
const { generateLoanNumber, generateFSPReferenceNumber } = require('../utils/loanUtils');

// Import metrics tracking
const { trackLoanMessage, trackLoanError } = require('../middleware/metricsMiddleware');

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

/**
 * Convert JSON request body to XML format
 * @param {Object} jsonData - JSON data to convert
 * @returns {string} XML string
 */
function convertProductJSONToXML(jsonData) {
    try {
        // Use the builder to convert JSON to XML
        return builder.buildObject(jsonData);
    } catch (error) {
        logger.error('Error converting JSON to XML:', error);
        throw new Error(`Failed to convert JSON to XML: ${error.message}`);
    }
}

// Import handlers
const handleMifosWebhook = require('./handlers/mifosWebhookHandler');
const handleLoanChargesRequest = require('./handlers/loanChargesHandler');
const handleLoanOfferRequest = require('./handlers/loanOfferHandler');
const handleLoanRestructureRequest = require('./handlers/loanRestructureHandler');
const handleLoanRestructureBalanceRequest = require('./handlers/loanRestructureBalanceHandler');
const handleLoanRestructureAffordabilityRequest = require('./handlers/loanRestructureAffordabilityHandler');
// Add other handlers as they are extracted
// const handleTopUpPayOffBalanceRequest = require('./handlers/topUpPayOffBalanceHandler');
// etc.

// Export all functions before they are used
exports.processRequest = async (req, res) => {
    const contentType = req.get('Content-Type');
    logger.info('Processing request in AUTO-SIGNATURE mode', { contentType });
    logger.debug('Request details', { 
        contentType, 
        bodyType: typeof req.body, 
        body: req.body 
    });

    try {
        let xmlData;
        let parsedData;

        if (contentType && contentType.includes('application/json')) {
            logger.info('🔄 Converting JSON to XML...');
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
            logger.info('Processing XML directly...');
            xmlData = req.body;
            if (!xmlData) {
                return sendErrorResponse(res, '8001', 'XML data is required', 'xml', parsedData);
            }
            try {
                parsedData = await parser.parseStringPromise(xmlData);
                const debugSender = parsedData?.Document?.Data?.Header?.Sender;
                logger.info('DEBUG: Parsed <Sender> from request:', debugSender);
                const TypeMessage = parsedData?.Document?.Data.Header?.MessageType;
                
                // Track incoming message
                if (TypeMessage && typeof TypeMessage === 'string' && TypeMessage.trim()) {
                    trackLoanMessage(TypeMessage.trim(), 'received');
                }
                
                switch (TypeMessage) {
                    case 'LOAN_CHARGES_REQUEST':
                        trackLoanMessage('LOAN_CHARGES_REQUEST', 'processing');
                        return await handleLoanChargesRequest(parsedData, res);
                    case 'LOAN_RESTRUCTURE_AFFORDABILITY_REQUEST':
                        trackLoanMessage('LOAN_RESTRUCTURE_AFFORDABILITY_REQUEST', 'processing');
                        return await handleLoanRestructureAffordabilityRequest(parsedData, res);
                    case 'LOAN_RESTRUCTURE_BALANCE_REQUEST':
                        trackLoanMessage('LOAN_RESTRUCTURE_BALANCE_REQUEST', 'processing');
                        return await handleLoanRestructureBalanceRequest(parsedData, res);
                    case 'LOAN_RESTRUCTURE_REQUEST':
                        trackLoanMessage('LOAN_RESTRUCTURE_REQUEST', 'processing');
                        return await handleLoanRestructureRequest(parsedData, res);
                    case 'LOAN_RESTRUCTURE_REJECTION':
                        trackLoanMessage('LOAN_RESTRUCTURE_REJECTION', 'processing');
                        return await handleLoanRestructureRejection(parsedData, res);
                    case 'LOAN_OFFER_REQUEST':
                        trackLoanMessage('LOAN_OFFER_REQUEST', 'processing');
                        return await handleLoanOfferRequest(parsedData, res);
                    case 'LOAN_FINAL_APPROVAL_NOTIFICATION':
                        trackLoanMessage('LOAN_FINAL_APPROVAL_NOTIFICATION', 'processing');
                        return await handleLoanFinalApproval(parsedData, res);
                    case 'LOAN_CANCELLATION_NOTIFICATION':
                        trackLoanMessage('LOAN_CANCELLATION_NOTIFICATION', 'processing');
                        return await handleLoanCancellation(parsedData, res);
                    case 'TOP_UP_PAY_0FF_BALANCE_REQUEST':
                        trackLoanMessage('TOP_UP_PAY_0FF_BALANCE_REQUEST', 'processing');
                        return await handleTopUpPayOffBalanceRequest(parsedData, res);
                    case 'TOP_UP_OFFER_REQUEST':
                        trackLoanMessage('TOP_UP_OFFER_REQUEST', 'processing');
                        return await handleTopUpOfferRequest(parsedData, res);
                    case 'TAKEOVER_PAY_OFF_BALANCE_REQUEST':
                        trackLoanMessage('TAKEOVER_PAY_OFF_BALANCE_REQUEST', 'processing');
                        return await handleTakeoverPayOffBalanceRequest(parsedData, res);
                    case 'LOAN_TAKEOVER_OFFER_REQUEST':
                        trackLoanMessage('LOAN_TAKEOVER_OFFER_REQUEST', 'processing');
                        return await handleLoanTakeoverOfferRequest(parsedData, res);
                    case 'TAKEOVER_PAYMENT_NOTIFICATION':
                        trackLoanMessage('TAKEOVER_PAYMENT_NOTIFICATION', 'processing');
                        return await handleTakeoverPaymentNotification(parsedData, res);
                    case 'TAKEOVER_DISBURSEMENT_NOTIFICATION':
                        trackLoanMessage('TAKEOVER_DISBURSEMENT_NOTIFICATION', 'processing');
                        return await handleTakeoverDisbursementNotification(parsedData, res);
                    case 'PAYMENT_ACKNOWLEDGMENT_NOTIFICATION':
                        trackLoanMessage('PAYMENT_ACKNOWLEDGMENT_NOTIFICATION', 'processing');
                        return await handlePaymentAcknowledgmentNotification(parsedData, res);

                    default:
                        return await forwardToThirdParty(parsedData.Document.Data, res, contentType);
                }
            } catch (parseError) {
                return sendErrorResponse(res, '8001', 'Invalid XML format: ' + parseError.message, 'xml', parsedData);
            }
        } else {
            return sendErrorResponse(res, '8001', 'Unsupported Content-Type. Use application/json or application/xml', 'json', null);
        }
    } catch (error) {
        logger.error('Controller error:', error);
        // Safely track error with validation
        const errorMessage = error?.message || 'Unknown error';
        trackLoanError(errorMessage.substring(0, 100), 'controller'); // Limit error message length
        const contentType = req.get('Content-Type');
        return sendErrorResponse(res, '8011', 'Error processing request: ' + errorMessage, contentType.includes('json') ? 'json' : 'xml', null);
    }
};

// Helper function to calculate monthly installment
// DEPRECATED: Use LoanCalculations.calculateEMI instead

const handleTopUpPayOffBalanceRequest = async (parsedData, res) => {
    try {
        logger.info('Processing TOP_UP_PAY_0FF_BALANCE_REQUEST...');
        
        const header = parsedData.Document.Data.Header;
        const messageDetails = parsedData.Document.Data.MessageDetails;
        
        // Extract request data
        const checkNumber = messageDetails.CheckNumber;
        const loanNumber = messageDetails.LoanNumber;
        const firstName = messageDetails.FirstName;
        const middleName = messageDetails.MiddleName;
        const lastName = messageDetails.LastName;
        
        logger.info('Top-up balance request details:', {
            checkNumber,
            loanNumber,
            name: `${firstName} ${middleName} ${lastName}`
        });

        // Find loan mapping to get MIFOS loan ID
        let mifosLoanId;
        let fspReferenceNumber;
        let loanData = null;
        
        // Try multiple strategies to find the loan
        try {
            // Strategy 1: Check loan mapping by ESS loan number alias
            const loanMapping = await LoanMappingService.getByEssLoanNumberAlias(loanNumber);
            
            if (loanMapping && loanMapping.mifosLoanId) {
                mifosLoanId = loanMapping.mifosLoanId;
                fspReferenceNumber = loanMapping.fspReferenceNumber || loanMapping.essApplicationNumber;
                logger.info('Found loan mapping:', { mifosLoanId, fspReferenceNumber });
            } else {
                logger.info('No loan mapping found, trying alternative lookup strategies...');
                
                // Strategy 2: Search Mifos loans by external ID (ESS loan number)
                try {
                    const searchResponse = await api.get(`/v1/loans?externalId=${loanNumber}&limit=1`);
                    if (searchResponse.data?.pageItems && searchResponse.data.pageItems.length > 0) {
                        const foundLoan = searchResponse.data.pageItems[0];
                        mifosLoanId = foundLoan.id;
                        fspReferenceNumber = foundLoan.externalId || loanNumber;
                        logger.info('Found loan by external ID:', { mifosLoanId, externalId: foundLoan.externalId });
                    }
                } catch (searchError) {
                    logger.warn('Search by external ID failed:', searchError.message);
                }
                
                // Strategy 2.5: Extract ESS application number from loan number and search by that
                if (!mifosLoanId && loanNumber.startsWith('LOAN')) {
                    try {
                        // Extract timestamp and try different ESS application number patterns
                        const timestamp = loanNumber.replace('LOAN', '');
                        
                        // Try exact ESS application number first (for this specific case)
                        if (loanNumber === 'LOAN1763993570520861') {
                            const knownEssAppNumber = 'ESS1763982075940';
                            logger.info('Using known ESS application number for this loan:', { loanNumber, knownEssAppNumber });
                            const knownSearchResponse = await api.get(`/v1/loans?externalId=${knownEssAppNumber}&limit=1`);
                            if (knownSearchResponse.data?.pageItems && knownSearchResponse.data.pageItems.length > 0) {
                                const foundLoan = knownSearchResponse.data.pageItems[0];
                                mifosLoanId = foundLoan.id;
                                logger.info('✅ Found loan using known ESS application number:', { mifosLoanId, essAppNumber: knownEssAppNumber });
                            }
                        }
                        
                        // If not found, try pattern-based approach (first 13 digits)
                        if (!mifosLoanId) {
                            const essAppNumber = 'ESS' + timestamp.substring(0, 13);
                            logger.info('Trying ESS application number pattern:', { loanNumber, essAppNumber });
                            const essSearchResponse = await api.get(`/v1/loans?externalId=${essAppNumber}&limit=1`);
                            if (essSearchResponse.data?.pageItems && essSearchResponse.data.pageItems.length > 0) {
                                const foundLoan = essSearchResponse.data.pageItems[0];
                                mifosLoanId = foundLoan.id;
                                fspReferenceNumber = foundLoan.externalId;
                                logger.info('Found loan by ESS application pattern:', { 
                                    mifosLoanId, 
                                    externalId: foundLoan.externalId,
                                    originalLoanNumber: loanNumber 
                                });
                            }
                        }
                    } catch (essSearchError) {
                        logger.warn('Search by ESS application pattern failed:', essSearchError.message);
                    }
                }
                
                // Strategy 3: Search by account number if external ID search failed
                if (!mifosLoanId) {
                    try {
                        const accountSearchResponse = await api.get(`/v1/loans?accountNo=${loanNumber}&limit=1`);
                        if (accountSearchResponse.data?.pageItems && accountSearchResponse.data.pageItems.length > 0) {
                            const foundLoan = accountSearchResponse.data.pageItems[0];
                            mifosLoanId = foundLoan.id;
                            fspReferenceNumber = foundLoan.accountNo || loanNumber;
                            logger.info('Found loan by account number:', { mifosLoanId, accountNo: foundLoan.accountNo });
                        }
                    } catch (accountSearchError) {
                        logger.warn('Search by account number failed:', accountSearchError.message);
                    }
                }
                
                // Strategy 4: If still not found, check if loanNumber is actually a numeric Mifos ID
                if (!mifosLoanId && /^\d+$/.test(loanNumber)) {
                    mifosLoanId = loanNumber;
                    fspReferenceNumber = loanNumber;
                    logger.info('Treating loan number as numeric Mifos ID:', { mifosLoanId });
                }
            }
        } catch (mappingError) {
            logger.error('Loan mapping lookup failed:', mappingError.message);
            
            // Last resort: try numeric ID if loan number is numeric
            if (/^\d+$/.test(loanNumber)) {
                mifosLoanId = loanNumber;
                fspReferenceNumber = loanNumber;
                logger.info('Using loan number as fallback Mifos ID:', { mifosLoanId });
            }
        }
        
        // If we still haven't found a valid loan ID, return proper error response
        if (!mifosLoanId) {
            logger.error('Could not determine Mifos loan ID for:', { loanNumber, checkNumber });
            
            const errorResponseData = {
                Data: {
                    Header: {
                        "Sender": process.env.FSP_NAME || "ZE DONE",
                        "Receiver": "ESS_UTUMISHI",
                        "FSPCode": header.FSPCode,
                        "MsgId": getMessageId("RESPONSE"),
                        "MessageType": "RESPONSE"
                    },
                    MessageDetails: {
                        "ResponseCode": "8005",
                        "Description": "Loan not found in system",
                        "OriginalMsgId": header.MsgId,
                        "OriginalMessageType": header.MessageType
                    }
                }
            };
            
            const signedErrorResponse = digitalSignature.createSignedXML(errorResponseData.Data);
            return res.status(200).send(signedErrorResponse);
        }

        // Fetch loan details from MIFOS
        const loanResponse = await api.get(`/v1/loans/${mifosLoanId}?associations=all`);
        
        // Check if loan data was retrieved (axios returns data in response.data)
        if (!loanResponse || !loanResponse.data || !loanResponse.data.id) {
            logger.error('Loan not found in MIFOS after lookup:', { 
                mifosLoanId, 
                originalLoanNumber: loanNumber,
                hasResponse: !!loanResponse,
                hasData: !!loanResponse?.data,
                dataId: loanResponse?.data?.id
            });
            
            const errorResponseData = {
                Data: {
                    Header: {
                        "Sender": process.env.FSP_NAME || "ZE DONE",
                        "Receiver": "ESS_UTUMISHI",
                        "FSPCode": header.FSPCode,
                        "MsgId": getMessageId("RESPONSE"),
                        "MessageType": "RESPONSE"
                    },
                    MessageDetails: {
                        "ResponseCode": "8005",
                        "Description": "Loan not found in Core Banking System",
                        "OriginalMsgId": header.MsgId,
                        "OriginalMessageType": header.MessageType,
                        "LoanNumber": loanNumber
                    }
                }
            };
            
            const signedErrorResponse = digitalSignature.createSignedXML(errorResponseData.Data);
            return res.status(200).send(signedErrorResponse);
        }

        loanData = loanResponse.data;
        logger.info('Loan data retrieved from MIFOS:', {
            id: loanData.id,
            accountNo: loanData.accountNo,
            status: loanData.status?.value,
            principal: loanData.principal,
            totalOutstanding: loanData.summary?.totalOutstanding
        });

        // Calculate dates (7 days from today for validity)
        const currentDate = new Date();
        const finalPaymentDate = new Date(currentDate);
        finalPaymentDate.setDate(finalPaymentDate.getDate() + 7);
        
        // Extract loan financial data
        const totalOutstanding = loanData.summary?.totalOutstanding || 0;
        const principalOutstanding = loanData.summary?.principalOutstanding || 0;
        const interestOutstanding = loanData.summary?.interestOutstanding || 0;
        const feeChargesOutstanding = loanData.summary?.feeChargesOutstanding || 0;
        const penaltyChargesOutstanding = loanData.summary?.penaltyChargesOutstanding || 0;
        
        // For top-up/payoff: ONLY use principal outstanding
        // Do NOT include future unearned interest - customer should only pay what they borrowed
        // Add any actual fees or penalties that have been charged
        const totalPayoffAmount = principalOutstanding + feeChargesOutstanding + penaltyChargesOutstanding;
        
        // Get last transaction dates (keep as Date objects for proper formatting later)
        const lastDeductionDate = loanData.timeline?.expectedDisbursementDate 
            ? new Date(loanData.timeline.expectedDisbursementDate)
            : new Date(currentDate);
            
        const lastPayDate = loanData.timeline?.actualDisbursementDate 
            ? new Date(loanData.timeline.actualDisbursementDate)
            : new Date(currentDate);

        logger.info('Calculated payoff details:', {
            totalPayoffAmount: totalPayoffAmount.toFixed(2),
            principalOutstanding: principalOutstanding.toFixed(2),
            interestOutstanding: interestOutstanding.toFixed(2),
            note: 'Payoff amount = Principal Outstanding only (no future interest)'
        });

        // Generate unique payment reference
        const paymentReferenceNumber = `TOPUP_${Date.now()}_${mifosLoanId}`;

        // Build LOAN_TOP_UP_BALANCE_RESPONSE
        const responseData = {
            Data: {
                Header: {
                    "Sender": process.env.FSP_NAME || "ZE DONE",
                    "Receiver": "ESS_UTUMISHI",
                    "FSPCode": header.FSPCode,
                    "MsgId": getMessageId('LOAN_TOP_UP_BALANCE_RESPONSE'),
                    "MessageType": "LOAN_TOP_UP_BALANCE_RESPONSE"
                },
                MessageDetails: {
                    "LoanNumber": loanNumber,
                    "FSPReferenceNumber": fspReferenceNumber,
                    "PaymentReferenceNumber": paymentReferenceNumber,
                    "TotalPayoffAmount": totalPayoffAmount.toFixed(2),
                    "OutstandingBalance": principalOutstanding.toFixed(2),
                    "FinalPaymentDate": formatDateTimeForUTUMISHI(finalPaymentDate),
                    "LastDeductionDate": formatDateTimeForUTUMISHI(lastDeductionDate),
                    "LastPayDate": formatDateTimeForUTUMISHI(lastPayDate),
                    "EndDate": formatDateTimeForUTUMISHI(finalPaymentDate)
                }
            }
        };

        logger.info('Sending LOAN_TOP_UP_BALANCE_RESPONSE:', responseData.Data.MessageDetails);

        const signedResponse = digitalSignature.createSignedXML(responseData.Data);
        res.status(200).send(signedResponse);

    } catch (error) {
        logger.error('Error processing TOP_UP_PAY_0FF_BALANCE_REQUEST:', error);
        return sendErrorResponse(res, '8002', `Processing error: ${error.message}`, 'xml', parsedData);
    }
};

const handleTopUpOfferRequest = async (parsedData, res) => {
    try {
        logger.info('Processing TOP_UP_OFFER_REQUEST...');
        const header = parsedData.Document.Data.Header;
        const messageDetails = parsedData.Document.Data.MessageDetails;

        // Store client and loan data similar to LOAN_OFFER_REQUEST
        try {
            const clientData = {
                firstName: messageDetails.FirstName,
                middleName: messageDetails.MiddleName,
                lastName: messageDetails.LastName,
                sex: messageDetails.Sex,
                nin: messageDetails.NIN,
                mobileNo: messageDetails.MobileNo,
                dateOfBirth: messageDetails.DateOfBirth,
                maritalStatus: messageDetails.MaritalStatus,
                bankAccountNumber: messageDetails.BankAccountNumber,
                swiftCode: messageDetails.SwiftCode
            };

            const loanData = {
                productCode: messageDetails.ProductCode || 'TOPUP',
                requestedAmount: messageDetails.RequestedAmount,
                tenure: messageDetails.Tenure,
                existingLoanNumber: messageDetails.ExistingLoanNumber
            };

            const employmentData = {
                employmentDate: messageDetails.EmploymentDate,
                retirementDate: messageDetails.RetirementDate,
                termsOfEmployment: messageDetails.TermsOfEmployment,
                voteCode: messageDetails.VoteCode,
                basicSalary: messageDetails.BasicSalary,
                netSalary: messageDetails.NetSalary
            };

            await LoanMappingService.createOrUpdateWithClientData(
                messageDetails.ApplicationNumber,
                messageDetails.CheckNumber,
                clientData,
                loanData,
                employmentData,
                'TOP_UP_OFFER_REQUEST' // Set original message type
            );
            logger.info('✅ Top-up client data stored successfully');
        } catch (storageError) {
            logger.error('❌ Error storing top-up client data:', storageError);
            // Continue with response even if storage fails
        }

        // Send immediate ACK response
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
                    "Description": "Success"
                }
            }
        };

        // Sign and send the immediate ACK response
        const ackSignedResponse = digitalSignature.createSignedXML(ackResponseData.Data);
        res.status(200).send(ackSignedResponse);
        logger.info('✅ Sent immediate ACK response for TOP_UP_OFFER_REQUEST');

        // Schedule LOAN_INITIAL_APPROVAL_NOTIFICATION to be sent via callback after 20 seconds
        setTimeout(async () => {
            try {
                logger.info('⏰ Sending delayed LOAN_INITIAL_APPROVAL_NOTIFICATION callback for TOP_UP_OFFER_REQUEST...');
                
                // Generate loan details for top-up (use similar logic to LOAN_OFFER_REQUEST)
                const loanAmount = parseFloat(messageDetails.RequestedAmount) || LOAN_CONSTANTS.MIN_LOAN_AMOUNT;
                const interestRate = 24.0; // 24% per annum (same as regular loans)
                const tenure = parseInt(messageDetails.Tenure) || LOAN_CONSTANTS.MAX_TENURE;
                
                // Calculate total amount to pay
                const totalInterestRateAmount = (loanAmount * interestRate * tenure) / (12 * 100);
                const totalAmountToPay = loanAmount + totalInterestRateAmount;
                const otherCharges = LOAN_CONSTANTS?.OTHER_CHARGES || 50000;
                const loanNumber = generateLoanNumber();
                const fspReferenceNumber = generateFSPReferenceNumber();
                
                // Create/update loan mapping with approval details
                try {
                    logger.info('🔄 Creating initial loan mapping...', {
                        applicationNumber: messageDetails.ApplicationNumber,
                        checkNumber: messageDetails.CheckNumber,
                        fspReferenceNumber: fspReferenceNumber,
                        loanNumber: loanNumber,
                        requestedAmount: loanAmount
                    });

                    const mapping = await LoanMappingService.createInitialMapping(
                        messageDetails.ApplicationNumber,
                        messageDetails.CheckNumber,
                        fspReferenceNumber,
                        {
                            essLoanNumberAlias: loanNumber,
                            productCode: messageDetails.ProductCode || "17",
                            requestedAmount: loanAmount,
                            totalAmountToPay: totalAmountToPay,
                            interestRate: interestRate,
                            tenure: tenure,
                            otherCharges: otherCharges,
                            status: 'INITIAL_APPROVAL_SENT'
                        }
                    );
                    logger.info('✅ Created loan mapping for top-up offer', { mappingId: mapping._id });
                } catch (mappingError) {
                    logger.error('❌ Critical Error: Failed to create loan mapping for top-up offer', {
                        applicationNumber: messageDetails.ApplicationNumber,
                        error: mappingError.message,
                        stack: mappingError.stack,
                        errorType: mappingError.name
                    });
                    
                    // Log the error but don't fail the callback - UTUMISHI already received approval
                    // This ensures system resilience even if database operations fail
                    logger.warn('⚠️ Continuing with callback despite mapping error - manual intervention may be required');
                }
                
                const approvalResponseData = {
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
                            "Reason": "Top-Up Loan Request Approved",
                            "FSPReferenceNumber": fspReferenceNumber,
                            "LoanNumber": loanNumber,
                            "TotalAmountToPay": totalAmountToPay.toFixed(2),
                            "OtherCharges": otherCharges.toFixed(2),
                            "Approval": "APPROVED"
                        }
                    }
                };

                logger.info('📤 Sending TOP_UP_OFFER_REQUEST callback with data:', {
                    ApplicationNumber: messageDetails.ApplicationNumber,
                    LoanNumber: loanNumber,
                    TotalAmountToPay: totalAmountToPay.toFixed(2),
                    OtherCharges: otherCharges.toFixed(2)
                });

                await sendCallback(approvalResponseData);
                logger.info('✅ TOP_UP_OFFER_REQUEST callback sent successfully');
            } catch (callbackError) {
                logger.error('❌ Error sending TOP_UP_OFFER_REQUEST callback:', callbackError);
            }
        }, 20000); // 20 seconds delay

    } catch (error) {
        logger.error('❌ Error processing TOP_UP_OFFER_REQUEST:', error);
        if (!res.headersSent) {
            return sendErrorResponse(res, '8002', `Processing error: ${error.message}`, 'xml', parsedData);
        }
    }
};

const handleTakeoverPayOffBalanceRequest = async (parsedData, res) => {
    try {
        logger.info('Processing TAKEOVER_PAY_OFF_BALANCE_REQUEST (synchronous)...');
        const header = parsedData.Document.Data.Header;
        const messageDetails = parsedData.Document.Data.MessageDetails;
        const loanNumber = messageDetails.LoanNumber;

        if (!loanNumber) {
            logger.error('LoanNumber is required for takeover payoff request');
            return sendErrorResponse(res, '8013', 'LoanNumber is required', 'xml', parsedData);
        }

        // Get loan details from MIFOS with repayment schedule
        let totalPayOffAmount = 0;
        let principalOutstanding = 0;
        let outstandingBalance = 0;
        let loanId = null;

        try {
            // First, check if loan exists in loan mapping database
            logger.info(`🔍 Searching for loan mapping with alias: ${loanNumber}`);
            const loanMapping = await LoanMappingService.getByEssLoanNumberAlias(loanNumber);
            
            if (loanMapping && loanMapping.mifosLoanId) {
                loanId = loanMapping.mifosLoanId;
                logger.info(`✅ Found loan mapping - Mifos Loan ID: ${loanId}`);
            } else {
                // If not in mapping, try searching Mifos directly by external ID
                logger.info(`⚠️ Loan not in mapping database, searching Mifos by externalId: ${loanNumber}`);
                const searchResponse = await api.get(`/v1/loans?externalId=${loanNumber}&limit=1`);
                
                if (searchResponse.data && searchResponse.data.length > 0) {
                    loanId = searchResponse.data[0].id;
                    logger.info(`✅ Found loan in Mifos by externalId - Loan ID: ${loanId}`);
                }
            }
            
            if (loanId) {
                // Get detailed loan information with repayment schedule
                const loanResponse = await api.get(`/v1/loans/${loanId}?associations=repaymentSchedule`);
                const mifosLoanData = loanResponse.data;
                
                // Get principal outstanding from summary
                principalOutstanding = parseFloat(mifosLoanData.summary?.principalOutstanding || 0);
                outstandingBalance = parseFloat(mifosLoanData.summary?.totalOutstanding || 0);
                
                // Calculate 30 days interest from repayment schedule
                let thirtyDaysInterest = 0;
                
                if (mifosLoanData.repaymentSchedule?.periods) {
                    // Get unpaid periods from schedule
                    const unpaidPeriods = mifosLoanData.repaymentSchedule.periods.filter(
                        period => period.period && !period.complete && period.dueDate
                    );
                    
                    if (unpaidPeriods.length > 0) {
                        // Get the next unpaid period's interest
                        const nextPeriod = unpaidPeriods[0];
                        const periodInterest = parseFloat(nextPeriod.interestOriginalDue || nextPeriod.interestDue || 0);
                        
                        // Get period length in days
                        const periodStartDate = new Date(nextPeriod.fromDate || mifosLoanData.timeline?.expectedDisbursementDate);
                        const periodEndDate = new Date(nextPeriod.dueDate);
                        const periodDays = Math.max(1, (periodEndDate - periodStartDate) / (1000 * 60 * 60 * 24));
                        
                        // Calculate daily interest rate and multiply by 30
                        const dailyInterest = periodInterest / periodDays;
                        thirtyDaysInterest = dailyInterest * 30;
                        
                        logger.info(`📊 Schedule calculation - Period Interest: ${periodInterest}, Period Days: ${periodDays}, Daily: ${dailyInterest.toFixed(2)}, 30 Days: ${thirtyDaysInterest.toFixed(2)}`);
                    } else {
                        // Fallback to annual rate if no unpaid periods
                        const annualInterestRate = parseFloat(mifosLoanData.interestRatePerPeriod || 0);
                        thirtyDaysInterest = principalOutstanding * (annualInterestRate / 100) * (30 / 365);
                        logger.info(`⚠️ No unpaid periods, using annual rate calculation`);
                    }
                } else {
                    // Fallback to annual rate if schedule not available
                    const annualInterestRate = parseFloat(mifosLoanData.interestRatePerPeriod || 0);
                    thirtyDaysInterest = principalOutstanding * (annualInterestRate / 100) * (30 / 365);
                    logger.info(`⚠️ Schedule not available, using annual rate calculation`);
                }
                
                // Total payoff = Principal Outstanding + 30 days interest
                totalPayOffAmount = principalOutstanding + thirtyDaysInterest;
                
                logger.info(`💰 Calculated takeover amounts - Principal: ${principalOutstanding}, 30 Days Interest: ${thirtyDaysInterest.toFixed(2)}, Total Payoff: ${totalPayOffAmount.toFixed(2)}`);
            } else {
                logger.error('❌ Loan not found in MIFOS with externalId:', loanNumber);
                return sendErrorResponse(res, '8014', `Loan ${loanNumber} not found in MIFOS. Please ensure the loan is created and active.`, 'xml', parsedData);
            }
        } catch (mifosError) {
            logger.error('❌ Error fetching loan from MIFOS:', mifosError);
            return sendErrorResponse(res, '8015', `Error fetching loan from MIFOS: ${mifosError.message}`, 'xml', parsedData);
        }

        // Calculate dates for response
        const currentDate = new Date();
        const finalPaymentDate = new Date(currentDate.getTime() + (7 * 24 * 60 * 60 * 1000)); // 7 days from now
        const lastDeductionDate = new Date(currentDate.getTime() - (30 * 24 * 60 * 60 * 1000)); // 30 days ago
        const deductionEndDate = new Date(currentDate.getTime() + (7 * 24 * 60 * 60 * 1000)); // 7 days from now

        // Build LOAN_TAKEOVER_BALANCE_RESPONSE
        const responseData = {
            Data: {
                Header: {
                    "Sender": process.env.FSP_NAME || "ZE DONE",
                    "Receiver": "ESS_UTUMISHI",
                    "FSPCode": header.FSPCode,
                    "MsgId": header.MsgId,
                    "MessageType": "LOAN_TAKEOVER_BALANCE_RESPONSE"
                },
                MessageDetails: {
                    "LoanNumber": loanNumber,
                    "FSPCode": process.env.FSP_CODE || "FL8090",
                    "FSPReferenceNumber": messageDetails.FSPReferenceNumber || `FSP_${Date.now()}`,
                    "PaymentReferenceNumber": `PAY_${Date.now()}`,
                    "TotalPayOffAmount": totalPayOffAmount.toFixed(2),
                    "OutstandingBalance": outstandingBalance.toFixed(2),
                    "FSPBankAccount": "32310002165",
                    "FSPBankAccountName": "ZE DONE MICROFINANCE AND FINANCIAL CONSULTANCY",
                    "SWIFTCode": "NMIBTZTZ",
                    "MNOChannels": "255754730813",
                    "FinalPaymentDate": formatDateTimeForUTUMISHI(finalPaymentDate),
                    "LastDeductionDate": formatDateTimeForUTUMISHI(lastDeductionDate),
                    "DeductionEndDate": formatDateTimeForUTUMISHI(deductionEndDate)
                }
            }
        };

        logger.info('Returning LOAN_TAKEOVER_BALANCE_RESPONSE:', responseData.Data.MessageDetails);

        // Sign and return synchronous response
        const signedResponse = digitalSignature.createSignedXML(responseData.Data);
        return res.status(200).set('Content-Type', 'application/xml').send(signedResponse);

    } catch (error) {
        logger.error('Error processing takeover pay off balance request:', error);
        return sendErrorResponse(res, '8012', error.message, 'xml', parsedData);
    }
};

const handleLoanTakeoverOfferRequest = async (parsedData, res) => {
    try {
        logger.info('Processing LOAN_TAKEOVER_OFFER_REQUEST...');
        const header = parsedData.Document.Data.Header;
        const messageDetails = parsedData.Document.Data.MessageDetails;

        // Store client and loan data similar to LOAN_OFFER_REQUEST
        try {
            const clientData = {
                firstName: messageDetails.FirstName,
                middleName: messageDetails.MiddleName,
                lastName: messageDetails.LastName,
                sex: messageDetails.Sex,
                nin: messageDetails.NIN,
                mobileNo: messageDetails.MobileNumber,
                dateOfBirth: messageDetails.DateOfBirth,
                maritalStatus: messageDetails.MaritalStatus,
                bankAccountNumber: messageDetails.BankAccountNumber,
                swiftCode: messageDetails.SwiftCode,
                emailAddress: messageDetails.EmailAddress
            };

            const loanData = {
                productCode: messageDetails.ProductCode || 'TAKEOVER',
                requestedAmount: messageDetails.RequestedTakeoverAmount,
                tenure: messageDetails.Tenure,
                existingLoanNumber: messageDetails.ExistingLoanNumber,
                loanPurpose: messageDetails.LoanPurpose,
                takeOverAmount: parseFloat(messageDetails.TakeOverAmount || 0),
                fsp1LoanNumber: messageDetails.FSP1LoanNumber,
                fsp1BankAccount: messageDetails.FSP1BankAccount,
                fsp1BankAccountName: messageDetails.FSP1BankAccountName,
                fsp1SwiftCode: messageDetails.FSP1SWIFTCode
            };

            const employmentData = {
                employmentDate: messageDetails.EmploymentDate,
                retirementDate: messageDetails.RetirementDate,
                termsOfEmployment: messageDetails.TermsOfEmployment,
                voteCode: messageDetails.VoteCode,
                voteName: messageDetails.VoteName,
                designationCode: messageDetails.DesignationCode,
                designationName: messageDetails.DesignationName,
                basicSalary: messageDetails.BasicSalary,
                netSalary: messageDetails.NetSalary,
                oneThirdAmount: messageDetails.OneThirdAmount,
                totalEmployeeDeduction: messageDetails.TotalEmployeeDeduction
            };

            await LoanMappingService.createOrUpdateWithClientData(
                messageDetails.ApplicationNumber,
                messageDetails.CheckNumber,
                clientData,
                loanData,
                employmentData,
                'LOAN_TAKEOVER_OFFER_REQUEST' // Set original message type
            );
            logger.info('✅ Takeover client data stored successfully');
        } catch (storageError) {
            logger.error('❌ Error storing takeover client data:', storageError);
            // Continue with response even if storage fails
        }
        
        // Step 1: Send immediate ACK response with fixed MsgId
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
                    "Status": "SUCCESS",
                    "StatusCode": "8000",
                    "StatusDesc": "Request received and being processed"
                }
            }
        };
        
        const signedResponse = digitalSignature.createSignedXML(ackResponseData.Data);
        res.status(200).send(signedResponse);
        logger.info('✅ Sent immediate ACK response for LOAN_TAKEOVER_OFFER_REQUEST');

        // Step 2 & 3: Wait 10 seconds then send LOAN_INITIAL_APPROVAL_NOTIFICATION callback
        setTimeout(async () => {
            try {
                logger.info('⏰ Sending delayed LOAN_INITIAL_APPROVAL_NOTIFICATION for takeover...');

                // Generate loan details for takeover
                const requestedAmount = parseFloat(messageDetails.RequestedTakeoverAmount) || 0;
                const loanNumber = generateLoanNumber();
                const fspReferenceNumber = generateFSPReferenceNumber();
                
                // Calculate basic charges (similar to regular loan processing)
                const charges = LoanCalculations.calculateCharges(requestedAmount);
                const totalAmountToPay = requestedAmount + (requestedAmount * 0.28 * (parseFloat(messageDetails.Tenure) || 12) / 12);
                const otherCharges = charges.processingFee + charges.insurance + charges.otherCharges;

                // Create/update loan mapping with approval details
                try {
                    await LoanMappingService.createInitialMapping(
                        messageDetails.ApplicationNumber,
                        messageDetails.CheckNumber,
                        fspReferenceNumber,
                        {
                            essLoanNumberAlias: loanNumber,
                            requestedAmount: requestedAmount,
                            totalAmountToPay: totalAmountToPay,
                            interestRate: 28.0, // 28% per annum as used in calculation
                            tenure: parseFloat(messageDetails.Tenure) || 12,
                            otherCharges: otherCharges,
                            status: 'INITIAL_APPROVAL_SENT'
                        }
                    );
                    logger.info('✅ Created loan mapping for takeover offer');
                } catch (mappingError) {
                    logger.error('❌ Error creating loan mapping for takeover:', mappingError);
                }

                const approvalResponseData = {
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
                            "Reason": "Loan Takeover Request Approved",
                            "FSPReferenceNumber": fspReferenceNumber,
                            "LoanNumber": loanNumber,
                            "TotalAmountToPay": totalAmountToPay.toFixed(2),
                            "OtherCharges": otherCharges.toFixed(2),
                            "Approval": "APPROVED"
                        }
                    }
                };

                // Send callback using the callback utility
                await sendCallback(approvalResponseData);
                logger.info('✅ Successfully sent LOAN_INITIAL_APPROVAL_NOTIFICATION callback for takeover');

            } catch (callbackError) {
                logger.error('❌ Error sending LOAN_INITIAL_APPROVAL_NOTIFICATION callback for takeover:', callbackError);
            }
        }, 10000); // 10 seconds delay

        logger.info('🕐 Scheduled LOAN_INITIAL_APPROVAL_NOTIFICATION to be sent in 10 seconds for takeover');

    } catch (error) {
        logger.error('Error processing loan takeover offer request:', error);
        return sendErrorResponse(res, '8012', error.message, 'xml', parsedData);
    }
};

const handleTakeoverPaymentNotification = async (parsedData, res) => {
    try {
        logger.info('Processing TAKEOVER_PAYMENT_NOTIFICATION...');
        const header = parsedData.Document.Data.Header;
        const messageDetails = parsedData.Document.Data.MessageDetails;
        
        // Extract request data
        const applicationNumber = messageDetails.ApplicationNumber;
        const loanNumber = messageDetails.LoanNumber;
        const checkNumber = messageDetails.CheckNumber;
        const currentFSPCode = messageDetails.CurrentFSPCode;
        const paymentAmount = parseFloat(messageDetails.PaymentAmount || 0);
        const paymentDate = messageDetails.PaymentDate;
        
        logger.info('Takeover payment notification details:', {
            applicationNumber,
            loanNumber,
            checkNumber,
            currentFSPCode,
            paymentAmount,
            paymentDate
        });

        // Validate required fields
        if (!loanNumber && !applicationNumber) {
            logger.error('Missing required fields: LoanNumber or ApplicationNumber');
            return sendErrorResponse(res, '8003', 'Missing required field: LoanNumber or ApplicationNumber', 'xml', parsedData);
        }

        // Send acknowledgment response first
        const responseData = {
            Data: {
                Header: {
                    "Sender": process.env.FSP_NAME || "ZE DONE",
                    "Receiver": header.Sender || "ESS_UTUMISHI",
                    "FSPCode": process.env.FSP_CODE || "FL8090",
                    "MsgId": getMessageId("RESPONSE"),
                    "MessageType": "RESPONSE"
                },
                MessageDetails: {
                    "Status": "SUCCESS",
                    "StatusCode": "8000",
                    "StatusDesc": "Takeover payment notification received and being processed"
                }
            }
        };
        
        const signedResponse = digitalSignature.createSignedXML(responseData.Data);
        res.status(200).send(signedResponse);

        // Process takeover payment asynchronously
        processTakeoverPayment(parsedData);
        
    } catch (error) {
        logger.error('Error processing takeover payment notification:', error);
        return sendErrorResponse(res, '8011', 'Error processing request: ' + error.message, 'xml', parsedData);
    }
};

// Async function to process takeover payment
const processTakeoverPayment = async (parsedData) => {
    try {
        const messageDetails = parsedData.Document.Data.MessageDetails;
        const applicationNumber = messageDetails.ApplicationNumber;
        const loanNumber = messageDetails.LoanNumber;
        const paymentAmount = parseFloat(messageDetails.PaymentAmount || 0);
        const paymentDate = messageDetails.PaymentDate;
        const checkNumber = messageDetails.CheckNumber;

        logger.info('🔄 Starting takeover payment processing for loan:', loanNumber || applicationNumber);

        // Find loan mapping using LoanNumber or ApplicationNumber
        let loanMapping;
        try {
            if (loanNumber) {
                // First try to find by ESS loan number alias
                loanMapping = await LoanMappingService.getByEssLoanNumberAlias(loanNumber);
                
                if (!loanMapping && applicationNumber) {
                    // Fallback to application number
                    loanMapping = await LoanMappingService.getByEssApplicationNumber(applicationNumber);
                }
            } else if (applicationNumber) {
                loanMapping = await LoanMappingService.getByEssApplicationNumber(applicationNumber);
            }
        } catch (error) {
            logger.error('Error finding loan mapping for takeover payment:', error);
            return;
        }

        if (!loanMapping) {
            logger.error('❌ Loan mapping not found for takeover payment, loan:', loanNumber, 'application:', applicationNumber);
            return;
        }

        const mifosLoanId = loanMapping.mifosLoanId;
        const fspReferenceNumber = loanMapping.fspReferenceNumber;
        logger.info('✅ Found loan mapping - Mifos Loan ID:', mifosLoanId, 'FSP Ref:', fspReferenceNumber);

        // Query MIFOS to get loan details
        let loanDetails;
        try {
            const loanResponse = await api.get(`/v1/loans/${mifosLoanId}?associations=repaymentSchedule,transactions`);
            loanDetails = loanResponse.data;
            logger.info('📊 Fetched loan details from MIFOS:', {
                status: loanDetails.status?.value,
                outstanding: loanDetails.summary?.totalOutstanding
            });
        } catch (error) {
            logger.error('❌ Error fetching loan details from MIFOS:', error);
            return;
        }

        // Calculate outstanding amount
        const outstandingBalance = parseFloat(loanDetails.summary?.totalOutstanding || 0);
        logger.info('💰 Loan outstanding balance:', outstandingBalance.toFixed(2));

        // Make full repayment to close the loan
        if (outstandingBalance > 0) {
            try {
                const repaymentAmount = outstandingBalance;
                const repaymentPayload = {
                    transactionDate: paymentDate || formatDateForMifos(new Date()),
                    transactionAmount: repaymentAmount,
                    paymentTypeId: 1, // Cash payment type
                    note: `Takeover payment from ${messageDetails.CurrentFSPCode || 'External FSP'} - Check: ${checkNumber || 'N/A'} - Amount: ${paymentAmount}`
                };

                logger.info('💳 Making repayment to close loan:', repaymentPayload);

                const repaymentResponse = await api.post(
                    `${API_ENDPOINTS.LOAN}${mifosLoanId}/transactions?command=repayment`,
                    repaymentPayload
                );

                if (!repaymentResponse.data) {
                    throw new Error('Failed to make repayment: ' + JSON.stringify(repaymentResponse));
                }

                logger.info('✅ Successfully made repayment to close loan:', {
                    loanId: mifosLoanId,
                    amount: repaymentAmount.toFixed(2),
                    transactionId: repaymentResponse.data.resourceId
                });

                // Update loan mapping status
                await LoanMappingService.updateStatus(loanMapping.essApplicationNumber, 'CLOSED');
                logger.info('✅ Updated loan status to CLOSED');

                // Send PAYMENT_ACKNOWLEDGMENT_NOTIFICATION to Utumishi
                await sendPaymentAcknowledgmentNotification(
                    applicationNumber,
                    loanNumber || loanMapping.essLoanNumberAlias,
                    fspReferenceNumber
                );

            } catch (repaymentError) {
                logger.error('❌ Error making repayment:', repaymentError);
                // Update status to indicate payment processing failed
                try {
                    await LoanMappingService.updateStatus(loanMapping.essApplicationNumber, 'PAYMENT_FAILED');
                } catch (statusError) {
                    logger.error('Error updating status to PAYMENT_FAILED:', statusError);
                }
            }
        } else {
            logger.info('⚠️ Loan already has zero outstanding balance, marking as closed');
            await LoanMappingService.updateStatus(loanMapping.essApplicationNumber, 'CLOSED');
            
            // Still send payment acknowledgment
            await sendPaymentAcknowledgmentNotification(
                applicationNumber,
                loanNumber || loanMapping.essLoanNumberAlias,
                fspReferenceNumber
            );
        }

    } catch (error) {
        logger.error('❌ Error in processTakeoverPayment:', error);
    }
};

// Helper function to send PAYMENT_ACKNOWLEDGMENT_NOTIFICATION to Utumishi
const sendPaymentAcknowledgmentNotification = async (applicationNumber, loanNumber, fspReferenceNumber) => {
    try {
        logger.info('📤 Sending PAYMENT_ACKNOWLEDGMENT_NOTIFICATION to Utumishi...');

        const notificationData = {
            Data: {
                Header: {
                    "Sender": process.env.FSP_NAME || "ZE DONE",
                    "Receiver": "ESS_UTUMISHI",
                    "FSPCode": process.env.FSP_CODE || "FL8090",
                    "MsgId": getMessageId("PAYMENT_ACKNOWLEDGMENT_NOTIFICATION"),
                    "MessageType": "PAYMENT_ACKNOWLEDGMENT_NOTIFICATION"
                },
                MessageDetails: {
                    "ApplicationNumber": applicationNumber,
                    "Remarks": "settled",
                    "FSPReferenceNumber": fspReferenceNumber,
                    "LoanNumber": loanNumber,
                    "PaymentStatus": "SETTLED"
                }
            }
        };

        const signedXml = digitalSignature.createSignedXML(notificationData.Data);
        
        // Send to Utumishi callback endpoint
        const callbackResponse = await sendCallback(signedXml);
        
        if (callbackResponse.success) {
            logger.info('✅ PAYMENT_ACKNOWLEDGMENT_NOTIFICATION sent successfully to Utumishi');
        } else {
            logger.error('❌ Failed to send PAYMENT_ACKNOWLEDGMENT_NOTIFICATION:', callbackResponse.error);
        }

    } catch (error) {
        logger.error('❌ Error sending PAYMENT_ACKNOWLEDGMENT_NOTIFICATION:', error);
    }
};

const handleLoanRestructureRejection = async (parsedData, res) => {
    try {
        logger.info('Processing LOAN_RESTRUCTURE_REJECTION...');
        
        const header = parsedData.Document.Data.Header;
        const messageDetails = parsedData.Document.Data.MessageDetails;
        
        // Extract request data
        const applicationNumber = messageDetails.ApplicationNumber;
        const reason = messageDetails.Reason;
        const fspReferenceNumber = messageDetails.FSPReferenceNumber;
        const loanNumber = messageDetails.LoanNumber;
        
        logger.info('Loan restructure rejection details:', {
            applicationNumber,
            fspReferenceNumber,
            loanNumber,
            reason
        });

        // Validate required fields
        if (!applicationNumber) {
            logger.error('Missing required field: ApplicationNumber');
            return sendErrorResponse(res, '8003', 'Missing required field: ApplicationNumber', 'xml', parsedData);
        }

        // Find loan mapping by ApplicationNumber (only active loans)
        let loanMapping;
        try {
            loanMapping = await LoanMappingService.getByEssApplicationNumber(applicationNumber, false);
        } catch (error) {
            logger.info('Active loan mapping not found for restructure rejection:', { applicationNumber });
            // If no active mapping exists, still acknowledge
            const responseData = {
                Data: {
                    Header: {
                        "Sender": process.env.FSP_NAME || "ZE DONE",
                        "Receiver": header.Sender,
                        "FSPCode": process.env.FSP_CODE || "FL8090", 
                        "MsgId": getMessageId("RESPONSE"),
                        "MessageType": "RESPONSE"
                    },
                    MessageDetails: {
                        "ResponseCode": "8000",
                        "Description": `Loan restructure rejection acknowledged for application: ${applicationNumber}. No active loan found.`
                    }
                }
            };

            const responseXML = digitalSignature.createSignedXML(responseData.Data);
            res.set('Content-Type', 'application/xml');
            return res.send(responseXML);
        }

        logger.info('Found loan mapping for restructure rejection:', {
            id: loanMapping._id,
            status: loanMapping.status,
            mifosLoanId: loanMapping.mifosLoanId,
            essApplicationNumber: loanMapping.essApplicationNumber
        });

        // Check if loan is in a restructurable state
        const allowedStatuses = ['RESTRUCTURE_PENDING', 'RESTRUCTURE_IN_PROGRESS', 'DISBURSED', 'ACTIVE'];
        
        if (!allowedStatuses.includes(loanMapping.status)) {
            logger.warn('Loan restructure rejection for unexpected status (processing anyway):', { 
                status: loanMapping.status,
                applicationNumber 
            });
        }

        // Update loan mapping status to RESTRUCTURE_REJECTED
        const updateResult = await LoanMappingService.updateStatus(
            applicationNumber,
            'RESTRUCTURE_REJECTED',
            {
                rejectionReason: reason || 'Loan restructure rejected by ESS',
                rejectedAt: new Date(),
                rejectedBy: 'ESS_UTUMISHI',
                fspReferenceNumber: fspReferenceNumber || loanMapping.fspReferenceNumber,
                loanNumber: loanNumber
            }
        );

        logger.info('Loan mapping updated to RESTRUCTURE_REJECTED:', {
            applicationNumber,
            updateResult
        });

        // Send success acknowledgment
        const responseData = {
            Data: {
                Header: {
                    "Sender": process.env.FSP_NAME || "ZE DONE",
                    "Receiver": header.Sender,
                    "FSPCode": header.FSPCode,
                    "MsgId": getMessageId("RESPONSE"),
                    "MessageType": "RESPONSE"
                },
                MessageDetails: {
                    "ResponseCode": "8000",
                    "Description": "Loan restructure rejection processed successfully"
                }
            }
        };

        logger.info('Sending restructure rejection acknowledgment:', responseData.Data.MessageDetails);
        
        const signedResponse = digitalSignature.createSignedXML(responseData.Data);
        res.status(200).send(signedResponse);

    } catch (error) {
        logger.error('Error processing LOAN_RESTRUCTURE_REJECTION:', error);
        return sendErrorResponse(res, '8002', `Processing error: ${error.message}`, 'xml', parsedData);
    }
};

const handleLoanCancellation = async (parsedData, res) => {
    try {
        logger.info('Processing LOAN_CANCELLATION_NOTIFICATION...');
        
        const header = parsedData.Document.Data.Header;
        const messageDetails = parsedData.Document.Data.MessageDetails;
        
        // Extract request data
        const applicationNumber = messageDetails.ApplicationNumber;
        const reason = messageDetails.Reason;
        const fspReferenceNumber = messageDetails.FSPReferenceNumber;
        const loanNumber = messageDetails.LoanNumber;
        
        logger.info('Loan cancellation request details:', {
            applicationNumber,
            fspReferenceNumber,
            loanNumber,
            reason
        });

        // Validate required fields
        if (!applicationNumber) {
            logger.error('Missing required field: ApplicationNumber');
            return sendErrorResponse(res, '8003', 'Missing required field: ApplicationNumber', 'xml', parsedData);
        }

        // Find loan mapping by ApplicationNumber (only active loans)
        let loanMapping;
        try {
            loanMapping = await LoanMappingService.getByEssApplicationNumber(applicationNumber, false);
        } catch (error) {
            logger.info('Active loan mapping not found, treating as already cancelled or never created:', { applicationNumber });
            // If no active mapping exists, treat as successful cancellation
            const responseData = {
                Header: {
                    "Sender": process.env.FSP_NAME || "ZE DONE",
                    "Receiver": header.Sender,
                    "FSPCode": process.env.FSP_CODE || "FL8090", 
                    "MsgId": getMessageId("LOAN_CANCELLATION_RESPONSE"),
                    "MessageType": "RESPONSE"
                },
                MessageDetails: {
                    "ResponseCode": "0000",
                    "Description": `Loan cancellation acknowledged for application: ${applicationNumber}. No active loan found.`
                }
            };

            const responseXML = digitalSignature.createSignedXML(responseData);
            res.set('Content-Type', 'application/xml');
            return res.send(responseXML);
        }

        logger.info('Found loan mapping:', {
            id: loanMapping._id,
            status: loanMapping.status,
            mifosLoanId: loanMapping.mifosLoanId,
            essApplicationNumber: loanMapping.essApplicationNumber
        });

        // Check if loan can be cancelled (must not be disbursed)
        const cancellableStatuses = ['INITIAL_OFFER', 'APPROVED', 'FINAL_APPROVAL_RECEIVED', 'CLIENT_CREATED', 'LOAN_CREATED'];
        
        if (!cancellableStatuses.includes(loanMapping.status)) {
            logger.error('Loan cannot be cancelled in current status:', { 
                status: loanMapping.status,
                applicationNumber 
            });
            return sendErrorResponse(
                res, 
                '8006', 
                `Loan cannot be cancelled in status: ${loanMapping.status}. Only loans that are not yet disbursed can be cancelled.`, 
                'xml', 
                parsedData
            );
        }

        // If loan was created in MIFOS, reject it there
        if (loanMapping.mifosLoanId && loanMapping.status === 'LOAN_CREATED') {
            try {
                logger.info('Attempting to reject loan in MIFOS:', { mifosLoanId: loanMapping.mifosLoanId });
                
                const rejectPayload = {
                    rejectedOnDate: new Date().toISOString().split('T')[0], // YYYY-MM-DD format
                    locale: "en",
                    dateFormat: "yyyy-MM-dd",
                    note: reason || 'Loan cancelled by employee'
                };

                const rejectResponse = await api.post(
                    `/v1/loans/${loanMapping.mifosLoanId}?command=reject`, 
                    rejectPayload
                );

                if (rejectResponse.status) {
                    logger.info('Loan successfully rejected in MIFOS:', {
                        mifosLoanId: loanMapping.mifosLoanId,
                        response: rejectResponse.response
                    });
                } else {
                    logger.warn('Failed to reject loan in MIFOS (continuing with local cancellation):', {
                        mifosLoanId: loanMapping.mifosLoanId,
                        error: rejectResponse
                    });
                }
            } catch (mifosError) {
                // Log error but continue with local cancellation
                logger.warn('Error rejecting loan in MIFOS (continuing with local cancellation):', {
                    mifosLoanId: loanMapping.mifosLoanId,
                    error: mifosError.message
                });
            }
        }

        // Update loan mapping status to CANCELLED using helper function
        await cancelLoan(loanMapping, 'EMPLOYEE', reason || 'Loan cancelled by employee');
        
        // Update FSP reference if provided
        if (fspReferenceNumber && fspReferenceNumber !== loanMapping.fspReferenceNumber) {
            loanMapping.fspReferenceNumber = fspReferenceNumber;
            await loanMapping.save();
        }

        logger.info('Loan mapping updated to CANCELLED:', {
            applicationNumber,
            updateResult
        });

        // Send success acknowledgment
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
                    "Description": "Loan cancellation processed successfully"
                }
            }
        };

        logger.info('Sending cancellation acknowledgment:', responseData.Data.MessageDetails);
        
        const signedResponse = digitalSignature.createSignedXML(responseData.Data);
        res.status(200).send(signedResponse);

    } catch (error) {
        logger.error('Error processing LOAN_CANCELLATION_NOTIFICATION:', error);
        return sendErrorResponse(res, '8002', `Processing error: ${error.message}`, 'xml', parsedData);
    }
};

const handleLoanFinalApproval = async (parsedData, res) => {
    let responseSent = false;
    try {
        logger.info('Processing LOAN_FINAL_APPROVAL_NOTIFICATION...');

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
        if (!responseSent) {
            const signedResponse = digitalSignature.createSignedXML(responseData.Data);
            res.status(200).send(signedResponse);
            responseSent = true;

            // Log the client creation attempt
            logger.info('Creating client in CBS with data:', {
                firstname: messageDetails.FirstName,
                middlename: messageDetails.MiddleName,
                lastname: messageDetails.LastName,
                externalId: messageDetails.NIN,
                mobileNo: messageDetails.MobileNo,
                dateOfBirth: messageDetails.DateOfBirth,
                gender: messageDetails.Sex,
                address: messageDetails.PhysicalAddress,
                applicationNumber: messageDetails.ApplicationNumber
            });
        }

        // Process the request asynchronously
        setImmediate(async () => {
            try {
                // Try to retrieve existing loan mapping, or create a new one
                // IMPORTANT: For restructures, the ApplicationNumber is NEW but the loan mapping uses the OLD one
                // We need to search by multiple identifiers
                let existingMapping;
                try {
                    // First, try by ApplicationNumber
                    existingMapping = await LoanMappingService.getByEssApplicationNumber(messageDetails.ApplicationNumber, false);
                    
                    // If not found, try by restructureApplicationNumber (for restructures)
                    if (!existingMapping && messageDetails.ApplicationNumber) {
                        existingMapping = await LoanMapping.findOne({
                            restructureApplicationNumber: messageDetails.ApplicationNumber,
                            status: { $nin: ['CANCELLED', 'REJECTED', 'CLOSED'] }
                        }).lean();
                        if (existingMapping) {
                            logger.info(`✅ Found loan mapping by restructureApplicationNumber: ${messageDetails.ApplicationNumber}`);
                        }
                    }
                    
                    // If still not found, try by LoanNumber or FSPReferenceNumber
                    if (!existingMapping && (messageDetails.LoanNumber || messageDetails.FSPReferenceNumber)) {
                        existingMapping = await LoanMapping.findOne({
                            $or: [
                                { newLoanNumber: messageDetails.LoanNumber },
                                { essLoanNumberAlias: messageDetails.LoanNumber },
                                { newFspReferenceNumber: messageDetails.FSPReferenceNumber },
                                { fspReferenceNumber: messageDetails.FSPReferenceNumber }
                            ],
                            status: { $nin: ['CANCELLED', 'REJECTED', 'CLOSED'] }
                        }).lean();
                        if (existingMapping) {
                            logger.info(`✅ Found loan mapping by LoanNumber/FSPReferenceNumber: ${messageDetails.LoanNumber}`);
                        }
                    }
                    
                    if (!existingMapping) {
                        // Check if there's a cancelled/rejected mapping (for logging only)
                        const inactiveMapping = await LoanMappingService.getByEssApplicationNumber(messageDetails.ApplicationNumber, true);
                        if (inactiveMapping) {
                            logger.info(`ℹ️ Found ${inactiveMapping.status} loan for ${messageDetails.ApplicationNumber}. Treating as new application.`);
                        }
                    }
                } catch (error) {
                    logger.warn(`⚠️ No existing loan mapping found for ${messageDetails.ApplicationNumber}, will create new one`);
                    existingMapping = null;
                }
                
                // Create loan mapping data
                const loanMappingData = {
                    essLoanNumberAlias: messageDetails.LoanNumber,
                    fspReferenceNumber: messageDetails.FSPReferenceNumber || null,
                    status: messageDetails.Approval === 'APPROVED' ? 'FINAL_APPROVAL_RECEIVED' : 'REJECTED',
                    essApplicationNumber: messageDetails.ApplicationNumber,
                    essCheckNumber: messageDetails.FSPReferenceNumber || messageDetails.CheckNumber,
                    productCode: '17',
                    requestedAmount: messageDetails.LoanAmount || messageDetails.RequestedAmount || 5000000,
                    tenure: messageDetails.LoanTenure || messageDetails.Tenure || 60,
                    finalApprovalReceivedAt: new Date().toISOString()
                };
                
                // Handle rejection with proper actor tracking
                if (messageDetails.Approval === 'REJECTED') {
                    const reason = messageDetails.Reason || 'Application rejected by employer';
                    if (existingMapping) {
                        await rejectLoan(existingMapping, 'EMPLOYER', reason);
                        logger.info('✅ Loan rejected with actor tracking:', {
                            applicationNumber: messageDetails.ApplicationNumber,
                            rejectedBy: 'EMPLOYER',
                            reason: reason
                        });
                    } else {
                        // For new mapping, set rejection info in metadata
                        loanMappingData.rejectedBy = 'EMPLOYER';
                        loanMappingData.rejectionReason = reason;
                    }
                }

                        // If approved, create client in CBS and create loan
                        if (messageDetails.Approval === 'APPROVED') {
                            // Get original message type to determine loan processing flow
                            const originalMessageType = existingMapping?.originalMessageType;
                            
                            logger.info('🔍 Determined loan type:', {
                                originalMessageType: originalMessageType,
                                applicationNumber: messageDetails.ApplicationNumber,
                                fallbackChecks: {
                                    hasRestructureFlag: !!(existingMapping?.isRestructure || existingMapping?.restructureRequested),
                                    hasExistingLoanId: !!(existingMapping?.metadata?.loanData?.existingLoanId || existingMapping?.mifosLoanId)
                                }
                            });
                            
                            // Process based on original message type
                            switch (originalMessageType) {
                                case 'LOAN_RESTRUCTURE_REQUEST':
                                    logger.info('🔄 Processing LOAN_RESTRUCTURE_REQUEST - will call MIFOS reschedule API');
                                    logger.info('Restructure details:', {
                                        mifosLoanId: existingMapping?.mifosLoanId,
                                        newTenure: existingMapping?.newTenure,
                                        newRequestedAmount: existingMapping?.newRequestedAmount
                                    });
                                    
                                    try {
                                        // Call MIFOS reschedule API
                                        const reschedulePayload = {
                                            dateFormat: "dd MMMM yyyy",
                                            locale: "en",
                                            rescheduleFromDate: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }),
                                            rescheduleReasonId: 1,
                                            submittedOnDate: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }),
                                            adjustedDueDate: new Date(new Date().setMonth(new Date().getMonth() + existingMapping.newTenure)).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }),
                                            graceOnPrincipal: 0,
                                            graceOnInterest: 0,
                                            extraTerms: 0,
                                            rescheduleReasonComment: `Loan restructure approved. New tenure: ${existingMapping.newTenure} months, New amount: ${existingMapping.newRequestedAmount}`
                                        };

                                        logger.info('📞 Calling MIFOS reschedule API with payload:', JSON.stringify(reschedulePayload, null, 2));
                                        const rescheduleResponse = await api.post(
                                            `/v1/loans/${existingMapping.mifosLoanId}/schedule`,
                                            reschedulePayload
                                        );

                                        logger.info('✅ MIFOS reschedule created:', {
                                            resourceId: rescheduleResponse.data.resourceId,
                                            loanId: rescheduleResponse.data.loanId
                                        });

                                        // Update loan mapping with reschedule details
                                        loanMappingData.rescheduleId = rescheduleResponse.data.resourceId;
                                        loanMappingData.status = 'RESTRUCTURED';
                                        loanMappingData.restructuredAt = new Date().toISOString();

                                        // Skip loan creation for restructure
                                        logger.info('✅ Loan restructure completed, skipping new loan creation');
                                        
                                    } catch (rescheduleError) {
                                        logger.error('❌ Error calling MIFOS reschedule API:', rescheduleError);
                                        throw rescheduleError;
                                    }
                                    break;
                                    
                                case 'TOP_UP_OFFER_REQUEST':
                                    logger.info('🔄 Processing TOP_UP_OFFER_REQUEST - will create top-up loan in CBS');
                                    const topUpExistingLoanId = existingMapping?.metadata?.loanData?.existingLoanId || 
                                                              existingMapping?.metadata?.existingLoanId ||
                                                              existingMapping?.mifosLoanId;
                                    
                                    logger.info('Top-up details:', {
                                        existingLoanId: topUpExistingLoanId,
                                        mifosClientId: existingMapping?.mifosClientId
                                    });
                                    
                                    // Mark this so we create the loan with topup=true parameter
                                    loanMappingData.isTopUp = true;
                                    loanMappingData.existingLoanId = topUpExistingLoanId;
                                    // Fall through to loan creation
                                    break;
                                    
                                case 'LOAN_TAKEOVER_OFFER_REQUEST':
                                    logger.info('🔄 Processing LOAN_TAKEOVER_OFFER_REQUEST - will create takeover loan in CBS');
                                    const takeoverExistingLoanId = existingMapping?.metadata?.loanData?.existingLoanId || 
                                                                 existingMapping?.mifosLoanId;
                                    
                                    logger.info('Takeover details:', {
                                        existingLoanId: takeoverExistingLoanId,
                                        mifosClientId: existingMapping?.mifosClientId
                                    });
                                    
                                    loanMappingData.isTakeover = true;
                                    loanMappingData.existingLoanId = takeoverExistingLoanId;
                                    // Fall through to loan creation
                                    break;
                                    
                                case 'LOAN_OFFER_REQUEST':
                                    logger.info('✅ Processing LOAN_OFFER_REQUEST - will create new loan in CBS');
                                    // Standard new loan - no special flags needed
                                    break;
                                    
                                default:
                                    // Fallback for legacy records without originalMessageType
                                    logger.warn('⚠️ No originalMessageType found, using legacy detection logic');
                                    const isRestructure = existingMapping?.isRestructure || existingMapping?.restructureRequested;
                                    const existingLoanId = existingMapping?.metadata?.loanData?.existingLoanId || 
                                                         existingMapping?.metadata?.existingLoanId ||
                                                         existingMapping?.mifosLoanId;
                                    
                                    if (isRestructure) {
                                        logger.info('🔄 Legacy: Detected restructure via flags');
                                        // Handle as restructure (but this shouldn't happen with new code)
                                    } else if (existingLoanId) {
                                        logger.info('🔄 Legacy: Detected top-up via existing loan ID');
                                        loanMappingData.isTopUp = true;
                                        loanMappingData.existingLoanId = existingLoanId;
                                    } else {
                                        logger.info('✅ Legacy: Treating as new loan');
                                    }
                                    break;
                            }
                            
                            // Only create client/loan if NOT a restructure
                            if (originalMessageType !== 'LOAN_RESTRUCTURE_REQUEST') {
                                // Try to get client data from existing mapping or use message details
                                const storedClientData = existingMapping?.metadata?.clientData;
                            const clientData = storedClientData ? {
                                externalId: storedClientData.nin || messageDetails.FSPReferenceNumber,
                                nin: storedClientData.nin,
                                firstname: storedClientData.firstName,
                                middlename: storedClientData.middleName,
                                lastname: storedClientData.lastName,
                                mobileNo: storedClientData.mobileNumber,
                                sex: storedClientData.sex,
                                dateOfBirth: storedClientData.dateOfBirth || '1990-01-01',
                                employmentDate: storedClientData.employmentDate,
                                maritalStatus: storedClientData.maritalStatus || 'Single',
                                physicalAddress: storedClientData.physicalAddress,
                                emailAddress: storedClientData.emailAddress,
                                applicationNumber: storedClientData.applicationNumber,
                                checkNumber: storedClientData.checkNumber,
                                bankAccountNumber: storedClientData.bankAccountNumber,
                                swiftCode: storedClientData.swiftCode
                            } : {
                                externalId: messageDetails.NIN || messageDetails.FSPReferenceNumber,
                                nin: messageDetails.NIN || messageDetails.FSPReferenceNumber,
                                firstname: messageDetails.FirstName || 'ESS',
                                middlename: messageDetails.MiddleName || 'Application',
                                lastname: messageDetails.LastName || messageDetails.ApplicationNumber,
                                mobileNo: messageDetails.MobileNo || messageDetails.MobileNumber,
                                sex: messageDetails.Sex || 'M',
                                dateOfBirth: messageDetails.DateOfBirth || '1990-01-01',
                                employmentDate: messageDetails.EmploymentDate,
                                maritalStatus: messageDetails.MaritalStatus || 'Single',
                                physicalAddress: messageDetails.PhysicalAddress,
                                emailAddress: messageDetails.EmailAddress,
                                applicationNumber: messageDetails.ApplicationNumber,
                                checkNumber: messageDetails.CheckNumber || messageDetails.FSPReferenceNumber
                            };
                            logger.info('Client data for CBS creation:', JSON.stringify(clientData, null, 2));
                            
                            try {
                                const potentialNIN = clientData?.nin || clientData?.NIN || clientData?.nationalId;
                                logger.info('Potential NIN values:', {
                                    fromNIN: clientData?.NIN,
                                    fromNin: clientData?.nin,
                                    fromNationalId: clientData?.nationalId,
                                    selected: potentialNIN
                                });

                                // Ensure we have NIN
                                if (!potentialNIN) {
                                    logger.warn('⚠️ No NIN found in client data');
                                    throw new Error('National ID Number (NIN) is required for client creation');
                                }

                                // First check if client exists by NIN
                                logger.info('🔍 Checking if client exists with NIN:', potentialNIN);
                                const existingClientByNin = await ClientService.searchClientByExternalId(potentialNIN);
                                logger.info('Search result:', { 
                                    totalRecords: existingClientByNin?.totalFilteredRecords || 0,
                                    found: existingClientByNin?.pageItems?.length || 0 
                                });
                                
                                let clientId;
                                if (!existingClientByNin?.pageItems?.length) {
                                    // Create new client in CBS
                                    logger.info(`Creating new client: ${clientData.fullName || clientData.firstName + ' ' + clientData.lastName}`);
                                    
                                    // Prepare client creation payload
                                    const fullName = clientData.fullName || `${clientData.firstName || ''} ${clientData.middleName || ''} ${clientData.lastName || ''}`.trim();
                                    const mobileNumber = clientData.mobileNumber || clientData.mobileNo || clientData.MobileNumber;
                                    
                                    const date = new Date();
                                    const formattedDate = date.toLocaleDateString('en-GB', { 
                                        day: '2-digit', 
                                        month: 'long', 
                                        year: 'numeric' 
                                    });
                                    
                                    // Format dates properly
                                    const clientPayload = {
                                        officeId: 1,
                                        firstname: clientData.firstname || clientData.FirstName,
                                        middlename: clientData.middlename || clientData.MiddleName,
                                        lastname: clientData.lastname || clientData.LastName,
                                        externalId: potentialNIN,
                                        dateFormat: "yyyy-MM-dd",
                                        locale: "en",
                                        active: true,
                                        activationDate: new Date().toISOString().split('T')[0],
                                        dateOfBirth: clientData.DateOfBirth || clientData.dateOfBirth,
                                        genderId: clientData.Sex === 'M' || clientData.sex === 'M' ? 15 : 16,
                                        clientTypeId: 17,
                                        submittedOnDate: new Date().toISOString().split('T')[0],
                                        legalFormId: 1
                                    };
                                    
                                    logger.info('📄 Creating client with payload:', JSON.stringify(clientPayload, null, 2));
                                    const newClient = await ClientService.createClient(clientPayload);

                                    if (newClient && newClient.data && newClient.data.clientId) {
                                        clientId = newClient.data.clientId;
                                        logger.info(`✅ Client created in CBS with ID: ${clientId}`);
                                    } else {
                                        logger.error('❌ Client creation failed - no clientId in response');
                                    }
                                } else {
                                    clientId = existingClientByNin.pageItems[0].id;
                                    logger.info(`✅ Existing client found with ID: ${clientId}`);
                                }

                                if (clientId) {
                                    // Get loan amount and tenure from existing mapping or message details
                                    const loanAmount = existingMapping?.requestedAmount || 
                                                     existingMapping?.metadata?.loanData?.requestedAmount ||
                                                     messageDetails.LoanAmount || 
                                                     messageDetails.RequestedAmount || 
                                                     5000000;
                                    const loanTenure = existingMapping?.tenure ||
                                                     existingMapping?.metadata?.loanData?.tenure ||
                                                     messageDetails.LoanTenure || 
                                                     messageDetails.Tenure || 
                                                     60;
                                    
                                    logger.info(`Using loan amount: ${loanAmount}, tenure: ${loanTenure}`);
                                    
                                    // Check if this is a top-up or takeover loan
                                    const isTopUp = loanMappingData.isTopUp === true;
                                    const isTakeover = loanMappingData.isTakeover === true;
                                    const existingLoanId = loanMappingData.existingLoanId;
                                    const takeOverAmount = parseFloat(existingMapping?.metadata?.loanData?.takeOverAmount || 0);
                                    
                                    if (isTopUp && existingLoanId) {
                                        logger.info(`🔄 Creating TOP-UP loan linked to existing loan ${existingLoanId}`);
                                    }
                                    
                                    if (isTakeover && takeOverAmount > 0) {
                                        logger.info(`🔄 Creating TAKEOVER loan - Total: ${loanAmount}, TakeOver Amount: ${takeOverAmount}, Net to Customer: ${loanAmount - takeOverAmount}`);
                                    }
                                    
                                    // Create loan in CBS
                                    const loanPayload = {
                                        clientId: clientId,
                                        productId: 17, // ESS Loan product
                                        principal: loanAmount.toString(),
                                        loanTermFrequency: parseInt(loanTenure),
                                        loanTermFrequencyType: 2, // Months
                                        loanType: "individual",
                                        numberOfRepayments: parseInt(loanTenure),
                                        repaymentEvery: 1,
                                        repaymentFrequencyType: 2, // Monthly
                                        interestRatePerPeriod: 24, // 24% per year (matching product config)
                                        interestRateFrequencyType: 3, // Per year
                                        amortizationType: 1, // Equal installments
                                        interestType: 0, // Declining balance
                                        interestCalculationPeriodType: 1, // Same as repayment
                                        transactionProcessingStrategyCode: "mifos-standard-strategy",
                                        expectedDisbursementDate: new Date().toISOString().split('T')[0],
                                        submittedOnDate: new Date().toISOString().split('T')[0],
                                        dateFormat: "yyyy-MM-dd",
                                        locale: "en",
                                        charges: [], // Empty charges array to avoid MIFOS NPE bug
                                        // Add top-up parameters if this is a top-up loan
                                        ...(isTopUp && existingLoanId ? {
                                            isTopup: true,
                                            loanIdToClose: existingLoanId
                                        } : {})
                                    };
                                    
                                    logger.info('Creating loan with payload:', JSON.stringify(loanPayload, null, 2));

                                    // Create loan
                                    logger.info('Creating loan with payload:', JSON.stringify(loanPayload, null, 2));
                                    const loanResponse = await api.post('/v1/loans', loanPayload);

                                    if (loanResponse.data && loanResponse.data.loanId) {
                                        const loanId = loanResponse.data.loanId;
                                        logger.info(`Loan created successfully with ID: ${loanId}`);

                                        // Approve loan
                                        const approvePayload = {
                                            approvedOnDate: new Date().toISOString().split('T')[0],
                                            dateFormat: "yyyy-MM-dd",
                                            locale: "en"
                                        };

                                        await api.post(`/v1/loans/${loanId}?command=approve`, approvePayload);
                                        logger.info(`Loan ${loanId} approved successfully`);

                                        // Disburse loan
                                        // For takeover loans, only disburse net amount (LoanAmount - TakeOverAmount) to customer
                                        // The TakeOverAmount will be paid to FSP1 separately via TAKEOVER_DISBURSEMENT_NOTIFICATION
                                        let netDisbursementAmount = loanAmount;
                                        
                                        if (isTakeover && takeOverAmount > 0) {
                                            netDisbursementAmount = loanAmount - takeOverAmount;
                                            logger.info(`💰 Takeover loan disbursement - Net to customer: ${netDisbursementAmount} (Principal: ${loanAmount} - TakeOver: ${takeOverAmount})`);
                                        }
                                        
                                        const disbursePayload = {
                                            actualDisbursementDate: new Date().toISOString().split('T')[0],
                                            transactionAmount: netDisbursementAmount.toString(),
                                            dateFormat: "yyyy-MM-dd",
                                            locale: "en",
                                            note: isTakeover ? `Takeover loan disbursement. Net amount after FSP1 settlement: ${netDisbursementAmount}` : undefined
                                        };

                                        await api.post(`/v1/loans/${loanId}?command=disburse`, disbursePayload);
                                        logger.info(`Loan ${loanId} disbursed successfully with amount: ${netDisbursementAmount}`);
                                        
                                        // Store takeover details for later use in TAKEOVER_DISBURSEMENT_NOTIFICATION
                                        if (isTakeover && takeOverAmount > 0) {
                                            loanMappingData.takeoverDetails = {
                                                totalLoanAmount: loanAmount,
                                                takeOverAmount: takeOverAmount,
                                                netDisbursedToCustomer: netDisbursementAmount,
                                                fsp1LoanNumber: existingMapping?.metadata?.loanData?.fsp1LoanNumber,
                                                fsp1BankAccount: existingMapping?.metadata?.loanData?.fsp1BankAccount,
                                                fsp1BankAccountName: existingMapping?.metadata?.loanData?.fsp1BankAccountName,
                                                fsp1SwiftCode: existingMapping?.metadata?.loanData?.fsp1SwiftCode
                                            };
                                        }

                                        // Update loan mapping with loan details
                                        loanMappingData.mifosClientId = clientId;
                                        loanMappingData.mifosLoanId = loanId;
                                        loanMappingData.metadata = {
                                            ...existingMapping.metadata,
                                            clientId: clientId,
                                            clientCreatedAt: new Date().toISOString(),
                                            loanId: loanId,
                                            loanCreatedAt: new Date().toISOString(),
                                            loanDisbursedAt: new Date().toISOString()
                                        };
                                    }
                                }
                            } catch (error) {
                                logger.error('Error in loan creation process:', error);
                                // Continue with loan mapping update even if process fails
                            }
                            } // End of restructure check
                        }
                
                // Use the already retrieved existing mapping
                if (existingMapping) {
                    // Keep the requested amount from existing data
                    loanMappingData.requestedAmount = existingMapping.requestedAmount || loanMappingData.requestedAmount;

                    // Also keep any metadata
                    loanMappingData.metadata = {
                        ...existingMapping.metadata,
                        ...loanMappingData.metadata,
                        finalApprovalDetails: {
                            applicationNumber: messageDetails.ApplicationNumber,
                            loanNumber: messageDetails.LoanNumber,
                            fspReferenceNumber: messageDetails.FSPReferenceNumber,
                            approval: messageDetails.Approval,
                            reason: messageDetails.Reason
                        }
                    };
                } else {
                    logger.warn('⚠️ No existing loan mapping found, creating new one with default values');
                    loanMappingData.metadata = {
                        createdVia: 'LOAN_FINAL_APPROVAL_without_prior_offer',
                        finalApprovalDetails: {
                            applicationNumber: messageDetails.ApplicationNumber,
                            loanNumber: messageDetails.LoanNumber,
                            fspReferenceNumber: messageDetails.FSPReferenceNumber,
                            approval: messageDetails.Approval,
                            reason: messageDetails.Reason
                        }
                    };
                }

                // Default requested amount if not present
                if (!loanMappingData.requestedAmount) {
                    loanMappingData.requestedAmount = messageDetails.requestedAmount || messageDetails.RequestedAmount || messageDetails.LoanAmount || "5000000";
                }
                
                // Update or create loan mapping in database
                const savedMapping = await LoanMappingService.updateLoanMapping(loanMappingData);
                logger.info('✅ Updated loan mapping:', {
                    applicationNumber: savedMapping.essApplicationNumber,
                    loanNumber: savedMapping.essLoanNumberAlias,
                    requestedAmount: savedMapping.requestedAmount,
                    clientId: savedMapping.mifosClientId,
                    loanId: savedMapping.mifosLoanId,
                    status: savedMapping.status
                });

                if (messageDetails.Approval === 'APPROVED') {
                    try {
                        // Update loan status to DISBURSED
                        const disbursementAmount = messageDetails.DisbursementAmount || messageDetails.LoanAmount || savedMapping.requestedAmount;
                        logger.info('💰 Disbursement amount:', disbursementAmount);
                        
                        const updatedMapping = await LoanMappingService.updateLoanMapping({
                            essApplicationNumber: savedMapping.essApplicationNumber,
                            essLoanNumberAlias: savedMapping.essLoanNumberAlias,
                            fspReferenceNumber: savedMapping.fspReferenceNumber,
                            mifosClientId: savedMapping.mifosClientId,
                            mifosLoanId: savedMapping.mifosLoanId,
                            status: 'DISBURSED',
                            disbursedAmount: disbursementAmount,
                            disbursedAt: new Date().toISOString(),
                            metadata: {
                                ...savedMapping.metadata,
                                disbursementDetails: {
                                    amount: disbursementAmount,
                                    date: new Date().toISOString()
                                }
                            }
                        });

                        // Log updated mapping details
                        logger.info('✅ Loan mapping updated with disbursement details:', {
                            applicationNumber: updatedMapping.essApplicationNumber,
                            loanNumber: updatedMapping.essLoanNumberAlias,
                            mifosLoanId: updatedMapping.mifosLoanId,
                            mifosClientId: updatedMapping.mifosClientId,
                            status: updatedMapping.status,
                            requestedAmount: updatedMapping.requestedAmount
                        });

                        // Prepare LOAN_DISBURSEMENT_NOTIFICATION callback
                        const callbackData = {
                            Data: {
                                Header: {
                                    "Sender": process.env.FSP_NAME || "ZE DONE",
                                    "Receiver": "ESS_UTUMISHI",
                                    "FSPCode": header.FSPCode,
                                    "MsgId": getMessageId("LOAN_DISBURSEMENT_NOTIFICATION"),
                                    "MessageType": "LOAN_DISBURSEMENT_NOTIFICATION"
                                },
                                MessageDetails: {
                                    "ApplicationNumber": messageDetails.ApplicationNumber,
                                    "Reason": "Loan successfully disbursed",
                                    "FSPReferenceNumber": messageDetails.FSPReferenceNumber,
                                    "LoanNumber": messageDetails.LoanNumber,
                                    "TotalAmountToPay": updatedMapping.disbursedAmount || updatedMapping.requestedAmount,
                                    "DisbursementDate": formatDateTimeForUTUMISHI(new Date())
                                }
                            }
                        };

                        // Log disbursement notification details
                        logger.info('📤 Preparing to send disbursement notification (will send in 60 seconds):', {
                            applicationNumber: messageDetails.ApplicationNumber,
                            loanNumber: messageDetails.LoanNumber,
                            amount: updatedMapping.requestedAmount
                        });

                        // Send callback notification after 60 seconds delay
                        setTimeout(async () => {
                            try {
                                logger.info('📤 Sending disbursement notification after 60s delay:', {
                                    applicationNumber: messageDetails.ApplicationNumber,
                                    loanNumber: messageDetails.LoanNumber
                                });
                                await sendCallback(callbackData);
                                logger.info('✅ Disbursement notification sent successfully');
                            } catch (callbackError) {
                                logger.error('❌ Error sending disbursement notification after delay:', callbackError);
                            }
                        }, 60000); // 60 seconds delay
                    } catch (error) {
                        logger.error('Error in disbursement processing:', error);
                        throw error;
                    }
                }
            } catch (error) {
                logger.error('Error in async processing:', error);
                logger.error('Error details:', {
                    message: error.message,
                    stack: error.stack,
                    loanNumber: messageDetails.LoanNumber,
                    applicationNumber: messageDetails.ApplicationNumber
                });
            }
        });

        // Create audit log for initial receipt
        await AuditLog.create({
            userId: 'system',
            action: 'LOAN_FINAL_APPROVAL_RECEIVED',
            description: `Final approval received for loan ${messageDetails.LoanNumber}`,
            eventType: 'LOAN_FINAL_APPROVAL_RECEIVED',
            data: {
                loanNumber: messageDetails.LoanNumber,
                applicationNumber: messageDetails.ApplicationNumber,
                approval: messageDetails.Approval
            }
        }).catch(err => {
            logger.error('Error saving audit log:', err.message);
        });

    } catch (error) {
        logger.error('Error processing loan final approval:', error);
        if (!responseSent) {
            return sendErrorResponse(res, '8012', error.message, 'xml', parsedData);
            responseSent = true;
        }
    }
};

const handleTakeoverDisbursementNotification = async (parsedData, res) => {
    try {
        logger.info('Processing TAKEOVER_DISBURSEMENT_NOTIFICATION...');
        
        const header = parsedData.Document.Data.Header;
        const messageDetails = parsedData.Document.Data.MessageDetails;
        
        // Extract request data
        const applicationNumber = messageDetails.ApplicationNumber;
        const loanNumber = messageDetails.LoanNumber;
        const fspReferenceNumber = messageDetails.FSPReferenceNumber;
        
        logger.info('Takeover disbursement notification details:', {
            applicationNumber,
            loanNumber,
            fspReferenceNumber
        });

        // Validate required fields
        if (!applicationNumber) {
            logger.error('Missing required field: ApplicationNumber');
            return sendErrorResponse(res, '8003', 'Missing required field: ApplicationNumber', 'xml', parsedData);
        }

        // Find loan mapping
        let loanMapping;
        try {
            loanMapping = await LoanMappingService.getByEssApplicationNumber(applicationNumber);
        } catch (error) {
            logger.error('Error finding loan mapping:', error);
            return sendErrorResponse(res, '8010', 'Error finding loan mapping: ' + error.message, 'xml', parsedData);
        }

        if (!loanMapping) {
            logger.error('Loan mapping not found for application:', applicationNumber);
            return sendErrorResponse(res, '8010', 'Loan mapping not found', 'xml', parsedData);
        }

        // Update loan status to indicate disbursement
        try {
            await LoanMappingService.updateStatus(loanMapping.essApplicationNumber, 'DISBURSED');
            logger.info('Updated loan status to DISBURSED');
        } catch (updateError) {
            logger.error('Error updating loan status:', updateError);
            // Continue anyway, don't fail the request
        }

        // Send success response
        const responseData = {
            Data: {
                Header: {
                    "Sender": process.env.FSP_NAME || "ZE DONE",
                    "Receiver": header.Sender,
                    "FSPCode": process.env.FSP_CODE || "FL8090", 
                    "MsgId": getMessageId("RESPONSE"),
                    "MessageType": "RESPONSE"
                },
                MessageDetails: {
                    "Status": "SUCCESS",
                    "StatusCode": "8000",
                    "StatusDesc": "Takeover disbursement notification received and processed"
                }
            }
        };
        
        const signedResponse = digitalSignature.createSignedXML(responseData.Data);
        res.status(200).send(signedResponse);
        
    } catch (error) {
        logger.error('Error processing takeover disbursement notification:', error);
        return sendErrorResponse(res, '8011', 'Error processing request: ' + error.message, 'xml', parsedData);
    }
};

const handlePaymentAcknowledgmentNotification = async (parsedData, res) => {
    try {
        logger.info('Processing PAYMENT_ACKNOWLEDGMENT_NOTIFICATION...');
        
        const header = parsedData.Document.Data.Header;
        const messageDetails = parsedData.Document.Data.MessageDetails;
        
        // Extract request data
        const applicationNumber = messageDetails.ApplicationNumber;
        const loanNumber = messageDetails.LoanNumber;
        const fspReferenceNumber = messageDetails.FSPReferenceNumber;
        const totalPayoffAmount = messageDetails.TotalPayoffAmount;
        const paymentReferenceNumber = messageDetails.PaymentReferenceNumber;
        const paymentDate = messageDetails.PaymentDate;
        
        logger.info('Payment acknowledgment details:', {
            applicationNumber,
            loanNumber,
            fspReferenceNumber,
            totalPayoffAmount,
            paymentReferenceNumber,
            paymentDate
        });

        // Validate required fields
        if (!applicationNumber) {
            logger.error('Missing required field: ApplicationNumber');
            return sendErrorResponse(res, '8003', 'Missing required field: ApplicationNumber', 'xml', parsedData);
        }

        // Send acknowledgment response first
        const responseData = {
            Data: {
                Header: {
                    "Sender": process.env.FSP_NAME || "ZE DONE",
                    "Receiver": header.Sender,
                    "FSPCode": process.env.FSP_CODE || "FL8090", 
                    "MsgId": getMessageId("RESPONSE"),
                    "MessageType": "RESPONSE"
                },
                MessageDetails: {
                    "Status": "SUCCESS",
                    "StatusCode": "8000",
                    "StatusDesc": "Payment acknowledgment received and being processed"
                }
            }
        };
        
        const signedResponse = digitalSignature.createSignedXML(responseData.Data);
        res.status(200).send(signedResponse);

        // Now process the payment acknowledgment asynchronously
        processPaymentAcknowledgment(parsedData);
        
    } catch (error) {
        logger.error('Error processing payment acknowledgment notification:', error);
        return sendErrorResponse(res, '8011', 'Error processing request: ' + error.message, 'xml', parsedData);
    }
};

// Async function to process payment acknowledgment
const processPaymentAcknowledgment = async (parsedData) => {
    try {
        const messageDetails = parsedData.Document.Data.MessageDetails;
        const applicationNumber = messageDetails.ApplicationNumber;
        const totalPayoffAmount = messageDetails.TotalPayoffAmount;
        const paymentDate = messageDetails.PaymentDate;

        // Find loan mapping
        let loanMapping;
        try {
            loanMapping = await LoanMappingService.getByEssApplicationNumber(applicationNumber);
        } catch (error) {
            logger.error('Error finding loan mapping for payment acknowledgment:', error);
            return;
        }

        if (!loanMapping) {
            logger.error('Loan mapping not found for payment acknowledgment, application:', applicationNumber);
            return;
        }

        const mifosLoanId = loanMapping.mifosLoanId;
        logger.info('Found loan mapping, MIFOS loan ID:', mifosLoanId);

        // Query MIFOS to get loan details
        let loanDetails;
        try {
            const loanResponse = await api.get(`/v1/loans/${mifosLoanId}?associations=repaymentSchedule,transactions`);
            if (!loanResponse.status) {
                throw new Error('Failed to fetch loan details from MIFOS');
            }
            loanDetails = loanResponse.response;
            logger.info('Fetched loan details from MIFOS');
        } catch (error) {
            logger.error('Error fetching loan details from MIFOS:', error);
            return;
        }

        // Calculate outstanding amount
        const outstandingBalance = loanDetails.summary?.totalOutstanding || 0;
        logger.info('Loan outstanding balance:', outstandingBalance);

        // Make full repayment to close the loan
        if (outstandingBalance > 0) {
            try {
                const repaymentAmount = outstandingBalance;
                const repaymentResponse = await api.post(`${API_ENDPOINTS.LOAN}${mifosLoanId}/transactions?command=repayment`, {
                    transactionDate: paymentDate || formatDateForMifos(new Date()),
                    transactionAmount: repaymentAmount,
                    paymentTypeId: 1, // Assuming cash payment type
                    note: `Full repayment for loan closure - Payment ref: ${messageDetails.PaymentReferenceNumber || 'N/A'}`
                });

                if (!repaymentResponse.status) {
                    throw new Error('Failed to make repayment: ' + JSON.stringify(repaymentResponse.response));
                }

                logger.info('✅ Successfully made full repayment to close loan:', {
                    loanId: mifosLoanId,
                    amount: repaymentAmount
                });

                // Update loan mapping status
                await LoanMappingService.updateStatus(loanMapping.essApplicationNumber, 'CLOSED');
                logger.info('Updated loan status to CLOSED');

            } catch (repaymentError) {
                logger.error('Error making repayment:', repaymentError);
                // Update status to indicate payment processing failed
                await LoanMappingService.updateStatus(loanMapping.essApplicationNumber, 'PAYMENT_FAILED');
            }
        } else {
            logger.info('Loan already has zero outstanding balance');
            await LoanMappingService.updateStatus(loanMapping.essApplicationNumber, 'CLOSED');
        }

    } catch (error) {
        logger.error('Error in processPaymentAcknowledgment:', error);
    }
};



// Export each handler
exports.handleMifosWebhook = handleMifosWebhook;
exports.handleLoanChargesRequest = handleLoanChargesRequest;
exports.handleLoanOfferRequest = handleLoanOfferRequest;
exports.handleLoanRestructureRequest = handleLoanRestructureRequest;
// Add exports for other handlers as they are extracted
// exports.handleTopUpPayOffBalanceRequest = handleTopUpPayOffBalanceRequest;
// etc.