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
async function processRequest(req, res) {
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
}

// Loan offer request handler
async function handleLoanOfferRequest(parsedData, res) {
    try {
        console.log('Processing LOAN_OFFER_REQUEST...');
        
        // Send immediate acknowledgment
        const ackResponse = {
            Data: {
                Header: {
                    Sender: process.env.FSP_NAME || "FSP_SYSTEM",
                    Receiver: "ESS_UTUMISHI",
                    FSPCode: parsedData.Document.Data.Header.FSPCode,
                    MsgId: `ACK_${Date.now()}`,
                    MessageType: "RESPONSE"
                },
                MessageDetails: {
                    ResponseCode: "8000",
                    Description: "Request received successfully"
                }
            }
        };
        
        // Send acknowledgment response immediately
        const signedAck = digitalSignature.createSignedXML(ackResponse.Data);
        res.set('Content-Type', 'application/xml');
        res.send(signedAck);

        // Process the request and send callback asynchronously
        setImmediate(async () => {
            try {
                const messageDetails = parsedData.Document.Data.MessageDetails;
                
                // Process loan application
                const result = await CreateLoanOffer({
                    checkNumber: messageDetails.CheckNumber,
                    firstName: messageDetails.FirstName,
                    lastName: messageDetails.LastName,
                    requestedAmount: parseFloat(messageDetails.RequestedAmount),
                    tenure: parseInt(messageDetails.Tenure),
                    productCode: messageDetails.ProductCode
                });

                // Send callback notification
                const callbackData = {
                    Header: {
                        Sender: process.env.FSP_NAME || "FSP_SYSTEM",
                        Receiver: "ESS_UTUMISHI",
                        FSPCode: parsedData.Document.Data.Header.FSPCode,
                        MsgId: `CALLBACK_${Date.now()}`,
                        MessageType: "LOAN_INITIAL_APPROVAL_NOTIFICATION"
                    },
                    MessageDetails: {
                        CheckNumber: messageDetails.CheckNumber,
                        FirstName: messageDetails.FirstName,
                        LastName: messageDetails.LastName,
                        Sex: messageDetails.Sex,
                        BankAccountNumber: messageDetails.BankAccountNumber,
                        EmploymentDate: messageDetails.EmploymentDate,
                        TotalEmployeeDeduction: messageDetails.TotalEmployeeDeduction,
                        NIN: messageDetails.NIN,
                        BasicSalary: messageDetails.BasicSalary,
                        NetSalary: messageDetails.NetSalary,
                        OneThirdAmount: messageDetails.OneThirdAmount,
                        RequestedAmount: messageDetails.RequestedAmount,
                        RetirementDate: messageDetails.RetirementDate,
                        TermsOfEmployment: messageDetails.TermsOfEmployment,
                        Tenure: messageDetails.Tenure,
                        ProductCode: messageDetails.ProductCode,
                        InterestRate: messageDetails.InterestRate,
                        ProcessingFee: messageDetails.ProcessingFee,
                        Insurance: messageDetails.Insurance,
                        SwiftCode: messageDetails.SwiftCode,
                        Reason: "Ok",
                        FSPReferenceNumber: result.fspReferenceNumber || `FSPREF${Date.now()}`,
                        LoanNumber: result.loanNumber || `LOAN${Date.now()}`,
                        TotalAmountToPay: result.totalAmount || (parseFloat(messageDetails.RequestedAmount) * 1.28).toString(),
                        OtherCharges: "0.00",
                        Approval: "APPROVED"
                    }
                };

                await sendCallback(callbackData);
                console.log('✅ LOAN_INITIAL_APPROVAL_NOTIFICATION callback sent successfully');

                // Store loan mapping
                try {
                    await LoanMappingService.createInitialMapping(
                        messageDetails.ApplicationNumber,
                        messageDetails.CheckNumber,
                        result.fspReferenceNumber,
                        {
                            productCode: messageDetails.ProductCode,
                            requestedAmount: parseFloat(messageDetails.RequestedAmount),
                            tenure: parseInt(messageDetails.Tenure),
                            calculatedAmount: result.totalAmount,
                            monthlyPayment: result.monthlyPayment,
                            totalInterest: result.totalInterest,
                            status: 'CALCULATED'
                        }
                    );
                } catch (mappingError) {
                    console.error('❌ Error storing loan mapping:', mappingError);
                }
            } catch (error) {
                console.error('❌ Error in async processing:', error);
                try {
                    const errorCallback = {
                        Header: {
                            Sender: process.env.FSP_NAME || "FSP_SYSTEM",
                            Receiver: "ESS_UTUMISHI",
                            FSPCode: parsedData.Document.Data.Header.FSPCode,
                            MsgId: `ERROR_${Date.now()}`,
                            MessageType: "LOAN_PROCESSING_ERROR"
                        },
                        MessageDetails: {
                            ResponseCode: "8013",
                            Description: error.message
                        }
                    };
                    await sendCallback(errorCallback);
                } catch (callbackError) {
                    console.error('❌ Failed to send error callback:', callbackError);
                }
            }
        });
    } catch (error) {
        console.error('Error in loan offer request:', error);
        return sendErrorResponse(res, '8013', 'Error processing loan offer: ' + error.message, 'xml', parsedData);
    }
}

