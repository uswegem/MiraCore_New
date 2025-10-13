const xml2js = require('xml2js');
const { validateXML, validateMessageType } = require('../validations/xmlValidator');
const { forwardToThirdParty } = require('../services/thirdPartyService');
const digitalSignature = require('../utils/signatureUtils');
const { LoanCalculate } = require('../services/loanService');

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

async function processRequest(req, res) {
    const contentType = req.get('Content-Type');
    console.log('Processing request in AUTO-SIGNATURE mode');
    console.log('Content-Type:', contentType);
    console.log('Raw body type:', typeof req.body);
    console.log('Raw body:', req.body);

    try {
        let xmlData;
        let parsedData;

        // Handle JSON input and convert to XML
        if (contentType && contentType.includes('application/json')) {
            console.log('🔄 Converting JSON to XML...');

            if (!req.body || typeof req.body !== 'object') {
                return sendErrorResponse(res, '8001', 'Invalid JSON data', 'json');
            }

            // Convert JSON to XML format
            xmlData = convertProductJSONToXML(req.body);
            console.log('JSON converted to XML');
            console.log('Generated XML:', xmlData);

            // Parse the generated XML
            try {
                parsedData = await parser.parseStringPromise(xmlData);
                console.log('Generated XML parsed successfully');
            } catch (parseError) {
                console.error('Failed to parse generated XML:', parseError.message);
                return sendErrorResponse(res, '8001', 'Failed to convert JSON to XML: ' + parseError.message, 'json');
            }

        }
        // Handle XML input directly
        else if (contentType && (contentType.includes('application/xml') || contentType.includes('text/xml'))) {
            console.log('Processing XML directly...');
            xmlData = req.body;

            if (!xmlData) {
                return sendErrorResponse(res, '8001', 'XML data is required', 'xml');
            }

            try {
                parsedData = await parser.parseStringPromise(xmlData);
                const TypeMessage = parsedData?.Document?.Data.Header?.MessageType
                switch (TypeMessage) {
                    case 'LOAN_CHARGES_REQUEST':
                        return await handleLoanChargesRequest(parsedData, res);

                    case 'LOAN_OFFER_REQUEST':
                        return await handleLoanOfferRequest(parsedData, res);

                    case 'LOAN_FINAL_APPROVAL_NOTIFICATION':
                        return await handleLoanFinalApproval(parsedData, res);

                    case 'LOAN_CANCELLATION_NOTIFICATION':
                        return await handleLoanCancellation(parsedData, res);

                    default:
                        return await forwardToESS(parsedData, res, contentType);
                }
            } catch (parseError) {
                console.error('❌ XML parsing failed:', parseError.message);
                return sendErrorResponse(res, '8001', 'Invalid XML format: ' + parseError.message, 'xml');
            }

        }
        // Unsupported content type
        else {
            return sendErrorResponse(res, '8001', 'Unsupported Content-Type. Use application/json or application/xml', 'json');
        }


    } catch (error) {
        console.error('Controller error:', error);
        const contentType = req.get('Content-Type');
        return sendErrorResponse(res, '8011', 'Error processing request: ' + error.message, contentType.includes('json') ? 'json' : 'xml');
    }
}

/**
 * Convert product creation JSON to XML format for ESS
 */
function convertProductJSONToXML(jsonData) {
    console.log('🔄 Converting JSON to XML format...');
    console.log('Input JSON:', JSON.stringify(jsonData, null, 2));

    // Map JSON fields to XML structure according to e-MKOPO PRODUCT_DETAIL specification
    const xmlData = {
        Data: {
            Header: {
                Sender: process.env.FSP_NAME,
                Receiver: "ESS_UTUMISHI",
                FSPCode: process.env.FSP_CODE,
                MsgId: `PROD_${Date.now()}`,
                MessageType: "PRODUCT_DETAIL"
            },
            MessageDetails: {
                DeductionCode: jsonData.deductionCode,
                ProductCode: jsonData.productCode,
                ProductName: jsonData.productName,
                ProductDescription: jsonData.productDescription,
                ForExecutive: jsonData.forExecutive ? 'true' : 'false',
                MinimumTenure: jsonData.minTenure,
                MaximumTenure: jsonData.maxTenure,
                InterestRate: jsonData.interestRate,
                ProcessFee: jsonData.processingFee,
                Insurance: jsonData.insurance,
                MaxAmount: jsonData.maxAmount,
                MinAmount: jsonData.minAmount,
                RepaymentType: jsonData.repaymentType,
                Currency: "TZS", // Default currency
                InsuranceType: jsonData.insuranceType,
                ShariaFacility: jsonData.shariaFacility ? 'true' : 'false'
            }
        }
    };

    // Add TermsCondition if provided - FIXED STRUCTURE
    if (jsonData.termsCondition && Array.isArray(jsonData.termsCondition) && jsonData.termsCondition.length > 0) {
        xmlData.Data.MessageDetails.TermsCondition = jsonData.termsCondition.map(term => ({
            TermsConditionNumber: term.termNumber,
            Description: term.description,
            TCEffectiveDate: term.effectiveDate
        }));
    }

    const xml = builder.buildObject(xmlData);
    console.log('✅ Generated XML:', xml);
    return xml;
}
/**
 * Convert XML to JSON for response
 */
