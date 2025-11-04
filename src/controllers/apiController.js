const xml2js = require('xml2js');
const { validateXML, validateMessageType } = require('../validations/xmlValidator');
const { forwardToThirdParty } = require('../services/thirdPartyService');
const digitalSignature = require('../utils/signatureUtils');
const { sendCallback } = require('../utils/callbackUtils');
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

// Export the module
module.exports = {
    processRequest,
    handleMifosWebhook
};