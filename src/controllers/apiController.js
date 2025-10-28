const xml2js = require('xml2js');
const { validateXML, validateMessageType } = require('../validations/xmlValidator');
const { forwardToThirdParty } = require('../services/thirdPartyService');
const digitalSignature = require('../utils/signatureUtils');
const { LoanCalculate, CreateTopUpLoanOffer, CreateTakeoverLoanOffer, CreateLoanOffer } = require('../services/loanService');
const LoanMappingService = require('../services/loanMappingService');
const cbsApi = require('../services/cbs.api');

const parser = new xml2js.Parser({
    explicitArray: false,
    mergeAttrs: true,
    normalize: true,
    trim: true
});

// Database-backed loan mapping service replaces in-memory store

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
                return sendErrorResponse(res, '8001', 'Invalid JSON data', 'json', null);
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
                return sendErrorResponse(res, '8001', 'Failed to convert JSON to XML: ' + parseError.message, 'json', null);
            }

        }
        // Handle XML input directly
        else if (contentType && (contentType.includes('application/xml') || contentType.includes('text/xml'))) {
            console.log('Processing XML directly...');
            xmlData = req.body;

            if (!xmlData) {
                return sendErrorResponse(res, '8001', 'XML data is required', 'xml', parsedData);
            }

            try {
                parsedData = await parser.parseStringPromise(xmlData);
                // Debug log: print the parsed <Sender> value
                const debugSender = parsedData?.Document?.Data?.Header?.Sender;
                console.log('DEBUG: Parsed <Sender> from request:', debugSender);
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
                console.error('❌ XML parsing failed:', parseError.message);
                return sendErrorResponse(res, '8001', 'Invalid XML format: ' + parseError.message, 'xml', parsedData);
            }

        }
        // Unsupported content type
        else {
            return sendErrorResponse(res, '8001', 'Unsupported Content-Type. Use application/json or application/xml', 'json', null);
        }


    } catch (error) {
        console.error('Controller error:', error);
        const contentType = req.get('Content-Type');
    return sendErrorResponse(res, '8011', 'Error processing request: ' + error.message, contentType.includes('json') ? 'json' : 'xml', null);
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
        // For RESPONSE, set Receiver to original Sender if parsedData is provided
        let receiver = 'ESS_UTUMISHI';
        if (arguments.length > 4 && arguments[4] && arguments[4].Document && arguments[4].Document.Data && arguments[4].Document.Data.Header && arguments[4].Document.Data.Header.Sender) {
            receiver = arguments[4].Document.Data.Header.Sender;
        }
        const errorResponse = digitalSignature.createSignedXML({
            Header: {
                Sender: process.env.FSP_NAME,
                Receiver: receiver,
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

        // Call the loan offer processing service to create client and loan
        const result = await CreateLoanOffer(loanOfferData);

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
                    Reason: "Loan offer calculated successfully",
                    FSPReferenceNumber: result.fspReferenceNumber,
                    LoanNumber: `CALC_${result.applicationNumber || Date.now()}`, // Placeholder loan number for calculation
                    TotalAmountToPay: result.totalAmount.toString(),
                    OtherCharges: "0.00",
                    Approval: result.approvalStatus
                }
            }
        };

        // Store loan offer calculation in database
        try {
            await LoanMappingService.createInitialMapping(
                loanOfferData.applicationNumber,
                loanOfferData.checkNumber,
                result.fspReferenceNumber,
                {
                    productCode: loanOfferData.productCode,
                    requestedAmount: loanOfferData.requestedAmount,
                    tenure: loanOfferData.tenure,
                    calculatedAmount: result.totalAmount,
                    monthlyPayment: result.monthlyPayment,
                    totalInterest: result.totalInterest,
                    status: 'CALCULATED' // Indicates this is just a calculation, not actual loan
                }
            );
        } catch (mappingError) {
            console.error('❌ Error storing loan calculation:', mappingError);
            // Continue with response even if mapping fails
        }

        const signedResponse = digitalSignature.createSignedXML(responseData.Data);
        res.set('Content-Type', 'application/xml');
        res.send(signedResponse);

    } catch (error) {
        console.error('Error processing loan offer request:', error);
    return sendErrorResponse(res, '8013', 'Error processing loan offer: ' + error.message, 'xml', parsedData);
    }
}

/**
 * Handle LOAN_FINAL_APPROVAL_NOTIFICATION - Final approval from ESS
 */
