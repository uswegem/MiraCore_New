const LoanCalculations = require('./src/utils/loanCalculations');
const loanUtils = require('./src/utils/loanUtils');
const LOAN_CONSTANTS = require('./src/utils/loanConstants');

// Mock data for reverse (RequestedAmount = 0)
const reverseData = {
    RequestedAmount: 0,
    DesiredDeductibleAmount: 266667,
    DeductibleAmount: 266667,
    Tenure: 96,
    RetirementDate: '2045-01-01' // Mock retirement
};

// Mock data for forward (RequestedAmount > 0)
const forwardData = {
    RequestedAmount: 14289807.36,
    DesiredDeductibleAmount: 0,
    DeductibleAmount: 266667,
    Tenure: 96,
    RetirementDate: '2045-01-01'
};

function simulateCalculation(data) {
    console.log(`\nSimulating with RequestedAmount: ${data.RequestedAmount}`);

    // Input validation
    let requestedAmount = parseFloat(data.RequestedAmount);
    let requestedTenure = parseInt(data.Tenure);
    if (!requestedTenure || requestedTenure <= 0) {
        requestedTenure = LOAN_CONSTANTS.MAX_TENURE;
    }
    const retirementMonthsLeft = loanUtils.calculateMonthsUntilRetirement(data.RetirementDate);
    requestedTenure = loanUtils.validateRetirementAge(requestedTenure, retirementMonthsLeft);

    const interestRate = 15.0;

    // Repayment capacity
    const desiredDeductibleAmount = parseFloat(data.DesiredDeductibleAmount || 0);
    const deductibleAmount = parseFloat(data.DeductibleAmount || 0);

    let targetEMI = 0;
    if (desiredDeductibleAmount > 0) {
        targetEMI = desiredDeductibleAmount;
    } else if (deductibleAmount > 0) {
        targetEMI = deductibleAmount;
    }

    // Calculate max affordable
    let maxAffordableAmount = LOAN_CONSTANTS.MIN_LOAN_AMOUNT;
    if (targetEMI > 0 && requestedTenure > 0) {
        maxAffordableAmount = LoanCalculations.calculateMaxLoanFromEMI(targetEMI, interestRate, requestedTenure);
    }

    // Unified calculation
    let eligibleAmount = maxAffordableAmount;
    let monthlyReturnAmount = targetEMI;

    if (requestedAmount > 0) {
        console.log(`RequestedAmount (${requestedAmount}) provided, but using max affordable (${eligibleAmount}) for consistency.`);
    } else {
        console.log(`Using max affordable: ${eligibleAmount}`);
    }

    // Charges
    const charges = LoanCalculations.calculateCharges(eligibleAmount);
    const totalInterestRateAmount = LoanCalculations.calculateTotalInterest(eligibleAmount, interestRate, requestedTenure);
    const totalDeductions = charges.processingFee + charges.insurance + charges.otherCharges;
    const netLoanAmount = eligibleAmount - totalDeductions;
    const totalAmountToPay = eligibleAmount + totalInterestRateAmount;

    console.log(`EligibleAmount: ${eligibleAmount.toFixed(2)}`);
    console.log(`MonthlyReturnAmount: ${monthlyReturnAmount.toFixed(2)}`);
    console.log(`TotalAmountToPay: ${totalAmountToPay.toFixed(2)}`);
}

console.log('Testing Unified Calculation:');
simulateCalculation(reverseData);
simulateCalculation(forwardData);