async function convertXMLToJSON(xmlData) {
    try {
        const parser = new xml2js.Parser({
            explicitArray: false,
            mergeAttrs: true,
            normalize: true
        });

        const result = await parser.parseStringPromise(xmlData);
        return result;
    } catch (error) {
        console.error('XML to JSON conversion error:', error);
        throw error;
    }
}

/**
 * Send error response in appropriate format
 */
function sendErrorResponse(res, code, description, format = 'json') {
    if (format === 'xml') {
        const errorResponse = digitalSignature.createSignedXML({
            Header: {
                Sender: process.env.FSP_NAME,
                Receiver: 'FRONTEND',
                FSPCode: process.env.FSP_CODE,
                MsgId: `ERR${Date.now()}`,
                MessageType: 'RESPONSE'
            },
            MessageDetails: {
                ResponseCode: code,
                Description: description
            }
        });

        res.set('Content-Type', 'application/xml');
        res.status(400).send(errorResponse);
    } else {
        res.status(400).json({
            responseCode: code,
            description: description,
            timestamp: new Date().toISOString()
        });
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

        console.log('Extracted loan data:', loanData);

        // Call your loan service directly
        const result = await LoanCalculate(loanData);

        // Convert result to ESS response format
        const responseData = {
            Data: {
                Header: {
                    Sender: process.env.FSP_NAME || "FSP_SYSTEM",
                    Receiver: "ESS_UTUMISHI",
                    FSPCode: parsedData.Document.Data.Header.FSPCode,
                    MsgId: `RESP_${Date.now()}`,
                    MessageType: "LOAN_CHARGES_RESPONSE"
                },
                MessageDetails: {
                    DesiredDeductibleAmount: result.desiredDeductibleAmount || "0.00",
                    TotalInsurance: result.totalInsurance || "0.00",
                    TotalProcessingFees: result.totalProcessingFees || "0.00",
                    TotalInterestRateAmount: result.totalInterestRateAmount || "0.00",
                    OtherCharges: "0.00", // Add if your service provides this
                    NetLoanAmount: result.netLoanAmount || "0.00",
                    TotalAmountToPay: result.totalAmountToPay || "0.00",
                    Tenure: result.tenure?.toString() || "0",
                    EligibleAmount: result.eligibleAmount || "0.00",
                    MonthlyReturnAmount: result.monthlyReturnAmount || "0.00"
                }
            }
        };

        // Generate signed XML response
        const signedResponse = digitalSignature.createSignedXML(responseData.Data);

        res.set('Content-Type', 'application/xml');
        res.send(signedResponse);

    } catch (error) {
        console.error('Error processing loan charges request:', error);
        return sendErrorResponse(res, '8012', 'Error calculating loan charges: ' + error.message, 'xml');
    }
}

/**
 * Handle LOAN_OFFER_REQUEST - Process loan application
 */