async function handleLoanFinalApproval(parsedData, res) {
    try {
        console.log('Processing LOAN_FINAL_APPROVAL_NOTIFICATION...');

        const messageDetails = parsedData.Document.Data.MessageDetails;
        console.log('Raw messageDetails:', JSON.stringify(messageDetails, null, 2));

        // Extract approval data and customer information
        const approvalData = {
            applicationNumber: messageDetails.ApplicationNumber,
            reason: messageDetails.Reason,
            fspReferenceNumber: messageDetails.FSPReferenceNumber,
            loanNumber: messageDetails.LoanNumber,
            approval: messageDetails.Approval,
            // Customer data (assuming these fields are in the message)
            nin: messageDetails.NIN || messageDetails.nin, // National ID Number
            firstName: messageDetails.FirstName || messageDetails.firstName,
            middleName: messageDetails.MiddleName || messageDetails.middleName,
            lastName: messageDetails.LastName || messageDetails.lastName,
            mobileNo: messageDetails.MobileNo || messageDetails.mobileNo,
            sex: messageDetails.Sex || messageDetails.sex,
            dateOfBirth: messageDetails.DateOfBirth || messageDetails.dateOfBirth,
            employmentDate: messageDetails.EmploymentDate || messageDetails.employmentDate,
            bankAccountNumber: messageDetails.BankAccountNumber || messageDetails.bankAccountNumber,
            swiftCode: messageDetails.SwiftCode || messageDetails.swiftCode,
            checkNumber: messageDetails.CheckNumber || messageDetails.checkNumber,
            maritalStatus: messageDetails.MaritalStatus || messageDetails.maritalStatus,
            retirementDate: messageDetails.RetirementDate || messageDetails.retirementDate,
            physicalAddress: messageDetails.PhysicalAddress || messageDetails.physicalAddress,
            emailAddress: messageDetails.EmailAddress || messageDetails.emailAddress,
            contractEndDate: messageDetails.ContractEndDate || messageDetails.contractEndDate,
            // Loan data
            requestedAmount: messageDetails.RequestedAmount || messageDetails.requestedAmount,
            productCode: messageDetails.ProductCode || messageDetails.productCode,
            tenure: messageDetails.Tenure || messageDetails.tenure,
            interestRate: messageDetails.InterestRate || messageDetails.interestRate,
            processingFee: messageDetails.ProcessingFee || messageDetails.processingFee,
            insurance: messageDetails.Insurance || messageDetails.insurance
        };

        console.log('Final approval data:', approvalData);

        // Update loan mapping with final approval data
        try {
            await LoanMappingService.updateWithFinalApproval(approvalData.loanNumber, approvalData);
        } catch (mappingError) {
            console.error('❌ Error updating loan mapping with final approval:', mappingError);
            // Continue processing even if mapping update fails
        }

        // 1. Check if customer exists using NIN as external ID
        let clientExists = false;
        let clientId = null;

        if (approvalData.nin) {
            try {
                console.log('Checking if client exists with NIN:', approvalData.nin);
                const clientSearch = await cbsApi.get(`/v1/clients?externalId=${approvalData.nin}`);
                clientExists = clientSearch.status && clientSearch.response && clientSearch.response.pageItems && clientSearch.response.pageItems.length > 0;
                if (clientExists) {
                    clientId = clientSearch.response.pageItems[0].id;
                    console.log('✅ Client exists with ID:', clientId);
                }
            } catch (error) {
                console.log('Client search failed, will create new client:', error.message);
            }
        }

        if (!clientExists) {
            // 2. Create customer in MIFOS
            console.log('Creating new client in MIFOS...');

            // Format phone number with country code 255
            const formattedMobile = approvalData.mobileNo ?
                (approvalData.mobileNo.startsWith('+') ? approvalData.mobileNo : `+255${approvalData.mobileNo.replace(/^0/, '')}`) : null;

            // Map gender (optional - skip if not available)
            // const genderMapping = { 'M': 1, 'F': 1 }; // Temporarily map both to 1 until MIFOS gender codes are verified
            // const genderId = genderMapping[approvalData.sex] || undefined;
            console.log('=== GENDER DISABLED - MIFOS GENDER CODES NOT CONFIGURED -', new Date().toISOString(), '===');
            console.log('Skipping gender mapping - MIFOS gender codes not configured in tenant zedone-uat');

            const clientPayload = {
                firstname: approvalData.firstName,
                lastname: approvalData.lastName,
                middlename: approvalData.middleName || '',
                externalId: approvalData.nin,
                dateOfBirth: approvalData.dateOfBirth,
                mobileNo: formattedMobile,
                emailAddress: approvalData.emailAddress,
                // Gender mapping: Female = 16, Male = 15 (MIFOS zedone-uat codes)
                genderId: approvalData.sex === 'F' ? 16 : approvalData.sex === 'M' ? 15 : undefined,
                officeId: 1, // Head Office
                activationDate: new Date().toISOString().split('T')[0],
                submittedOnDate: new Date().toISOString().split('T')[0],
                legalFormId: 1, // Person
                isStaff: false,
                locale: 'en',
                dateFormat: 'yyyy-MM-dd'
                // Note: addresses not supported in this MIFOS version
            };

            console.log('Final client payload:', JSON.stringify(clientPayload, null, 2));

            // Create base payload with only standard MIFOS fields
            const baseClientPayload = {
                firstname: approvalData.firstName,
                lastname: approvalData.lastName,
                middlename: approvalData.middleName || '',
                externalId: approvalData.nin,
                dateOfBirth: approvalData.dateOfBirth,
                mobileNo: formattedMobile,
                emailAddress: approvalData.emailAddress,
                genderId: approvalData.sex === 'F' ? 16 : approvalData.sex === 'M' ? 15 : undefined,
                officeId: 1, // Head Office
                activationDate: new Date().toISOString().split('T')[0],
                submittedOnDate: new Date().toISOString().split('T')[0],
                legalFormId: 1, // Person
                isStaff: false,
                locale: 'en',
                dateFormat: 'yyyy-MM-dd'
                // Note: addresses not supported in this MIFOS version
            };

            // Fields to be stored in client_onboarding datatable
            const datatableFields = {
                checkNumber: approvalData.checkNumber,
                bankAccountNumber: approvalData.bankAccountNumber,
                employmentDate: approvalData.employmentDate,
                swiftCode: approvalData.swiftCode
            };

            let clientResponse;
            let clientId;

            try {
                // First attempt: Try to create client with all fields
                console.log('Attempting client creation with full payload...');
                clientResponse = await cbsApi.post('/v1/clients', clientPayload);

                if (clientResponse.status) {
                    console.log('✅ Client created successfully with full payload');
                    clientId = clientResponse.response.clientId;
                } else {
                    console.error('❌ MIFOS API returned error for full payload:', JSON.stringify(clientResponse, null, 2));
                    throw new Error('Client creation failed: ' + JSON.stringify(clientResponse.response));
                }
            } catch (fullPayloadError) {
                console.log('⚠️ Full payload failed, attempting with base fields only...');

                try {
                    // Second attempt: Create client with only standard MIFOS fields
                    clientResponse = await cbsApi.post('/v1/clients', baseClientPayload);

                    if (clientResponse.status) {
                        console.log('✅ Client created successfully with base payload');
                        clientId = clientResponse.response.clientId;

                        // Store datatable fields in client_onboarding datatable
                        console.log('Storing datatable fields in client_onboarding...');
                        await storeClientOnboardingData(clientId, datatableFields);
                    } else {
                        console.error('❌ MIFOS API returned error for base payload:', JSON.stringify(clientResponse, null, 2));
                        throw new Error('Base client creation failed: ' + JSON.stringify(clientResponse.response));
                    }
                } catch (basePayloadError) {
                    console.error('❌ Both client creation attempts failed');
                    console.error('Full payload error:', fullPayloadError.message);
                    console.error('Base payload error:', basePayloadError.message);
                    throw new Error('Failed to create client in MIFOS - check MIFOS API credentials, server connectivity, and field validation');
                }
            }

            console.log('MIFOS client creation response status:', clientResponse.status);
            console.log('MIFOS client creation response:', JSON.stringify(clientResponse.response, null, 2));
            console.log('✅ Client created successfully:', clientId);

        if (!clientExists) {
            // Update loan mapping with MIFOS client ID for new clients
            try {
                await LoanMappingService.updateWithClientCreation(approvalData.loanNumber, clientId);
            } catch (mappingError) {
                console.error('❌ Error updating loan mapping with client creation:', mappingError);
            }
        } else {
            console.log('Client already exists with NIN:', approvalData.nin, 'ID:', clientId);
        }

        // 3. Check and activate client if needed
        console.log('Checking client activation status...');
        const clientDetailsResponse = await cbsApi.get(`/v1/clients/${clientId}`);
        if (!clientDetailsResponse.status) {
            throw new Error('Failed to get client details: ' + JSON.stringify(clientDetailsResponse.response));
        }

        const clientDetails = clientDetailsResponse.response;
        const isActive = clientDetails.active;

        if (!isActive) {
            console.log('Client is not active, activating...');
            const activationResponse = await cbsApi.post(`/v1/clients/${clientId}?command=activate`, {
                activationDate: new Date().toISOString().split('T')[0],
                locale: 'en',
                dateFormat: 'yyyy-MM-dd'
            });

            if (!activationResponse.status) {
                console.log('⚠️ Client activation failed, but continuing:', activationResponse.message);
            } else {
                console.log('✅ Client activated successfully');
            }
        } else {
            console.log('✅ Client is already active');
        }

            // Insert client onboarding datatable data
            if (approvalData.checkNumber) {
                const formatEmploymentDate = (dateString) => {
                    if (!dateString) return null;
                    const date = new Date(dateString);
                    const day = date.getDate();
                    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                                      'July', 'August', 'September', 'October', 'November', 'December'];
                    const month = monthNames[date.getMonth()];
                    const year = date.getFullYear();
                    return `${day} ${month} ${year}`;
                };

                const onboardingData = {
                    dateFormat: 'dd MMMM yyyy',
                    locale: 'en',
                    CheckNumber: approvalData.checkNumber,
                    Sex: approvalData.sex,
                    BankAccountNumber: approvalData.bankAccountNumber,
                    EmploymentDate: formatEmploymentDate(approvalData.employmentDate),
                    MaritalStatus: approvalData.maritalStatus,
                    PhysicalAddress: approvalData.physicalAddress,
                    ContractEndDate: approvalData.contractEndDate,
                    SwiftCode: approvalData.swiftCode
                };

                try {
                    const datatableResponse = await cbsApi.post(`/v1/datatables/client_onboarding/${clientId}`, onboardingData);
                    if (datatableResponse.status) {
                        console.log('✅ Client onboarding data inserted successfully');
                    }
                } catch (datatableError) {
                    console.log('⚠️ Datatable insertion failed:', datatableError.message);
                }
            }
        } else {
            console.log('Client already exists with NIN:', approvalData.nin, 'ID:', clientId);
        }

        // 5. Check if loan already exists for this LoanNumber
        console.log('Checking if loan already exists for LoanNumber:', approvalData.loanNumber);
        let existingLoanId = null;
        
        try {
            const existingMapping = await LoanMappingService.getByEssLoanNumberAlias(approvalData.loanNumber);
            if (existingMapping && existingMapping.mifosLoanId) {
                existingLoanId = existingMapping.mifosLoanId;
                console.log('✅ Found existing loan:', existingLoanId);
            } else {
                console.log('No existing loan found for this LoanNumber, will create new loan');
            }
        } catch (error) {
            console.log('Error checking existing loan mapping:', error.message);
            console.log('Will create new loan');
        }

        let loanId;

        if (existingLoanId) {
            // Use existing loan
            loanId = existingLoanId;
            console.log('Using existing loan ID:', loanId);
        } else {
            // 6. Create Loan in MIFOS (only if it doesn't exist)
            console.log('Creating loan in MIFOS...');

            // Get loan product details (use valid product ID 17)
            const productResponse = await cbsApi.get(`/v1/loanproducts/${approvalData.productCode || 17}`);
            if (!productResponse.status) {
                throw new Error('Loan product not found: ' + (approvalData.productCode || 17));
            }

            const product = productResponse.response;
            console.log('Product details retrieved:', product.name);

            // Create loan payload
            const loanPayload = {
                clientId: clientId,
                productId: approvalData.productCode || 17, // Use valid product ID 17 as default
                principal: approvalData.requestedAmount,
                loanTermFrequency: approvalData.tenure,
                loanTermFrequencyType: 2, // Months
                numberOfRepayments: approvalData.tenure,
                repaymentEvery: 1,
                repaymentFrequencyType: 2, // Months
                interestRatePerPeriod: approvalData.interestRate || 28, // Use product default
                amortizationType: 1, // Equal installments
                interestType: 0, // Declining balance
                interestCalculationPeriodType: 1, // Same as repayment period
                submittedOnDate: new Date().toISOString().split('T')[0],
                expectedDisbursementDate: new Date().toISOString().split('T')[0],
                loanType: 'individual', // Required for individual loans
                transactionProcessingStrategyCode: 'mifos-standard-strategy', // Standard repayment strategy
                locale: 'en',
                dateFormat: 'yyyy-MM-dd'
            };

            const loanResponse = await cbsApi.post('/v1/loans', loanPayload);
            if (!loanResponse.status) {
                throw new Error('Failed to create loan: ' + JSON.stringify(loanResponse.response));
            }

            loanId = loanResponse.response.loanId;
            console.log('✅ Loan created successfully:', loanId);

            // Update loan mapping with MIFOS loan details
            try {
                await LoanMappingService.updateWithLoanCreation(
                    approvalData.loanNumber,
                    loanId,
                    loanResponse.response.accountNo || `LOAN${loanId}`
                );
            } catch (mappingError) {
                console.error('❌ Error updating loan mapping with loan creation:', mappingError);
            }
        }

        // 7. Check current loan status
        console.log('Checking current loan status...');
        const loanDetailsResponse = await cbsApi.get(`/v1/loans/${loanId}`);
        if (!loanDetailsResponse.status) {
            throw new Error('Failed to get loan details: ' + JSON.stringify(loanDetailsResponse.response));
        }
        
        const loanStatus = loanDetailsResponse.response.status?.code;
        console.log('Current loan status:', loanStatus);

        // 8. Approve LOAN in MIFOS (if not already approved)
        let loanApproved = false;
        if (loanStatus !== '300' && loanStatus !== '400') { // Not approved or disbursed
            console.log('Approving loan...');
            const approvalResponse = await cbsApi.post(`/v1/loans/${loanId}?command=approve`, {
                approvedOnDate: new Date().toISOString().split('T')[0],
                approvedLoanAmount: approvalData.requestedAmount,
                locale: 'en',
                dateFormat: 'yyyy-MM-dd'
            });

            if (!approvalResponse.status) {
                throw new Error('Failed to approve loan: ' + JSON.stringify(approvalResponse.response));
            }

            console.log('✅ Loan approved successfully');
            loanApproved = true;
        } else {
            console.log('Loan already approved or disbursed');
        }

        // 9. Disburse LOAN in MIFOS (if not already disbursed)
        let loanDisbursed = false;
        if (loanStatus !== '400') { // Not disbursed
            console.log('Disbursing loan...');
            const disbursementResponse = await cbsApi.post(`/v1/loans/${loanId}?command=disburse`, {
                actualDisbursementDate: new Date().toISOString().split('T')[0],
                transactionAmount: approvalData.requestedAmount,
                locale: 'en',
                dateFormat: 'yyyy-MM-dd'
            });

            if (!disbursementResponse.status) {
                throw new Error('Failed to disburse loan: ' + JSON.stringify(disbursementResponse.response));
            }

            console.log('✅ Loan disbursed successfully');
            loanDisbursed = true;
        } else {
            console.log('Loan already disbursed');
        }

        // LOAN_DISBURSEMENT_NOTIFICATION will be sent to ESS when MIFOS webhook triggers disbursement event

        // Processing complete - no response sent to ESS
        // LOAN_DISBURSEMENT_NOTIFICATION will be sent via webhook when disbursement occurs

        console.log('✅ Final approval processing completed - awaiting disbursement notification');

    } catch (error) {
        console.error('Error processing final approval:', error);
        return sendErrorResponse(res, '8014', 'Error processing final approval: ' + error.message, 'xml', parsedData);
    }
}