/**
 * Handle MIFOS webhooks for loan events
 */
async function handleMifosWebhook(req, res) {
    try {
        // Validate webhook secret
        const webhookSecret = req.headers['x-webhook-secret'] || req.body.webhookSecret;
        if (process.env.WEBHOOK_SECRET && webhookSecret !== process.env.WEBHOOK_SECRET) {
            console.log('❌ Invalid webhook secret');
            return res.status(401).json({ error: 'Unauthorized' });
        }

        console.log('Received MIFOS webhook:', JSON.stringify(req.body, null, 2));
        const webhookData = req.body;

        if (webhookData.entityName === 'LOAN' && webhookData.action === 'DISBURSE') {
            console.log('Processing loan disbursement webhook...');
            const loanId = webhookData.entityId;

            // Get loan mapping
            const loanMapping = await LoanMappingService.getByMifosLoanId(loanId);
            if (!loanMapping) {
                return res.status(404).json({ error: 'Loan mapping not found' });
            }

            // Get loan details from MIFOS
            const loanDetailsResponse = await cbsApi.get(`/v1/loans/${loanId}`);
            if (!loanDetailsResponse.status) {
                return res.status(500).json({ error: 'Failed to get loan details' });
            }

            const loan = loanDetailsResponse.response;
            // Send disbursement notification to ESS
            const disbursementNotification = {
                Data: {
                    Header: {
                        Sender: process.env.FSP_NAME || "ZE DONE",
                        Receiver: "ESS_UTUMISHI",
                        FSPCode: process.env.FSP_CODE || "FL8090",
                        MsgId: `WEBHOOK_DISBURSE_${Date.now()}`,
                        MessageType: "LOAN_DISBURSEMENT_NOTIFICATION"
                    },
                    MessageDetails: {
                        ApplicationNumber: loanMapping.essApplicationNumber,
                        FSPReferenceNumber: loanMapping.fspReferenceNumber,
                        LoanNumber: loanMapping.essLoanNumberAlias,
                        ClientId: loan.clientId,
                        LoanId: loanId,
                        DisbursedAmount: loan.principal,
                        DisbursementDate: new Date().toISOString().split('T')[0],
                        Status: "DISBURSED"
                    }
                }
            };

            const signedDisbursementXml = digitalSignature.createSignedXML(disbursementNotification.Data);
            console.log('Sending LOAN_DISBURSEMENT_NOTIFICATION to ESS...');

            try {
                await forwardToThirdParty(signedDisbursementXml, "LOAN_DISBURSEMENT_NOTIFICATION");
                console.log('✅ LOAN_DISBURSEMENT_NOTIFICATION sent successfully to ESS');
                await LoanMappingService.updateWithDisbursement(loanId);
                res.status(200).json({ status: 'success', message: 'Webhook processed, disbursement notification sent' });
            } catch (sendError) {
                console.error('❌ Failed to send LOAN_DISBURSEMENT_NOTIFICATION to ESS:', sendError.message);
                res.status(500).json({ error: 'Failed to send disbursement notification' });
            }
        } else {
            console.log('Ignoring non-disbursement webhook event');
            res.status(200).json({ status: 'ignored', message: 'Event not processed' });
        }
    } catch (error) {
        console.error('Error processing MIFOS webhook:', error);
        res.status(500).json({ error: 'Webhook processing failed' });
    }
}

/**
 * Handle LOAN_CHARGES_REQUEST - Calculate possible loan charges
 */
