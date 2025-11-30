const logger = require('../../utils/logger');
const digitalSignature = require('../../utils/signatureUtils');
const { sendErrorResponse } = require('../../utils/responseUtils');
const { getMessageId } = require('../../utils/messageIdGenerator');
const LOAN_CONSTANTS = require('../../utils/loanConstants');
const LoanMappingService = require('../../services/loanMappingService');

const handleLoanChargesRequest = async (parsedData, res) => {
    try {
        logger.info('Processing LOAN_CHARGES_REQUEST...');
        const header = parsedData.Document.Data.Header;
        const messageDetails = parsedData.Document.Data.MessageDetails;

        // Input validation
        let requestedAmount = parseFloat(messageDetails.RequestedAmount || messageDetails.LoanAmount);
        let requestedTenure = parseInt(messageDetails.RequestedTenure || messageDetails.Tenure);
        // Tenure logic: if provided, use it; else if requestedAmount >0, use DEFAULT_TENURE; else null
        if (requestedTenure > 0) {
            // Use provided tenure
        } else if (requestedAmount > 0) {
            requestedTenure = LOAN_CONSTANTS.DEFAULT_TENURE;
            logger.info(`Tenure not provided but RequestedAmount >0, defaulting to default tenure: ${requestedTenure} months`);
        } else {
            requestedTenure = null; // Will be handled later
            logger.info(`Tenure not provided and RequestedAmount=0, setting to null for reverse calculation`);
        }
        // Validate retirement
        const retirementMonthsLeft = require('../utils/loanUtils').calculateMonthsUntilRetirement(messageDetails.RetirementDate);
        requestedTenure = require('../utils/loanUtils').validateRetirementAge(requestedTenure, retirementMonthsLeft);
        if (!requestedTenure || requestedTenure <= 0) {
            requestedTenure = LOAN_CONSTANTS.DEFAULT_TENURE;
            logger.info(`Tenure adjusted for retirement: ${requestedTenure} months`);
        }

        const interestRate = 15.0; // 15% per annum

        // Repayment capacity
        const desiredDeductibleAmount = parseFloat(messageDetails.DesiredDeductibleAmount || 0);
        const deductibleAmount = parseFloat(messageDetails.DeductibleAmount || 0);
        const oneThirdAmount = parseFloat(messageDetails.OneThirdAmount || 0);
        const MIN_LOAN_AMOUNT = LOAN_CONSTANTS.MIN_LOAN_AMOUNT;

        // Calculate maxAffordableEMI (equivalent to maxAffordableEMI in Kotlin)
        const maxAffordableEMI = deductibleAmount > 0 ? deductibleAmount : 0; // Assuming DeductibleAmount is provided

        // Calculate desirableEMI (capped desired)
        let desirableEMI = 0;
        if (desiredDeductibleAmount > 0) {
            desirableEMI = Math.min(desiredDeductibleAmount, maxAffordableEMI);
        } else {
            desirableEMI = maxAffordableEMI;
        }

        // Determine affordabilityType
        const affordabilityType = (requestedAmount === 0 || requestedTenure === null) ? 'REVERSE' : 'FORWARD';

        logger.info(`AffordabilityType: ${affordabilityType}, RequestedAmount: ${requestedAmount}, Tenure: ${requestedTenure}`);

        // Calculate max affordable loan amount
        const maxAffordableLoan = require('../utils/loanCalculations').calculateMaxLoanFromEMI(desirableEMI, interestRate, requestedTenure);

        let eligibleAmount = 0;
        let monthlyReturnAmount = 0;

        if (affordabilityType === 'FORWARD') {
            // Forward: Consider RequestedAmount, maximize eligibility by capping at max affordable
            eligibleAmount = Math.min(requestedAmount, maxAffordableLoan);
            monthlyReturnAmount = require('../utils/loanCalculations').calculateEMI(eligibleAmount, interestRate, requestedTenure);
            logger.info(`Forward calculation: RequestedAmount=${requestedAmount}, MaxAffordable=${maxAffordableLoan.toFixed(2)}, EligibleAmount=${eligibleAmount}, MonthlyReturnAmount=${monthlyReturnAmount}`);
        } else {
            // Reverse: Maximize eligibility
            eligibleAmount = maxAffordableLoan;
            monthlyReturnAmount = desirableEMI;
            logger.info(`Reverse calculation: EligibleAmount=${eligibleAmount}, MonthlyReturnAmount=${monthlyReturnAmount}`);
        }

        // Ensure minimum
        eligibleAmount = Math.max(eligibleAmount, MIN_LOAN_AMOUNT);

        // Calculate charges modularly using eligibleAmount
        const charges = require('../utils/loanCalculations').calculateCharges(eligibleAmount);
        const totalProcessingFees = charges.processingFee;
        const totalInsurance = charges.insurance;
        const otherCharges = charges.otherCharges;

        // Interest and net loan using eligibleAmount
        const totalInterestRateAmount = require('../utils/loanCalculations').calculateTotalInterest(eligibleAmount, interestRate, requestedTenure);
        const totalDeductions = totalProcessingFees + totalInsurance + otherCharges;
        const netLoanAmount = eligibleAmount - totalDeductions;
        const totalAmountToPay = eligibleAmount + totalInterestRateAmount;

        // Prepare response
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
                    "DesiredDeductibleAmount": monthlyReturnAmount.toFixed(2),
                    "TotalInsurance": totalInsurance.toFixed(2),
                    "TotalProcessingFees": totalProcessingFees.toFixed(2),
                    "TotalInterestRateAmount": totalInterestRateAmount.toFixed(2),
                    "OtherCharges": otherCharges.toFixed(2),
                    "NetLoanAmount": netLoanAmount.toFixed(2),
                    "TotalAmountToPay": totalAmountToPay.toFixed(2),
                    "Tenure": requestedTenure,
                    "EligibleAmount": eligibleAmount.toFixed(2),
                    "MonthlyReturnAmount": monthlyReturnAmount.toFixed(2)
                }
            }
        };

        // Store charge calculation results for later use
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
                    eligibleAmount: eligibleAmount.toFixed(2),
                    tenure: requestedTenure,
                    calculatedAt: new Date().toISOString()
                };
                await LoanMappingService.storeChargeCalculation(checkNumber, chargeCalculationData);
                logger.info('Stored charge calculation data for CheckNumber:', checkNumber);
            }
        } catch (storageError) {
            logger.warn('Failed to store charge calculation data:', storageError.message);
        }

        const signedResponse = digitalSignature.createSignedXML(responseData.Data);
        res.status(200).send(signedResponse);
    } catch (error) {
        logger.error('Error processing loan charges request:', error);
        return sendErrorResponse(res, '8012', error.message, 'xml', parsedData);
    }
};

module.exports = handleLoanChargesRequest;