const logger = require('../../utils/logger');
const digitalSignature = require('../../utils/signatureUtils');
const { sendErrorResponse } = require('../../utils/responseUtils');
const { sendCallback } = require('../../utils/callbackUtils');
const { getMessageId } = require('../../utils/messageIdGenerator');
const LOAN_CONSTANTS = require('../../utils/loanConstants');
const LoanCalculations = require('../../utils/loanCalculations');
const LoanMappingService = require('../../services/loanMappingService');

// Helper function to calculate monthly installment
function calculateMonthlyInstallment(principal, annualRate, termMonths) {
    return LoanCalculations.calculateEMI(principal, annualRate, termMonths);
}

// Helper function to generate loan number
function generateLoanNumber() {
    const timestamp = Date.now().toString();
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `LOAN${timestamp}${random}`;
}

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
        const otherCharges = LOAN_CONSTANTS?.OTHER_CHARGES || 50000;
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
        logger.info('✅ Sent immediate ACK response for LOAN_OFFER_REQUEST');

        // Schedule LOAN_INITIAL_APPROVAL_NOTIFICATION to be sent via callback after 20 seconds
        setTimeout(async () => {
            try {
                logger.info('⏰ Sending delayed LOAN_INITIAL_APPROVAL_NOTIFICATION callback...');

                const approvalResponseData = {
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
                };

                // Send callback using the callback utility
                await sendCallback(approvalResponseData);
                logger.info('✅ Successfully sent LOAN_INITIAL_APPROVAL_NOTIFICATION callback');

            } catch (callbackError) {
                logger.error('❌ Error sending LOAN_INITIAL_APPROVAL_NOTIFICATION callback:', callbackError);
            }
        }, 20000); // 20 seconds delay

        logger.info('🕐 Scheduled LOAN_INITIAL_APPROVAL_NOTIFICATION to be sent in 20 seconds');

    } catch (error) {
        logger.error('Error processing loan offer request:', error);
        return sendErrorResponse(res, '8012', error.message, 'xml', parsedData);
    }
};

module.exports = handleLoanOfferRequest;