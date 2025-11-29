const LOAN_CONSTANTS = require('./loanConstants');

// Use Decimal.js-light for precision if available
let Decimal;
try {
  Decimal = require('decimal.js-light');
} catch (e) {
  Decimal = null;
}

/** Internal helpers for Decimal or Number */
const D = (v) => (Decimal ? new Decimal(v) : Number(v));
const add = (a, b) => (Decimal ? a.plus(b) : a + b);
const sub = (a, b) => (Decimal ? a.minus(b) : a - b);
const mul = (a, b) => (Decimal ? a.times(b) : a * b);
const div = (a, b) => (Decimal ? a.div(b) : a / b);
const pow = (a, b) => (Decimal ? a.pow(b) : Math.pow(a, b));
const toNumber = (a) => (Decimal ? a.toNumber() : a);
const round2 = (n) => {
  if (Decimal) return Number(new Decimal(n).toFixed(2));
  return Math.round(n * 100) / 100;
};

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
    if (!principal || principal <= 0) return 0;
    if (!tenureMonths || tenureMonths <= 0) return 0;

    const monthlyRate = annualInterestRate / 100 / 12;

    if (monthlyRate === 0) {
      return round2(principal / tenureMonths);
    }

    const emi = (principal * monthlyRate * Math.pow(1 + monthlyRate, tenureMonths)) /
                (Math.pow(1 + monthlyRate, tenureMonths) - 1);

    return round2(emi);
  }

  /**
   * Calculate maximum loan amount from target EMI (reverse calculation)
   * @param {number} targetEMI - Target monthly EMI
   * @param {number} annualInterestRate - Annual interest rate (percentage)
   * @param {number} tenureMonths - Loan tenure in months
   * @returns {number} Maximum loan amount
   */
  static calculateMaxLoanFromEMI(targetEMI, annualInterestRate, tenureMonths) {
    if (!targetEMI || targetEMI <= 0) return 0;
    if (!tenureMonths || tenureMonths <= 0) return 0;

    const monthlyRate = annualInterestRate / 100 / 12;

    if (monthlyRate === 0) {
      return round2(targetEMI * tenureMonths);
    }

    const maxAmount = (targetEMI * (Math.pow(1 + monthlyRate, tenureMonths) - 1)) /
                      (monthlyRate * Math.pow(1 + monthlyRate, tenureMonths));

    return Math.max(LOAN_CONSTANTS.MIN_LOAN_AMOUNT, round2(maxAmount));
  }

  /**
   * Calculate total interest for loan
   * @param {number} principal - Loan principal amount
   * @param {number} annualInterestRate - Annual interest rate (percentage)
   * @param {number} tenureMonths - Loan tenure in months
   * @returns {number} Total interest amount
   */
  static calculateTotalInterest(principal, annualInterestRate, tenureMonths) {
    if (!principal || principal <= 0) return 0;
    const emi = this.calculateEMI(principal, annualInterestRate, tenureMonths);
    const totalPaid = emi * tenureMonths;
    const totalInterest = totalPaid - principal;
    return round2(totalInterest);
  }

  /**
   * Calculate loan charges breakdown
   * @param {number} loanAmount - Principal loan amount
   * @returns {object} Breakdown of charges
   */
  static calculateCharges(loanAmount) {
    return {
      processingFee: round2(loanAmount * (LOAN_CONSTANTS?.ADMIN_FEE_RATE || 0.02)),
      insurance: round2(loanAmount * (LOAN_CONSTANTS?.INSURANCE_RATE || 0.015)),
      otherCharges: LOAN_CONSTANTS?.OTHER_CHARGES || 50000
    };
  }

  /**
   * Generate amortization schedule
   * @param {number} principal
   * @param {number} annualRatePercent
   * @param {number} tenureMonths
   * @returns {array} Schedule
   */
  static amortizationSchedule(principal, annualRatePercent, tenureMonths) {
    const schedule = [];
    if (!principal || principal <= 0 || !tenureMonths || tenureMonths <= 0) return schedule;

    const r = annualRatePercent / 100 / 12;
    let balance = principal;
    const emi = this.calculateEMI(principal, annualRatePercent, tenureMonths);

    for (let m = 1; m <= tenureMonths; m++) {
      const interest = balance * r;
      let principalRepayment = emi - interest;

      if (m === tenureMonths) {
        principalRepayment = balance;
      }

      const closing = balance - principalRepayment;

      schedule.push({
        month: m,
        openingBalance: round2(balance),
        interest: round2(interest),
        principal: round2(principalRepayment),
        emi: round2(emi),
        closingBalance: round2(closing)
      });

      balance = closing;
    }

    if (schedule.length > 0) {
      schedule[schedule.length - 1].closingBalance = 0.00;
    }

    return schedule;
  }
}

module.exports = LoanCalculations;