/**
 * Handle MIFOS webhooks for loan events
 */
async function handleMifosWebhook(req, res) {
    try {
        console.log('Received MIFOS webhook:', JSON.stringify(req.body, null, 2));

        const webhookData = req.body;

        // Check if this is a loan disbursement event
        if (webhookData.entityName === 'LOAN' && webhookData.action === 'DISBURSE') {
            console.log('Processing loan disbursement webhook...');

            const loanId = webhookData.entityId;

            // Get loan mapping from database using MIFOS loan ID
            let loanMapping;
            try {
                loanMapping = await LoanMappingService.getByMifosLoanId(loanId);
                console.log('✅ Found loan mapping for disbursement:', loanMapping.essLoanNumber);
            } catch (mappingError) {
                console.error('❌ No loan mapping found for MIFOS loan ID:', loanId);
                return res.status(404).json({ error: 'Loan mapping not found' });
            }

            // Get loan details from MIFOS for additional data
            const loanDetailsResponse = await cbsApi.get(`/v1/loans/${loanId}`);
            if (!loanDetailsResponse.status) {
                console.error('Failed to get loan details for webhook:', loanDetailsResponse.message);
                return res.status(500).json({ error: 'Failed to get loan details' });
            }

            const loan = loanDetailsResponse.response;

            // Use the correct ESS identifiers from the mapping
            const applicationNumber = loanMapping.essApplicationNumber;
            const fspReferenceNumber = loanMapping.fspReferenceNumber;
            const loanNumber = loanMapping.essLoanNumberAlias; // Send back the alias that ESS knows

            // Get client details
            const clientDetailsResponse = await cbsApi.get(`/v1/clients/${loan.clientId}`);
            const client = clientDetailsResponse.status ? clientDetailsResponse.response : {};

            // Send LOAN_DISBURSEMENT_NOTIFICATION to ESS
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
                        ApplicationNumber: applicationNumber,
                        FSPReferenceNumber: fspReferenceNumber,
                        LoanNumber: loanNumber,
                        ClientId: loan.clientId,
                        LoanId: loanId,
                        DisbursedAmount: loan.principal,
                        DisbursementDate: new Date().toISOString().split('T')[0],
                        Status: "DISBURSED"
                    }
                }
            };

            // Create signed XML and send to ESS
            const signedDisbursementXml = digitalSignature.createSignedXML(disbursementNotification.Data);
            console.log('Sending LOAN_DISBURSEMENT_NOTIFICATION to ESS...');

            try {
                const essResponse = await forwardToThirdParty(signedDisbursementXml, "LOAN_DISBURSEMENT_NOTIFICATION");
                console.log('✅ LOAN_DISBURSEMENT_NOTIFICATION sent successfully to ESS');
                console.log('ESS Response:', essResponse);

                // Update loan mapping status to DISBURSED
                try {
                    await LoanMappingService.updateWithDisbursement(loanId);
                } catch (mappingError) {
                    console.error('❌ Error updating loan mapping with disbursement:', mappingError);
                }

            } catch (sendError) {
                console.error('❌ Failed to send LOAN_DISBURSEMENT_NOTIFICATION to ESS:', sendError.message);
                // Continue processing webhook even if notification fails
            }

            res.status(200).json({ status: 'success', message: 'Webhook processed, disbursement notification sent' });

        } else {
            console.log('Ignoring non-disbursement webhook event');
            res.status(200).json({ status: 'ignored', message: 'Event not processed' });
        }

    } catch (error) {
        console.error('Error processing MIFOS webhook:', error);
        res.status(500).json({ error: 'Webhook processing failed' });
    }
}
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
                    Receiver: parsedData.Document.Data.Header.Sender || "ESS_UTUMISHI",
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
    return sendErrorResponse(res, '8015', 'Error processing loan cancellation: ' + error.message, 'xml', parsedData);
    }
}


