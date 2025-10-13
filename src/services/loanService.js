const { sendResponse } = require("../utils/responseHelper");
const api = require("./cbs.api");
const { API_ENDPOINTS } = require("./cbs.endpoints");


const LoanCalculate = async (data) => {
    try {
        const {
            checkNumber,
            designationCode,
            designationName,
            basicSalary,
            netSalary,
            oneThirdAmount,
            deductibleAmount,
            retirementDate,
            termsOfEmployment,
            requestedAmount,
            desiredDeductibleAmount,
            tenure,
            fspCode,
            productCode,
            voteCode,
            totalEmployeeDeduction,
            jobClassCode
        } = data;

        const productId = productCode;
        //check loan product
        const loanProduct = await api.get(API_ENDPOINTS.PRODUCT + '/' + productId);


        const { response, status } = loanProduct
        if (!status) {
            throw new Error(response.error || "Product not found");
        }

        let {
            interestRatePerPeriod,
            charges,
            maxPrincipal,
            minPrincipal,
            minNumberOfRepayments,
            maxNumberOfRepayments,
            numberOfRepayments
        } = response;


        // pick usable tenure values
        const defaultTenure = numberOfRepayments || maxNumberOfRepayments;

        if (!defaultTenure) {
            throw new Error("Unable to find loan tenure");
        }

        if (!interestRatePerPeriod) {
            throw new Error("Unable to find Interest Rate");
        }

        let principal = (requestedAmount && requestedAmount > 0) ? requestedAmount : null;
        let months = (tenure && tenure > 0) ? tenure : null;
        let desiredDeduction = (desiredDeductibleAmount && desiredDeductibleAmount > 0) ? desiredDeductibleAmount : null;

        if (!charges || charges.length === 0) {
            throw new Error("Unable to find charges Insurance | Arrangement");
        }

        const insuranceCharge = charges.find(c => c.name.includes("Insurance"));
        const processingFeeCharge = charges.find(c => c.name.includes("Arrangement"));

        // --- CASE 1: requestedAmount only ---
        if (principal && !months && !desiredDeduction) {
            months = defaultTenure;
        }

        // --- CASE 2: tenure only ---
        if (!principal && months && !desiredDeduction) {
            if (!maxPrincipal) {
                throw new Error("Unable to find maxPrincipal");
            }
            principal = maxPrincipal;
        }

        // --- CASE 3: desiredDeductibleAmount only ---
        if (!principal && !months && desiredDeduction) {
            months = defaultTenure;
            principal = (desiredDeduction * months) / (1 + (interestRatePerPeriod / 100) * months);
        }

        // --- CASE 4: requestedAmount + tenure ---
        // just use directly

        // --- CASE 5: requestedAmount + desiredDeductibleAmount ---
        if (principal && desiredDeduction && !months) {
            const totalInterest = (principal * (interestRatePerPeriod / 100)) * defaultTenure;
            const approxTotalPay = principal + totalInterest;
            months = Math.ceil(approxTotalPay / desiredDeduction);
        }

        // --- CASE 6: tenure + desiredDeductibleAmount ---
        if (!principal && months && desiredDeduction) {
            principal = (desiredDeduction * months) / (1 + (interestRatePerPeriod / 100) * months);
        }

        // --- Charges & Interest ---
        const totalInsurance = (principal * (insuranceCharge?.amount || 0)) / 100;
        const totalProcessingFees = (principal * (processingFeeCharge?.amount || 0)) / 100;

        // Interest is per *year*, convert to monthly if repayment is in months
        const monthlyInterestRate = (interestRatePerPeriod / 100) / 12;

        const totalInterestRateAmount = months
            ? principal * monthlyInterestRate * months
            : 0;

        const netLoanAmount = principal - (totalInsurance + totalProcessingFees);
        const totalAmountToPay = principal + totalInterestRateAmount + totalInsurance + totalProcessingFees;
        const monthlyReturnAmount = months ? totalAmountToPay / months : 0;

        // fallback if user didn’t provide deduction
        if (!desiredDeduction) {
            desiredDeduction = monthlyReturnAmount;
        }

        const result = {
            requestedAmount: principal.toFixed(2),
            desiredDeductibleAmount: (desiredDeduction ?? monthlyReturnAmount).toFixed(2),
            totalInsurance: totalInsurance.toFixed(2),
            totalProcessingFees: totalProcessingFees.toFixed(2),
            totalInterestRateAmount: totalInterestRateAmount.toFixed(2),
            netLoanAmount: netLoanAmount.toFixed(2),
            totalAmountToPay: totalAmountToPay.toFixed(2),
            tenure: months,
            eligibleAmount: maxPrincipal.toFixed(2),
            monthlyReturnAmount: monthlyReturnAmount.toFixed(2),
        };


        return result

    } catch (error) {
        console.error('LoanCalculate error:', error);
        throw error;
    }
}


module.exports = {
    LoanCalculate
}