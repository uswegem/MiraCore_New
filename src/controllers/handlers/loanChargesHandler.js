const logger = require('../../utils/logger');
const digitalSignature = require('../../utils/signatureUtils');
const { sendErrorResponse } = require('../../utils/responseUtils');
const { getMessageId } = require('../../utils/messageIdGenerator');
const LOAN_CONSTANTS = require('../../utils/loanConstants');
const loanUtils = require('../../utils/loanUtils');
const loanCalculations = require('../../utils/loanCalculations');
const LoanMappingService = require('../../services/loanMappingService');

const handleLoanChargesRequest = async (parsedData, res) => {
    try {
        logger.info('Processing LOAN_CHARGES_REQUEST...');
        const header = parsedData.Document.Data.Header;
        const messageDetails = parsedData.Document.Data.MessageDetails;

        // Input validation - handle optional fields
        let requestedAmount = messageDetails.RequestedAmount !== undefined ? parseFloat(messageDetails.RequestedAmount || messageDetails.LoanAmount) : null;
        let requestedTenure = messageDetails.Tenure !== undefined ? parseInt(messageDetails.RequestedTenure || messageDetails.Tenure) : null;
        let deductibleAmount = messageDetails.DeductibleAmount !== undefined ? parseFloat(messageDetails.DeductibleAmount) : null;

        // Determine affordability type based on presence of RequestedAmount
        const affordabilityType = (requestedAmount === null || requestedAmount === 0) ? 'REVERSE' : 'FORWARD';

        // Set interest rate from constants
        const interestRate = LOAN_CONSTANTS.DEFAULT_INTEREST_RATE;

        // Set defaults and validate tenure
        if (requestedTenure === null || requestedTenure === 0) {
            if (affordabilityType === 'FORWARD') {
                requestedTenure = LOAN_CONSTANTS.DEFAULT_TENURE;
                logger.info(`Tenure not provided but RequestedAmount >0, defaulting to default tenure: ${requestedTenure} months`);
            } else {
                requestedTenure = null; // Will be determined by reverse calculation
                logger.info(`Tenure not provided for reverse calculation, will optimize`);
            }
        }

        // Validate retirement if tenure is set
        if (requestedTenure !== null) {
            const retirementMonthsLeft = loanUtils.calculateMonthsUntilRetirement(messageDetails.RetirementDate);
            requestedTenure = loanUtils.validateRetirementAge(requestedTenure, retirementMonthsLeft);
            if (!requestedTenure || requestedTenure <= 0) {
                requestedTenure = LOAN_CONSTANTS.DEFAULT_TENURE;
                logger.info(`Tenure adjusted for retirement: ${requestedTenure} months`);
            }
        }

        // Repayment capacity - handle optional DeductibleAmount
        const desiredDeductibleAmount = parseFloat(messageDetails.DesiredDeductibleAmount || 0);
        const oneThirdAmount = parseFloat(messageDetails.OneThirdAmount || 0);
        const MIN_LOAN_AMOUNT = LOAN_CONSTANTS.MIN_LOAN_AMOUNT;

        // Calculate maxAffordableEMI based on available deduction capacity
        let maxAffordableEMI = 0;
        if (deductibleAmount !== null && deductibleAmount > 0) {
            maxAffordableEMI = deductibleAmount;
        } else if (oneThirdAmount > 0) {
            maxAffordableEMI = oneThirdAmount; // Fallback to 1/3 rule
        } else {
            maxAffordableEMI = 0; // No deduction limit provided
        }

        // Calculate desirableEMI (capped desired deduction)
        let desirableEMI = 0;
        if (desiredDeductibleAmount > 0) {
            desirableEMI = Math.min(desiredDeductibleAmount, maxAffordableEMI);
        } else {
            desirableEMI = maxAffordableEMI;
        }

        logger.info(`AffordabilityType: ${affordabilityType}, RequestedAmount: ${requestedAmount}, Tenure: ${requestedTenure}, DeductibleAmount: ${deductibleAmount}, MaxAffordableEMI: ${maxAffordableEMI}`);

        // Ensure tenure is set for calculations
        if (requestedTenure === null) {
            if (affordabilityType === 'REVERSE') {
                // For reverse calculation, optimize tenure to maximize eligible amount
                // Try different tenures and find the one that gives maximum loan amount
                let maxEligibleAmount = 0;
                let optimalTenure = LOAN_CONSTANTS.DEFAULT_TENURE;
                let optimalMonthlyReturn = desirableEMI;

                const possibleTenures = [12, 24, 36, 48, 60, 72, 84, 96]; // Common tenure options
                for (const tenure of possibleTenures) {
                    const testLoanAmount = await loanCalculations.calculateMaxLoanFromEMI(desirableEMI, interestRate, tenure);
                    if (testLoanAmount > maxEligibleAmount) {
                        maxEligibleAmount = testLoanAmount;
                        optimalTenure = tenure;
                    }
                }
                requestedTenure = optimalTenure;
                logger.info(`Optimized tenure for reverse calculation: ${requestedTenure} months, MaxEligibleAmount: ${maxEligibleAmount}`);
            } else {
                requestedTenure = LOAN_CONSTANTS.DEFAULT_TENURE;
            }
        }

        // Calculate max affordable loan amount
        const maxAffordableLoan = await loanCalculations.calculateMaxLoanFromEMI(desirableEMI, interestRate, requestedTenure);

        let eligibleAmount = 0;
        let monthlyReturnAmount = 0;

        if (affordabilityType === 'FORWARD') {
            // Forward: Consider RequestedAmount, but ensure EMI doesn't exceed capacity
            const requestedEligible = Math.min(requestedAmount, maxAffordableLoan);
            const requestedEMI = await loanCalculations.calculateEMI(requestedEligible, interestRate, requestedTenure);
            
            // If calculated EMI exceeds capacity, recalculate with max affordable EMI
            if (requestedEMI > maxAffordableEMI) {
                eligibleAmount = maxAffordableLoan;
                monthlyReturnAmount = desirableEMI;
                logger.info(`Forward calculation (EMI-capped): RequestedAmount=${requestedAmount}, EMI would be ${requestedEMI.toFixed(2)} but max is ${maxAffordableEMI}, using MaxAffordable=${maxAffordableLoan.toFixed(2)}, EligibleAmount=${eligibleAmount}, MonthlyReturnAmount=${monthlyReturnAmount}`);
            } else {
                eligibleAmount = requestedEligible;
                monthlyReturnAmount = requestedEMI;
                logger.info(`Forward calculation: RequestedAmount=${requestedAmount}, MaxAffordable=${maxAffordableLoan.toFixed(2)}, EligibleAmount=${eligibleAmount}, MonthlyReturnAmount=${monthlyReturnAmount}`);
            }
        } else {
            // Reverse: Maximize eligibility within EMI capacity
            eligibleAmount = maxAffordableLoan;
            monthlyReturnAmount = desirableEMI;
            logger.info(`Reverse calculation: EligibleAmount=${eligibleAmount}, MonthlyReturnAmount=${monthlyReturnAmount}`);
        }

        // Final validation: Ensure EMI doesn't exceed maxAffordableEMI (safety check)
        if (monthlyReturnAmount > maxAffordableEMI) {
            // This should not happen with the improved logic above, but keep as safety net
            eligibleAmount = await loanCalculations.calculateMaxLoanFromEMI(maxAffordableEMI, interestRate, requestedTenure);
            monthlyReturnAmount = maxAffordableEMI;
            logger.warn(`Safety EMI cap triggered: EligibleAmount=${eligibleAmount}, MonthlyReturnAmount=${monthlyReturnAmount}`);
        }

        // Ensure minimum loan amount
        eligibleAmount = Math.max(eligibleAmount, MIN_LOAN_AMOUNT);

        // Calculate charges modularly using eligibleAmount
        const charges = loanCalculations.calculateCharges(eligibleAmount);
        const totalProcessingFees = charges.processingFee;
        const totalInsurance = charges.insurance;
        const otherCharges = charges.otherCharges;

        // Interest and net loan using eligibleAmount
        const totalInterestRateAmount = await loanCalculations.calculateTotalInterest(eligibleAmount, interestRate, requestedTenure);
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