async function forwardToESS(parsedData, res, contentType) {
    // Step 1: Validate XML structure and extract data
    const validationResult = validateXML(parsedData);
    if (!validationResult.isValid) {
        console.error('XML validation failed:', validationResult.description);
    return sendErrorResponse(res, validationResult.errorCode || '8001', validationResult.description, contentType.includes('json') ? 'json' : 'xml', parsedData);
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
    return sendErrorResponse(res, '8001', messageValidation.description, contentType.includes('json') ? 'json' : 'xml', parsedData);
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
    return sendErrorResponse(res, '8009', 'Digital signature generation failed: ' + signError.message, contentType.includes('json') ? 'json' : 'xml', parsedData);
    }
}

/**
 * Handle TOP_UP_PAY_0FF_BALANCE_REQUEST - Get loan payoff balance
 */
async function handleTopUpPayOffBalanceRequest(parsedData, res) {
    try {
        console.log('Processing TOP_UP_PAY_0FF_BALANCE_REQUEST...');

        const messageDetails = parsedData.Document.Data.MessageDetails;
        const loanNumber = messageDetails.LoanNumber;

        console.log('Getting payoff balance for loan:', loanNumber);

        // Call MIFOS API to get loan payoff balance
        const payoffResponse = await cbsApi.get(`${API_ENDPOINTS.LOAN}${loanNumber}/transactions/template?command=payoff`);
        
        if (!payoffResponse.status) {
            console.error('MIFOS API error:', payoffResponse.message);
            return sendErrorResponse(res, '8014', 'Failed to retrieve loan balance from CBS', 'xml');
        }

        const balanceAmount = payoffResponse.response.amount || 0;

        // Create response
        const responseData = {
            Data: {
                Header: {
                    Sender: process.env.FSP_NAME || "ZE DONE",
                    Receiver: "ESS_UTUMISHI",
                    FSPCode: parsedData.Document.Data.Header.FSPCode,
                    MsgId: `BAL_${Date.now()}`,
                    MessageType: "LOAN_TOP_UP_BALANCE_RESPONSE"
                },
                MessageDetails: {
                    CheckNumber: messageDetails.CheckNumber,
                    LoanNumber: loanNumber,
                    BalanceAmount: balanceAmount.toFixed(2),
                    Currency: "TZS",
                    ResponseCode: "00",
                    ResponseDescription: "Success",
                    TransactionReference: `TXN${Date.now()}`
                }
            }
        };

        const signedResponse = digitalSignature.createSignedXML(responseData.Data);
        res.set('Content-Type', 'application/xml');
        res.send(signedResponse);

    } catch (error) {
        console.error('Error processing top-up pay-off balance request:', error);
    return sendErrorResponse(res, '8015', 'Error retrieving loan balance: ' + error.message, 'xml', parsedData);
    }
}

