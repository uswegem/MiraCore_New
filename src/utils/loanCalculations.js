const LOAN_CONSTANTS = require('./loanConstants');

/**
 * Centralized loan calculation utilities
 * Single source of truth for all EMI and loan-related calculations
 */
class LoanCalculations {
  /**
   * Calculate monthly EMI using standard amortization formula
   * @param {number} principal - Loan principal amount
   * @param {number} annualInterestRate - Annual interest rate (percentage)
   * @param {number} tenureMonths - Loan tenure in months
   * @returns {number} Monthly EMI amount
   */
  static calculateEMI(principal, annualInterestRate, tenureMonths) {
    if (tenureMonths === 0 || !tenureMonths) {
      return 0;
    }
    
    const monthlyRate = annualInterestRate / 100 / 12;
    
    if (monthlyRate === 0) {
      return principal / tenureMonths;
    }
    
    const emi = (principal * monthlyRate * Math.pow(1 + monthlyRate, tenureMonths)) /
                (Math.pow(1 + monthlyRate, tenureMonths) - 1);
    
    return Math.round(emi * 100) / 100; // Round to 2 decimal places
  }

  /**
   * Calculate maximum loan amount from target EMI (reverse calculation)
   * @param {number} targetEMI - Target monthly EMI
   * @param {number} annualInterestRate - Annual interest rate (percentage)
   * @param {number} tenureMonths - Loan tenure in months
   * @returns {number} Maximum loan amount
   */
  static calculateMaxLoanFromEMI(targetEMI, annualInterestRate, tenureMonths) {
    if (tenureMonths === 0 || !tenureMonths) {
      return 0;
    }
    
    const monthlyRate = annualInterestRate / 100 / 12;
    
    if (monthlyRate === 0) {
      return targetEMI * tenureMonths;
    }
    
    const maxAmount = (targetEMI * (Math.pow(1 + monthlyRate, tenureMonths) - 1)) /
                      (monthlyRate * Math.pow(1 + monthlyRate, tenureMonths));
    
    return Math.max(LOAN_CONSTANTS.MIN_LOAN_AMOUNT, Math.round(maxAmount));
  }

  /**
   * Calculate total interest for loan
   * @param {number} principal - Loan principal amount
   * @param {number} annualInterestRate - Annual interest rate (percentage)
   * @param {number} tenureMonths - Loan tenure in months
   * @returns {number} Total interest amount
   */
  static calculateTotalInterest(principal, annualInterestRate, tenureMonths) {
    const emi = this.calculateEMI(principal, annualInterestRate, tenureMonths);
    return (emi * tenureMonths) - principal;
  }

  /**
   * Calculate loan charges breakdown
   * @param {number} loanAmount - Principal loan amount
   * @returns {object} Breakdown of charges
   */
  static calculateCharges(loanAmount) {
    return {
      processingFee: Math.round(loanAmount * LOAN_CONSTANTS.ADMIN_FEE_RATE * 100) / 100,
      insurance: Math.round(loanAmount * LOAN_CONSTANTS.INSURANCE_RATE * 100) / 100,
      otherCharges: LOAN_CONSTANTS.OTHER_CHARGES // Fixed other charges from constants
    };
  }
}

module.exports = LoanCalculations;
