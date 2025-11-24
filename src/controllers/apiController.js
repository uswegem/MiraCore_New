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
const { formatDateForMifos } = require('../utils/dateUtils');
const { AuditLog } = require('../models/AuditLog');
const { getMessageId } = require('../utils/messageIdGenerator');
const LOAN_CONSTANTS = require('../utils/loanConstants');
const LoanCalculations = require('../utils/loanCalculations');

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
        logger.error('Controller error:', error);
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
// DEPRECATED: Use LoanCalculations.calculateEMI instead
function calculateMonthlyInstallment(principal, annualRate, termMonths) {
    return LoanCalculations.calculateEMI(principal, annualRate, termMonths);
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
    logger.info('Processing request in AUTO-SIGNATURE mode');
    logger.info('Content-Type:', contentType);
    logger.info('Raw body type:', typeof req.body);
    logger.info('Raw body:', req.body);

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
        logger.error('Controller error:', error);
        const contentType = req.get('Content-Type');
        return sendErrorResponse(res, '8011', 'Error processing request: ' + error.message, contentType.includes('json') ? 'json' : 'xml', null);
    }
};

const handleMifosWebhook = async (req, res) => {
    // Implement webhook handling
    logger.info('Processing Mifos webhook...');
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
        logger.info('Processing LOAN_CHARGES_REQUEST...');
        const header = parsedData.Document.Data.Header;
        const messageDetails = parsedData.Document.Data.MessageDetails;

        // Extract loan details from request
        let requestedAmount = parseFloat(messageDetails.RequestedAmount || messageDetails.LoanAmount);
        // Default to maximum tenure if not provided or is 0
        let requestedTenure = parseInt(messageDetails.RequestedTenure || messageDetails.Tenure);
        if (!requestedTenure || requestedTenure === 0) {
            requestedTenure = LOAN_CONSTANTS.MAX_TENURE;
            logger.info(`Tenure not provided or is 0, defaulting to maximum tenure: ${requestedTenure} months`);
        }
        const interestRate = 15.0; // 15% per annum
        
        // Extract repayment capacity fields
        // CONSERVATIVE APPROACH: DesiredDeductibleAmount must be capped at DeductibleAmount
        const desiredDeductibleAmount = parseFloat(messageDetails.DesiredDeductibleAmount || 0);
        const deductibleAmount = parseFloat(messageDetails.DeductibleAmount || 0);
        const oneThirdAmount = parseFloat(messageDetails.OneThirdAmount || 0);
        const MIN_LOAN_AMOUNT = LOAN_CONSTANTS.MIN_LOAN_AMOUNT;
        
        // Determine which EMI value to use based on priority
        // CRITICAL: Always cap DesiredDeductibleAmount at DeductibleAmount for safety
        let targetEMI = 0;
        if (desiredDeductibleAmount > 0) {
            // Cap desired amount at system-calculated capacity
            if (deductibleAmount > 0 && desiredDeductibleAmount > deductibleAmount) {
                targetEMI = deductibleAmount;
                logger.info(`⚠️ DesiredDeductibleAmount (${desiredDeductibleAmount}) exceeds DeductibleAmount (${deductibleAmount}). Capped at DeductibleAmount for safety.`);
            } else {
                targetEMI = desiredDeductibleAmount;
                logger.info(`Using DesiredDeductibleAmount as target EMI: ${targetEMI}`);
            }
        } else if (deductibleAmount > 0) {
            targetEMI = deductibleAmount;
            logger.info(`Using DeductibleAmount as maximum capacity EMI: ${targetEMI}`);
        } else if (oneThirdAmount > 0) {
            targetEMI = oneThirdAmount;
            logger.info(`Using OneThirdAmount as fallback EMI: ${targetEMI}`);
        }
        
        logger.info(`Customer repayment capacity - DesiredDeductibleAmount: ${desiredDeductibleAmount}, DeductibleAmount: ${deductibleAmount}, OneThirdAmount: ${oneThirdAmount}, Target EMI: ${targetEMI}`);
        
        // If requested amount is 0, calculate maximum loan amount based on target EMI
        if (!requestedAmount || requestedAmount === 0) {
            logger.info(`RequestedAmount is 0, calculating maximum loan from target EMI: ${targetEMI}`);
            
            if (targetEMI > 0 && requestedTenure > 0) {
                // Calculate maximum loan amount from target EMI (reverse calculation)
                const maxAmount = LoanCalculations.calculateMaxLoanFromEMI(targetEMI, interestRate, requestedTenure);
                requestedAmount = Math.max(MIN_LOAN_AMOUNT, Math.round(maxAmount));
                logger.info(`Calculated maximum eligible loan amount: ${requestedAmount} (EMI will be: ${targetEMI})`);
            } else {
                // Default to minimum loan amount if no affordability data
                requestedAmount = MIN_LOAN_AMOUNT;
                logger.info(`No affordability data, using minimum loan amount: ${requestedAmount}`);
            }
        } else {
            // If requested amount is provided, validate it doesn't exceed customer's repayment capacity
            // Use DeductibleAmount (max capacity) for validation
            if (deductibleAmount > 0) {
                const calculatedEMI = calculateMonthlyInstallment(requestedAmount, interestRate, requestedTenure);
                logger.info(`Requested amount: ${requestedAmount}, Calculated EMI: ${calculatedEMI}, Max capacity: ${deductibleAmount}`);
                
                if (calculatedEMI > deductibleAmount) {
                    // Adjust loan amount downward to fit within customer's maximum capacity
                    const adjustedAmount = LoanCalculations.calculateMaxLoanFromEMI(deductibleAmount, interestRate, requestedTenure);
                    requestedAmount = Math.max(MIN_LOAN_AMOUNT, Math.round(adjustedAmount));
                    logger.info(`⚠️ Requested amount exceeds capacity. Adjusted to: ${requestedAmount} (EMI: ${deductibleAmount})`);
                }
            }
        }
        
        // Ensure amount meets minimum requirement
        requestedAmount = Math.max(requestedAmount, MIN_LOAN_AMOUNT);

        // Calculate charges
        const totalProcessingFees = requestedAmount * 0.02; // 2% processing fee
        const totalInsurance = requestedAmount * 0.01; // 1% insurance
        const otherCharges = LOAN_CONSTANTS?.OTHER_CHARGES || 50000; // Other charges (e.g., legal fees)
        
        // Calculate interest for the entire tenure
        const totalInterestRateAmount = (requestedAmount * interestRate * requestedTenure) / (12 * 100);
        
        // Net amount after deducting charges
        const totalDeductions = totalProcessingFees + totalInsurance + otherCharges;
        const netLoanAmount = requestedAmount - totalDeductions;
        
        // Total amount to pay back (principal + interest)
        const totalAmountToPay = requestedAmount + totalInterestRateAmount;
        
        // Monthly installment
        const monthlyReturnAmount = calculateMonthlyInstallment(requestedAmount, interestRate, requestedTenure);
        
        // Apply EMI constraint validation - ensure MonthlyReturnAmount doesn't exceed customer's DesiredDeductibleAmount
        const constrainedMonthlyReturnAmount = Math.min(monthlyReturnAmount, targetEMI);
        if (constrainedMonthlyReturnAmount < monthlyReturnAmount) {
            logger.info(`EMI constraint applied - Original: ${monthlyReturnAmount.toFixed(2)}, Constrained: ${constrainedMonthlyReturnAmount.toFixed(2)}, Customer Max: ${targetEMI.toFixed(2)}`);
        }
        const finalMonthlyReturnAmount = constrainedMonthlyReturnAmount;

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
                    "DesiredDeductibleAmount": finalMonthlyReturnAmount.toFixed(2),
                    "TotalInsurance": totalInsurance.toFixed(2),
                    "TotalProcessingFees": totalProcessingFees.toFixed(2),
                    "TotalInterestRateAmount": totalInterestRateAmount.toFixed(2),
                    "OtherCharges": otherCharges.toFixed(2),
                    "NetLoanAmount": netLoanAmount.toFixed(2),
                    "TotalAmountToPay": totalAmountToPay.toFixed(2),
                    "Tenure": requestedTenure,
                    "EligibleAmount": requestedAmount.toFixed(2),
                    "MonthlyReturnAmount": finalMonthlyReturnAmount.toFixed(2)
                }
            }
        };
        
        // Store charge calculation results for later use in LOAN_INITIAL_APPROVAL_NOTIFICATION
        try {
            const checkNumber = messageDetails.CheckNumber;
            if (checkNumber) {
                const chargeCalculationData = {
                    totalAmountToPay: totalAmountToPay.toFixed(2),
                    otherCharges: otherCharges.toFixed(2),
                    totalInsurance: totalInsurance.toFixed(2),
                    totalProcessingFees: totalProcessingFees.toFixed(2),
                    totalInterestRateAmount: totalInterestRateAmount.toFixed(2),
                    netLoanAmount: netLoanAmount.toFixed(2),
                    eligibleAmount: requestedAmount.toFixed(2),
                    tenure: requestedTenure,
                    calculatedAt: new Date().toISOString()
                };
                
                // Try to update existing loan mapping with charge calculation data
                await LoanMappingService.storeChargeCalculation(checkNumber, chargeCalculationData);
                logger.info('✅ Stored charge calculation data for CheckNumber:', checkNumber);
            }
        } catch (storageError) {
            logger.warn('⚠️ Failed to store charge calculation data:', storageError.message);
            // Continue with response even if storage fails
        }
        
        const signedResponse = digitalSignature.createSignedXML(responseData.Data);
        res.status(200).send(signedResponse);
    } catch (error) {
        logger.error('Error processing loan charges request:', error);
        return sendErrorResponse(res, '8012', error.message, 'xml', parsedData);
    }
};