/**
 * Handle TOP_UP_OFFER_REQUEST - Process top-up loan offer
 */
async function handleTopUpOfferRequest(parsedData, res) {
    try {
        console.log('Processing TOP_UP_OFFER_REQUEST...');

        const messageDetails = parsedData.Document.Data.MessageDetails;

        // Extract top-up offer data
        const topUpOfferData = {
            checkNumber: messageDetails.CheckNumber,
            existingLoanNumber: messageDetails.ExistingLoanNumber,
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
            requestedTopUpAmount: parseFloat(messageDetails.RequestedTopUpAmount),
            productCode: messageDetails.ProductCode,
            interestRate: parseFloat(messageDetails.InterestRate),
            processingFee: parseFloat(messageDetails.ProcessingFee),
            insurance: parseFloat(messageDetails.Insurance),
            tenure: parseInt(messageDetails.Tenure),
            fspCode: parsedData.Document.Data.Header.FSPCode
        };

        console.log('Processing top-up offer:', topUpOfferData);

        // Call MIFOS API to create top-up loan offer
        const offerResult = await CreateTopUpLoanOffer(topUpOfferData);

        // Create response with calculated values
        const responseData = {
            Data: {
                Header: {
                    Sender: process.env.FSP_NAME || "ZE DONE",
                    Receiver: "ESS_UTUMISHI",
                    FSPCode: parsedData.Document.Data.Header.FSPCode,
                    MsgId: `TOPUP_${Date.now()}`,
                    MessageType: "LOAN_TOP_UP_OFFER_RESPONSE"
                },
                MessageDetails: {
                    CheckNumber: topUpOfferData.checkNumber,
                    ExistingLoanNumber: topUpOfferData.existingLoanNumber,
                    OfferedTopUpAmount: offerResult.offeredAmount.toFixed(2),
                    InterestRate: offerResult.interestRate.toFixed(2),
                    Tenure: offerResult.tenure,
                    MonthlyInstallment: offerResult.monthlyInstallment,
                    TotalPayable: offerResult.totalPayable,
                    ProcessingFee: topUpOfferData.processingFee.toFixed(2),
                    Insurance: topUpOfferData.insurance.toFixed(2),
                    ResponseCode: "00",
                    ResponseDescription: "Top-up offer created successfully",
                    FSPReferenceNumber: offerResult.loanId
                }
            }
        };

        const signedResponse = digitalSignature.createSignedXML(responseData.Data);
        res.set('Content-Type', 'application/xml');
        res.send(signedResponse);

    } catch (error) {
        console.error('Error processing top-up offer request:', error);
    return sendErrorResponse(res, '8016', 'Error processing top-up offer: ' + error.message, 'xml', parsedData);
    }
}