async function handleLoanOfferRequest(parsedData, res) {
    try {
        console.log('Processing LOAN_OFFER_REQUEST...');

        const messageDetails = parsedData.Document.Data.MessageDetails;

        // Extract all loan offer data
        const loanOfferData = {
            checkNumber: messageDetails.CheckNumber,
            firstName: messageDetails.FirstName,
            middleName: messageDetails.MiddleName,
            lastName: messageDetails.LastName,
            sex: messageDetails.Sex,
            employmentDate: messageDetails.EmploymentDate,
            maritalStatus: messageDetails.MaritalStatus,
            confirmationDate: messageDetails.ConfirmationDate,
            bankAccountNumber: messageDetails.BankAccountNumber,
            nearestBranchName: messageDetails.NearestBranchName,
            nearestBranchCode: messageDetails.NearestBranchCode,
            voteCode: messageDetails.VoteCode,
            voteName: messageDetails.VoteName,
            nin: messageDetails.NIN,
            designationCode: messageDetails.DesignationCode,
            designationName: messageDetails.DesignationName,
            basicSalary: parseFloat(messageDetails.BasicSalary),
            netSalary: parseFloat(messageDetails.NetSalary),
            oneThirdAmount: parseFloat(messageDetails.OneThirdAmount),
            totalEmployeeDeduction: parseFloat(messageDetails.TotalEmployeeDeduction),
            retirementDate: messageDetails.RetirementDate,
            termsOfEmployment: messageDetails.TermsOfEmployment,
            requestedAmount: parseFloat(messageDetails.RequestedAmount),
            desiredDeductibleAmount: parseFloat(messageDetails.DesiredDeductibleAmount),
            tenure: parseInt(messageDetails.Tenure),
            fspCode: parsedData.Document.Data.Header.FSPCode,
            productCode: messageDetails.ProductCode,
            interestRate: parseFloat(messageDetails.InterestRate),
            processingFee: parseFloat(messageDetails.ProcessingFee),
            insurance: parseFloat(messageDetails.Insurance),
            physicalAddress: messageDetails.PhysicalAddress,
            telephoneNumber: messageDetails.TelephoneNumber,
            emailAddress: messageDetails.EmailAddress,
            mobileNumber: messageDetails.MobileNumber,
            applicationNumber: messageDetails.ApplicationNumber,
            loanPurpose: messageDetails.LoanPurpose,
            contractStartDate: messageDetails.ContractStartDate,
            contractEndDate: messageDetails.ContractEndDate,
            swiftCode: messageDetails.SwiftCode,
            funding: messageDetails.Funding
        };

        console.log('Processing loan offer:', loanOfferData);

        // TODO: Call your loan offer processing service
        // const result = await processLoanOffer(loanOfferData);

        // For now, return immediate approval notification
        const responseData = {
            Data: {
                Header: {
                    Sender: process.env.FSP_NAME || "FSP_SYSTEM",
                    Receiver: "ESS_UTUMISHI",
                    FSPCode: parsedData.Document.Data.Header.FSPCode,
                    MsgId: `OFFER_${Date.now()}`,
                    MessageType: "LOAN_INITIAL_APPROVAL_NOTIFICATION"
                },
                MessageDetails: {
                    ApplicationNumber: loanOfferData.applicationNumber,
                    Reason: "Loan offer received successfully",
                    FSPReferenceNumber: `FSPREF${Date.now()}`,
                    LoanNumber: `LN${Date.now()}`,
                    TotalAmountToPay: "0.00", // Calculate based on your business logic
                    OtherCharges: "0.00",
                    Approval: "APPROVED" // or "REJECTED" based on your logic
                }
            }
        };

        const signedResponse = digitalSignature.createSignedXML(responseData.Data);
        res.set('Content-Type', 'application/xml');
        res.send(signedResponse);

    } catch (error) {
        console.error('Error processing loan offer request:', error);
        return sendErrorResponse(res, '8013', 'Error processing loan offer: ' + error.message, 'xml');
    }
}

/**
 * Handle LOAN_FINAL_APPROVAL_NOTIFICATION - Final approval from ESS
 */
async function handleLoanFinalApproval(parsedData, res) {
    try {
        console.log('Processing LOAN_FINAL_APPROVAL_NOTIFICATION...');

        const messageDetails = parsedData.Document.Data.MessageDetails;

        // Process final approval
        const approvalData = {
            applicationNumber: messageDetails.ApplicationNumber,
            reason: messageDetails.Reason,
            fspReferenceNumber: messageDetails.FSPReferenceNumber,
            loanNumber: messageDetails.LoanNumber,
            approval: messageDetails.Approval
        };

        console.log('Final approval data:', approvalData);

        // TODO: Update loan status in your system
        // await updateLoanStatus(approvalData);

        // Return acknowledgment
        const responseData = {
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
                    Description: "Final approval processed successfully"
                }
            }
        };

        const signedResponse = digitalSignature.createSignedXML(responseData.Data);
        res.set('Content-Type', 'application/xml');
        res.send(signedResponse);

    } catch (error) {
        console.error('Error processing final approval:', error);
        return sendErrorResponse(res, '8014', 'Error processing final approval: ' + error.message, 'xml');
    }
}