const handleLoanOfferRequest = async (parsedData, res) => {
    try {
        logger.info('Processing LOAN_OFFER_REQUEST...');
        const header = parsedData.Document.Data.Header;
        const messageDetails = parsedData.Document.Data.MessageDetails;

        // Store client data for later use during final approval
            // Extract all client data fields with logging
            logger.info('Extracting client data from request...');
            logger.info('NIN from request:', messageDetails.NIN);
            
            const clientData = {
                checkNumber: messageDetails.CheckNumber,
                firstName: messageDetails.FirstName,
                middleName: messageDetails.MiddleName,
                lastName: messageDetails.LastName,
                fullName: `${messageDetails.FirstName || ''} ${messageDetails.MiddleName || ''} ${messageDetails.LastName || ''}`.trim(),
                sex: messageDetails.Sex,
                nin: messageDetails.NIN || messageDetails.Nin || messageDetails.NationalId, // Try multiple possible field names
                bankAccountNumber: messageDetails.BankAccountNumber,
                employmentDate: messageDetails.EmploymentDate,
                maritalStatus: messageDetails.MaritalStatus,
                confirmationDate: messageDetails.ConfirmationDate,
                physicalAddress: messageDetails.PhysicalAddress,
                emailAddress: messageDetails.EmailAddress,
                mobileNumber: messageDetails.MobileNumber,
                applicationNumber: messageDetails.ApplicationNumber,
                swiftCode: messageDetails.SwiftCode
            };
            
            logger.info('Extracted client data:', JSON.stringify(clientData, null, 2));        // Store loan and employment data
        const loanData = {
            requestedAmount: messageDetails.RequestedAmount,
            desiredDeductibleAmount: messageDetails.DesiredDeductibleAmount,
            tenure: messageDetails.Tenure,
            productCode: messageDetails.ProductCode,
            interestRate: messageDetails.InterestRate,
            processingFee: messageDetails.ProcessingFee,
            insurance: messageDetails.Insurance,
            loanPurpose: messageDetails.LoanPurpose,
            contractStartDate: messageDetails.ContractStartDate,
            contractEndDate: messageDetails.ContractEndDate,
            funding: messageDetails.Funding
        };

        const employmentData = {
            designationCode: messageDetails.DesignationCode,
            designationName: messageDetails.DesignationName,
            basicSalary: messageDetails.BasicSalary,
            netSalary: messageDetails.NetSalary,
            oneThirdAmount: messageDetails.OneThirdAmount,
            totalEmployeeDeduction: messageDetails.TotalEmployeeDeduction,
            retirementDate: messageDetails.RetirementDate,
            termsOfEmployment: messageDetails.TermsOfEmployment,
            voteCode: messageDetails.VoteCode,
            voteName: messageDetails.VoteName,
            nearestBranchName: messageDetails.NearestBranchName,
            nearestBranchCode: messageDetails.NearestBranchCode
        };

        // Calculate loan offer immediately with proper tenure defaulting
        let offerTenure = parseInt(messageDetails.Tenure);
        if (!offerTenure || offerTenure === 0) {
            offerTenure = LOAN_CONSTANTS.MAX_TENURE;
            logger.info(`Tenure not provided or is 0, defaulting to maximum tenure: ${offerTenure} months`);
        }
        
        // Determine maximum affordable EMI from available data
        // CONSERVATIVE APPROACH: DesiredDeductibleAmount must be capped at DeductibleAmount
        let maxAffordableEMI = 0;
        const deductibleAmountOffer = parseFloat(messageDetails.DeductibleAmount || 0);
        const desiredDeductibleAmountOffer = parseFloat(messageDetails.DesiredDeductibleAmount || 0);
        
        if (desiredDeductibleAmountOffer > 0) {
            // Cap desired amount at system-calculated capacity
            if (deductibleAmountOffer > 0 && desiredDeductibleAmountOffer > deductibleAmountOffer) {
                maxAffordableEMI = deductibleAmountOffer;
                logger.info(`⚠️ DesiredDeductibleAmount (${desiredDeductibleAmountOffer}) exceeds DeductibleAmount (${deductibleAmountOffer}). Capped at DeductibleAmount for safety.`);
            } else {
                maxAffordableEMI = desiredDeductibleAmountOffer;
                logger.info(`Using DesiredDeductibleAmount as max affordable EMI: ${maxAffordableEMI}`);
            }
        } else if (deductibleAmountOffer > 0) {
            maxAffordableEMI = deductibleAmountOffer;
            logger.info(`Using DeductibleAmount as max affordable EMI: ${maxAffordableEMI}`);
        } else if (messageDetails.OneThirdAmount && messageDetails.OneThirdAmount > 0) {
            maxAffordableEMI = messageDetails.OneThirdAmount;
            logger.info(`Using OneThirdAmount as max affordable EMI: ${maxAffordableEMI}`);
        } else if (messageDetails.NetSalary && messageDetails.NetSalary > 0) {
            maxAffordableEMI = messageDetails.NetSalary * 0.33; // Fallback to 1/3 of net salary
            logger.info(`Calculated max affordable EMI as 1/3 of NetSalary: ${maxAffordableEMI}`);
        }
        
        let requestedAmount = messageDetails.RequestedAmount || 0;
        
        // If requested amount is provided, validate it doesn't exceed affordability
        if (requestedAmount > 0 && maxAffordableEMI > 0) {
            const calculatedEMI = calculateMonthlyInstallment(requestedAmount, 15.0, offerTenure);
            logger.info(`Requested amount: ${requestedAmount}, Calculated EMI: ${calculatedEMI}, Max affordable: ${maxAffordableEMI}`);
            
            if (calculatedEMI > maxAffordableEMI) {
                // Adjust loan amount downward to fit within customer's maximum capacity
                const adjustedAmount = LoanCalculations.calculateMaxLoanFromEMI(maxAffordableEMI, 15.0, offerTenure);
                requestedAmount = Math.max(LOAN_CONSTANTS.MIN_LOAN_AMOUNT, Math.round(adjustedAmount));
                logger.info(`⚠️ Requested amount exceeds affordability. Adjusted from ${messageDetails.RequestedAmount} to ${requestedAmount} (EMI: ${maxAffordableEMI})`);
            }
        } else if (requestedAmount === 0 && maxAffordableEMI > 0) {
            // Calculate maximum loan from affordability
            requestedAmount = Math.round(LoanCalculations.calculateMaxLoanFromEMI(maxAffordableEMI, 15.0, offerTenure));
            requestedAmount = Math.max(requestedAmount, LOAN_CONSTANTS.MIN_LOAN_AMOUNT);
            logger.info(`Calculated loan amount from affordability: ${requestedAmount} (EMI: ${maxAffordableEMI})`);
        } else {
            // No affordability data, use minimum loan amount
            requestedAmount = Math.max(requestedAmount, LOAN_CONSTANTS.MIN_LOAN_AMOUNT);
            logger.info(`Using minimum loan amount: ${requestedAmount}`);
        }
        
        const loanOffer = {
            LoanAmount: requestedAmount,
            InterestRate: 15.0, // 15% per annum
            Tenure: offerTenure,
            MonthlyInstallment: calculateMonthlyInstallment(
                requestedAmount,
                15.0,
                offerTenure
            )
        };
        
        logger.info('Final loan offer:', loanOffer);

        // Calculate TotalAmountToPay and OtherCharges using same logic as LOAN_CHARGES_REQUEST
        const loanAmount = parseFloat(loanOffer.LoanAmount) || 0;
        const interestRate = parseFloat(loanOffer.InterestRate) || 0;
        const tenure = parseFloat(loanOffer.Tenure) || 0;
        
        // Use same calculation logic as LOAN_CHARGES_REQUEST
        const totalInterestRateAmount = (loanAmount * interestRate * tenure) / (12 * 100);
        const totalAmountToPay = loanAmount + totalInterestRateAmount;
        const otherCharges = LOAN_CONSTANTS?.OTHER_CHARGES || 50000; // Same fixed amount as LOAN_CHARGES_REQUEST (legal fees)
        const loanNumber = generateLoanNumber();
        
        logger.info(`Calculated using LOAN_CHARGES_REQUEST logic - LoanAmount: ${loanAmount}, TotalAmountToPay: ${totalAmountToPay}, OtherCharges: ${otherCharges}`);

        // Store in loan mapping with all client, loan, and employment data
        logger.info('💾 Storing client data for application:', messageDetails.ApplicationNumber);
        try {
            await LoanMappingService.createOrUpdateWithClientData(
                messageDetails.ApplicationNumber,
                messageDetails.CheckNumber,
                clientData,
                loanData,
                employmentData
            );
            logger.info('✅ Client data stored successfully');
        } catch (storageError) {
            logger.error('❌ Error storing client data:', storageError);
            // Continue with response even if storage fails
        }

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
                    "Reason": "Loan Request Approved",
                    "FSPReferenceNumber": header.FSPReferenceNumber || messageDetails.CheckNumber || messageDetails.ApplicationNumber,
                    "LoanNumber": loanNumber,
                    "TotalAmountToPay": totalAmountToPay.toFixed(2),
                    "OtherCharges": otherCharges.toFixed(2),
                    "Approval": "APPROVED"
                }
            }
        };

        // Sign and send the response
        const signedResponse = digitalSignature.createSignedXML(responseData.Data);
        res.status(200).send(signedResponse);

    } catch (error) {
        logger.error('Error processing loan offer request:', error);
        return sendErrorResponse(res, '8012', error.message, 'xml', parsedData);
    }
};

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
        
        // Try to find by ESS loan number alias
        try {
            const loanMapping = await LoanMappingService.getByEssLoanNumberAlias(loanNumber);
            
            if (loanMapping && loanMapping.mifosLoanId) {
                mifosLoanId = loanMapping.mifosLoanId;
                fspReferenceNumber = loanMapping.fspReferenceNumber || loanMapping.essApplicationNumber;
                logger.info('Found loan mapping:', { mifosLoanId, fspReferenceNumber });
            } else {
                // If not found in mapping, treat loanNumber as MIFOS loan ID directly
                mifosLoanId = loanNumber;
                fspReferenceNumber = loanNumber;
                logger.info('No loan mapping found, using loan number directly as MIFOS ID:', { mifosLoanId });
            }
        } catch (mappingError) {
            // If mapping lookup fails, treat loanNumber as MIFOS loan ID directly
            mifosLoanId = loanNumber;
            fspReferenceNumber = loanNumber;
            logger.info('Loan mapping lookup failed, using loan number directly as MIFOS ID:', { 
                mifosLoanId, 
                error: mappingError.message 
            });
        }

        // Fetch loan details from MIFOS
        const loanResponse = await api.get(`/v1/loans/${mifosLoanId}?associations=all`);
        
        if (!loanResponse.status || !loanResponse.response) {
            logger.error('Loan not found in MIFOS:', { mifosLoanId });
            return sendErrorResponse(res, '8005', 'Loan not found', 'xml', parsedData);
        }

        const loanData = loanResponse.response;
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
        
        // Format dates for response (ISO format)
        const formatDate = (date) => date.toISOString();
        
        // Extract loan financial data
        const totalOutstanding = loanData.summary?.totalOutstanding || 0;
        const principalOutstanding = loanData.summary?.principalOutstanding || 0;
        const interestOutstanding = loanData.summary?.interestOutstanding || 0;
        const feeChargesOutstanding = loanData.summary?.feeChargesOutstanding || 0;
        const penaltyChargesOutstanding = loanData.summary?.penaltyChargesOutstanding || 0;
        
        // Total payoff amount includes all outstanding amounts
        const totalPayoffAmount = totalOutstanding + feeChargesOutstanding + penaltyChargesOutstanding;
        
        // Get last transaction dates
        const lastDeductionDate = loanData.timeline?.expectedDisbursementDate 
            ? new Date(loanData.timeline.expectedDisbursementDate).toISOString()
            : formatDate(currentDate);
            
        const lastPayDate = loanData.timeline?.actualDisbursementDate 
            ? new Date(loanData.timeline.actualDisbursementDate).toISOString()
            : formatDate(currentDate);

        logger.info('Calculated payoff details:', {
            totalPayoffAmount: totalPayoffAmount.toFixed(2),
            totalOutstanding: totalOutstanding.toFixed(2),
            principalOutstanding: principalOutstanding.toFixed(2),
            interestOutstanding: interestOutstanding.toFixed(2)
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
                    "OutstandingBalance": totalOutstanding.toFixed(2),
                    "FinalPaymentDate": formatDate(finalPaymentDate),
                    "LastDeductionDate": lastDeductionDate,
                    "LastPayDate": lastPayDate,
                    "EndDate": formatDate(finalPaymentDate)
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
    // Implement top up offer request
    logger.info('Processing top up offer request...');
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
    logger.info('Processing takeover pay off balance request...');
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
    logger.info('Processing loan takeover offer request...');
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
    logger.info('Processing takeover payment notification...');
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

        // Find loan mapping by ApplicationNumber
        const loanMapping = await LoanMappingService.getByEssApplicationNumber(applicationNumber);
        
        if (!loanMapping) {
            logger.error('Loan application not found:', { applicationNumber });
            return sendErrorResponse(res, '8004', `Loan application not found: ${applicationNumber}`, 'xml', parsedData);
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

        // Update loan mapping status to CANCELLED
        const updateResult = await LoanMappingService.updateStatus(
            applicationNumber,
            'CANCELLED',
            {
                reason: reason || 'Loan cancelled by employee',
                cancelledAt: new Date(),
                cancelledBy: 'Employee',
                fspReferenceNumber: fspReferenceNumber || loanMapping.fspReferenceNumber
            }
        );

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
                // Retrieve the loan mapping with client data
                const existingMapping = await LoanMappingService.getByEssApplicationNumber(messageDetails.ApplicationNumber);
                
                // Create loan mapping data
                const loanMappingData = {
                    essLoanNumberAlias: messageDetails.LoanNumber,
                    fspReferenceNumber: messageDetails.FSPReferenceNumber || null,
                    status: messageDetails.Approval === 'APPROVED' ? 'FINAL_APPROVAL_RECEIVED' : 'REJECTED',
                    essApplicationNumber: messageDetails.ApplicationNumber,
                    reason: messageDetails.Reason || (messageDetails.Approval === 'REJECTED' ? 'Application rejected' : null),
                    finalApprovalReceivedAt: new Date().toISOString()
                };

                        // If approved, create client in CBS and create loan
                        if (messageDetails.Approval === 'APPROVED') {
                            const clientData = {
                                externalId: messageDetails.NIN,
                                nin: messageDetails.NIN,
                                firstname: messageDetails.FirstName,
                                middlename: messageDetails.MiddleName,
                                lastname: messageDetails.LastName,
                                mobileNo: messageDetails.MobileNo,
                                sex: messageDetails.Sex,
                                dateOfBirth: messageDetails.DateOfBirth,
                                employmentDate: messageDetails.EmploymentDate,
                                maritalStatus: messageDetails.MaritalStatus,
                                physicalAddress: messageDetails.PhysicalAddress,
                                emailAddress: messageDetails.EmailAddress,
                                applicationNumber: messageDetails.ApplicationNumber,
                                checkNumber: messageDetails.CheckNumber
                            };
                            logger.info('Retrieved client data from loan mapping:', JSON.stringify(clientData, null, 2));
                            
                            try {
                                const potentialNIN = clientData?.NIN || clientData?.nin || clientData?.nationalId;
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
                                logger.info('Search result:', JSON.stringify(existingClientByNin, null, 2));
                                
                                let clientId;
                                if (!existingClientByNin?.status || !existingClientByNin?.response?.pageItems?.length) {
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

                                    if (newClient.status && newClient.response) {
                                        clientId = newClient.response.clientId;
                                        logger.info(`✅ Client created in CBS with ID: ${clientId}`);
                                    }
                                } else {
                                    clientId = existingClientByNin.response.pageItems[0].id;
                                    logger.info(`✅ Existing client found with ID: ${clientId}`);
                                }

                                if (clientId) {
                                    // Create loan in CBS
                                    const loanPayload = {
                                        clientId: clientId,
                                        productId: 17, // ESS Loan product
                                        principal: messageDetails.LoanAmount.toString(),
                                        loanTermFrequency: parseInt(messageDetails.LoanTenure),
                                        loanTermFrequencyType: 2, // Months
                                        numberOfRepayments: parseInt(messageDetails.LoanTenure),
                                        repaymentEvery: 1,
                                        repaymentFrequencyType: 2, // Monthly
                                        interestRatePerPeriod: 15, // 15% per year
                                        interestRateFrequencyType: 3, // Per year
                                        amortizationType: 1, // Equal installments
                                        interestType: 0, // Declining balance
                                        interestCalculationPeriodType: 1, // Same as repayment
                                        transactionProcessingStrategyCode: "mifos-standard-strategy",
                                        expectedDisbursementDate: new Date().toISOString().split('T')[0],
                                        submittedOnDate: new Date().toISOString().split('T')[0],
                                        dateFormat: "yyyy-MM-dd",
                                        locale: "en"
                                    };
                                    
                                    logger.info('Creating loan with payload:', JSON.stringify(loanPayload, null, 2));

                                    // Create loan
                                    logger.info('Creating loan with payload:', JSON.stringify(loanPayload, null, 2));
                                    const loanResponse = await api.post('/v1/loans', loanPayload);

                                    if (loanResponse.status && loanResponse.response?.loanId) {
                                        const loanId = loanResponse.response.loanId;
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
                                        const disbursePayload = {
                                            actualDisbursementDate: new Date().toISOString().split('T')[0],
                                            dateFormat: "yyyy-MM-dd",
                                            locale: "en"
                                        };

                                        await api.post(`/v1/loans/${loanId}?command=disburse`, disbursePayload);
                                        logger.info(`Loan ${loanId} disbursed successfully`);

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
                        }                // Get existing loan mapping data
                const existingLoanData = await LoanMappingService.getByEssApplicationNumber(messageDetails.ApplicationNumber);
                
                if (!existingLoanData) {
                    logger.warn('⚠️ No existing loan mapping found for application:', messageDetails.ApplicationNumber);
                } else {
                    // Keep the requested amount from existing data
                    loanMappingData.requestedAmount = existingLoanData.requestedAmount;

                    // Also keep any metadata
                    loanMappingData.metadata = {
                        ...existingLoanData.metadata,
                        ...loanMappingData.metadata,
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
                    loanMappingData.requestedAmount = messageDetails.requestedAmount || messageDetails.RequestedAmount || "5000000";
                }
                
                // Update loan mapping in database
                const savedMapping = await LoanMappingService.updateLoanMapping(loanMappingData);
                logger.info('✅ Updated loan mapping:', {
                    applicationNumber: savedMapping.essApplicationNumber,
                    loanNumber: savedMapping.essLoanNumberAlias,
                    requestedAmount: savedMapping.requestedAmount,
                    clientId: savedMapping.mifosClientId,
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
                            status: updatedMapping.status,
                            requestedAmount: updatedMapping.requestedAmount
                        });

                        // Prepare LOAN_DISBURSMENT_NOTIFICATION callback
                        const callbackData = {
                            Data: {
                                Header: {
                                    "Sender": process.env.FSP_NAME || "ZE DONE",
                                    "Receiver": "ESS_UTUMISHI",
                                    "FSPCode": header.FSPCode,
                                    "MsgId": getMessageId("LOAN_DISBURSMENT_NOTIFICATION"),
                                    "MessageType": "LOAN_DISBURSMENT_NOTIFICATION"
                                },
                                MessageDetails: {
                                    "ApplicationNumber": messageDetails.ApplicationNumber,
                                    "LoanNumber": messageDetails.LoanNumber,
                                    "FSPReferenceNumber": messageDetails.FSPReferenceNumber,
                                    "DisbursementDate": new Date().toISOString(),
                                    "DisbursementAmount": updatedMapping.disbursedAmount || updatedMapping.requestedAmount,
                                    "Status": "DISBURSED",
                                    "StatusCode": "8000",
                                    "StatusDesc": "Loan disbursed successfully"
                                }
                            }
                        };

                        // Log disbursement notification details
                        logger.info('📤 Sending disbursement notification:', {
                            applicationNumber: messageDetails.ApplicationNumber,
                            loanNumber: messageDetails.LoanNumber,
                            amount: updatedMapping.requestedAmount
                        });

                        // Send callback notification
                        await sendCallback(callbackData);
                    } catch (error) {
                        logger.error('Error in disbursement processing:', error);
                        throw error;
                    }
                }
            } catch (error) {
                logger.error('Error in async processing:', error);
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
        logger.error('Error processing loan final approval:', error);
        if (!responseSent) {
            return sendErrorResponse(res, '8012', error.message, 'xml', parsedData);
            responseSent = true;
        }
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