async function handleTakeoverPayOffBalanceRequest(parsedData, res) {
    try {
        console.log('Processing TAKEOVER_PAY_OFF_BALANCE_REQUEST...');

        const messageDetails = parsedData.Document.Data.MessageDetails;
        const loanNumber = messageDetails.LoanNumber;

        console.log('Getting takeover payoff balance for loan:', loanNumber);

        // Call MIFOS API to get loan payoff balance
        const payoffResponse = await cbsApi.get(`${API_ENDPOINTS.LOAN}${loanNumber}/transactions/template?command=payoff`);
        
        if (!payoffResponse.status) {
            console.error('MIFOS API error:', payoffResponse.message);
            return sendErrorResponse(res, '8014', 'Failed to retrieve loan balance from CBS', 'xml');
        }

        const balanceAmount = payoffResponse.response.amount || 0;

        // Create response
        const responseData = {
            Data: {
                Header: {
                    Sender: process.env.FSP_NAME || "ZE DONE",
                    Receiver: "ESS_UTUMISHI",
                    FSPCode: parsedData.Document.Data.Header.FSPCode,
                    MsgId: `TAKEOVER_BAL_${Date.now()}`,
                    MessageType: "LOAN_TAKEOVER_BALANCE_RESPONSE"
                },
                MessageDetails: {
                    CheckNumber: messageDetails.CheckNumber,
                    LoanNumber: loanNumber,
                    BalanceAmount: balanceAmount.toFixed(2),
                    Currency: "TZS",
                    ResponseCode: "00",
                    ResponseDescription: "Success",
                    TransactionReference: `TXN${Date.now()}`
                }
            }
        };

        const signedResponse = digitalSignature.createSignedXML(responseData.Data);
        res.set('Content-Type', 'application/xml');
        res.send(signedResponse);

    } catch (error) {
        console.error('Error processing takeover pay-off balance request:', error);
    return sendErrorResponse(res, '8015', 'Error retrieving loan balance: ' + error.message, 'xml', parsedData);
    }
}