/**
 * Handle LOAN_CANCELLATION_NOTIFICATION - Loan cancellation
 */
async function handleLoanCancellation(parsedData, res) {
    try {
        console.log('Processing LOAN_CANCELLATION_NOTIFICATION...');

        const messageDetails = parsedData.Document.Data.MessageDetails;

        const cancellationData = {
            applicationNumber: messageDetails.ApplicationNumber,
            reason: messageDetails.Reason,
            fspReferenceNumber: messageDetails.FSPReferenceNumber,
            loanNumber: messageDetails.LoanNumber
        };

        console.log('Cancellation data:', cancellationData);

        // TODO: Process cancellation in your system
        // await cancelLoan(cancellationData);

        // Return acknowledgment
        const responseData = {
            Data: {
                Header: {
                    Sender: process.env.FSP_NAME || "FSP_SYSTEM",
                    Receiver: "ESS_UTUMISHI",
                    FSPCode: parsedData.Document.Data.Header.FSPCode,
                    MsgId: `CANCEL_${Date.now()}`,
                    MessageType: "RESPONSE"
                },
                MessageDetails: {
                    ResponseCode: "8000",
                    Description: "Loan cancellation processed successfully"
                }
            }
        };

        const signedResponse = digitalSignature.createSignedXML(responseData.Data);
        res.set('Content-Type', 'application/xml');
        res.send(signedResponse);

    } catch (error) {
        console.error('Error processing loan cancellation:', error);
        return sendErrorResponse(res, '8015', 'Error processing loan cancellation: ' + error.message, 'xml');
    }
}


async function forwardToESS(parsedData, res, contentType) {
    // Step 1: Validate XML structure and extract data
    const validationResult = validateXML(parsedData);
    if (!validationResult.isValid) {
        console.error('XML validation failed:', validationResult.description);
        return sendErrorResponse(res, validationResult.errorCode || '8001', validationResult.description, contentType.includes('json') ? 'json' : 'xml');
    }

    // Get the extracted data element
    const dataElement = validationResult.data;
    const header = dataElement.Header || dataElement.header;
    const messageType = header.MessageType;

    console.log(`Processing ${messageType} request from ${header.Sender} to ${header.Receiver}`);

    // Step 2: Validate message-specific structure
    const messageValidation = validateMessageType(messageType, dataElement);
    if (!messageValidation.isValid) {
        console.error('Message validation failed:', messageValidation.description);
        return sendErrorResponse(res, '8001', messageValidation.description, contentType.includes('json') ? 'json' : 'xml');
    }

    // Step 3: AUTO-GENERATE SIGNATURE for the request
    console.log('Auto-generating digital signature...');
    try {
        // Create proper e-MKOPO format with Document root
        const dataForESS = {
            Header: header,
            MessageDetails: dataElement.MessageDetails || dataElement.messagedetails
        };

        const signedXml = digitalSignature.createSignedXML(dataForESS);
        console.log('Signature generated successfully');

        // Step 4: Forward SIGNED XML to ESS
        console.log(`Forwarding signed ${messageType} to ESS...`);
        const thirdPartyResponse = await forwardToThirdParty(signedXml, messageType);

        // Step 5: Send response back to frontend in same format as request
        console.log('Sending response to frontend');
        if (contentType.includes('application/json')) {
            // Convert XML response to JSON
            try {
                const jsonResponse = await convertXMLToJSON(thirdPartyResponse);
                res.json(jsonResponse);
            } catch (convertError) {
                console.error('Failed to convert ESS response to JSON:', convertError.message);
                // Fallback to XML response
                res.set('Content-Type', 'application/xml');
                res.send(thirdPartyResponse);
            }
        } else {
            res.set('Content-Type', 'application/xml');
            res.send(thirdPartyResponse);
        }

    } catch (signError) {
        console.error('Signature generation failed:', signError.message);
        return sendErrorResponse(res, '8009', 'Digital signature generation failed: ' + signError.message, contentType.includes('json') ? 'json' : 'xml');
    }
}

module.exports = {
    processRequest
};