async function handleLoanChargesRequest(parsedData, res) {
    try {
        console.log('Processing LOAN_CHARGES_REQUEST...');

        // Extract message details from XML
        const messageDetails = parsedData.Document.Data.MessageDetails;
        console.log('Message details:', JSON.stringify(messageDetails, null, 2));

        // Convert XML data to format expected by LoanCalculate
        const loanData = {
            checkNumber: messageDetails.CheckNumber,
            designationCode: messageDetails.DesignationCode,
            designationName: messageDetails.DesignationName,
            basicSalary: parseFloat(messageDetails.BasicSalary),
            netSalary: parseFloat(messageDetails.NetSalary),
            oneThirdAmount: parseFloat(messageDetails.OneThirdAmount),
            deductibleAmount: parseFloat(messageDetails.DeductibleAmount),
            retirementDate: messageDetails.RetirementDate,
            termsOfEmployment: messageDetails.TermsOfEmployment,
            requestedAmount: messageDetails.RequestedAmount ? parseFloat(messageDetails.RequestedAmount) : null,
            desiredDeductibleAmount: messageDetails.DesiredDeductibleAmount ? parseFloat(messageDetails.DesiredDeductibleAmount) : null,
            tenure: messageDetails.Tenure ? parseInt(messageDetails.Tenure) : null,
            fspCode: parsedData.Document.Data.Header.FSPCode,
            productCode: messageDetails.ProductCode,
            voteCode: messageDetails.VoteCode,
            totalEmployeeDeduction: parseFloat(messageDetails.TotalEmployeeDeduction),
            jobClassCode: messageDetails.JobClassCode
        };

        console.log('Loan data prepared:', loanData);

        // Call loan calculation service
        const result = await LoanCalculate(loanData);
        console.log('Calculation result:', result);

        // Helper function to safely format number values
        const formatNumber = (value) => {
            if (typeof value === 'number') return value.toFixed(2);
            if (typeof value === 'string' && !isNaN(parseFloat(value))) return parseFloat(value).toFixed(2);
            return "0.00";
        };

        // Convert result to ESS response format
        const responseData = {
            Data: {
                Header: {
                    Sender: process.env.FSP_NAME || "ZE DONE",
                    Receiver: "ESS_UTUMISHI",
                    FSPCode: parsedData.Document.Data.Header.FSPCode,
                    MsgId: `CHRG_${Date.now()}`,
                    MessageType: "LOAN_CHARGES_RESPONSE"
                },
                MessageDetails: {
                    DesiredDeductibleAmount: formatNumber(result.desiredDeductibleAmount),
                    TotalInsurance: formatNumber(result.totalInsurance),
                    TotalProcessingFees: formatNumber(result.totalProcessingFees),
                    TotalInterestRateAmount: formatNumber(result.totalInterestRateAmount),
                    OtherCharges: "0.00",
                    NetLoanAmount: formatNumber(result.netLoanAmount),
                    TotalAmountToPay: formatNumber(result.totalAmountToPay),
                    Tenure: result.tenure?.toString() || "0",
                    EligibleAmount: formatNumber(result.eligibleAmount),
                    MonthlyReturnAmount: formatNumber(result.monthlyReturnAmount)
                }
            }
        };

        console.log('Preparing response:', JSON.stringify(responseData, null, 2));

        // Generate signed XML response
        const signedResponse = digitalSignature.createSignedXML(responseData.Data);
        console.log('Response signed successfully');

        res.set('Content-Type', 'application/xml');
        res.send(signedResponse);

    } catch (error) {
        console.error('Error processing loan charges request:', error);

        // Handle ApplicationException with specific error codes
        if (error.errorCode) {
            const errorCodeMap = {
                '8014': '8014', // Invalid code, mismatch of supplied code on information and header (NOT_ELIGIBLE)
                '8012': '8012'  // Request cannot be completed at this time, try later (INTERNAL_ERROR)
            };

            const responseCode = errorCodeMap[error.errorCode] || '8012';
            return sendErrorResponse(res, responseCode, error.errorMsg || error.message, 'xml', parsedData);
        }

        return sendErrorResponse(res, '8012', 'Error calculating loan charges: ' + error.message, 'xml', parsedData);
    }
}

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
        if (!messageDetails.LoanId || !messageDetails.LoanAmount || !messageDetails.ApprovalStatus) {
            throw new Error('Missing required fields in loan final approval notification');
        }

        // Create loan mapping data
        const loanMappingData = {
            essLoanId: messageDetails.LoanId,
            fspLoanId: messageDetails.FSPLoanId || null,
            amount: parseFloat(messageDetails.LoanAmount),
            status: messageDetails.ApprovalStatus,
            tenure: parseInt(messageDetails.Tenure || '0'),
            monthlyInstallment: parseFloat(messageDetails.MonthlyInstallment || '0'),
            approvalDate: messageDetails.ApprovalDate || new Date().toISOString(),
            disbursementDate: messageDetails.DisbursementDate || null,
            fspCode: header.FSPCode
        };

        // Update loan mapping in database
        await loanMappingService.updateLoanMapping(loanMappingData);

        // Prepare acknowledgment response
        const responseData = {
            Data: {
                Header: {
                    Sender: process.env.FSP_NAME || "ZE DONE",
                    Receiver: "ESS_UTUMISHI",
                    FSPCode: header.FSPCode,
                    MsgId: `RESP_${Date.now()}`,
                    MessageType: "RESPONSE"
                },
                MessageDetails: {
                    LoanId: messageDetails.LoanId,
                    Status: "SUCCESS",
                    StatusCode: "8000",
                    StatusDesc: "Final approval notification processed successfully"
                }
            }
        };

        // Generate signed XML response
        const signedResponse = digitalSignature.createSignedXML(responseData.Data);
        
        // Create audit log
        await AuditLog.create({
            messageType: 'LOAN_FINAL_APPROVAL_NOTIFICATION',
            requestId: header.MsgId,
            loanId: messageDetails.LoanId,
            fspCode: header.FSPCode,
            status: 'SUCCESS',
            request: JSON.stringify(parsedData.Document.Data),
            response: JSON.stringify(responseData.Data)
        });

        res.set('Content-Type', 'application/xml');
        res.send(signedResponse);

    } catch (error) {
        console.error('Error processing loan final approval:', error);

        // Prepare error response
        return sendErrorResponse(res, '8012', 'Error processing loan final approval: ' + error.message, 'xml', parsedData);
    }
}

// Export the module
module.exports = {
    processRequest,
    handleMifosWebhook
};