async function handleLoanTakeoverOfferRequest(parsedData, res) {
    try {
        console.log('Processing LOAN_TAKEOVER_OFFER_REQUEST...');

        const messageDetails = parsedData.Document.Data.MessageDetails;

        // Extract takeover offer data
        const takeoverOfferData = {
            checkNumber: messageDetails.CheckNumber,
            existingLoanNumber: messageDetails.ExistingLoanNumber,
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
            requestedTakeoverAmount: parseFloat(messageDetails.RequestedTakeoverAmount),
            productCode: messageDetails.ProductCode,
            interestRate: parseFloat(messageDetails.InterestRate),
            processingFee: parseFloat(messageDetails.ProcessingFee),
            insurance: parseFloat(messageDetails.Insurance),
            tenure: parseInt(messageDetails.Tenure),
            fspCode: parsedData.Document.Data.Header.FSPCode
        };

        console.log('Processing takeover offer:', takeoverOfferData);

        // Call MIFOS API to create takeover loan offer
        const offerResult = await CreateTakeoverLoanOffer(takeoverOfferData);

        // Create response with calculated values
        const responseData = {
            Data: {
                Header: {
                    Sender: process.env.FSP_NAME || "ZE DONE",
                    Receiver: "ESS_UTUMISHI",
                    FSPCode: parsedData.Document.Data.Header.FSPCode,
                    MsgId: `TAKEOVER_${Date.now()}`,
                    MessageType: "LOAN_TAKEOVER_OFFER_RESPONSE"
                },
                MessageDetails: {
                    CheckNumber: takeoverOfferData.checkNumber,
                    ExistingLoanNumber: takeoverOfferData.existingLoanNumber,
                    OfferedTakeoverAmount: offerResult.offeredAmount.toFixed(2),
                    InterestRate: offerResult.interestRate.toFixed(2),
                    Tenure: offerResult.tenure,
                    MonthlyInstallment: offerResult.monthlyInstallment,
                    TotalPayable: offerResult.totalPayable,
                    ProcessingFee: takeoverOfferData.processingFee.toFixed(2),
                    Insurance: takeoverOfferData.insurance.toFixed(2),
                    ResponseCode: "00",
                    ResponseDescription: "Takeover offer created successfully",
                    FSPReferenceNumber: offerResult.loanId
                }
            }
        };

        const signedResponse = digitalSignature.createSignedXML(responseData.Data);
        res.set('Content-Type', 'application/xml');
        res.send(signedResponse);

    } catch (error) {
        console.error('Error processing takeover offer request:', error);
    return sendErrorResponse(res, '8017', 'Error processing takeover offer: ' + error.message, 'xml', parsedData);
    }
}

async function handleTakeoverPaymentNotification(parsedData, res) {
    try {
        console.log('Processing TAKEOVER_PAYMENT_NOTIFICATION...');

        const messageDetails = parsedData.Document.Data.MessageDetails;

        // Extract takeover payment data
        const paymentData = {
            applicationNumber: messageDetails.ApplicationNumber,
            fspReferenceNumber: messageDetails.FSPReferenceNumber,
            loanNumber: messageDetails.LoanNumber,
            clientId: messageDetails.ClientId,
            loanId: messageDetails.LoanId,
            loanAccountNumber: messageDetails.LoanAccountNumber,
            disbursementAmount: parseFloat(messageDetails.DisbursementAmount),
            disbursementDate: messageDetails.DisbursementDate,
            bankAccountNumber: messageDetails.BankAccountNumber,
            swiftCode: messageDetails.SwiftCode,
            checkNumber: messageDetails.CheckNumber,
            requestedAmount: parseFloat(messageDetails.RequestedAmount),
            productCode: messageDetails.ProductCode,
            tenure: parseInt(messageDetails.Tenure),
            interestRate: parseFloat(messageDetails.InterestRate),
            processingFee: parseFloat(messageDetails.ProcessingFee),
            insurance: parseFloat(messageDetails.Insurance)
        };

        console.log('Processing takeover payment notification:', paymentData);

        // Update loan mapping with final approval details
        await loanMappingService.updateWithFinalApproval(
            paymentData.applicationNumber,
            paymentData.loanNumber,
            paymentData.clientId,
            paymentData.loanId,
            'TAKEOVER'
        );

        // Process takeover payment through MIFOS
        const paymentResult = await processTakeoverPayment(paymentData);

        console.log('Takeover payment processed successfully');

        // For notifications, we don't send a response back
        res.status(200).send('Takeover payment notification processed successfully');

    } catch (error) {
        console.error('Error processing takeover payment notification:', error);
        return sendErrorResponse(res, '8018', 'Error processing takeover payment: ' + error.message, 'xml', parsedData);
    }
}

/**
 * Store client onboarding data in MIFOS client_onboarding datatable
 */
async function storeClientOnboardingData(clientId, datatableFields) {
    try {
        console.log('Storing client onboarding data for client ID:', clientId);

        // Prepare datatable payload with only non-null values
        const datatablePayload = {
            dateFormat: 'dd MMMM yyyy',
            locale: 'en'
        };

        // Format employment date if present
        if (datatableFields.employmentDate) {
            const formatEmploymentDate = (dateString) => {
                if (!dateString) return null;
                const date = new Date(dateString);
                const day = date.getDate();
                const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                                  'July', 'August', 'September', 'October', 'November', 'December'];
                const month = monthNames[date.getMonth()];
                const year = date.getFullYear();
                return `${day} ${month} ${year}`;
            };
            datatablePayload.EmploymentDate = formatEmploymentDate(datatableFields.employmentDate);
        }

        // Add other fields if they exist
        if (datatableFields.checkNumber) datatablePayload.CheckNumber = datatableFields.checkNumber;
        if (datatableFields.bankAccountNumber) datatablePayload.BankAccountNumber = datatableFields.bankAccountNumber;
        if (datatableFields.swiftCode) datatablePayload.SwiftCode = datatableFields.swiftCode;

        console.log('Client onboarding datatable payload:', JSON.stringify(datatablePayload, null, 2));

        // Store in client_onboarding datatable
        const datatableResponse = await cbsApi.post(`/v1/datatables/client_onboarding/${clientId}`, datatablePayload);

        if (datatableResponse.status) {
            console.log('✅ Client onboarding data stored successfully in datatable');
        } else {
            console.log('⚠️ Failed to store client onboarding data in datatable:', datatableResponse.message);
            // Don't throw error here - client was created successfully, just log the warning
        }

    } catch (error) {
        console.log('⚠️ Error storing client onboarding data:', error.message);
        // Don't throw error - client creation was successful
    }
}

module.exports = {
    processRequest,
    handleMifosWebhook
};